import * as THREE from 'three';
import type { Game } from '../../../core/Game';
import type { StoryNPC } from '../../../npc/StoryNPC';
import type { RadioQueue } from '../radio';

/** Seconds: the Board in session, then his desk, then the balcony, then desk and balcony in turn. */
const BOARD = 75, TOAST = 28, DESK = 35, BALCONY = 55;

type Phase = 'waiting' | 'toBoard' | 'board' | 'toDesk' | 'desk' | 'toBalcony' | 'balcony' | 'dead';
export type ValeDeath = 'poison' | 'overboard' | 'shot';

/**
 * Augustin Vale's night, once you're after him: he walks down to the lounge for the Board, makes his
 * speech and the toast (from the decanter on the bar: if you've poisoned it, that's that), goes back
 * to his desk, and steps out onto his balcony alone, desk and balcony in turn after that.
 */
export class ValeRoutine {
  phase: Phase = 'waiting';
  private t = 0;
  poisoned = false;
  death: ValeDeath | null = null;
  /** Said when he's out on the balcony the first time (Overwatch points it out). */
  private toldBalcony = false;
  /** Seconds until the poison takes him (after he drinks). */
  private poisonIn = -1;

  constructor(private readonly game: Game, readonly npc: StoryNPC, private readonly radio: RadioQueue,
    private readonly marks: Map<string, THREE.Vector3>, private readonly onDeath: (how: ValeDeath) => void) {}

  /** The Board convenes: he heads down to the lounge. */
  begin(): void {
    if (this.phase !== 'waiting') return;
    this.walk('toBoard', 'vale-board');
    this.radio.say(2, 'c2-vale-meeting');
  }

  private walk(phase: Phase, mark: string): void {
    const at = this.marks.get(mark);
    if (at && this.npc.goTo(at, this.game.world.nav)) this.phase = phase;
    this.t = 0;
  }

  update(dt: number): void {
    const v = this.npc;
    if (this.phase === 'dead') return;
    if (!v.alive) return this.die('shot');
    if (this.poisonIn > 0) {
      this.poisonIn -= dt;
      if (this.poisonIn <= 0) { v.hp = 0; return this.die('poison'); }
    }
    this.t += dt;
    if (v.walking) this.game.world.doors.npcPass(v.pos);
    switch (this.phase) {
      case 'toBoard':
        if (!v.walking) { this.phase = 'board'; this.t = 0; v.yaw = Math.PI; this.radio.speak('vale-speech', v.head); }
        break;
      case 'board':
        if (this.t > TOAST && this.t - dt <= TOAST) {
          this.radio.speak('vale-toast', v.head);
          if (this.poisoned) this.poisonIn = 5;
        }
        if (this.t > BOARD) this.walk('toDesk', 'vale-desk');
        break;
      case 'toDesk':
        if (!v.walking) { this.phase = 'desk'; this.t = 0; v.yaw = Math.PI / 2; v.seat = 0.47; }
        break;
      case 'desk':
        if (this.t > DESK) this.walk('toBalcony', 'vale-balcony');
        break;
      case 'toBalcony':
        if (!v.walking) {
          this.phase = 'balcony';
          this.t = 0;
          v.yaw = Math.PI;
          if (!this.toldBalcony) { this.toldBalcony = true; this.radio.say(0.5, 'c2-vale-balcony'); }
        }
        break;
      case 'balcony':
        if (this.t > BALCONY) this.walk('toDesk', 'vale-desk');
        break;
    }
  }

  /** Alone at the rail, facing the sea: someone behind him could put him over it. */
  pushable(from: THREE.Vector3): boolean {
    const v = this.npc;
    if (this.phase !== 'balcony' || !v.alive) return false;
    const to = v.pos.clone().sub(from).setY(0);
    const facing = new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw));
    return to.length() < 1.5 && to.normalize().dot(facing) > 0.4;
  }

  push(): void {
    const v = this.npc;
    v.fall(new THREE.Vector3(-Math.sin(v.yaw), 0, -Math.cos(v.yaw)));
    this.die('overboard');
  }

  private die(how: ValeDeath): void {
    if (this.phase === 'dead') return;
    this.phase = 'dead';
    this.death = how;
    this.onDeath(how);
  }
}
