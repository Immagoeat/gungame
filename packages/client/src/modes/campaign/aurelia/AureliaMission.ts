import * as THREE from 'three';
import { DIFFICULTIES, SEA_LEVEL, type DifficultyId, type PropDef, type Vec3, type WeaponId } from '@gungame/shared';
import { VoicePlayer, type BarkKind } from '../../../audio/Voice';
import type { WorldActors } from '../../../core/actors';
import type { Game } from '../../../core/Game';
import { storage } from '../../../core/storage';
import type { Cutscene } from '../../../cutscenes/Cutscene';
import type { Guard } from '../../../npc/Guard';
import { GuardManager, type GuardEvent } from '../../../npc/GuardManager';
import { escapeHtml, formatTime } from '../../../ui/dom';
import { MissionHud } from '../../../ui/MissionHud';
import { StoryNPC } from '../../../npc/StoryNPC';
import { ConversationPlayer } from '../conversation';
import { FieldKit } from '../fieldKit';
import { RadioQueue } from '../radio';
import type { CampaignScript } from '../types';
import { ACCESS_NAMES, accessOf, OUTFITS, type Access, type Outfit } from './cover';
import { CAST, castellTalk, FELIX, INTEL, INTEL_NEEDED, INTEL_ORDER, POOL_TALK, type IntelId } from './story';
import { AURELIA_CHALLENGES, AURELIA_CHALLENGES_KEY } from './challenges';
import { ValeRoutine, type ValeDeath } from './vale';
import { Wardrobe } from '../wardrobe';

/**
 * Chapter 2, The Aurelia: aboard a cruise ship as "Marco Navarro", with the invitation Kessler had,
 * to find out who the Meridian are, reach their boss Augustin Vale, and kill him. Castell is aboard
 * too, under Vale's protection.
 *
 * Undercover (cover.ts): what you wear decides where you can be. In the open you blend in and nobody
 * looks twice; guards only get suspicious when you give them a reason: being somewhere your clothes
 * don't belong (they warn you off first), a gun in your hand, running or creeping about, a takedown or
 * a body they see. Change into uniforms you find (or take one off a ship's officer you've knocked
 * out); what you take off stays where you left it. A full alert blows your cover until it dies down.
 *
 * The story so far (story.ts): find Felix, your contact, at the casino bar and talk to him; collect
 * the gun he left in the spa; find out who the Meridian are (any three of five things to read or
 * overhear); then see Castell in his suite, who can give you Vale's keycard. Vale follows.
 */

type Pile = { outfit: Outfit; x: number; y: number; z: number; yaw: number };

export interface AureliaCheckpoint {
  stage: number;
  pos: Vec3;
  yaw: number;
  inventory: WeaponId[];
  elapsed: number;
  outfit?: Outfit;
  piles?: Pile[];
  bodies?: { id: string; x: number; y: number; z: number; yaw: number; hidden: boolean; stripped: boolean }[];
  coins?: number;
  intel?: IntelId[];
  items?: string[];
  askedBooks?: boolean;
  threatened?: boolean;
  stats?: { kills: number; takedowns: number; alarms: number; bodiesFound: number };
}

const STAGES = [
  { title: 'Aboard', text: 'Find your contact in the casino', sub: "Deck 4, amidships. You're Marco Navarro, a guest of the Meridian: act like one." },
  { title: 'The contact', text: 'Talk to Felix at the casino bar', sub: "He knows your face from the file. Let him do the talking." },
  { title: 'Armed', text: 'Get what Felix left you: spa, deck 5, locker 12', sub: 'Through the lido bar to the spa. Guests are welcome there.' },
  { title: 'The Meridian', text: 'Find out who the Meridian are', sub: "Any three leads. Felix said start with the purser's records and the hold: you'll need to look like crew for those." },
  { title: 'Castell', text: 'Talk to Castell in his suite, deck 6', sub: "One of Vale's men is on his door, and deck 6 is for the Meridian and the staff who serve them." },
  { title: 'Vale', text: 'Kill Augustin Vale', sub: "The Board meets in the lounge, and he drinks a toast from the decanter on the bar (the medical centre, deck 3, keeps digoxin). After that, his desk, then his balcony alone. His suite takes his keycard." },
  { title: 'Out', text: "Get to the stern: Overwatch's boat", sub: 'Deck 4, aft. Walk if you can.' },
];

/** Hold E this long to poison the decanter. */
const POISON_HOLD = 2;

/** Hold E this long to open the locker. */
const LOCKER_HOLD = 1.2;
/** How close you have to be to hear the two at the pool bar (m). */
const LISTEN = 8;

const KEY = 'campaign.aurelia.checkpoint';
/** Seconds after a takedown (or while dragging a body) that anyone watching takes you for a threat. */
const HOSTILE_MEMORY = 3;

export class AureliaMission implements CampaignScript {
  readonly guards: GuardManager;
  readonly hud = new MissionHud();
  readonly kit: FieldKit;
  readonly radio: RadioQueue;
  readonly wardrobe: Wardrobe<Outfit>;
  outro: (() => Cutscene | null) | null = null;
  stage = 0;
  outfit: Outfit = 'suit';
  private failed = false;
  private checkpoint: AureliaCheckpoint | null;
  private elapsedBase = 0;
  private dragging: Guard | null = null;
  private sinceHostile = 99;
  private sinceBark = 9;
  /** Named characters, by id. */
  readonly npcs = new Map<string, StoryNPC>();
  readonly convo: ConversationPlayer;
  readonly intel = new Set<IntelId>();
  readonly items = new Set<string>();
  private askedBooks = false;
  private threatened = false;
  private hold: { what: string; t: number; need: number } | null = null;
  private talk = { line: -1, t: 0 };
  /** Vale's night (once you're after him). */
  readonly vale: ValeRoutine | null;
  private readonly marks = new Map<string, THREE.Vector3>();
  private stats = { kills: 0, takedowns: 0, alarms: 0, bodiesFound: 0, method: '' as ValeDeath | '' };
  private listening = false;
  /** Worked out once a frame: where you are, what that means for your cover. */
  private cover = { access: 'public' as Access, allowed: true, hostile: false, odd: false };

  constructor(private readonly game: Game, props: readonly PropDef[], difficulty: DifficultyId, private readonly startCheckpoint: AureliaCheckpoint | null) {
    this.guards = new GuardManager(game, props, difficulty, new Set(startCheckpoint?.bodies?.map(b => b.id) ?? []));
    this.guards.onEvent = e => this.onGuardEvent(e);
    this.guards.suspicion = g => this.suspicion(g);
    this.guards.cameraSuspicion = () => (this.cover.hostile || !this.cover.allowed ? 1 : this.cover.odd ? 0.3 : 0);
    this.radio = new RadioQueue(game, this.hud);
    this.kit = new FieldKit(game, this.guards, this.hud, props, [
      { name: 'Deck 2 · Crew', y: 0 }, { name: 'Deck 3 · Staterooms', y: 3.5 }, { name: 'Deck 4 · Promenade', y: 7 },
      { name: 'Deck 5 · Lido', y: 10.5 }, { name: 'Deck 6 · Meridian', y: 14 }, { name: 'Deck 7 · Bridge', y: 17.5 },
    ], startCheckpoint?.coins ?? DIFFICULTIES[difficulty].stealth.coins);
    this.wardrobe = new Wardrobe(game.gfx.scene, props, OUTFITS);
    for (const p of props) if (p.kind === 'character' && CAST[p.id]) this.npcs.set(p.id, new StoryNPC(p, CAST[p.id], game.gfx.scene));
    for (const p of props) if (p.kind === 'marker') this.marks.set(p.id, new THREE.Vector3(p.x, p.y, p.z));
    const v = this.npcs.get('vale');
    this.vale = v ? new ValeRoutine(game, v, this.radio, this.marks, how => this.valeDied(how)) : null;
    this.convo = new ConversationPlayer(game, this.hud);
    this.convo.onAction = a => this.storyAction(a);
    this.checkpoint = startCheckpoint;
  }

  get skipIntro(): boolean {
    return !!this.startCheckpoint;
  }

  /** What the world's bullets and noises talk to. */
  readonly actors: WorldActors = {
    hitTargets: () => [...this.guards.hitTargets(), ...[...this.npcs.values()].filter(n => n.alive).map(n => n.hitbox)],
    hit: (obj, dmg, head, from) => {
      const npc = obj.userData.storyNpc as StoryNPC | undefined;
      if (npc) {
        npc.hurt(dmg * (head ? 2 : 1));
        if (!npc.alive) this.npcKilled(npc);
        return !npc.alive;
      }
      return this.guards.damage(obj.userData.guard as Guard, dmg, head, from);
    },
    noise: (at, radius, kind) => this.guards.noise(at, radius, kind),
    civilianHit: () => this.fail('You shot a passenger.'),
  };

  start(): void {
    const g = this.game;
    g.actors = this.actors;
    this.hud.show();
    const cp = this.startCheckpoint;
    if (cp) {
      this.stage = cp.stage;
      g.player.pos.set(cp.pos.x, cp.pos.y, cp.pos.z);
      g.player.yaw = cp.yaw;
      g.weapons.setInventory([]);
      // Felix's pistol: suppressed, and holstered until you draw it.
      if (cp.inventory.includes('pistol')) g.weapons.give('pistol', true, { muzzle: 'suppressor' });
      this.elapsedBase = cp.elapsed;
      this.outfit = cp.outfit ?? 'suit';
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
      for (const id of cp.intel ?? []) { this.intel.add(id); g.world.clues.markRead(id); }
      for (const i of cp.items ?? []) this.items.add(i);
      this.askedBooks = !!cp.askedBooks;
      this.threatened = !!cp.threatened;
      if (cp.stats) Object.assign(this.stats, cp.stats);
      if (this.stage === 5) this.vale?.begin();
      g.hud.banner('Checkpoint', STAGES[this.stage].title);
    }
    g.setOutfit(OUTFITS[this.outfit].style);
    this.refreshRestricted();
    this.showStage();
  }

  introDone(): void {
    if (this.startCheckpoint) return;
    this.saveCheckpoint();
    this.radio.say(0.6, 'c2-intro');
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
    this.vale?.update(dt);
    this.convo.update(dt);
    this.updateHold(dt);
    this.eavesdrop(dt);
    this.dragBody();
    // Over the side: the sea.
    if (p.y < SEA_LEVEL + 0.6) return this.fail('You went overboard.');
    if (this.stage === 0 && g.world.zoneAt({ x: p.x, y: p.y + 1, z: p.z })?.name === 'Casino') this.advance(1, 'c2-casino');
    if (this.stage === 3 && this.intel.size >= INTEL_NEEDED) this.advance(4, 'c2-meridian-done');
    if (this.stage === 6) {
      const ex = this.marks.get('extract');
      if (ex && Math.hypot(p.x - ex.x, p.z - ex.z) < 4.5 && Math.abs(p.y - ex.y) < 1.5) return this.win();
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

  /** Where you are and what you're doing, as far as anyone watching is concerned. */
  private readCover(): void {
    const g = this.game;
    const p = g.player;
    const zone = g.world.zoneAt({ x: p.pos.x, y: p.pos.y + 1, z: p.pos.z });
    const access = accessOf(zone?.name);
    this.cover = {
      access,
      allowed: OUTFITS[this.outfit].access.includes(access),
      // A gun in your hand, a takedown just now, a body over your shoulder.
      hostile: !g.weapons.holstered || this.sinceHostile < HOSTILE_MEMORY || !!this.dragging,
      // Running, or creeping about: odd, not alarming.
      odd: p.horizontalSpeed > 6.5 || p.stance !== 'stand',
    };
  }

  /** How a guard reacts to you right now (see GuardManager.suspicion). */
  private suspicion(_g: Guard): { rate: number; cap: number; trespass: boolean } {
    const c = this.cover;
    if (this.guards.alarm >= 2) return { rate: 1, cap: 1, trespass: false };
    if (c.hostile) return { rate: 2, cap: 1, trespass: false };
    if (!c.allowed) return { rate: 1, cap: 1, trespass: true };
    if (c.odd) return { rate: 0.6, cap: 0.6, trespass: false };
    return { rate: 0, cap: 0, trespass: false };
  }

  private showCover(): void {
    const c = this.cover;
    // Stepping somewhere you don't belong: the warning card, a two-tone alarm, the red edge while you're in.
    if (this.hud.restricted(c.allowed ? null : ACCESS_NAMES[c.access], "you'll be warned off")) {
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

  /** Into other clothes; what you had on is left folded at your feet. */
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
  }

  /** Shade on the tactical map wherever your clothes don't belong. */
  private refreshRestricted(): void {
    const allowed = OUTFITS[this.outfit].access;
    this.kit.map.restricted = this.game.world.map.zones.filter(z => !allowed.includes(accessOf(z.name)));
  }

  // ---------- Hands-on: takedowns, bodies, clothes (E) ----------

  private bodyNear(me: THREE.Vector3): Guard | null {
    return this.guards.guards.find(x => !x.alive && !x.hidden && new THREE.Vector3(x.pos.x, x.pos.y, x.pos.z).distanceTo(me) < 1.8) ?? null;
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
    if (this.dragging) return this.kit.hidingSpotNear(me) ? key('Hide the body') : key('Drop body');
    const t = this.guards.takedownTarget(me);
    if (t) return key(`Take down${t.name ? ` ${t.name}` : ''}`);
    const body = this.guards.searchable(me);
    if (body) return key(`Search ${body.name ?? 'body'}`);
    const near = this.bodyNear(me);
    if (near && near.def.look === 'crew' && !near.stripped && this.outfit !== 'security') return key('Take his uniform');
    if (near) return key('Drag body');
    const { eye, dir } = this.look();
    const bar = (what: string, need: number) => `<span class="hold"><span style="width:${Math.round(((this.hold?.what === what ? this.hold.t : 0) / need) * 100)}%"></span></span>`;
    if (this.vale?.pushable(me)) return key('Push Vale over the rail');
    const npc = this.talkTarget();
    if (npc) return key(`Talk to ${npc.name}`);
    const thing = this.thingTarget();
    if (thing === 'vial') return key('Take the vial');
    if (thing === 'decanter') return key('Poison the decanter') + ' (hold)' + bar('decanter', POISON_HOLD);
    if (this.atLocker()) return key('Open locker 12') + ' (hold)' + bar('locker', LOCKER_HOLD);
    const intel = this.intelTarget();
    if (intel) return key(INTEL[intel].verb) + ' (hold)' + bar(intel, INTEL[intel].hold);
    const pile = this.wardrobe.target(eye, dir);
    if (pile && pile.outfit !== this.outfit) return key(`Change into: ${OUTFITS[pile.outfit].name}`);
    if (this.listening) return '<span class="listen">Listening…</span>';
    const door = g.world.doors.target(eye, dir);
    if (door) {
      if (door.locked) return door.prop.lock && this.items.has(door.prop.lock) ? key('Swipe keycard') : key('Locked');
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
      this.passengersSee(me, 'A passenger saw you attack someone');
      return true;
    }
    const body = this.guards.searchable(me);
    if (body) {
      body.searched = true;
      g.audio.pickup();
      return true;
    }
    const near = this.bodyNear(me);
    if (near && near.def.look === 'crew' && !near.stripped && this.outfit !== 'security') {
      near.stripped = true;
      this.changeInto('security');
      return true;
    }
    if (near) {
      this.dragging = near;
      g.player.speedMul = 0.5;
      g.input.stance = 'crouch';
      return true;
    }
    if (this.vale?.pushable(me)) {
      this.vale.push();
      this.sinceHostile = 0;
      g.audio.takedown();
      return true;
    }
    const thing = this.thingTarget();
    if (thing === 'vial') {
      this.items.add('poison');
      g.world.clues.markRead('vial');
      g.audio.pickup();
      g.hud.banner('Digoxin', 'Enough to stop a heart');
      this.radio.say(0.4, 'c2-poison');
      return true;
    }
    if (thing === 'decanter') return true; // held
    const npc = this.talkTarget();
    if (npc) {
      this.convo.start(npc.id === 'felix' ? FELIX : castellTalk({
        uniformed: () => this.outfit !== 'suit',
        armed: () => g.weapons.carried.length > 0,
        askedBooks: () => this.askedBooks,
      }), npc);
      return true;
    }
    if (this.atLocker() || this.intelTarget()) return true; // held
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

  // ---------- The story: people, the locker, what there is to find out ----------

  /** Someone you can talk to right now, if you're facing them close by. */
  private talkTarget(): StoryNPC | null {
    if (this.convo.active) return null;
    const who = this.stage === 1 ? 'felix' : this.stage === 4 ? 'castell' : null;
    const npc = who ? this.npcs.get(who) : undefined;
    if (!npc || !npc.alive) return null;
    const { eye, dir } = this.look();
    const to = npc.head.sub(eye);
    return to.length() < 2.6 && to.normalize().dot(dir) > 0.7 ? npc : null;
  }

  /** The vial in the medical centre (once you're after Vale), or the decanter (once you have the vial). */
  private thingTarget(): 'vial' | 'decanter' | null {
    if (this.stage !== 5) return null;
    const { eye, dir } = this.look();
    const c = this.game.world.clues.target(eye, dir);
    if (c?.id === 'vial' && !this.items.has('poison') && !this.vale?.poisoned) return 'vial';
    // Before the toast: once he's drunk, it's too late.
    if (c?.id === 'decanter' && this.items.has('poison') && this.vale && !this.vale.poisoned && ['waiting', 'toBoard', 'board'].includes(this.vale.phase)) return 'decanter';
    return null;
  }

  private valeDied(how: ValeDeath): void {
    const g = this.game;
    this.stats.method = how;
    if (how === 'shot') this.stats.kills++;
    // A man collapsing at the Board brings people running; one going over the side, nobody saw.
    if (how === 'poison' && this.vale) this.guards.noise(this.vale.npc.pos.clone().setY(this.vale.npc.pos.y + 1), 22, 'voice');
    g.hud.banner('Augustin Vale is dead', how === 'poison' ? 'Heart failure at the Board' : how === 'overboard' ? 'Lost overboard' : 'Shot');
    this.advance(6, how === 'poison' ? 'c2-vale-poison' : how === 'overboard' ? 'c2-vale-overboard' : 'c2-vale-shot');
  }

  private atLocker(): boolean {
    if (this.stage !== 2) return false;
    const at = this.game.world.clues.position('spa-locker');
    if (!at) return false;
    const { eye, dir } = this.look();
    const to = at.clone().sub(eye);
    return to.length() < 2 && to.normalize().dot(dir) > 0.75;
  }

  private intelTarget(): IntelId | null {
    if (this.stage < 2) return null;
    const { eye, dir } = this.look();
    const c = this.game.world.clues.target(eye, dir);
    return c && c.id in INTEL && !this.intel.has(c.id as IntelId) ? (c.id as IntelId) : null;
  }

  /** Hold-E actions: the locker, reading things. */
  private updateHold(dt: number): void {
    const g = this.game;
    const what = this.atLocker() ? 'locker' : this.thingTarget() === 'decanter' ? 'decanter' : this.intelTarget();
    if (!what || !g.input.isDown('KeyE')) { this.hold = null; return; }
    const need = what === 'locker' ? LOCKER_HOLD : what === 'decanter' ? POISON_HOLD : INTEL[what as IntelId].hold;
    if (this.hold?.what !== what) this.hold = { what, t: 0, need };
    this.hold.t += dt;
    if (this.hold.t < need) return;
    this.hold = null;
    if (what === 'locker') {
      // A pistol with a suppressor, fully loaded, holstered.
      g.weapons.give('pistol', true, { muzzle: 'suppressor' });
      g.audio.door();
      g.audio.pickup();
      g.hud.banner('Pistol', 'H to draw it. Keep it away unless you mean it.');
      this.advance(3, 'c2-gun');
    } else if (what === 'decanter') {
      if (this.vale) this.vale.poisoned = true;
      this.items.delete('poison');
      g.world.clues.markRead('decanter');
      g.audio.beep(900, 0.04, 'sine', 0.03);
      g.hud.banner('The decanter', "Vale's toast is poisoned");
    } else this.learn(what as IntelId);
  }

  private learn(id: IntelId): void {
    const g = this.game;
    if (this.intel.has(id)) return;
    this.intel.add(id);
    g.world.clues.markRead(id);
    const it = INTEL[id];
    if (it.card) this.hud.intel(it.card.kind, it.card.from, it.card.title, it.card.body);
    g.audio.beep(1200, 0.05, 'square', 0.05);
    this.radio.say(0.8, it.radio);
    if (this.stage === 3) this.showStage();
    this.saveCheckpoint();
  }

  /** The two at the pool bar: get close enough unseen and you hear it all. */
  private eavesdrop(dt: number): void {
    this.listening = false;
    if (this.stage < 2 || this.intel.has('m-overheard')) return;
    const a = this.guards.guards.find(x => x.id === 'mer-pool-1');
    const b = this.guards.guards.find(x => x.id === 'mer-pool-2');
    const spot = this.game.world.clues.position('m-overheard');
    if (!a || !b || !spot || !a.alive || !b.alive) return;
    if (a.state !== 'post' || b.state !== 'post' || this.guards.alarm >= 2) { this.talk = { line: -1, t: 0 }; return; }
    const p = this.game.player.pos;
    if (Math.hypot(p.x - spot.x, p.z - spot.z) > LISTEN || Math.abs(p.y - spot.y) > 2.5) return;
    this.listening = true;
    if (this.talk.line < 0) this.talk = { line: 0, t: 0 };
    const id = POOL_TALK[this.talk.line];
    if (this.talk.t === 0) this.radio.speak(id, (this.talk.line % 2 ? b : a).eye);
    this.talk.t += dt;
    if (this.talk.t < this.game.voice.info(id).duration + 0.35) return;
    this.talk = { line: this.talk.line + 1, t: 0 };
    if (this.talk.line >= POOL_TALK.length) this.learn('m-overheard');
  }

  /** What a conversation sets off. */
  private storyAction(a: string): void {
    const g = this.game;
    if (a === 'felixDone') this.advance(2, 'c2-felix-done');
    else if (a === 'books') this.askedBooks = true;
    else if (a === 'keycard' || a === 'keycardThreat') {
      this.items.add('valeCard');
      this.threatened = a === 'keycardThreat';
      g.audio.pickup();
      g.hud.banner("Vale's keycard", 'His suite, deck 6');
      this.advance(5, 'c2-keycard');
    }
  }

  private npcKilled(npc: StoryNPC): void {
    if (npc.id === 'felix') this.fail('You killed your contact.');
    else this.guards.raise(2, `${npc.name} was shot`);
  }

  private advance(stage: number, line?: Parameters<RadioQueue['say']>[1]): void {
    this.stage = stage;
    if (stage === 5) this.vale?.begin();
    this.showStage();
    this.game.audio.arpeggio([660, 880], 0.08, 0.12);
    if (line) this.radio.say(0.4, line);
    this.saveCheckpoint();
  }

  /** Passengers who see something they shouldn't call for help: the ship's security comes running. */
  private passengersSee(at: THREE.Vector3, reason: string): void {
    const chest = at.clone().add(new THREE.Vector3(0, 1.2, 0));
    for (const pos of this.game.world.party.positions()) {
      const eye = pos.clone().add(new THREE.Vector3(0, 1.6, 0));
      if (eye.distanceTo(chest) < 14 && this.game.world.clearLine(eye, chest)) {
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
    if (e.type === 'bark') this.bark(e.kind, VoicePlayer.guardVoice(e.guard.id), e.at, e.kind === 'spotted' || e.kind === 'body' || e.kind === 'warn');
  }

  private bark(kind: BarkKind, voice: Parameters<VoicePlayer['bark']>[1], at: THREE.Vector3, always: boolean): void {
    const g = this.game;
    if (!always && this.sinceBark < 0.8) return;
    const muffled = !g.world.clearLine(g.gfx.camera.position, at);
    const s = g.voice.bark(kind, voice, at, muffled);
    this.sinceBark = 0;
    // A warning is meant for you: it always gets a subtitle.
    if ((this.radio.talking <= 0 || kind === 'warn') && g.gfx.camera.position.distanceTo(at) < (muffled ? 8 : 18)) this.hud.radio(s.speaker, s.text, s.duration + 0.5);
  }

  private marker(): { pos: THREE.Vector3; label: string } | null {
    const head = (id: string) => this.npcs.get(id)?.head.add(new THREE.Vector3(0, 0.6, 0));
    if (this.stage === 0) return { pos: new THREE.Vector3(-19, 8.6, 0), label: 'Casino' };
    if (this.stage === 1) { const h = head('felix'); return h ? { pos: h, label: 'Felix' } : null; }
    if (this.stage === 2) { const at = this.game.world.clues.position('spa-locker'); return at ? { pos: at.clone(), label: 'Locker 12' } : null; }
    if (this.stage === 3) {
      // The nearest lead you haven't followed up yet.
      const me = this.game.player.pos;
      let best: { pos: THREE.Vector3; label: string } | null = null;
      for (const id of INTEL_ORDER) {
        if (this.intel.has(id)) continue;
        const at = this.game.world.clues.position(id);
        if (!at) continue;
        const d = at.distanceTo(me) + Math.abs(at.y - me.y) * 6;
        if (!best || d < best.pos.distanceTo(me) + Math.abs(best.pos.y - me.y) * 6) best = { pos: at.clone().setY(at.y + 0.6), label: INTEL[id].name.replace(/ \(.*\)$/, '') };
      }
      return best;
    }
    if (this.stage === 4) { const h = head('castell'); return h ? { pos: h, label: 'Castell' } : null; }
    if (this.stage === 5 && this.vale?.npc.alive) return { pos: this.vale.npc.head.add(new THREE.Vector3(0, 0.6, 0)), label: 'Vale' };
    if (this.stage === 6) { const ex = this.marks.get('extract'); return ex ? { pos: ex.clone().setY(ex.y + 1.2), label: 'Boat' } : null; }
    return null;
  }

  private showStage(): void {
    const s = STAGES[this.stage];
    this.hud.objective(s.title, this.stage === 3 ? `${s.text} (${Math.min(this.intel.size, INTEL_NEEDED)}/${INTEL_NEEDED})` : s.text, s.sub);
    this.hud.leads(this.stage !== 3 ? [] : INTEL_ORDER.map(id => ({ name: INTEL[id].name, state: this.intel.has(id) ? 'found' : 'open' })));
  }

  pauseDetails(): string {
    const s = STAGES[this.stage];
    const o = OUTFITS[this.outfit];
    return `<h3>OBJECTIVE</h3><div class="pd-obj">${escapeHtml(s.text)}</div><p>${escapeHtml(s.sub)}</p>` +
      `<h3>COVER · ${escapeHtml(o.name.toUpperCase())}</h3><p>Welcome in: ${escapeHtml(o.access.map(a => ACCESS_NAMES[a]).join(', '))}. ` +
      'Nobody minds you there. They notice a gun in your hand (H holsters it), running or creeping about, a takedown, a body. ' +
      'Anywhere else they warn you off first. Change into uniforms you find, or take one off a ship\'s officer you\'ve knocked out.</p>' +
      this.boardHtml() +
      '<h3>KIT</h3><p>T tag · G throw a coin · M tactical map · H holster · E take down, drag, hide a body in a wardrobe or locker</p>';
  }

  /** What you know about the Meridian so far. */
  private boardHtml(): string {
    if (this.stage < 2) return '';
    const found = INTEL_ORDER.filter(id => this.intel.has(id));
    const rows = INTEL_ORDER.map(id => {
      const it = INTEL[id];
      if (!this.intel.has(id)) return `<ul><li>${escapeHtml(it.name)}</li></ul>`;
      return `<details><summary>✓ ${escapeHtml(it.name)}</summary><div class="intel-body">${it.card?.body ?? ''}<p><i>Overwatch: ${escapeHtml(this.game.voice.info(it.radio).text)}</i></p></div></details>`;
    });
    return `<h3>THE MERIDIAN · ${found.length}/${INTEL_ORDER.length}</h3>${rows.join('')}`;
  }

  private saveCheckpoint(): void {
    const g = this.game;
    this.checkpoint = {
      stage: this.stage,
      pos: { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z },
      yaw: g.player.yaw,
      inventory: [...g.weapons.carried],
      elapsed: this.elapsedBase + g.elapsed,
      outfit: this.outfit,
      piles: this.wardrobe.snapshot(),
      bodies: this.guards.guards.filter(x => !x.alive && !x.reinforcement)
        .map(x => ({ id: x.id, x: x.pos.x, y: x.pos.y, z: x.pos.z, yaw: x.yaw, hidden: x.hidden, stripped: x.stripped })),
      coins: this.kit.coins.count,
      intel: [...this.intel],
      items: [...this.items],
      askedBooks: this.askedBooks,
      threatened: this.threatened,
      stats: { kills: this.stats.kills, takedowns: this.stats.takedowns, alarms: this.stats.alarms, bodiesFound: this.stats.bodiesFound },
    };
    storage.set(KEY, this.checkpoint);
  }

  private win(): void {
    const g = this.game;
    this.failed = true;
    const time = this.elapsedBase + g.elapsed;
    g.setCheckpoint(undefined);
    storage.set(KEY, null);
    storage.set('campaign.aurelia.complete', true);
    const best = storage.get<number | null>('campaign.aurelia.best', null);
    if (best === null || time < best) storage.set('campaign.aurelia.best', time);
    this.kit.map.close();
    this.radio.speak('c2-win');
    const scene = this.outro?.() ?? null;
    if (scene) g.playOutro(scene, () => this.results(time));
    else this.results(time);
  }

  private results(time: number): void {
    const run = {
      alarms: this.stats.alarms, otherKills: this.stats.kills - (this.stats.method === 'shot' ? 1 : 0), bodiesFound: this.stats.bodiesFound,
      intel: this.intel.size, threatened: this.threatened, method: this.stats.method,
    };
    const earned = new Set(storage.get<string[]>(AURELIA_CHALLENGES_KEY, []));
    const items = AURELIA_CHALLENGES.map(c => {
      const done = c.done(run);
      const fresh = done && !earned.has(c.id);
      if (done) earned.add(c.id);
      return `<li class="${done ? 'done' : ''}">${escapeHtml(c.name)}${fresh ? '<em>NEW</em>' : ''}</li>`;
    });
    storage.set(AURELIA_CHALLENGES_KEY, [...earned]);
    const silent = this.stats.alarms === 0;
    const method = { poison: 'Poisoned', overboard: 'Overboard', shot: 'Shot', '': '—' }[this.stats.method];
    this.game.endMatch({
      won: true, title: 'MISSION COMPLETE',
      subtitle: silent ? 'Augustin Vale is dead, and the Aurelia sails on without him. Nobody knows you were ever aboard.' : 'Augustin Vale is dead.',
      stats: [
        { label: 'Time', value: formatTime(time) },
        { label: 'Vale', value: method },
        { label: 'Takedowns', value: String(this.stats.takedowns) },
        { label: 'Kills', value: String(this.stats.kills) },
        { label: 'Meridian intel', value: `${this.intel.size}/5` },
        { label: 'Rating', value: silent && run.otherKills === 0 ? 'Silent Assassin' : silent ? 'Professional' : 'Loud' },
      ],
      extraHtml: `<h3>CHALLENGES · ${earned.size}/${AURELIA_CHALLENGES.length} EARNED</h3><ul>${items.join('')}</ul>`,
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
    this.kit.dispose();
    this.wardrobe.dispose();
    this.guards.dispose();
    this.hud.hide();
    this.game.setOutfit(null);
  }
}
