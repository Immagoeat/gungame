import * as THREE from 'three';
import { type DifficultyId, type PropDef, type Vec3, type WeaponId } from '@gungame/shared';
import type { WorldActors } from '../../core/actors';
import type { Game } from '../../core/Game';
import { storage } from '../../core/storage';
import { GuardManager, type GuardEvent } from '../../npc/GuardManager';
import { Hostage } from '../../npc/Hostage';
import { escapeHtml, formatTime } from '../../ui/dom';
import { MissionHud } from '../../ui/MissionHud';
import type { Guard } from '../../npc/Guard';

/**
 * Chapter 1, The Mansion: rescue Daniel Reyes, an accountant who agreed to testify against Victor
 * Castell and was taken before he could. Castell is throwing a party tonight; Reyes is somewhere in
 * the house.
 *
 *  0  Get inside the house unseen (the side door by the garage is the quiet way in).
 *  1  Find Reyes on the security feeds (basement security room). Optionally loop the cameras.
 *  2  Take the keycard from Kessler, head of security (patrols the second floor with a partner).
 *  3  Free Reyes (penthouse study, keycard doors). This locks the house down.
 *  4  Get Reyes to the van.
 *
 * Until the escape (stage 4) the party must not find out: gunfire they can hear, a body they see, a
 * gunfight near them or a guest being shot fails the mission. Each stage starts with a checkpoint.
 */

export interface MansionCheckpoint {
  stage: number;
  pos: Vec3;
  yaw: number;
  inventory: WeaponId[];
  items: string[];
  dead: string[];
  taken: WeaponId[];
  looped: boolean;
  unlocked: string[];
  elapsed: number;
  stats: Stats;
}

interface Stats {
  kills: number;
  takedowns: number;
  spotted: number;
  alarms: number;
}

const STAGES = [
  { title: 'Get inside', text: 'Get into the house unseen', sub: 'Guards and cameras watch the grounds. The side door by the garage is quieter than the front.' },
  { title: 'Find Reyes', text: 'Find Reyes on the security feeds', sub: 'Security room, basement. Take the service stairs on the east side.' },
  { title: 'The keycard', text: "Take Kessler's keycard", sub: 'The head of security patrols the second floor with a partner.' },
  { title: 'Free Reyes', text: 'Free Reyes', sub: 'Penthouse study, third floor. Both doors take the keycard.' },
  { title: 'Get out', text: 'Get Reyes to the van', sub: 'Keep him alive. Reinforcements are coming through the gate.' },
];

/** Hold E for this long to use the terminal, loop the feeds, free Reyes. */
const HOLD = { terminal: 1.6, loop: 2.2, free: 3 };

export class MansionMission {
  readonly guards: GuardManager;
  readonly reyes: Hostage | null;
  readonly hud = new MissionHud();
  stage = 0;
  private readonly items = new Set<string>();
  private readonly stats: Stats = { kills: 0, takedowns: 0, spotted: 0, alarms: 0 };
  private checkpoint: MansionCheckpoint | null = null;
  private hold: { what: keyof typeof HOLD; t: number } | null = null;
  private failed = false;
  private partyTimer = 0;
  private partyIndex = 0;
  private terminalUsed = false;
  private readonly marks = new Map<string, THREE.Vector3>();
  private readonly doorsUnlocked = new Set<string>();
  private elapsedBase = 0;
  /** A body being dragged. */
  private dragging: Guard | null = null;
  private readonly startCheckpoint: MansionCheckpoint | null;

  constructor(private readonly game: Game, props: readonly PropDef[], difficulty: DifficultyId, checkpoint: MansionCheckpoint | null) {
    this.startCheckpoint = checkpoint;
    this.guards = new GuardManager(game, props, difficulty, new Set(checkpoint?.dead ?? []));
    const h = props.find((p): p is Extract<PropDef, { kind: 'hostage' }> => p.kind === 'hostage');
    this.reyes = h ? new Hostage(h, game.gfx.scene) : null;
    for (const p of props) if (p.kind === 'marker') this.marks.set(p.id, new THREE.Vector3(p.x, p.y, p.z));
    this.guards.onEvent = e => this.onGuardEvent(e);
    if (this.reyes) this.guards.others = [this.reyes];
  }

  get skipIntro(): boolean {
    return !!this.startCheckpoint;
  }

  /** What the world's bullets and noises talk to. */
  readonly actors: WorldActors = {
    hitTargets: () => [...this.guards.hitTargets(), ...(this.reyes && this.reyes.alive ? [this.reyes.hitbox] : [])],
    hit: (obj, dmg, head, from) => {
      if (obj.userData.hostage) {
        this.reyes?.hurt(dmg);
        return !this.reyes?.alive;
      }
      const g = obj.userData.guard as Guard;
      const killed = this.guards.damage(g, dmg, head, from);
      return killed;
    },
    noise: (at, radius, kind) => {
      this.guards.noise(at, radius, kind);
      if (kind === 'gunshot' && radius > 20) this.partyHeard(at, 'The party heard gunshots.');
    },
    civilianHit: () => this.fail('A guest was shot.'),
  };

  start(): void {
    const g = this.game;
    g.actors = this.actors;
    this.hud.show();
    // Overwatch took over the two gate cameras as the van came in.
    g.world.security.ignored.add('gate-w');
    g.world.security.ignored.add('gate-e');
    const cp = this.startCheckpoint;
    if (cp) {
      this.stage = cp.stage;
      g.player.pos.set(cp.pos.x, cp.pos.y, cp.pos.z);
      g.player.yaw = cp.yaw;
      g.weapons.setInventory(cp.inventory);
      for (const i of cp.items) this.items.add(i);
      for (const w of cp.taken) g.world.pickups.take(w);
      g.world.security.looped = cp.looped;
      this.terminalUsed = cp.stage >= 2;
      for (const id of cp.unlocked) {
        const d = g.world.doors.doors.find(x => x.prop.id === id);
        if (d) g.world.doors.use(d, new Set([d.prop.lock ?? '']));
        this.doorsUnlocked.add(id);
      }
      Object.assign(this.stats, cp.stats);
      this.elapsedBase = cp.elapsed;
      if (cp.stage >= 4) this.freeReyes(true);
      this.checkpoint = cp;
      g.hud.banner('Checkpoint', STAGES[this.stage].title);
    }
    this.showStage();
    this.hud.alarm('undetected');
  }

  /** After the intro: set the scene with a word from Overwatch. */
  introDone(): void {
    if (this.startCheckpoint) return;
    // Down low beside the van: the front door guards are looking this way.
    this.game.input.stance = 'crouch';
    this.saveCheckpoint();
    this.hud.radio('Overwatch', "I've got the gate cameras on a loop; every other camera is live. Stay low, guards on the front door. Get inside unseen; the side door by the garage is your best bet.", 8);
  }

  scenery(dt: number): void {
    for (const gd of this.guards.guards) gd.updateBody(dt, false);
    this.reyes?.update(dt, this.game.player.pos, this.game.world.nav, this.game.world.colliders, false);
  }

  update(dt: number): void {
    if (this.failed) return;
    const g = this.game;
    const player = g.player.pos;
    this.guards.update(dt);
    const danger = this.guards.alarm >= 2;
    this.reyes?.update(dt, player, g.world.nav, g.world.colliders, danger);
    if (this.reyes?.freed) g.world.doors.npcPass(this.reyes.position);
    if (this.reyes && this.reyes.freed && !this.reyes.alive) return this.fail('Reyes was killed.');
    this.updateHold(dt);
    this.dragBody();
    this.stageLogic();
    if (this.stage < 4) this.partyWatch(dt);
    this.hud.update(dt, g.gfx.camera, this.marker(), this.guards.detections());
  }

  // ---------- Stages ----------

  private showStage(): void {
    const s = STAGES[this.stage];
    this.hud.objective(s.title, s.text, s.sub);
  }

  private advance(radio?: [string, string]): void {
    this.stage++;
    this.showStage();
    this.game.audio.arpeggio([660, 880], 0.08, 0.12);
    if (radio) this.hud.radio(radio[0], radio[1], 6);
    this.saveCheckpoint();
  }

  private stageLogic(): void {
    const g = this.game;
    const p = g.player.pos;
    if (this.stage === 0) {
      const zone = g.world.zoneAt({ x: p.x, y: p.y + 1, z: p.z });
      if (zone && zone.floor !== 'Grounds') {
        this.advance(['Overwatch', "You're in. The security room is in the basement, east side; take the service stairs. Their terminal will show us where he is."]);
      }
    } else if (this.stage === 2 && this.items.has('keycard')) {
      this.advance(['Overwatch', 'Got the card. Third floor, penthouse study. Quietly.']);
    } else if (this.stage === 4 && this.reyes) {
      const extract = this.marks.get('extract')!;
      const me = new THREE.Vector3(p.x, p.y, p.z);
      if (me.distanceTo(extract) < 5 && this.reyes.position.distanceTo(extract) < 5) this.win();
    }
  }

  /** Where the waypoint points. */
  private marker(): { pos: THREE.Vector3; label: string } | null {
    const lift = (v: THREE.Vector3, h = 1) => v.clone().add(new THREE.Vector3(0, h, 0));
    switch (this.stage) {
      case 0: return { pos: new THREE.Vector3(20, 5.4, 6.4), label: 'Side door' };
      case 1: return { pos: lift(this.marks.get('terminal')!, 0.4), label: 'Security terminal' };
      case 2: {
        const k = this.guards.guards.find(x => x.id === 'kessler');
        if (!k) return null;
        return { pos: new THREE.Vector3(k.pos.x, k.pos.y + (k.alive ? 2.1 : 0.6), k.pos.z), label: k.alive ? 'Kessler' : 'Search Kessler' };
      }
      case 3: return this.reyes ? { pos: lift(this.reyes.position, 1.6), label: 'Reyes' } : null;
      case 4: return { pos: lift(this.marks.get('extract')!, 1.2), label: 'Van' };
    }
    return null;
  }

  // ---------- Interactions (E) ----------

  prompt(): string | null {
    const g = this.game;
    const me = new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z);
    const key = (text: string, hold?: keyof typeof HOLD) => {
      const bar = hold ? `<span class="hold"><span style="width:${Math.round(((this.hold?.what === hold ? this.hold.t : 0) / HOLD[hold]) * 100)}%"></span></span>` : '';
      return `<kbd>E</kbd>${escapeHtml(text)}${hold ? ' (hold)' : ''}${bar}`;
    };
    if (this.dragging) return key('Drop body');
    const t = this.guards.takedownTarget(me);
    if (t) return key(`Take down${t.name ? ` ${t.name}` : ''}`);
    const body = this.guards.searchable(me);
    if (body) return key(`Search ${body.name ?? 'body'}`);
    if (this.bodyNear(me)) return key('Drag body');
    if (this.atTerminal()) {
      if (!this.terminalUsed) return key('Check the camera feeds', 'terminal');
      if (!g.world.security.looped) return key('Loop the camera feeds', 'loop');
    }
    if (this.reyes && !this.reyes.freed && this.stage === 3 && this.reyes.position.distanceTo(me) < 1.8) return key('Free Reyes', 'free');
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(g.gfx.camera.quaternion);
    const door = g.world.doors.target(g.gfx.camera.position, look);
    if (door) {
      if (door.locked) return door.prop.lock && this.items.has(door.prop.lock) ? key('Swipe keycard') : key('Locked (keycard)');
      return key(door.target > 0.5 ? 'Close door' : 'Open door');
    }
    return null;
  }

  interact(): boolean {
    const g = this.game;
    const me = new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z);
    if (this.dragging) {
      this.dragging = null;
      g.player.speedMul = 1;
      g.audio.takedown();
      return true;
    }
    const t = this.guards.takedownTarget(me);
    if (t) {
      this.guards.takeDown(t);
      return true;
    }
    const near = !this.guards.searchable(me) && this.bodyNear(me);
    if (near) {
      this.dragging = near;
      g.player.speedMul = 0.5;
      g.input.stance = 'crouch';
      return true;
    }
    const body = this.guards.searchable(me);
    if (body) {
      body.searched = true;
      if (body.carries) {
        this.items.add(body.carries);
        g.audio.pickup();
        g.hud.banner(body.carries === 'keycard' ? 'Keycard' : body.carries, `Taken from ${body.name ?? 'the body'}`);
      }
      return true;
    }
    if (this.atTerminal() || (this.reyes && !this.reyes.freed && this.stage === 3 && this.reyes.position.distanceTo(me) < 1.8)) return true; // held
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(g.gfx.camera.quaternion);
    const door = g.world.doors.target(g.gfx.camera.position, look);
    if (door) {
      const r = g.world.doors.use(door, this.items);
      if (r === 'locked') g.audio.beep(220, 0.12, 'square', 0.06);
      else if (r === 'unlocked') {
        this.doorsUnlocked.add(door.prop.id);
        g.audio.beep(1500, 0.06, 'square', 0.05);
        g.audio.beep(2000, 0.06, 'square', 0.05, 0.08);
      } else g.audio.door();
      return true;
    }
    return false;
  }

  /** A body within reach to drag. */
  private bodyNear(me: THREE.Vector3): Guard | null {
    return this.guards.guards.find(x => !x.alive && new THREE.Vector3(x.pos.x, x.pos.y, x.pos.z).distanceTo(me) < 1.8) ?? null;
  }

  /** The dragged body follows behind you. */
  private dragBody(): void {
    const b = this.dragging;
    if (!b) return;
    const p = this.game.player;
    const behind = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    b.pos.x = p.pos.x + behind.x * 0.7;
    b.pos.z = p.pos.z + behind.z * 0.7;
    b.pos.y = p.pos.y;
    // Dragged by the shoulders: the head end towards you.
    b.yaw = p.yaw + Math.PI;
  }

  private atTerminal(): boolean {
    const t = this.marks.get('terminal');
    if (!t || this.stage < 1) return false;
    const p = this.game.player.pos;
    return Math.hypot(p.x - t.x, p.z - t.z) < 2.5 && Math.abs(p.y - (t.y - 1.05)) < 1.3;
  }

  /** Hold-E actions: progress while E is held and the action is available. */
  private updateHold(dt: number): void {
    const g = this.game;
    const me = new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z);
    let what: keyof typeof HOLD | null = null;
    if (this.atTerminal()) what = !this.terminalUsed ? 'terminal' : !g.world.security.looped ? 'loop' : null;
    else if (this.reyes && !this.reyes.freed && this.stage === 3 && this.reyes.position.distanceTo(me) < 1.8) what = 'free';
    if (!what || !g.input.isDown('KeyE')) {
      this.hold = null;
      return;
    }
    if (this.hold?.what !== what) this.hold = { what, t: 0 };
    this.hold.t += dt;
    if (this.hold.t < HOLD[what]) return;
    this.hold = null;
    if (what === 'terminal') {
      this.terminalUsed = true;
      g.audio.beep(1200, 0.05, 'square', 0.05);
      if (this.stage === 1) {
        this.advance(['Overwatch', "There he is. Penthouse study, top floor, two guards on him. The doors take a keycard; Kessler, head of security, carries one. Second floor. You can loop the camera feeds from there too."]);
      }
    } else if (what === 'loop') {
      g.world.security.looped = true;
      g.audio.beep(900, 0.05, 'square', 0.05);
      this.hud.radio('Overwatch', 'Feeds are looped. The cameras are blind.', 4);
    } else if (what === 'free') {
      this.freeReyes(false);
    }
  }

  private freeReyes(fromCheckpoint: boolean): void {
    const g = this.game;
    if (!this.reyes) return;
    this.reyes.free(g.world.nav);
    if (fromCheckpoint) {
      // Restarting the escape: you're both by the study door, the house already locked down.
      const p = g.player.pos;
      this.reyes.pos.x = p.x + 1;
      this.reyes.pos.y = p.y;
      this.reyes.pos.z = p.z;
    }
    const at = new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z);
    this.guards.maxWaves = 99;
    this.guards.lockdown(at);
    g.world.party.panic();
    g.stopMusic();
    if (!fromCheckpoint) {
      this.hud.radio('Reyes', "Who... you're here for me? They'll have heard that. Get me out of here.", 4);
      setTimeout(() => this.hud.radio('Overwatch', "The whole house is locking down. Get him to the van, now!", 5), 4200);
      this.advance();
    }
    this.hud.alarm('lockdown');
  }

  // ---------- The party must not find out ----------

  private partyHeard(at: THREE.Vector3, reason: string): void {
    if (this.stage >= 4) return;
    for (const pos of this.game.world.party.positions()) {
      const d = pos.distanceTo(at);
      // Over the music: close by they hear it through walls; in the open, from much further.
      if (d < 14 || (d < 30 && this.game.world.clearLine(pos.clone().setY(pos.y + 1.6), at))) return this.fail(reason);
    }
  }

  private partyWatch(dt: number): void {
    this.partyTimer -= dt;
    if (this.partyTimer > 0) return;
    this.partyTimer = 0.2;
    const guests = this.game.world.party.positions();
    if (!guests.length) return;
    // One guest a tick looks around for bodies; any fight near the party gives it away.
    this.partyIndex = (this.partyIndex + 1) % guests.length;
    const eye = guests[this.partyIndex].clone().add(new THREE.Vector3(0, 1.6, 0));
    if (this.guards.visibleBody(eye, 15)) return this.fail('A guest found a body.');
    for (const gd of this.guards.guards) {
      if (gd.state !== 'combat') continue;
      for (const pos of guests) if (pos.distanceTo(gd.pos as THREE.Vector3) < 18) return this.fail('Security started a gunfight in the middle of the party.');
    }
  }

  // ---------- Events, checkpoints, outcome ----------

  private onGuardEvent(e: GuardEvent): void {
    switch (e.type) {
      case 'spotted':
        this.stats.spotted++;
        break;
      case 'alarm':
        if (e.level >= 2) this.stats.alarms++;
        if (this.stage < 4 || e.level === 3) this.hud.alarm(e.level === 0 ? 'undetected' : e.level === 1 ? 'suspicious' : e.level === 2 ? 'alert' : 'lockdown');
        if (e.level === 2) this.hud.radio('Overwatch', `${e.reason}. They're on alert.`, 3.5);
        if (e.level === 1 && e.reason === 'They lost you') this.hud.radio('Overwatch', 'They lost you. Stay low.', 3);
        break;
      case 'killed':
        this.stats.kills++;
        break;
      case 'takedown':
        this.stats.takedowns++;
        break;
      case 'bodyFound':
        this.hud.radio(e.guard.name ?? 'Guard', 'Man down! We have a man down!', 3);
        break;
      case 'camera':
        if (this.stage < 4) this.hud.radio('Security', 'Camera picked something up. Check it out.', 3);
        break;
      case 'reinforcements':
        this.hud.radio('Overwatch', `More security coming in: ${e.count} of them.`, 3);
        break;
      case 'shot':
        if (this.stage < 4) this.partyHeard(e.at, 'The party heard gunshots.');
        break;
    }
  }

  private saveCheckpoint(): void {
    const g = this.game;
    this.checkpoint = {
      stage: this.stage,
      pos: { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z },
      yaw: g.player.yaw,
      inventory: [...g.weapons.carried],
      items: [...this.items],
      dead: this.guards.guards.filter(x => !x.alive && !x.reinforcement).map(x => x.id),
      taken: g.world.pickups.takenWeapons(),
      looped: g.world.security.looped,
      unlocked: [...this.doorsUnlocked],
      elapsed: this.elapsedBase + g.elapsed,
      stats: { ...this.stats },
    };
    storage.set('campaign.mansion.checkpoint', this.checkpoint);
  }

  fail(reason: string): void {
    if (this.failed) return;
    this.failed = true;
    this.game.player.speedMul = 1;
    this.game.setCheckpoint(this.checkpoint);
    this.game.endMatch({
      won: false, title: 'MISSION FAILED', subtitle: reason,
      stats: [{ label: 'Checkpoint', value: STAGES[this.checkpoint?.stage ?? 0].title }],
      againLabel: this.checkpoint ? 'Retry from checkpoint' : 'Try again',
    });
  }

  private win(): void {
    const g = this.game;
    this.failed = true;
    const time = this.elapsedBase + g.elapsed;
    storage.set('campaign.mansion.checkpoint', null);
    storage.set('campaign.mansion.complete', true);
    const best = storage.get<number | null>('campaign.mansion.best', null);
    if (best === null || time < best) storage.set('campaign.mansion.best', time);
    const ghost = this.stats.alarms === 0;
    g.setCheckpoint(undefined);
    g.audio.arpeggio([523, 659, 784, 1047], 0.12, 0.2);
    g.endMatch({
      won: true, title: 'MISSION COMPLETE', subtitle: ghost ? 'Reyes is safe, and nobody ever knew you were there.' : 'Reyes is safe.',
      stats: [
        { label: 'Time', value: formatTime(time) },
        { label: 'Takedowns', value: String(this.stats.takedowns) },
        { label: 'Kills', value: String(this.stats.kills) },
        { label: 'Times spotted', value: String(this.stats.spotted) },
        { label: 'Rating', value: ghost ? 'Ghost' : this.stats.spotted <= 2 ? 'Professional' : 'Loud' },
      ],
    });
  }

  dispose(): void {
    this.game.player.speedMul = 1;
    if (this.game.actors === this.actors) this.game.actors = null;
    this.guards.dispose();
    this.reyes?.dispose();
    this.hud.hide();
  }
}
