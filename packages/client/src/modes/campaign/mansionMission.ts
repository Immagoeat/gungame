import * as THREE from 'three';
import { DIFFICULTIES, type DifficultyId, type PropDef, type Vec3, type WeaponId } from '@gungame/shared';
import type { WorldActors } from '../../core/actors';
import type { Game } from '../../core/Game';
import { storage } from '../../core/storage';
import { GuardManager, type GuardEvent } from '../../npc/GuardManager';
import { Hostage } from '../../npc/Hostage';
import { escapeHtml, formatTime } from '../../ui/dom';
import { MissionHud } from '../../ui/MissionHud';
import type { Guard } from '../../npc/Guard';
import { VoicePlayer, type BarkKind, type VoiceLineId } from '../../audio/Voice';
import type { Cutscene } from '../../cutscenes/Cutscene';
import type { CampaignScript } from './types';
import type { MapMarker } from '../../ui/TacticalMap';
import { FieldKit } from './fieldKit';
import { CHALLENGES, CHALLENGES_KEY, type RunRecord } from './mansionChallenges';
import { LEAD_ORDER, leadLine, LEADS, LEADS_NEEDED, LISTEN_RANGE, SMOKERS_TALK, type LeadId } from './mansionLeads';

/**
 * Chapter 1, The Mansion: rescue Daniel Reyes, an accountant who agreed to testify against Victor
 * Castell and was taken before he could. Castell is throwing a party tonight; Reyes is somewhere in
 * the house.
 *
 *  0  Get inside the house unseen: the side door by the garage, or the library's garden door off the
 *     west lawn (locked; pick it).
 *  1  Find out where he's held: any three leads (mansionLeads.ts) of the camera log in the basement
 *     security room (where you can also loop the cameras), the wine cellar, Castell's laptop, a
 *     kitchen order, Castell's phone, and two guards on a smoke break you can listen in on.
 *  2  Take the keycard from Kessler, head of security (patrols the second floor with a partner).
 *  3  Free Reyes (penthouse study, keycard doors). This locks the house down.
 *  4  Get Reyes to the van.
 *
 * Until the escape (stage 4) the party must not find out: gunfire they can hear, a body they see, a
 * gunfight near them or a guest being shot fails the mission. Each stage starts with a checkpoint.
 *
 * Tools (fieldKit.ts): tag guards (T), throw coins (G), the tactical map (M); drag bodies into
 * wardrobes and lockers. Optional challenges (mansionChallenges.ts) are scored at the end, after the
 * getaway (cutscenes/mansionEscape.ts).
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
  /** Leads followed up, and lost (older saves have none). */
  leads?: LeadId[];
  lostLeads?: LeadId[];
  /** Where the bodies are, and whether they're stashed. */
  bodies?: { id: string; x: number; y: number; z: number; yaw: number; hidden: boolean }[];
  coins?: number;
  elapsed: number;
  stats: Stats;
}

interface Stats {
  kills: number;
  takedowns: number;
  spotted: number;
  /** Alerts before the escape. */
  alarms: number;
  bodiesFound?: number;
  hidden?: number;
}

const STAGES = [
  { title: 'Get inside', text: 'Get into the house unseen', sub: "Two ways in: the side door by the garage, or round the west lawn to the library's garden door (locked: pick it)." },
  { title: 'Find Reyes', text: "Find out where they're holding Reyes", sub: 'Any three leads will do. Read what Castell leaves lying around; listen to what his men say.' },
  { title: 'The keycard', text: "Take Kessler's keycard", sub: 'The head of security patrols the second floor with a partner.' },
  { title: 'Free Reyes', text: 'Free Reyes', sub: 'Penthouse study, third floor. Both doors take the keycard.' },
  { title: 'Get out', text: 'Get Reyes to the van', sub: 'Keep him alive. Reinforcements are coming through the gate.' },
];

/** Hold E for this long to loop the feeds or free Reyes (leads have their own times). */
const HOLD = { loop: 2.2, free: 3, pick: 4.5 };

/** A hold-E action: a fixed one, or examining a lead. */
type HoldAction = keyof typeof HOLD | LeadId;
const holdTime = (what: HoldAction) => (what in HOLD ? HOLD[what as keyof typeof HOLD] : LEADS[what as LeadId].hold);

/** The ways into the house (stage 0 waypoints): the side door, and the library's garden door. */
const ENTRIES = [
  { pos: new THREE.Vector3(20, 5.4, 6.4), label: 'Side door' },
  { pos: new THREE.Vector3(-22.6, 5.4, -1), label: 'Garden door' },
];

export class MansionMission implements CampaignScript {
  readonly guards: GuardManager;
  readonly reyes: Hostage | null;
  readonly hud = new MissionHud();
  stage = 0;
  private readonly items = new Set<string>();
  private readonly stats: Stats = { kills: 0, takedowns: 0, spotted: 0, alarms: 0 };
  private checkpoint: MansionCheckpoint | null = null;
  private hold: { what: HoldAction; t: number } | null = null;
  private failed = false;
  private partyTimer = 0;
  private partyIndex = 0;
  private readonly leads = new Set<LeadId>();
  private readonly lostLeads = new Set<LeadId>();
  /** The overheard conversation: the line being said (-1 not started) and how long it's been said for. */
  private talk = { line: -1, t: 0 };
  private listening = false;
  /** Lines waiting their turn: [pause before, line]. */
  private readonly radioQueue: [number, VoiceLineId][] = [];
  /** Seconds until whoever's talking now (radio or the mission's characters) has finished. */
  private talking = 0;
  /** Since the last guard call-out (they don't all talk at once). */
  private sinceBark = 9;
  private reyesTalk = { cooldown: 4, wasScared: false, van: false, hp: Infinity, hurtCooldown: 0 };
  private readonly marks = new Map<string, THREE.Vector3>();
  private readonly doorsUnlocked = new Set<string>();
  private elapsedBase = 0;
  /** A body being dragged. */
  private dragging: Guard | null = null;
  private readonly startCheckpoint: MansionCheckpoint | null;
  /** Tagging, coins, the map, hiding spots. */
  readonly kit: FieldKit;
  /** The getaway scene, if the mode can make one (set by CampaignMode). */
  outro: (() => Cutscene | null) | null = null;

  constructor(private readonly game: Game, props: readonly PropDef[], difficulty: DifficultyId, checkpoint: MansionCheckpoint | null) {
    this.startCheckpoint = checkpoint;
    this.guards = new GuardManager(game, props, difficulty, new Set(checkpoint?.dead ?? []));
    const h = props.find((p): p is Extract<PropDef, { kind: 'hostage' }> => p.kind === 'hostage');
    this.reyes = h ? new Hostage(h, game.gfx.scene) : null;
    for (const p of props) if (p.kind === 'marker') this.marks.set(p.id, new THREE.Vector3(p.x, p.y, p.z));
    this.guards.onEvent = e => this.onGuardEvent(e);
    if (this.reyes) this.guards.others = [this.reyes];
    this.kit = new FieldKit(game, this.guards, this.hud, props, [
      { name: 'Basement', y: 0 }, { name: 'Ground floor & grounds', y: 4.2 }, { name: 'Second floor', y: 8.4 },
      { name: 'Third floor & terrace', y: 12.6 }, { name: 'Roof', y: 16.8 },
    ], checkpoint?.coins ?? DIFFICULTIES[difficulty].stealth.coins);
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
      for (const id of cp.leads ?? []) { this.leads.add(id); g.world.clues.markRead(id); }
      for (const id of cp.lostLeads ?? []) this.lostLeads.add(id);
      for (const id of cp.unlocked) {
        const d = g.world.doors.doors.find(x => x.prop.id === id);
        if (d?.prop.lock === 'pick') g.world.doors.pick(d);
        else if (d) g.world.doors.use(d, new Set([d.prop.lock ?? '']));
        this.doorsUnlocked.add(id);
      }
      // Bodies where you left them (stashed ones stay stashed).
      for (const b of cp.bodies ?? []) {
        const gd = this.guards.guards.find(x => x.id === b.id);
        if (!gd) continue;
        this.guards.placeBody(gd, b, b.yaw, b.hidden);
        if (b.hidden) {
          const spot = this.kit.hidingSpotNear(new THREE.Vector3(b.x, b.y, b.z), 2.5);
          if (spot) spot.used = true;
        }
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
    this.say(0.4, 'intro');
    this.say(4, 'intro-kit');
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
    this.eavesdrop(dt);
    this.updateRadio(dt);
    this.reyesChatter(dt);
    this.dragBody();
    this.stageLogic();
    if (this.stage < 4) this.partyWatch(dt);
    const marker = this.marker();
    this.hud.update(dt, g.gfx.camera, marker, this.guards.detections());
    this.kit.update(dt, this.mapMarkers(marker), marker ? `Objective: ${marker.label}` : '', true);
  }

  /** Keys while playing (the field kit: T tag, G coin, M map). */
  key(code: string): boolean {
    if (this.failed) return false;
    return this.kit.key(code);
  }

  /** What the mission puts on the tactical map. */
  private mapMarkers(objective: { pos: THREE.Vector3; label: string } | null): MapMarker[] {
    const g = this.game;
    const p = g.player;
    const out: MapMarker[] = [{ kind: 'player', x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw }];
    if (objective) out.push({ kind: 'objective', x: objective.pos.x, y: objective.pos.y - 1.6, z: objective.pos.z, label: objective.label });
    // Once you know where he is.
    if (this.reyes && (this.stage >= 2 || this.reyes.freed)) {
      const r = this.reyes.pos;
      out.push({ kind: 'reyes', x: r.x, y: r.y, z: r.z, label: 'Reyes' });
    }
    for (const id of this.leads) {
      const at = id === 'feeds' ? this.marks.get('terminal')?.clone().setY(0) : g.world.clues.position(id);
      if (at) out.push({ kind: 'clue', x: at.x, y: at.y, z: at.z });
    }
    const ex = this.marks.get('extract');
    if (ex) out.push({ kind: 'exit', x: ex.x, y: ex.y, z: ex.z, label: 'Van' });
    if (this.stage === 0) for (const e of ENTRIES) out.push({ kind: 'entry', x: e.pos.x, y: e.pos.y - 1.2, z: e.pos.z, label: e.label });
    return out;
  }

  // ---------- Stages ----------

  private showStage(): void {
    const s = STAGES[this.stage];
    this.hud.objective(s.title, this.stage === 1 ? `${s.text} (${Math.min(this.leads.size, LEADS_NEEDED)}/${LEADS_NEEDED})` : s.text, s.sub);
    this.showLeads();
  }

  private showLeads(): void {
    this.hud.leads(this.stage !== 1 ? [] : LEAD_ORDER.map(id => ({
      name: LEADS[id].name,
      state: this.leads.has(id) ? 'found' : this.lostLeads.has(id) ? 'lost' : 'open',
    })));
  }

  /** A line after a pause, once whoever's talking has finished. */
  private say(delay: number, id: VoiceLineId): void {
    if (!this.radioQueue.some(q => q[1] === id)) this.radioQueue.push([delay, id]);
  }

  /** Says a line now (from `at` for someone in the room) with its subtitle. */
  private speak(id: VoiceLineId, at?: THREE.Vector3): void {
    const g = this.game;
    const s = g.voice.say(id, at, at ? !g.world.clearLine(g.gfx.camera.position, at) : false);
    this.hud.radio(s.speaker, s.text, s.duration + 0.6);
    this.talking = s.duration + 0.3;
  }

  private updateRadio(dt: number): void {
    this.talking -= dt;
    this.sinceBark += dt;
    const next = this.radioQueue[0];
    if (!next || this.talking > 0) return;
    next[0] -= dt;
    if (next[0] > 0) return;
    this.radioQueue.shift();
    this.speak(next[1]);
  }

  /** Someone in the world calling out: voiced from where they are, subtitled if you're close. */
  private bark(kind: BarkKind, voice: Parameters<VoicePlayer['bark']>[1], at: THREE.Vector3, always = false): void {
    const g = this.game;
    if (!always && this.sinceBark < 0.8) return;
    const muffled = !g.world.clearLine(g.gfx.camera.position, at);
    const s = g.voice.bark(kind, voice, at, muffled);
    this.sinceBark = 0;
    const d = g.gfx.camera.position.distanceTo(at);
    if (this.talking <= 0 && d < (muffled ? 8 : 18)) this.hud.radio(s.speaker, s.text, s.duration + 0.5);
  }

  /** Reyes, on the way out: keeps up, flinches at gunfire, spots the van. */
  private reyesChatter(dt: number): void {
    const r = this.reyes;
    if (!r || !r.freed || !r.alive || this.stage !== 4) return;
    const t = this.reyesTalk;
    t.cooldown -= dt;
    t.hurtCooldown -= dt;
    const at = r.position.add(new THREE.Vector3(0, 1.6, 0));
    // Hit by anyone (guards shoot him too).
    if (r.hp < t.hp && t.hp !== Infinity && t.hurtCooldown <= 0) {
      this.bark('reyes-hurt', 'reyes', at, true);
      t.hurtCooldown = 2.5;
      t.cooldown = Math.max(t.cooldown, 3);
    }
    t.hp = r.hp;
    const scared = r.scared > 0;
    if (scared && !t.wasScared && t.cooldown <= 0) {
      this.bark('reyes-scared', 'reyes', at, true);
      t.cooldown = 7;
    } else if (t.cooldown <= 0 && at.distanceTo(this.game.gfx.camera.position) > 10) {
      this.bark('reyes-wait', 'reyes', at, true);
      t.cooldown = 9;
    }
    t.wasScared = scared;
    const van = this.marks.get('extract');
    if (!t.van && van && r.position.distanceTo(van) < 16) {
      t.van = true;
      this.bark('reyes-van', 'reyes', at, true);
    }
  }

  private advance(line?: VoiceLineId): void {
    this.stage++;
    this.showStage();
    this.game.audio.arpeggio([660, 880], 0.08, 0.12);
    if (line) this.say(0.3, line);
    this.saveCheckpoint();
  }

  private stageLogic(): void {
    const g = this.game;
    const p = g.player.pos;
    if (this.stage === 0) {
      const zone = g.world.zoneAt({ x: p.x, y: p.y + 1, z: p.z });
      if (zone && zone.floor !== 'Grounds') {
        this.advance('inside');
      }
    } else if (this.stage === 1 && this.leads.size >= LEADS_NEEDED) {
      this.advance();
      this.say(0.6, 'deduce');
    } else if (this.stage === 2 && this.items.has('keycard')) {
      this.advance('keycard');
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
      case 0: {
        // The nearer of the two ways in.
        const p = this.game.player.pos;
        const e = [...ENTRIES].sort((a, b) => a.pos.distanceTo(p as THREE.Vector3) - b.pos.distanceTo(p as THREE.Vector3))[0];
        return { pos: e.pos.clone(), label: e.label };
      }
      case 1: return null;
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
    const key = (text: string, hold?: HoldAction) => {
      const bar = hold ? `<span class="hold"><span style="width:${Math.round(((this.hold?.what === hold ? this.hold.t : 0) / holdTime(hold)) * 100)}%"></span></span>` : '';
      return `<kbd>E</kbd>${escapeHtml(text)}${hold ? ' (hold)' : ''}${bar}`;
    };
    if (this.dragging) return this.kit.hidingSpotNear(me) ? key('Hide the body') : key('Drop body');
    const t = this.guards.takedownTarget(me);
    if (t) return key(`Take down${t.name ? ` ${t.name}` : ''}`);
    const body = this.guards.searchable(me);
    if (body) return key(`Search ${body.name ?? 'body'}`);
    if (this.bodyNear(me)) return key('Drag body');
    if (this.atTerminal()) {
      if (!this.leads.has('feeds')) return key(LEADS.feeds.verb, 'feeds');
      if (!g.world.security.looped) return key('Loop the camera feeds', 'loop');
    }
    const clue = this.clueTarget();
    if (clue) return key(LEADS[clue].verb, clue);
    if (this.ledgerTarget()) return key("Take Castell's ledger");
    if (this.reyes && !this.reyes.freed && this.stage === 3 && this.reyes.position.distanceTo(me) < 1.8) return key('Free Reyes', 'free');
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(g.gfx.camera.quaternion);
    const door = g.world.doors.target(g.gfx.camera.position, look);
    if (this.listening) return '<span class="listen">Listening…</span>';
    if (door) {
      if (door.locked && door.prop.lock === 'pick') return key('Pick the lock', 'pick');
      if (door.locked) return door.prop.lock && this.items.has(door.prop.lock) ? key('Swipe keycard') : key('Locked (keycard)');
      return key(door.target > 0.5 ? 'Close door' : 'Open door');
    }
    return null;
  }

  interact(): boolean {
    const g = this.game;
    const me = new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z);
    if (this.dragging) {
      const spot = this.kit.hidingSpotNear(me);
      if (spot) this.stash(this.dragging, spot);
      else g.audio.takedown();
      this.dragging = null;
      g.player.speedMul = 1;
      return true;
    }
    if (this.ledgerTarget()) {
      this.items.add('ledger');
      g.world.clues.markRead('ledger');
      g.audio.pickup();
      g.hud.banner("Castell's ledger", 'Evidence for the prosecution');
      this.say(0.4, 'ledger');
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
    if (this.atTerminal() || this.clueTarget() || this.pickTarget() || (this.reyes && !this.reyes.freed && this.stage === 3 && this.reyes.position.distanceTo(me) < 1.8)) return true; // held
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

  /** Castell's ledger, if you're looking at it and haven't taken it. */
  private ledgerTarget(): boolean {
    const g = this.game;
    if (this.items.has('ledger')) return false;
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(g.gfx.camera.quaternion);
    return g.world.clues.target(g.gfx.camera.position, look)?.id === 'ledger';
  }

  /** A locked door you could pick, if you're looking at one. */
  private pickTarget() {
    const g = this.game;
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(g.gfx.camera.quaternion);
    const d = g.world.doors.target(g.gfx.camera.position, look);
    return d && d.locked && d.prop.lock === 'pick' ? d : null;
  }

  /** A body into a wardrobe or locker: it's gone for good (and anything it carried is yours). */
  private stash(b: Guard, spot: { pos: THREE.Vector3; used: boolean }): void {
    const g = this.game;
    spot.used = true;
    if (b.carries && !b.searched) {
      b.searched = true;
      this.items.add(b.carries);
      g.hud.banner(b.carries === 'keycard' ? 'Keycard' : b.carries, `Taken from ${b.name ?? 'the body'}`);
    }
    this.guards.hide(b);
    this.stats.hidden = (this.stats.hidden ?? 0) + 1;
    g.audio.door();
    g.audio.takedown();
  }

  /** The lead you're looking at, if it's one still worth examining. */
  private clueTarget(): LeadId | null {
    const g = this.game;
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(g.gfx.camera.quaternion);
    const c = g.world.clues.target(g.gfx.camera.position, look);
    return c && c.id in LEADS && !this.leads.has(c.id as LeadId) ? (c.id as LeadId) : null;
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
    let what: HoldAction | null = null;
    if (this.atTerminal()) what = !this.leads.has('feeds') ? 'feeds' : !g.world.security.looped ? 'loop' : null;
    else if (this.clueTarget()) what = this.clueTarget();
    else if (this.pickTarget()) what = 'pick';
    else if (this.reyes && !this.reyes.freed && this.stage === 3 && this.reyes.position.distanceTo(me) < 1.8) what = 'free';
    if (!what || !g.input.isDown('KeyE')) {
      this.hold = null;
      return;
    }
    if (this.hold?.what !== what) this.hold = { what, t: 0 };
    this.hold.t += dt;
    if (this.hold.t < holdTime(what)) return;
    this.hold = null;
    if (what in LEADS) {
      this.followLead(what as LeadId);
    } else if (what === 'pick') {
      const d = this.pickTarget();
      if (d) {
        g.world.doors.pick(d);
        this.doorsUnlocked.add(d.prop.id);
        g.audio.beep(2600, 0.03, 'square', 0.03);
        g.audio.door();
      }
    } else if (what === 'loop') {
      g.world.security.looped = true;
      g.audio.beep(900, 0.05, 'square', 0.05);
      this.say(0.2, 'looped');
    } else if (what === 'free') {
      this.freeReyes(false);
    }
  }

  // ---------- Leads ----------

  private followLead(id: LeadId): void {
    const g = this.game;
    if (this.leads.has(id)) return;
    this.leads.add(id);
    g.world.clues.markRead(id);
    const lead = LEADS[id];
    if (lead.card) this.hud.intel(lead.card.kind, lead.card.from, lead.card.title, lead.card.body);
    g.audio.beep(1200, 0.05, 'square', 0.05);
    g.audio.beep(1600, 0.05, 'square', 0.04, 0.07);
    this.say(id === 'smokers' ? 1 : 0.8, leadLine(id));
    if (this.stage === 1) this.showStage();
    // Each lead keeps (a checkpoint within the stage).
    if (this.stage <= 1) this.saveCheckpoint();
  }

  /** The two guards behind the garage talk about Reyes; get close enough unseen and you hear it all. */
  private eavesdrop(dt: number): void {
    this.listening = false;
    if (this.stage > 1 || this.leads.has('smokers') || this.lostLeads.has('smokers')) return;
    const a = this.guards.guards.find(x => x.id === 'smoke-1');
    const b = this.guards.guards.find(x => x.id === 'smoke-2');
    const spot = this.game.world.clues.position('smokers');
    if (!a || !b || !spot) return;
    if (!a.alive || !b.alive) {
      this.lostLeads.add('smokers');
      if (this.talk.line >= 0) this.say(0.5, 'smokers-lost');
      this.showLeads();
      return;
    }
    // Only while they're at ease; if they're spooked they start over once they settle.
    const calm = (x: Guard) => x.state === 'post' && x.awareness < 0.3;
    if (!calm(a) || !calm(b) || this.guards.alarm >= 2) {
      this.talk = { line: -1, t: 0 };
      return;
    }
    const p = this.game.player.pos;
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > LISTEN_RANGE || Math.abs(p.y - spot.y) > 2.5) return;
    this.listening = true;
    if (this.talk.line < 0) this.talk = { line: 0, t: 0 };
    const id = SMOKERS_TALK[this.talk.line];
    // Mills (smoke-1) has the even lines, Dario the odd ones; each line plays from whoever says it.
    if (this.talk.t === 0) this.speak(id, (this.talk.line % 2 ? b : a).eye);
    this.talk.t += dt;
    if (this.talk.t < this.game.voice.info(id).duration + 0.35) return;
    this.talk = { line: this.talk.line + 1, t: 0 };
    if (this.talk.line >= SMOKERS_TALK.length) this.followLead('smokers');
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
      this.speak('reyes-freed', this.reyes.position.add(new THREE.Vector3(0, 1.5, 0)));
      this.say(0.3, 'viper-got-him');
      this.say(0.2, 'lockdown');
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
        // Alerts before the escape (freeing Reyes sets off the lockdown on purpose).
        if (e.level >= 2 && this.stage < 4 && e.reason !== 'Lockdown') this.stats.alarms++;
        if (this.stage < 4 || e.level === 3) this.hud.alarm(e.level === 0 ? 'undetected' : e.level === 1 ? 'suspicious' : e.level === 2 ? 'alert' : 'lockdown');
        if (e.level === 2) this.say(0.6, alertLine(e.reason));
        if (e.level === 1 && e.reason === 'They lost you') this.say(0.4, 'lost-you');
        break;
      case 'killed':
        this.stats.kills++;
        break;
      case 'takedown':
        this.stats.takedowns++;
        break;
      case 'camera':
        if (this.stage < 4) this.say(0.3, 'camera-chatter');
        break;
      case 'reinforcements':
        this.say(0.5, 'reinforcements');
        break;
      case 'bodyFound':
        if (this.stage < 4) this.stats.bodiesFound = (this.stats.bodiesFound ?? 0) + 1;
        break;
      case 'bark':
        this.bark(e.kind, VoicePlayer.guardVoice(e.guard.id), e.at, e.kind === 'spotted' || e.kind === 'body');
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
      leads: [...this.leads],
      lostLeads: [...this.lostLeads],
      bodies: this.guards.guards.filter(x => !x.alive && !x.reinforcement)
        .map(x => ({ id: x.id, x: x.pos.x, y: x.pos.y, z: x.pos.z, yaw: x.yaw, hidden: x.hidden })),
      coins: this.kit.coins.count,
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
    g.setCheckpoint(undefined);
    storage.set('campaign.mansion.checkpoint', null);
    storage.set('campaign.mansion.complete', true);
    const best = storage.get<number | null>('campaign.mansion.best', null);
    if (best === null || time < best) storage.set('campaign.mansion.best', time);
    this.kit.map.close();
    this.speak('win');
    // They're in the van: the getaway, then the results.
    const scene = this.outro?.() ?? null;
    if (scene) {
      if (this.reyes?.avatar) this.reyes.avatar.group.visible = false;
      g.playOutro(scene, () => this.results(time));
    } else {
      g.audio.arpeggio([523, 659, 784, 1047], 0.12, 0.2);
      this.results(time);
    }
  }

  private record(time: number): RunRecord {
    return {
      alarms: this.stats.alarms, kills: this.stats.kills, bodiesFound: this.stats.bodiesFound ?? 0,
      leads: this.leads.size, ledger: this.items.has('ledger'), time,
    };
  }

  private results(time: number): void {
    const g = this.game;
    const run = this.record(time);
    const earned = new Set(storage.get<string[]>(CHALLENGES_KEY, []));
    const items = CHALLENGES.map(c => {
      const done = c.done(run);
      const fresh = done && !earned.has(c.id);
      if (done) earned.add(c.id);
      return `<li class="${done ? 'done' : ''}">${escapeHtml(c.name)}${fresh ? '<em>NEW</em>' : ''}</li>`;
    });
    storage.set(CHALLENGES_KEY, [...earned]);
    const ghost = this.stats.alarms === 0;
    g.endMatch({
      won: true, title: 'MISSION COMPLETE', subtitle: ghost ? 'Reyes is safe, and nobody ever knew you were there.' : 'Reyes is safe.',
      stats: [
        { label: 'Time', value: formatTime(time) },
        { label: 'Takedowns', value: String(this.stats.takedowns) },
        { label: 'Kills', value: String(this.stats.kills) },
        { label: 'Times spotted', value: String(this.stats.spotted) },
        { label: 'Bodies hidden', value: String(this.stats.hidden ?? 0) },
        { label: 'Rating', value: ghost ? 'Ghost' : this.stats.spotted <= 2 ? 'Professional' : 'Loud' },
      ],
      extraHtml: `<h3>CHALLENGES · ${[...earned].length}/${CHALLENGES.length} EARNED</h3><ul>${items.join('')}</ul>`,
    });
  }

  /** The pause screen: where you're at, the leads and what they said, the challenges. */
  pauseDetails(): string {
    const s = STAGES[this.stage];
    const parts = [`<h3>OBJECTIVE</h3><div class="pd-obj">${escapeHtml(s.text)}</div><p>${escapeHtml(s.sub)}</p>`];
    if (this.stage <= 1 || this.leads.size) {
      parts.push(`<h3>LEADS · ${this.leads.size}/${LEAD_ORDER.length}</h3>`);
      parts.push(LEAD_ORDER.map(id => {
        const lead = LEADS[id];
        if (!this.leads.has(id)) return `<ul><li class="${this.lostLeads.has(id) ? 'failed' : ''}">${escapeHtml(lead.name)}</li></ul>`;
        const said = this.game.voice.info(leadLine(id)).text;
        const body = lead.card ? lead.card.body : '';
        return `<details><summary>✓ ${escapeHtml(lead.name)}</summary><div class="intel-body">${body}<p><i>Overwatch: ${escapeHtml(said)}</i></p></div></details>`;
      }).join(''));
    }
    const run = this.record(this.elapsedBase + this.game.elapsed);
    const earned = new Set(storage.get<string[]>(CHALLENGES_KEY, []));
    parts.push(`<h3>CHALLENGES</h3><ul>${CHALLENGES.map(c => {
      const cls = earned.has(c.id) ? 'done' : !c.alive(run) ? 'failed' : '';
      return `<li class="${cls}">${escapeHtml(c.name)}</li>`;
    }).join('')}</ul>`);
    parts.push('<h3>KIT</h3><p>T tag a guard · G throw a coin · M tactical map · E take down, drag, hide a body in a wardrobe or locker</p>');
    return parts.join('');
  }

  dispose(): void {
    this.kit.dispose();
    this.game.player.speedMul = 1;
    if (this.game.actors === this.actors) this.game.actors = null;
    this.guards.dispose();
    this.reyes?.dispose();
    this.hud.hide();
  }
}

/** Overwatch's warning when the guards go on alert, for the reason they did. */
function alertLine(reason: string): VoiceLineId {
  if (reason === 'Gunshots heard') return 'alert-gunshots';
  if (reason === 'A camera spotted you') return 'alert-camera';
  if (reason.endsWith('spotted you')) return 'alert-spotted';
  if (reason === 'A body was found') return 'alert-body';
  return 'alert-other';
}
