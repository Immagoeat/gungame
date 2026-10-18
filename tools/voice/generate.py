#!/usr/bin/env python3
"""
Renders the game's voice lines (packages/client/src/audio/voicelines.json) to
packages/client/public/audio/voice/*.ogg with Piper text-to-speech.

    python3 tools/voice/generate.py --piper /path/to/piper/piper --model /path/to/en_US-libritts-high.onnx [--force]

Piper: https://github.com/rhasspy/piper (release 2023.11.14-2, MIT).
Voice model: en_US-libritts-high from https://huggingface.co/rhasspy/piper-voices (LibriTTS, CC BY 4.0).
Needs ffmpeg with libopus. Only lines whose text or voice changed are rendered again (see index.json).
"""
import argparse, hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'packages/client/src/audio/voicelines.json'
OUT = ROOT / 'packages/client/public/audio/voice'

# Voice band, squashed and a little driven: a handheld radio. In-person voices are only cleaned up.
RADIO = 'highpass=f=320,lowpass=f=3300,acompressor=threshold=-22dB:ratio=6:attack=5:release=80,volume=2.2,alimiter=limit=0.9'
DIRECT = 'highpass=f=70'
TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse'


def jobs(manifest):
    """Every file to render: (file name, voice id, text)."""
    voices = manifest['voices']
    for line_id, line in manifest['lines'].items():
        yield line_id, line['voice'], line['text']
    for kind, texts in manifest['barks'].items():
        if kind.startswith('_'):
            continue
        speakers = ['reyes'] if kind.startswith('reyes-') else manifest['guardVoices']
        for i, text in enumerate(texts):
            for v in speakers:
                assert v in voices, v
                yield f'bark-{kind}-{i}-{v}', v, text


def key(voice, text):
    """What a recording depends on; the client's voice test computes the same thing."""
    spec = f"{voice['speaker']}|{round(voice['length'] * 1000)}|{1 if voice['radio'] else 0}|{text}"
    return hashlib.sha1(spec.encode('utf-8')).hexdigest()[:16]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--piper', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    voices = manifest['voices']
    OUT.mkdir(parents=True, exist_ok=True)
    index_path = OUT / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {}

    todo = {}
    wanted = set()
    for name, voice, text in jobs(manifest):
        wanted.add(name)
        k = key(voices[voice], text)
        if args.force or index.get(name) != k or not (OUT / f'{name}.ogg').exists():
            todo.setdefault(voice, []).append((name, text, k))
    with tempfile.TemporaryDirectory() as tmp:
        for voice, items in todo.items():
            v = voices[voice]
            # One Piper run per voice (length scale is per run), lines fed as JSON.
            feed = ''.join(json.dumps({'text': t, 'speaker_id': v['speaker'], 'output_file': f'{tmp}/{n}.wav'}) + '\n' for n, t, _ in items)
            subprocess.run([args.piper, '--model', args.model, '--json-input', '--length_scale', str(v['length']),
                            '--noise_scale', '0.6', '--noise_w', '0.75', '--sentence_silence', '0.15'],
                           input=feed.encode(), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for name, text, k in items:
                chain = f"{TRIM},{RADIO if v['radio'] else DIRECT},loudnorm=I=-17:TP=-1.5:LRA=7"
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{tmp}/{name}.wav', '-af', chain,
                                '-ar', '48000', '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', str(OUT / f'{name}.ogg')], check=True)
                index[name] = k
                print(f'{name}: {text}')
    # Drop files for lines that no longer exist.
    for f in OUT.glob('*.ogg'):
        if f.stem not in wanted:
            f.unlink()
            index.pop(f.stem, None)
    index_path.write_text(json.dumps(dict(sorted(index.items())), indent=1) + '\n')
    print(f'{sum(len(i) for i in todo.values())} rendered, {len(wanted)} total', file=sys.stderr)


if __name__ == '__main__':
    main()
