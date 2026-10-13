import { PartyMusic } from '../audio/PartyMusic';

/** Procedural sound effects via WebAudio. Call init() from a user gesture before anything plays. */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Low-pass on the master bus; closes down underwater to muffle everything. */
  private muffle: BiquadFilterNode | null = null;
  /** Music goes through its own level control. */
  private musicBus: GainNode | null = null;
  private musicLevel = 0.7;

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
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicLevel;
    this.musicBus.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
  }

  setMusicVolume(v: number): void {
    this.musicLevel = v;
    if (this.musicBus) this.musicBus.gain.value = v;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /** Where the listener is and which way is right (for positional sounds); set every frame. */
  readonly listener = { pos: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 } };

  /** A gunshot somewhere in the world: quieter and duller with distance, panned to its side. */
  shotAt(sound: { cutoff: number; decay: number }, at: { x: number; y: number; z: number }, vol = 1): void {
    const { pos, right } = this.listener;
    const dx = at.x - pos.x, dy = at.y - pos.y, dz = at.z - pos.z;
    const d = Math.hypot(dx, dy, dz);
    const level = Math.min(1, 10 / (d + 2)) * vol;
    if (level < 0.02) return;
    const pan = d > 0.5 ? (dx * right.x + dz * right.z) / d : 0;
    this.shot({ cutoff: sound.cutoff * Math.max(0.25, 1 - d / 120), decay: sound.decay * (1 + d / 60) }, level, pan);
  }

  /** Gunshot: filtered noise burst plus a low thump. */
  shot(sound: { cutoff: number; decay: number }, vol = 1, pan = 0): void {
    const { ctx, noise } = this;
    let master: AudioNode | null = this.master;
    if (!ctx || !master || !noise) return;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(master);
      master = p;
    }
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

  /**
   * A running engine: low rumble plus tyre roar. Returns controls to follow the vehicle (`load` 0..1
   * from idle to working hard, `vol` for distance) and to switch it off.
   */
  engine(): { set(load: number, vol: number): void; stop(): void } | null {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return null;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 180;
    rumble.connect(rf).connect(out);
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const sg = ctx.createGain();
    sg.gain.value = 0.6;
    sub.connect(sg).connect(out);
    const road = ctx.createBufferSource();
    road.buffer = noise;
    road.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 500;
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    road.connect(nf).connect(ng).connect(out);
    for (const s of [rumble, sub, road]) s.start(t);
    return {
      set: (load, vol) => {
        const now = ctx.currentTime;
        const rpm = 38 + load * 50;
        rumble.frequency.setTargetAtTime(rpm, now, 0.15);
        sub.frequency.setTargetAtTime(rpm / 2, now, 0.15);
        ng.gain.setTargetAtTime(0.08 + load * 0.35, now, 0.2);
        out.gain.setTargetAtTime(0.22 * vol, now, 0.1);
      },
      stop: () => {
        const now = ctx.currentTime;
        out.gain.setTargetAtTime(0, now, 0.15);
        for (const s of [rumble, sub, road]) s.stop(now + 0.8);
      },
    };
  }

  /** A van's sliding door: a latch clunk, then the roll along its track. */
  slidingDoor(): void {
    this.burst('lowpass', 900, 0.12, 0.35);
    this.beep(140, 0.08, 'triangle', 0.12);
    this.burst('bandpass', 1300, 0.7, 0.12, 0.15);
    this.burst('lowpass', 700, 0.18, 0.3, 0.85);
  }

  /** Radio squelch: the click and hiss of a push-to-talk opening (start) or closing. */
  radio(start: boolean): void {
    this.burst('bandpass', 2400, start ? 0.07 : 0.12, 0.16);
    this.beep(start ? 1250 : 950, 0.045, 'square', 0.035, start ? 0 : 0.04);
  }

  /**
   * Night ambience: crickets chirping from around you over a soft breeze. Returns a handle to set
   * its level (0..1) and stop it.
   */
  nightAmbience(): { set(level: number): void; stop(): void } | null {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise) return null;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 320;
    const wg = ctx.createGain();
    wg.gain.value = 0.05;
    wind.connect(wf).connect(wg).connect(out);
    wind.start();
    // A few crickets, each with its own pitch, rhythm and place around the listener.
    const crickets = Array.from({ length: 5 }, () => ({
      freq: 4200 + Math.random() * 900, rate: 0.6 + Math.random() * 0.8, pan: Math.random() * 2 - 1, next: ctx.currentTime + Math.random() * 2,
    }));
    const timer = window.setInterval(() => {
      for (const c of crickets) {
        while (c.next < ctx.currentTime + 0.3) {
          const p = ctx.createStereoPanner();
          p.pan.value = c.pan;
          p.connect(out);
          // A chirp is a quick train of 3-4 pulses.
          const pulses = 3 + Math.floor(Math.random() * 2);
          for (let i = 0; i < pulses; i++) {
            const t = c.next + i * 0.022;
            const o = ctx.createOscillator();
            o.frequency.value = c.freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.02, t + 0.004);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
            o.connect(g).connect(p);
            o.start(t);
            o.stop(t + 0.02);
          }
          c.next += c.rate * (0.85 + Math.random() * 0.3);
        }
      }
    }, 100);
    return {
      set: level => out.gain.setTargetAtTime(level, ctx.currentTime, 0.4),
      stop: () => {
        clearInterval(timer);
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        wind.stop(ctx.currentTime + 1);
        setTimeout(() => out.disconnect(), 1500);
      },
    };
  }

  /** Picking up a weapon: a handling rattle and the bolt or slide being checked. */
  pickup(): void {
    this.burst('bandpass', 1800, 0.08, 0.25);
    this.burst('highpass', 3000, 0.05, 0.3, 0.12);
    this.beep(900, 0.03, 'square', 0.05, 0.14);
  }

  /** A door opening or closing: latch click and a soft swing. */
  door(): void {
    this.beep(320, 0.04, 'square', 0.04);
    this.burst('lowpass', 500, 0.3, 0.12, 0.03);
  }

  /** A bullet passing close by. */
  whiz(): void {
    this.burst('bandpass', 3200, 0.12, 0.18);
    this.beep(1700 + Math.random() * 600, 0.08, 'sine', 0.03);
  }

  /** A quiet takedown: a scuffle and a body hitting the floor. */
  takedown(): void {
    this.burst('lowpass', 700, 0.25, 0.3);
    this.burst('lowpass', 300, 0.35, 0.45, 0.35);
  }

  /** A guard calling out or radioing in, heard from where they are. */
  bark(_kind: 'huh' | 'spotted' | 'body' | 'camera', at: { x: number; y: number; z: number }): void {
    const { pos } = this.listener;
    const d = Math.hypot(at.x - pos.x, at.y - pos.y, at.z - pos.z);
    if (d > 30) return;
    const v = Math.min(1, 6 / (d + 1));
    // Radio click and a burst of voice-band chatter.
    this.burst('bandpass', 2200, 0.06, 0.12 * v);
    for (let i = 0; i < 4; i++) this.burst('bandpass', 500 + Math.random() * 700, 0.09, 0.14 * v, 0.06 + i * 0.09);
  }

  /** A boot landing on paving. */
  footstep(vol = 1): void {
    this.burst('lowpass', 600, 0.09, 0.18 * vol);
  }

  /** Starts live party music (see PartyMusic). Null until audio is initialised. */
  partyMusic(): PartyMusic | null {
    const { ctx, musicBus, noise } = this;
    if (!ctx || !musicBus || !noise) return null;
    return new PartyMusic(ctx, musicBus, noise);
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
