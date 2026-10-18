import type { AudioSystem } from '../core/Audio';
import manifest from './voicelines.json';

/**
 * Spoken lines (voicelines.json; audio rendered by tools/voice/generate.py into public/audio/voice).
 * Every line has its subtitle text, so anything that speaks works the same with or without the audio
 * files, which load in the background.
 */

export type VoiceLineId = keyof typeof manifest.lines;
export type BarkKind = Exclude<keyof typeof manifest.barks, '_about'>;
export type VoiceId = keyof typeof manifest.voices;

/** What was said: for the subtitle, and how long it takes. */
export interface Spoken {
  speaker: string;
  text: string;
  duration: number;
}

type Pos = { x: number; y: number; z: number };

const LINES = manifest.lines as Record<VoiceLineId, { voice: VoiceId; text: string }>;
const BARKS = manifest.barks as unknown as Record<BarkKind, string[]>;
const GUARD_VOICES = manifest.guardVoices as VoiceId[];

/** Every file the generator writes, by the same rules. */
function allFiles(): string[] {
  const files: string[] = Object.keys(LINES);
  for (const [kind, texts] of Object.entries(BARKS)) {
    if (kind.startsWith('_')) continue;
    const voices = kind.startsWith('reyes-') ? ['reyes'] : GUARD_VOICES;
    texts.forEach((_, i) => { for (const v of voices) files.push(`bark-${kind}-${i}-${v}`); });
  }
  return files;
}

/** Roughly how long a line takes to say, for when its audio isn't loaded. */
const estimate = (text: string) => 0.5 + text.split(/\s+/).length * 0.36;

export class VoicePlayer {
  private readonly buffers = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private radioLine: { stop(): void } | null = null;
  private readonly lastBark = new Map<string, number>();

  constructor(private readonly audio: AudioSystem) {}

  /** Fetches and decodes every line (about 2 MB); safe to call more than once. */
  preload(): Promise<void> {
    this.loading ??= (async () => {
      const files = allFiles();
      // A few at a time, so loading doesn't flood the network stack or the decoder.
      for (let i = 0; i < files.length; i += 8) {
        await Promise.all(files.slice(i, i + 8).map(async name => {
          try {
            const res = await fetch(`audio/voice/${name}.ogg`);
            if (!res.ok) return;
            this.buffers.set(name, await this.audio.decode(await res.arrayBuffer()));
          } catch {
            // Missing or undecodable: that line is subtitles only.
          }
        }));
      }
    })();
    return this.loading;
  }

  /** The line's subtitle and length, without saying it. */
  info(id: VoiceLineId): Spoken {
    const line = LINES[id];
    return { speaker: manifest.voices[line.voice].name, text: line.text, duration: this.buffers.get(id)?.duration ?? estimate(line.text) };
  }

  /**
   * Says a line: over the radio for radio voices (one radio line at a time; a new one cuts the old
   * off), or from `at` in the world. Returns what was said.
   */
  say(id: VoiceLineId, at?: Pos, muffled = false): Spoken {
    const line = LINES[id];
    const voice = manifest.voices[line.voice];
    const buffer = this.buffers.get(id);
    if (!buffer && voice.radio) this.audio.radio(true);
    if (buffer) {
      if (voice.radio || !at) {
        this.radioLine?.stop();
        this.radioLine = this.audio.voice(buffer, { radio: voice.radio });
      } else this.audio.voice(buffer, { at, muffled });
    }
    return this.info(id);
  }

  /** A short call-out in someone's voice (a variant they haven't just used), heard from `at`. */
  bark(kind: BarkKind, voice: VoiceId, at: Pos, muffled = false): Spoken {
    const texts = BARKS[kind];
    const key = `${kind}:${voice}`;
    let i = Math.floor(Math.random() * texts.length);
    if (texts.length > 1 && i === this.lastBark.get(key)) i = (i + 1) % texts.length;
    this.lastBark.set(key, i);
    const buffer = this.buffers.get(`bark-${kind}-${i}-${voice}`);
    if (buffer) this.audio.voice(buffer, { at, muffled });
    return { speaker: manifest.voices[voice].name, text: texts[i], duration: buffer?.duration ?? estimate(texts[i]) };
  }

  /** Cuts off the radio (skipping a cutscene, leaving a mission). */
  stopRadio(): void {
    this.radioLine?.stop();
    this.radioLine = null;
  }

  /** A guard's voice: the named ones have their own, the rest share the generic guard voices. */
  static guardVoice(id: string): VoiceId {
    const named: Record<string, VoiceId> = { kessler: 'kessler', 'smoke-1': 'mills', 'smoke-2': 'dario' };
    if (named[id]) return named[id];
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
    return `guard${(Math.abs(h) % 5) + 1}` as VoiceId;
  }
}
