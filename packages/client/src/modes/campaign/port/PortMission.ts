import * as THREE from 'three';
import { DIFFICULTIES, HARBOUR_LEVEL, OPS_UPPER, TARGET_BOX, type DifficultyId, type PropDef, type Vec3, type WeaponId } from '@gungame/shared';
import { VoicePlayer, type BarkKind } from '../../../audio/Voice';
import type { WorldActors } from '../../../core/actors';
import type { Game } from '../../../core/Game';
import { storage } from '../../../core/storage';
import type { Cutscene } from '../../../cutscenes/Cutscene';
import type { Guard } from '../../../npc/Guard';
import { GuardManager, type GuardEvent } from '../../../npc/GuardManager';
import { StoryNPC } from '../../../npc/StoryNPC';
import { escapeHtml, formatTime } from '../../../ui/dom';
import { MissionHud } from '../../../ui/MissionHud';
import { ConversationPlayer } from '../conversation';
import { FieldKit } from '../fieldKit';
import { RadioQueue } from '../radio';
import type { CampaignScript } from '../types';
import { Wardrobe } from '../wardrobe';
import { PORT_CHALLENGES, PORT_CHALLENGES_KEY } from './challenges';
import { ACCESS_NAMES, ACCESS_WARNINGS, accessOf, OUTFITS, PORT_PERCEPTION, UNIFORM_OF_LOOK, type Access, type Outfit } from './cover';
import { CAST, LEAD_ORDER, LEADS, LEADS_NEEDED, NADIA, REEFER_TALK, type LeadId } from './story';

/**
 * Chapter 3, The Port: into Terminal Est at Marseille-Fos with the night shift, to find which of the
 * Meridian's four containers holds their reserve, plant a charge on it, and walk out again.
 *
 * Undercover (cover.ts) works as on the Aurelia: what you wear decides where you can be. You start
 * outside the fence in your own clothes; Nadia has left you a docker's kit behind her car. Terminal
 * security's uniform (taken from one you've knocked out, or found in the gate office) gets you into the
 * offices. Nobody gets into the Meridian's compound on the quay: that part is stealth.
 *
 * The story: put the kit on; find Nadia in the canteen (she tells you where to look, and that security
 * took her bag with the charge in it at the shift's bag checks); get it back off the evidence rack in
 * the gate office; find out which box it is (any three of four leads); plant the charge on its doors;
 * then out through the hole in the west fence (Marchetti puts his men on the gates once it's on).
 */

type Pile = { outfit: Outfit; x: number; y: number; z: number; yaw: number };

export interface PortCheckpoint {
  stage: number;
  pos: Vec3;
  yaw: number;
  inventory: WeaponId[];
  elapsed: number;
  outfit?: Outfit;
  piles?: Pile[];
  bodies?: { id: string; x: number; y: number; z: number; yaw: number; hidden: boolean; stripped: boolean }[];
  coins?: number;
  leads?: LeadId[];
  items?: string[];
  stats?: { kills: number; takedowns: number; alarms: number; bodiesFound: number; warned: boolean };
}

const STAGES = [
  { title: 'Night shift', text: "Put on the kit behind Nadia's car", sub: 'The white hatchback in the staff car park. Inside the fence you need to look like you work here.' },
  { title: 'The contact', text: 'Find Nadia in the canteen', sub: 'Through the staff gate; the canteen is in the staff building just inside.' },
  { title: 'The bag', text: 'Get the charge back from the gate office', sub: "Nadia's bag is on the evidence rack in the guard room. Terminal security only: you'll need one of their uniforms, or nobody looking." },
  { title: 'Four boxes', text: 'Find out which container is the reserve', sub: "Three leads that agree. The planner's load plan upstairs in Ops, customs' scans, the gate office's bookings, or the Meridian's own talk." },
  { title: 'The charge', text: `Plant the charge on MRDU ${TARGET_BOX}`, sub: "In the Meridian's compound on the quay. Nobody's allowed in there: don't be seen. On its doors, in the gap between the boxes." },
  { title: 'Out', text: 'Get out through the hole in the west fence', sub: "Marchetti's men are on the gates now. The far west end of the fence, past the yard: the van's on the road beyond." },
];

/** Hold E this long to plant the charge. */
const PLANT_HOLD = 5;
/** How close you must be to hear the two by the reefers (m). */
const LISTEN = 8;
const KEY = 'campaign.port.checkpoint';
/** Seconds after a takedown (or while dragging a body, or planting) that anyone watching takes you for a threat. */
const HOSTILE_MEMORY = 3;

export class PortMission implements CampaignScript {
  readonly guards: GuardManager;
  readonly hud = new MissionHud();
  readonly kit: FieldKit;
  readonly radio: RadioQueue;
  readonly wardrobe: Wardrobe<Outfit>;
  outro: (() => Cutscene | null) | null = null;
  stage = 0;
  outfit: Outfit = 'civilian';
  private failed = false;
  private checkpoint: PortCheckpoint | null;
  private elapsedBase = 0;
  private dragging: Guard | null = null;
  private sinceHostile = 99;
  private sinceBark = 9;
  readonly npcs = new Map<string, StoryNPC>();
  readonly convo: ConversationPlayer;
  readonly leads = new Set<LeadId>();
  readonly items = new Set<string>();
  private hold: { what: string; t: number } | null = null;
  private talk = { line: -1, t: 0 };
  private readonly marks = new Map<string, THREE.Vector3>();
  private stats = { kills: 0, takedowns: 0, alarms: 0, bodiesFound: 0, warned: false };
  private listening = false;
  private cover = { access: 'public' as Access, allowed: true, hostile: false, odd: false };
  /** Once the charge is on: Marchetti's men on the gates, and the way out is the west fence. */
  private lockdown = false;
  /** Moves Overwatch's van (set by CampaignMode: the van is the intro's). */
  moveVan: ((x: number, z: number, yaw: number) => void) | null = null;
  /** The charge on the box's doors, once planted (a small block with a blinking light). */
  private charge: { group: THREE.Group; led: THREE.MeshBasicMaterial; t: number } | null = null;

  constructor(private readonly game: Game, props: readonly PropDef[], difficulty: DifficultyId, private readonly startCheckpoint: PortCheckpoint | null) {
    this.guards = new GuardManager(game, props, difficulty, new Set(startCheckpoint?.bodies?.map(b => b.id) ?? []));
    this.guards.onEvent = e => this.onGuardEvent(e);
    this.guards.suspicion = () => this.suspicion();
    this.guards.cameraSuspicion = () => (this.cover.hostile || !this.cover.allowed ? 1 : this.cover.odd ? 0.3 : 0) * PORT_PERCEPTION;
    this.radio = new RadioQueue(game, this.hud);
    this.kit = new FieldKit(game, this.guards, this.hud, props, [
      { name: 'Ground', y: 0 }, { name: 'Terminal Ops · upstairs', y: OPS_UPPER },
    ], startCheckpoint?.coins ?? DIFFICULTIES[difficulty].stealth.coins);
    this.wardrobe = new Wardrobe(game.gfx.scene, props, OUTFITS);
    for (const p of props) if (p.kind === 'character' && CAST[p.id]) this.npcs.set(p.id, new StoryNPC(p, CAST[p.id], game.gfx.scene));
    for (const p of props) if (p.kind === 'marker') this.marks.set(p.id, new THREE.Vector3(p.x, p.y, p.z));
    this.convo = new ConversationPlayer(game, this.hud);
    this.convo.onAction = a => this.storyAction(a);
    this.checkpoint = startCheckpoint;
  }

  get skipIntro(): boolean {
    return !!this.startCheckpoint;
  }

  readonly actors: WorldActors = {
    hitTargets: () => [...this.guards.hitTargets(), ...[...this.npcs.values()].filter(n => n.alive).map(n => n.hitbox)],
    hit: (obj, dmg, head, from) => {
      const npc = obj.userData.storyNpc as StoryNPC | undefined;
      if (npc) {
        npc.hurt(dmg * (head ? 2 : 1));
        if (!npc.alive) this.fail('You killed your contact.');
        return !npc.alive;
      }
      return this.guards.damage(obj.userData.guard as Guard, dmg, head, from);
    },
    noise: (at, radius, kind) => this.guards.noise(at, radius, kind),
    civilianHit: () => this.fail('You shot a dock worker.'),
  };

  start(): void {
    const g = this.game;
    g.actors = this.actors;
    this.hud.show();
    g.weapons.setInventory([]);
    const cp = this.startCheckpoint;
    if (cp) {
      this.stage = cp.stage;
      g.player.pos.set(cp.pos.x, cp.pos.y, cp.pos.z);
      g.player.yaw = cp.yaw;
      for (const w of cp.inventory) g.weapons.give(w, true);
      this.elapsedBase = cp.elapsed;
      this.outfit = cp.outfit ?? 'civilian';
      if (cp.piles) this.wardrobe.restore(cp.piles);
      for (const b of cp.bodies ?? []) {
        const gd = this.guards.guards.find(x => x.id === b.id);
        if (!gd) continue;
        gd.stripped = b.stripped;
        this.guards.placeBody(gd, b, b.yaw, b.hidden);
        if (b.hidden) {
          const spot = this.kit.hidingSpotNear(new THREE.Vector3(b.x, b.y, b.z), 2.5);
          if (spot) spot.used = true;
        }
      }
      for (const id of cp.leads ?? []) { this.leads.add(id); g.world.clues.markRead(id); }
      for (const i of cp.items ?? []) this.items.add(i);
      if (this.stage >= 3) g.world.clues.markRead('p-charge');
      if (cp.stats) Object.assign(this.stats, cp.stats);
      if (this.stage >= 5) { this.plantCharge(); this.lockDown(); }
      g.hud.banner('Checkpoint', STAGES[this.stage].title);
    }
    g.setOutfit(OUTFITS[this.outfit].style);
    this.refreshRestricted();
    this.showStage();
  }

  introDone(): void {
    if (this.startCheckpoint) return;
    this.saveCheckpoint();
    this.radio.say(0.6, 'c3-intro');
  }

  scenery(dt: number): void {
    for (const gd of this.guards.guards) gd.updateBody(dt, false);
    for (const n of this.npcs.values()) n.update(dt);
  }

  update(dt: number): void {
    if (this.failed) return;
    const g = this.game;
    const p = g.player.pos;
    this.sinceHostile += dt;
    this.sinceBark += dt;
    this.readCover();
    this.guards.update(dt);
    this.radio.update(dt);
    for (const n of this.npcs.values()) n.update(dt);
    this.convo.update(dt);
    this.updateHold(dt);
    this.eavesdrop(dt);
    this.dragBody();
    this.blinkCharge(dt);
    if (p.y < HARBOUR_LEVEL + 0.6) return this.fail('You went into the harbour.');
    if (this.stage === 3 && this.leads.size >= LEADS_NEEDED) this.advance(4, 'c3-found');
    if (this.stage === 5) {
      const ex = this.marks.get('extract-west');
      if (ex && Math.hypot(p.x - ex.x, p.z - ex.z) < 3.5) return this.win();
    }
    this.showCover();
    const marker = this.marker();
    this.hud.update(dt, g.gfx.camera, marker, this.guards.detections());
    this.kit.update(dt, [
      { kind: 'player', x: p.x, y: p.y, z: p.z, yaw: g.player.yaw },
      ...(marker ? [{ kind: 'objective' as const, x: marker.pos.x, y: marker.pos.y - 1.6, z: marker.pos.z, label: marker.label }] : []),
    ], marker ? `Objective: ${marker.label}` : '', true);
  }

  // ---------- Cover ----------

  private readCover(): void {
    const g = this.game;
    const p = g.player;
    const zone = g.world.zoneAt({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z });
    const access = accessOf(zone?.name, this.lockdown);
    this.cover = {
      access,
      allowed: OUTFITS[this.outfit].access.includes(access),
      hostile: !g.weapons.holstered || this.sinceHostile < HOSTILE_MEMORY || !!this.dragging,
      odd: p.horizontalSpeed > 6.5 || p.stance !== 'stand',
    };
  }

  /** How a guard reacts to you right now (see GuardManager.suspicion). */
  private suspicion(): { rate: number; cap: number; trespass: boolean } {
    const c = this.cover;
    const k = PORT_PERCEPTION;
    if (this.guards.alarm >= 2) return { rate: k, cap: 1, trespass: false };
    if (c.hostile) return { rate: 2 * k, cap: 1, trespass: false };
    // The Meridian don't warn you off their own ground.
    if (!c.allowed) return { rate: k, cap: 1, trespass: c.access !== 'private' };
    if (c.odd) return { rate: 0.6 * k, cap: 0.6, trespass: false };
    return { rate: 0, cap: 0, trespass: false };
  }

  private showCover(): void {
    const c = this.cover;
    // Stepping somewhere you don't belong: the warning card, a two-tone alarm, the red edge while you're in.
    if (this.hud.restricted(c.allowed ? null : `${ACCESS_NAMES[c.access]}`, ACCESS_WARNINGS[c.access])) {
      this.game.audio.beep(740, 0.12, 'square', 0.05);
      this.game.audio.beep(520, 0.18, 'square', 0.05, 0.14);
    }
    const watched = this.guards.guards.some(x => x.alive && x.awareness > 0.3 && x.state !== 'combat');
    if (this.guards.alarm >= 2) this.hud.status('COVER BLOWN', 'alert');
    else if (!c.allowed) this.hud.status(`RESTRICTED · ${ACCESS_NAMES[c.access].toUpperCase()}`, 'suspicious');
    else if (c.hostile && watched) this.hud.status('SUSPICIOUS', 'suspicious');
    else if (watched) this.hud.status('BEING WATCHED', 'suspicious');
    else this.hud.status(`COVER · ${OUTFITS[this.outfit].name.toUpperCase()}`, 'undetected');
  }

  private changeInto(outfit: Outfit): void {
    const g = this.game;
    if (outfit === this.outfit) return;
    const feet = new THREE.Vector3(g.player.pos.x, g.player.pos.y + 0.02, g.player.pos.z);
    this.wardrobe.add(this.outfit, feet.addScaledVector(new THREE.Vector3(-Math.sin(g.player.yaw), 0, -Math.cos(g.player.yaw)), 0.5));
    this.outfit = outfit;
    g.setOutfit(OUTFITS[outfit].style);
    g.audio.takedown();
    g.hud.banner(OUTFITS[outfit].name, `Allowed: ${OUTFITS[outfit].access.map(a => ACCESS_NAMES[a]).join(', ')}`);
    this.refreshRestricted();
    if (this.stage === 0 && outfit !== 'civilian') this.advance(1, 'c3-dressed');
  }

  // ---------- Hands-on (E) ----------

  private bodyNear(me: THREE.Vector3): Guard | null {
    return this.guards.guards.find(x => !x.alive && !x.hidden && new THREE.Vector3(x.pos.x, x.pos.y, x.pos.z).distanceTo(me) < 1.8) ?? null;
  }

  private uniformOf(body: Guard): Outfit | null {
    const o = UNIFORM_OF_LOOK[body.def.look ?? 'suit'];
    return o && !body.stripped && o !== this.outfit ? o : null;
  }

  private dragBody(): void {
    const b = this.dragging;
    if (!b) return;
    const p = this.game.player;
    const behind = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    b.pos.x = p.pos.x + behind.x * 0.7;
    b.pos.z = p.pos.z + behind.z * 0.7;
    b.pos.y = p.pos.y;
    b.yaw = p.yaw + Math.PI;
  }

  private look(): { eye: THREE.Vector3; dir: THREE.Vector3 } {
    const cam = this.game.gfx.camera;
    return { eye: cam.position, dir: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion) };
  }

  prompt(): string | null {
    const g = this.game;
    const me = new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z);
    const key = (text: string) => `<kbd>E</kbd>${escapeHtml(text)}`;
    const bar = (what: string, need: number) => `<span class="hold"><span style="width:${Math.round(((this.hold?.what === what ? this.hold.t : 0) / need) * 100)}%"></span></span>`;
    if (this.dragging) return this.kit.hidingSpotNear(me) ? key('Hide the body') : key('Drop body');
    const t = this.guards.takedownTarget(me);
    if (t) return key(`Take down${t.name ? ` ${t.name}` : ''}`);
    const body = this.guards.searchable(me);
    if (body) return key(`Search ${body.name ?? 'body'}`);
    const near = this.bodyNear(me);
    if (near && this.uniformOf(near)) return key('Take his uniform');
    if (near) return key('Drag body');
    const { eye, dir } = this.look();
    const box = this.boxTarget();
    if (box === 'plant') return key('Plant the charge') + ' (hold)' + bar('plant', PLANT_HOLD);
    if (box === 'unknown') return '<span class="listen">Which one? Find out first.</span>';
    if (this.talkTarget()) return key('Talk to Nadia');
    if (this.bagTarget()) return key("Take Nadia's bag");
    const lead = this.leadTarget();
    if (lead) return key(LEADS[lead].verb) + ' (hold)' + bar(lead, LEADS[lead].hold);
    const pile = this.wardrobe.target(eye, dir);
    if (pile && pile.outfit !== this.outfit) return key(`Change into: ${OUTFITS[pile.outfit].name}`);
    if (this.listening) return '<span class="listen">Listening…</span>';
    const door = g.world.doors.target(eye, dir);
    if (door) {
      if (door.locked) return door.prop.lock && this.items.has(door.prop.lock) ? key('Unlock') : key('Locked');
      return key(door.target > 0.5 ? 'Close door' : 'Open door');
    }
    return null;
  }

  interact(): boolean {
    const g = this.game;
    const me = new THREE.Vector3(g.player.pos.x, g.player.pos.y, g.player.pos.z);
    if (this.dragging) {
      const spot = this.kit.hidingSpotNear(me);
      if (spot) {
        spot.used = true;
        this.guards.hide(this.dragging);
        g.audio.door();
      }
      g.audio.takedown();
      this.dragging = null;
      g.player.speedMul = 1;
      return true;
    }
    const t = this.guards.takedownTarget(me);
    if (t) {
      this.guards.takeDown(t);
      this.sinceHostile = 0;
      this.workersSee(me, 'A docker saw you attack someone');
      return true;
    }
    const body = this.guards.searchable(me);
    if (body) {
      body.searched = true;
      g.audio.pickup();
      return true;
    }
    const near = this.bodyNear(me);
    const uniform = near ? this.uniformOf(near) : null;
    if (near && uniform) {
      near.stripped = true;
      this.changeInto(uniform);
      return true;
    }
    if (near) {
      this.dragging = near;
      g.player.speedMul = 0.5;
      g.input.stance = 'crouch';
      return true;
    }
    if (this.boxTarget()) return true; // held, or not yet known
    if (this.talkTarget()) {
      this.convo.start(NADIA, this.npcs.get('nadia')!);
      return true;
    }
    if (this.bagTarget()) {
      this.items.add('charge');
      g.world.clues.markRead('p-charge');
      g.audio.pickup();
      g.hud.banner('The charge', 'Magnetic. On the doors, then walk away.');
      this.advance(3, 'c3-bag');
      return true;
    }
    if (this.leadTarget()) return true; // held
    const { eye, dir } = this.look();
    const pile = this.wardrobe.target(eye, dir);
    if (pile && pile.outfit !== this.outfit) {
      this.wardrobe.take(pile);
      this.changeInto(pile.outfit);
      return true;
    }
    const door = g.world.doors.target(eye, dir);
    if (door) {
      const r = g.world.doors.use(door, this.items);
      if (r === 'locked') g.audio.beep(220, 0.12, 'square', 0.06);
      else if (r === 'unlocked') { g.audio.beep(1500, 0.06, 'square', 0.05); g.audio.beep(2000, 0.06, 'square', 0.05, 0.08); }
      else g.audio.door();
      return true;
    }
    return false;
  }

  // ---------- The story ----------

  private talkTarget(): StoryNPC | null {
    if (this.convo.active || this.stage !== 1) return null;
    const npc = this.npcs.get('nadia');
    if (!npc || !npc.alive) return null;
    const { eye, dir } = this.look();
    const to = npc.head.sub(eye);
    return to.length() < 2.6 && to.normalize().dot(dir) > 0.7 ? npc : null;
  }

  /** Nadia's bag on the evidence rack, while you need it. */
  private bagTarget(): boolean {
    if (this.stage !== 2) return false;
    const { eye, dir } = this.look();
    return this.game.world.clues.target(eye, dir)?.id === 'p-charge';
  }

  /** At the Meridian's boxes with the charge: 'plant' if it's the right one, 'unknown' if you don't know yet. */
  private boxTarget(): 'plant' | 'unknown' | null {
    if (this.stage < 3 || this.stage > 4 || !this.items.has('charge')) return null;
    const at = this.marks.get('charge');
    if (!at) return null;
    const { eye, dir } = this.look();
    const to = at.clone().sub(eye);
    if (to.length() > 2.2 || to.normalize().dot(dir) < 0.6) return null;
    return this.stage === 4 ? 'plant' : 'unknown';
  }

  private leadTarget(): LeadId | null {
    if (this.stage < 1) return null;
    const { eye, dir } = this.look();
    const c = this.game.world.clues.target(eye, dir);
    return c && c.id in LEADS && !this.leads.has(c.id as LeadId) ? (c.id as LeadId) : null;
  }

  /** Hold-E actions: reading things, planting the charge. */
  private updateHold(dt: number): void {
    const g = this.game;
    const what = this.boxTarget() === 'plant' ? 'plant' : this.leadTarget();
    if (!what || !g.input.isDown('KeyE')) { this.hold = null; return; }
    const need = what === 'plant' ? PLANT_HOLD : LEADS[what as LeadId].hold;
    if (this.hold?.what !== what) this.hold = { what, t: 0 };
    this.hold.t += dt;
    // Kneeling at the Meridian's box with a bomb: anyone who sees that knows what you are.
    if (what === 'plant') this.sinceHostile = HOSTILE_MEMORY - 0.5;
    if (this.hold.t < need) return;
    this.hold = null;
    if (what === 'plant') {
      this.items.delete('charge');
      this.plantCharge();
      g.audio.beep(1800, 0.05, 'square', 0.04);
      g.audio.beep(1800, 0.05, 'square', 0.04, 0.2);
      g.hud.banner('Charge planted', `MRDU ${TARGET_BOX}`);
      this.lockDown();
      // (The checkpoint puts you back outside the cut in the fence, not in the gap between their boxes.)
      this.advance(5, 'c3-planted', this.marks.get('after-plant'));
    } else this.learn(what as LeadId);
  }

  private learn(id: LeadId): void {
    const g = this.game;
    if (this.leads.has(id)) return;
    this.leads.add(id);
    g.world.clues.markRead(id);
    const it = LEADS[id];
    if (it.card) this.hud.intel(it.card.kind, it.card.from, it.card.title, it.card.body);
    g.audio.beep(1200, 0.05, 'square', 0.05);
    this.radio.say(0.8, it.radio);
    if (this.stage === 3) this.showStage();
    this.saveCheckpoint();
  }

  /** The two by the reefers: get close enough unnoticed and you hear it all. */
  private eavesdrop(dt: number): void {
    this.listening = false;
    if (this.stage < 1 || this.leads.has('p-overheard')) return;
    const a = this.guards.guards.find(x => x.id === 'mer-reefer-1');
    const b = this.guards.guards.find(x => x.id === 'mer-reefer-2');
    const spot = this.game.world.clues.position('p-overheard');
    if (!a || !b || !spot || !a.alive || !b.alive) return;
    if (a.state !== 'post' || b.state !== 'post' || this.guards.alarm >= 2) { this.talk = { line: -1, t: 0 }; return; }
    const p = this.game.player.pos;
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > LISTEN || Math.abs(p.y - spot.y) > 2.5) return;
    this.listening = true;
    if (this.talk.line < 0) this.talk = { line: 0, t: 0 };
    const id = REEFER_TALK[this.talk.line];
    if (this.talk.t === 0) this.radio.speak(id, (this.talk.line % 2 ? b : a).eye);
    this.talk.t += dt;
    if (this.talk.t < this.game.voice.info(id).duration + 0.35) return;
    this.talk = { line: this.talk.line + 1, t: 0 };
    if (this.talk.line >= REEFER_TALK.length) this.learn('p-overheard');
  }

  private storyAction(a: string): void {
    if (a === 'nadia') this.advance(2, 'c3-nadia-done');
  }

  /**
   * The charge is on: Marchetti sends his two reserves to watch the staff and truck gates (nobody gets
   * past them), and Overwatch brings the van round to the road beyond the west fence.
   */
  private lockDown(): void {
    if (this.lockdown) return;
    this.lockdown = true;
    for (const [id, mark] of [['mer-reserve-1', 'gatecheck-1'], ['mer-reserve-2', 'gatecheck-2']] as const) {
      const gd = this.guards.guards.find(x => x.id === id);
      const at = this.marks.get(mark);
      const def = gd?.def as { x: number; z: number; yaw: number } | undefined;
      if (!gd || !at || !def) continue;
      def.x = at.x; def.z = at.z; def.yaw = Math.PI;
    }
    const van = this.game.world.map.props.find(p => p.kind === 'marker' && p.id === 'van-west');
    if (van && van.kind === 'marker') this.moveVan?.(van.x, van.z, van.yaw ?? 0);
    this.refreshRestricted();
  }

  /** Shade on the tactical map wherever your clothes don't belong. */
  private refreshRestricted(): void {
    const allowed = OUTFITS[this.outfit].access;
    const off = this.game.world.map.zones.filter(z => !allowed.includes(accessOf(z.name, this.lockdown)));
    // (A yard inside the terminal, when the whole terminal is off limits, would only shade it twice.)
    const inside = (a: typeof off[number], b: typeof off[number]) => a !== b && a.min.x >= b.min.x && a.max.x <= b.max.x && a.min.z >= b.min.z && a.max.z <= b.max.z && a.min.y >= b.min.y - 0.01 && a.max.y <= b.max.y + 0.01;
    this.kit.map.restricted = off.filter(a => !off.some(b => inside(a, b)));
  }

  /** The charge on the box's doors: a dark block with a red light that blinks. */
  private plantCharge(): void {
    if (this.charge) return;
    const at = this.marks.get('charge');
    if (!at) return;
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: 0x2a2d2a, roughness: 0.7 }));
    const led = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), led);
    lamp.position.set(-0.05, 0.07, 0.1);
    group.add(body, lamp);
    group.position.copy(at);
    this.game.gfx.scene.add(group);
    this.charge = { group, led, t: 0 };
  }

  private blinkCharge(dt: number): void {
    const c = this.charge;
    if (!c) return;
    c.t += dt;
    c.led.color.setHex(c.t % 1.2 < 0.15 ? 0xff3b2a : 0x2a0806);
  }

  private advance(stage: number, line?: Parameters<RadioQueue['say']>[1], restartAt?: THREE.Vector3): void {
    this.stage = stage;
    this.showStage();
    this.game.audio.arpeggio([660, 880], 0.08, 0.12);
    if (line) this.radio.say(0.4, line);
    this.saveCheckpoint(restartAt);
  }

  /** The night shift calls security if they see you attack someone. */
  private workersSee(at: THREE.Vector3, reason: string): void {
    const chest = at.clone().add(new THREE.Vector3(0, 1.2, 0));
    for (const pos of this.game.world.party.positions()) {
      const eye = pos.clone().add(new THREE.Vector3(0, 1.6, 0));
      if (eye.distanceTo(chest) < 16 && this.game.world.clearLine(eye, chest)) {
        this.guards.raise(2, reason);
        this.guards.noise(at, 30, 'voice');
        return;
      }
    }
  }

  key(code: string): boolean {
    if (this.failed) return false;
    if (this.convo.key(code)) return true;
    return this.kit.key(code);
  }

  // ---------- Events, objectives, checkpoints ----------

  private onGuardEvent(e: GuardEvent): void {
    if (e.type === 'killed') this.stats.kills++;
    if (e.type === 'takedown') this.stats.takedowns++;
    if (e.type === 'bodyFound') this.stats.bodiesFound++;
    if (e.type === 'alarm' && e.level >= 2) this.stats.alarms++;
    if (e.type === 'bark' && e.kind === 'warn') this.stats.warned = true;
    if (e.type === 'bark') this.bark(e.kind, VoicePlayer.guardVoice(e.guard.id), e.at, e.kind === 'spotted' || e.kind === 'body' || e.kind === 'warn');
  }

  private bark(kind: BarkKind, voice: Parameters<VoicePlayer['bark']>[1], at: THREE.Vector3, always: boolean): void {
    const g = this.game;
    if (!always && this.sinceBark < 0.8) return;
    const muffled = !g.world.clearLine(g.gfx.camera.position, at);
    // (The terminal's guards have their own way of telling you to leave.)
    const s = g.voice.bark(kind === 'warn' ? 'warnPort' : kind, voice, at, muffled);
    this.sinceBark = 0;
    if ((this.radio.talking <= 0 || kind === 'warn') && g.gfx.camera.position.distanceTo(at) < (muffled ? 8 : 18)) this.hud.radio(s.speaker, s.text, s.duration + 0.5);
  }

  private marker(): { pos: THREE.Vector3; label: string } | null {
    if (this.stage === 0) {
      const pile = this.wardrobe.piles.find(p => p.outfit === 'docker');
      return pile ? { pos: pile.group.position.clone().setY(pile.group.position.y + 1), label: 'Your kit' } : null;
    }
    if (this.stage === 1) { const n = this.npcs.get('nadia'); return n ? { pos: n.head.add(new THREE.Vector3(0, 0.6, 0)), label: 'Nadia' } : null; }
    if (this.stage === 2) { const at = this.game.world.clues.position('p-charge'); return at ? { pos: at.clone().setY(at.y + 0.8), label: "Nadia's bag" } : null; }
    if (this.stage === 3) {
      // The nearest lead not yet followed up.
      const me = this.game.player.pos;
      let best: { pos: THREE.Vector3; label: string } | null = null;
      let bestD = Infinity;
      for (const id of LEAD_ORDER) {
        if (this.leads.has(id)) continue;
        const at = this.game.world.clues.position(id);
        if (!at) continue;
        const d = at.distanceTo(me) + Math.abs(at.y - me.y) * 6;
        if (d < bestD) { bestD = d; best = { pos: at.clone().setY(at.y + 0.6), label: LEADS[id].name.replace(/ \(.*\)$/, '') }; }
      }
      return best;
    }
    if (this.stage === 4) { const at = this.marks.get('charge'); return at ? { pos: at.clone().setY(at.y + 1.2), label: `MRDU ${TARGET_BOX}` } : null; }
    if (this.stage === 5) { const ex = this.marks.get('extract-west'); return ex ? { pos: ex.clone().setY(ex.y + 1.6), label: 'The way out' } : null; }
    return null;
  }

  private showStage(): void {
    const s = STAGES[this.stage];
    this.hud.objective(s.title, this.stage === 3 ? `${s.text} (${Math.min(this.leads.size, LEADS_NEEDED)}/${LEADS_NEEDED})` : s.text, s.sub);
    this.hud.leads(this.stage !== 3 ? [] : LEAD_ORDER.map(id => ({ name: LEADS[id].name, state: this.leads.has(id) ? 'found' : 'open' })));
  }

  pauseDetails(): string {
    const s = STAGES[this.stage];
    const o = OUTFITS[this.outfit];
    const leads = this.stage < 3 ? '' : `<h3>THE FOUR BOXES · ${this.leads.size}/${LEAD_ORDER.length}</h3>` + LEAD_ORDER.map(id => {
      const it = LEADS[id];
      if (!this.leads.has(id)) return `<ul><li>${escapeHtml(it.name)}</li></ul>`;
      return `<details><summary>✓ ${escapeHtml(it.name)}</summary><div class="intel-body">${it.card?.body ?? ''}<p><i>Overwatch: ${escapeHtml(this.game.voice.info(it.radio).text)}</i></p></div></details>`;
    }).join('');
    return `<h3>OBJECTIVE</h3><div class="pd-obj">${escapeHtml(s.text)}</div><p>${escapeHtml(s.sub)}</p>` +
      `<h3>COVER · ${escapeHtml(o.name.toUpperCase())}</h3><p>Welcome in: ${escapeHtml(o.access.map(a => ACCESS_NAMES[a]).join(', '))}. ` +
      'Nobody minds you there. They notice a gun in your hand (H holsters it), running or creeping about, a takedown, a body. ' +
      "Anywhere else they warn you off first (the red edge on screen means you're somewhere you shouldn't be; M shows where). Take a terminal security officer's uniform for the offices. Nobody is allowed in the Meridian's compound, and they don't warn.</p>" +
      leads +
      '<h3>KIT</h3><p>T tag · G throw a coin · M tactical map · H holster · E take down, drag, hide a body in a locker</p>';
  }

  private saveCheckpoint(at?: THREE.Vector3): void {
    const g = this.game;
    this.checkpoint = {
      stage: this.stage,
      pos: at ? { x: at.x, y: at.y, z: at.z } : { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z },
      yaw: at ? Math.PI : g.player.yaw,
      inventory: [...g.weapons.carried],
      elapsed: this.elapsedBase + g.elapsed,
      outfit: this.outfit,
      piles: this.wardrobe.snapshot(),
      bodies: this.guards.guards.filter(x => !x.alive && !x.reinforcement)
        .map(x => ({ id: x.id, x: x.pos.x, y: x.pos.y, z: x.pos.z, yaw: x.yaw, hidden: x.hidden, stripped: x.stripped })),
      coins: this.kit.coins.count,
      leads: [...this.leads],
      items: [...this.items],
      stats: { ...this.stats },
    };
    storage.set(KEY, this.checkpoint);
  }

  private win(): void {
    const g = this.game;
    this.failed = true;
    const time = this.elapsedBase + g.elapsed;
    g.setCheckpoint(undefined);
    storage.set(KEY, null);
    storage.set('campaign.port.complete', true);
    const best = storage.get<number | null>('campaign.port.best', null);
    if (best === null || time < best) storage.set('campaign.port.best', time);
    this.kit.map.close();
    const scene = this.outro?.() ?? null;
    if (scene) g.playOutro(scene, () => this.results(time));
    else { this.radio.speak('c3-win'); this.results(time); }
  }

  private results(time: number): void {
    const run = { alarms: this.stats.alarms, kills: this.stats.kills, takedowns: this.stats.takedowns, bodiesFound: this.stats.bodiesFound, intel: this.leads.size, neverWarned: !this.stats.warned };
    const earned = new Set(storage.get<string[]>(PORT_CHALLENGES_KEY, []));
    const items = PORT_CHALLENGES.map(c => {
      const done = c.done(run);
      const fresh = done && !earned.has(c.id);
      if (done) earned.add(c.id);
      return `<li class="${done ? 'done' : ''}">${escapeHtml(c.name)}${fresh ? '<em>NEW</em>' : ''}</li>`;
    });
    storage.set(PORT_CHALLENGES_KEY, [...earned]);
    const silent = this.stats.alarms === 0;
    this.game.endMatch({
      won: true, title: 'MISSION COMPLETE',
      subtitle: silent ? "The Sirocco sailed on time, and the Meridian's reserve went to the bottom with her deck cargo. Nobody at Terminal Est remembers a new docker." : "The Meridian's reserve is gone.",
      stats: [
        { label: 'Time', value: formatTime(time) },
        { label: 'Takedowns', value: String(this.stats.takedowns) },
        { label: 'Kills', value: String(this.stats.kills) },
        { label: 'Leads', value: `${this.leads.size}/4` },
        { label: 'Bodies found', value: String(this.stats.bodiesFound) },
        { label: 'Rating', value: silent && this.stats.kills === 0 ? 'Silent Assassin' : silent ? 'Professional' : 'Loud' },
      ],
      extraHtml: `<h3>CHALLENGES · ${earned.size}/${PORT_CHALLENGES.length} EARNED</h3><ul>${items.join('')}</ul>`,
    });
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

  dispose(): void {
    this.game.player.speedMul = 1;
    if (this.game.actors === this.actors) this.game.actors = null;
    this.convo.end();
    for (const n of this.npcs.values()) n.dispose();
    this.charge?.group.removeFromParent();
    this.kit.dispose();
    this.wardrobe.dispose();
    this.guards.dispose();
    this.hud.hide();
    this.game.setOutfit(null);
  }
}
