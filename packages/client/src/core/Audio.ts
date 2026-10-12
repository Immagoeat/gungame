/** Procedural sound effects via WebAudio. Call init() from a user gesture before anything plays. */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Low-pass on the master bus; closes down underwater to muffle everything. */
  private muffle: BiquadFilterNode | null = null;

  constructor(private volume: number) {}

  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Gunshot: filtered noise burst plus a low thump. */
  shot(sound: { cutoff: number; decay: number }, vol = 1): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(sound.cutoff, t);
    f.frequency.exponentialRampToValueAtTime(150, t + sound.decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + sound.decay);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + sound.decay + 0.05);

    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5 * vol, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 0.15);
  }

  beep(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, delay = 0): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Filtered noise burst. `type` picks the filter, `freq` its cutoff/center. */
  private burst(type: BiquadFilterType, freq: number, dur: number, vol: number, delay = 0): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Shattering glass: a crash plus a spray of high tinkles. Bigger panes are louder and longer. */
  glassBreak(area: number): void {
    const size = Math.min(1, area / 4);
    this.burst('highpass', 1800, 0.35 + size * 0.4, 0.45 + size * 0.3);
    this.burst('bandpass', 5000, 0.2, 0.3);
    const pings = 6 + Math.round(size * 10);
    for (let i = 0; i < pings; i++) {
      this.beep(2500 + Math.random() * 4500, 0.05 + Math.random() * 0.08, 'sine', 0.025 + Math.random() * 0.03, Math.random() * (0.25 + size * 0.5));
    }
  }

  setUnderwater(under: boolean): void {
    if (!this.ctx || !this.muffle) return;
    this.muffle.frequency.setTargetAtTime(under ? 500 : 20000, this.ctx.currentTime, 0.08);
  }

  /** Something entering water; strength 0..1. */
  splash(strength: number): void {
    const s = Math.min(1, strength);
    this.burst('lowpass', 1400 + s * 1800, 0.25 + s * 0.5, 0.2 + s * 0.45);
    this.burst('bandpass', 700, 0.2 + s * 0.3, 0.15 + s * 0.2, 0.05);
    for (let i = 0; i < 3 + s * 6; i++) this.beep(500 + Math.random() * 900, 0.05, 'sine', 0.03, 0.08 + Math.random() * 0.4);
  }

  /** One swimming stroke. */
  stroke(): void {
    this.burst('lowpass', 1100, 0.3, 0.12);
  }

  /** Glass crunching underfoot. */
  crunch(): void {
    this.burst('highpass', 2500, 0.08, 0.18);
    for (let i = 0; i < 3; i++) this.beep(3000 + Math.random() * 3000, 0.03, 'sine', 0.02, Math.random() * 0.06);
  }

  /** A pane cracking without breaking. */
  glassCrack(): void {
    this.burst('highpass', 3500, 0.12, 0.35);
    this.beep(4200, 0.06, 'sine', 0.05);
    this.beep(2800, 0.09, 'sine', 0.04, 0.02);
  }

  /** A bullet glancing off something hard. */
  ricochet(): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 2500 + Math.random() * 1500;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.36);
    this.burst('highpass', 3000, 0.05, 0.2);
  }

  /** A shard landing. */
  tinkle(vol = 1): void {
    this.beep(3500 + Math.random() * 3500, 0.04 + Math.random() * 0.05, 'sine', 0.02 * vol);
  }

  /** Something solid and small hitting the floor. */
  clunk(): void {
    this.beep(140 + Math.random() * 60, 0.08, 'triangle', 0.12);
    this.burst('lowpass', 900, 0.08, 0.2);
  }

  /** Electronics being shot: crunch, crackle and a dying buzz. */
  zap(): void {
    this.burst('bandpass', 2500, 0.15, 0.5);
    for (let i = 0; i < 6; i++) this.burst('highpass', 4000, 0.03, 0.25, 0.05 + Math.random() * 0.4);
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.55);
  }

  arpeggio(freqs: number[], step: number, dur: number): void {
    freqs.forEach((f, i) => this.beep(f, dur, 'triangle', 0.1, i * step));
  }
}
