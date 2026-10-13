/**
 * Party music, synthesised live: a 124 bpm house groove (kick, clap, hats, shaker, rolling bassline,
 * filtered chord stabs, a pad and a simple lead hook) over an Am - F - C - G progression, with an
 * 8-bar arrangement so it builds and drops instead of looping one bar.
 *
 * It plays from a point in the world (the DJ booth): louder close by, panned left/right, muffled and
 * quieter when there's a wall in between, like hearing a party from inside the house.
 */

/** Tempo of the party music; the dancers move to it. */
export const PARTY_BPM = 124;
const BPM = PARTY_BPM;
const STEP = 60 / BPM / 4; // one 16th note
const LOOKAHEAD = 0.15;

/** Bar chords (MIDI notes) and the bass root of each. */
const PROGRESSION: { chord: number[]; root: number }[] = [
  { chord: [57, 60, 64], root: 33 }, // Am
  { chord: [53, 57, 60], root: 29 }, // F
  { chord: [55, 60, 64], root: 36 }, // C
  { chord: [55, 59, 62], root: 31 }, // G
];
/** Bassline rhythm in 16ths (offbeat house bass) with octave jumps. */
const BASS: [number, number][] = [[2, 0], [3, 12], [6, 0], [7, 0], [10, 0], [11, 12], [14, 0], [15, 7]];
/** Chord stab rhythm. */
const STABS = [3, 6, 10, 14];
/** Lead hook over two bars: [16th within the 2 bars, semitones above A4]. */
const HOOK: [number, number][] = [[0, 7], [3, 5], [6, 3], [8, 0], [11, 3], [14, 5], [16, 7], [19, 10], [22, 7], [24, 5], [28, 3]];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class PartyMusic {
  private readonly out: GainNode;
  private readonly muffle: BiquadFilterNode;
  private readonly pan: StereoPannerNode;
  private readonly bus: GainNode;
  private readonly reverb: ConvolverNode;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private stopped = false;

  constructor(private readonly ctx: AudioContext, destination: AudioNode, private readonly noise: AudioBuffer) {
    // Instruments -> bus -> (dry + reverb) -> muffle (walls/distance) -> pan -> out -> master.
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(1.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 18000;
    this.pan = ctx.createStereoPanner();
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.bus.connect(this.muffle);
    this.bus.connect(this.reverb).connect(wet).connect(this.muffle);
    this.muffle.connect(this.pan).connect(this.out).connect(destination);
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  /**
   * Places the listener relative to the music: distance in meters, the source's direction relative
   * to where the listener faces (-1 left .. 1 right), and whether something solid is in between.
   */
  setListener(distance: number, side: number, blocked: boolean, paused: boolean): void {
    const t = this.ctx.currentTime;
    // Loud near the speakers, carrying across the estate; walls take the top end off.
    let vol = Math.min(1, 9 / (distance + 3));
    if (blocked) vol *= 0.45;
    if (paused) vol *= 0.35;
    const cutoff = blocked ? 380 + 900 * Math.min(1, 6 / (distance + 1)) : Math.max(1800, 18000 - distance * 160);
    this.out.gain.setTargetAtTime(0.5 * vol, t, 0.15);
    this.muffle.frequency.setTargetAtTime(cutoff, t, 0.15);
    this.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, side)) * Math.min(1, distance / 4), t, 0.1);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.timer);
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    setTimeout(() => this.out.disconnect(), 1500);
  }

  // ---------- Sequencer ----------

  private schedule(): void {
    if (this.stopped) return;
    // If the tab was asleep, skip ahead rather than playing a burst of catch-up notes.
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += STEP;
    }
  }

  private playStep(step: number, t: number): void {
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const section = bar % 16; // 16-bar arrangement
    const { chord, root } = PROGRESSION[bar % 4];
    const breakdown = section >= 12 && section < 14; // kick drops out, pad swells
    const full = section >= 4 && !breakdown;
    // Swing the offbeat 16ths a touch.
    const time = t + (s16 % 2 === 1 ? STEP * 0.08 : 0);

    if (!breakdown && s16 % 4 === 0) this.kick(time);
    if (s16 === 4 || s16 === 12) this.clap(time);
    if (s16 % 4 === 2) this.hat(time, 0.32, 0.09); // open hat on the offbeat
    else if (full || section >= 2) this.hat(time, 0.08, 0.03);
    if (full && s16 % 2 === 1) this.shaker(time);
    if (!breakdown || section === 13) for (const [at, oct] of BASS) if (at === s16) this.bass(midi(root + oct), time);
    if (section >= 2 && STABS.includes(s16)) this.stab(chord, time, breakdown ? 0.5 : 1);
    if (s16 === 0) this.pad(chord, time, breakdown ? 1 : 0.45);
    if (full && section >= 8) for (const [at, semi] of HOOK) if (at === (bar % 2) * 16 + s16) this.lead(midi(69 + semi), time);
    // Riser into the drop.
    if (section === 13 && s16 === 0) this.riser(time);
  }

  // ---------- Instruments ----------

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private kick(t: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.ctx.createGain();
    this.env(g, t, 1.0, 0.003, 0.32);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.4);
    // Click on top so it cuts through.
    this.noiseHit(t, 'highpass', 3000, 0.012, 0.25);
  }

  private clap(t: number): void {
    for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, 'bandpass', 1500, 0.02, 0.35);
    this.noiseHit(t + 0.033, 'bandpass', 1300, 0.15, 0.28);
  }

  private hat(t: number, decay: number, vol: number): void {
    this.noiseHit(t, 'highpass', 8000, decay, vol * 3);
  }

  private shaker(t: number): void {
    this.noiseHit(t, 'highpass', 6000, 0.05, 0.06);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, decay: number, vol: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    this.env(g, t, vol, 0.002, decay);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.05);
  }

  private bass(freq: number, t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const sub = this.ctx.createOscillator();
    sub.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(160, t + 0.14);
    const g = this.ctx.createGain();
    this.env(g, t, 0.32, 0.005, 0.16);
    o.connect(f).connect(g);
    sub.connect(g);
    g.connect(this.bus);
    for (const x of [o, sub]) { x.start(t); x.stop(t + 0.22); }
  }

  private stab(chord: number[], t: number, vol: number): void {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.18);
    const g = this.ctx.createGain();
    this.env(g, t, 0.07 * vol, 0.004, 0.2);
    f.connect(g).connect(this.bus);
    for (const n of chord) for (const det of [-9, 9]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(n + 12);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.25);
    }
  }

  private pad(chord: number[], t: number, vol: number): void {
    const bar = STEP * 16;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035 * vol, t + bar * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + bar * 1.02);
    f.connect(g).connect(this.bus);
    for (const n of chord) for (const det of [-6, 6]) {
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(n);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + bar * 1.05);
    }
  }

  private lead(freq: number, t: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    const g = this.ctx.createGain();
    this.env(g, t, 0.05, 0.005, 0.22);
    o.connect(f).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.3);
  }

  private riser(t: number): void {
    const dur = STEP * 32;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t);
    src.stop(t + dur + 0.1);
  }

  /** A short decaying-noise impulse response for a little room ambience. */
  private impulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(2, Math.floor(rate * seconds), rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    return buf;
  }
}
