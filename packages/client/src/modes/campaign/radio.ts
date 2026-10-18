import type * as THREE from 'three';
import type { VoiceLineId } from '../../audio/Voice';
import type { Game } from '../../core/Game';
import type { MissionHud } from '../../ui/MissionHud';

/**
 * Who's talking in a mission: lines wait their turn (nobody talks over anybody), each voiced and
 * subtitled. Lines from someone in the room come from where they are, muffled through walls.
 */
export class RadioQueue {
  private readonly queue: [number, VoiceLineId, THREE.Vector3 | undefined][] = [];
  /** Seconds until whoever's talking now has finished. */
  talking = 0;

  constructor(private readonly game: Game, private readonly hud: MissionHud) {}

  /** A line after a pause, once whoever's talking has finished (each line queued once). */
  say(delay: number, id: VoiceLineId, at?: THREE.Vector3): void {
    if (!this.queue.some(q => q[1] === id)) this.queue.push([delay, id, at]);
  }

  /** Says a line now, with its subtitle. */
  speak(id: VoiceLineId, at?: THREE.Vector3): void {
    const g = this.game;
    const s = g.voice.say(id, at, at ? !g.world.clearLine(g.gfx.camera.position, at) : false);
    this.hud.radio(s.speaker, s.text, s.duration + 0.6);
    this.talking = s.duration + 0.3;
  }

  update(dt: number): void {
    this.talking -= dt;
    const next = this.queue[0];
    if (!next || this.talking > 0) return;
    next[0] -= dt;
    if (next[0] > 0) return;
    this.queue.shift();
    this.speak(next[1], next[2]);
  }
}
