import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import manifest from './voicelines.json';

const dir = new URL('../../public/audio/voice/', import.meta.url);

/** The files tools/voice/generate.py writes for the manifest, and what each says. */
function expected(): [string, string, string][] {
  const out: [string, string, string][] = Object.entries(manifest.lines).map(([id, l]) => [id, l.voice, l.text]);
  for (const [kind, texts] of Object.entries(manifest.barks)) {
    if (kind.startsWith('_')) continue;
    const voices = kind.startsWith('reyes-') ? ['reyes'] : manifest.guardVoices;
    (texts as string[]).forEach((t, i) => { for (const v of voices) out.push([`bark-${kind}-${i}-${v}`, v, t]); });
  }
  return out;
}

describe('voice lines', () => {
  it('every line has its recording, made from its current text and voice', () => {
    const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')) as Record<string, string>;
    const voices = manifest.voices as Record<string, { speaker: number; length: number; radio: boolean }>;
    for (const [name, voice, text] of expected()) {
      expect(existsSync(new URL(`${name}.ogg`, dir)), name).toBe(true);
      // Same key as the generator: re-run it after changing a line (python3 tools/voice/generate.py).
      const v = voices[voice];
      const key = createHash('sha1').update(`${v.speaker}|${Math.round(v.length * 1000)}|${v.radio ? 1 : 0}|${text}`, 'utf8').digest('hex').slice(0, 16);
      expect(index[name], `${name} is out of date`).toBe(key);
    }
  });
});

