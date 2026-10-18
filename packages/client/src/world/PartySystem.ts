import * as THREE from 'three';
import { DEFAULT_LOOK, LOOK_OPTIONS, type AABB, type BlockMaterial, type CharacterLook, type PropDef } from '@gungame/shared';
import { getModel, MODEL_FILES } from '../assets/AssetLibrary';
import type { CivilianStyle } from '../entities/character/soldierOutfit';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { findBones, scaleToHeight } from '../entities/character/rig';
import { dressSoldier } from '../entities/character/soldierOutfit';
import { PartyGuest, type GuestSetup } from '../entities/party/PartyGuest';

type GuestProp = Extract<PropDef, { kind: 'guest' }>;

/** Party palettes: dresses and shirts in evening colours, dark trousers. */
const DRESS = [0x0e0e10, 0xa4142a, 0x1d3f8a, 0xd8b45c, 0x0f5a4a, 0xe8e1d6, 0x6b2a7a, 0xc26a8a];
const SHIRT = [0xf2f2f0, 0x1a1a1c, 0x8fb4d8, 0x2a3a5a, 0xe8d8c8, 0x5a1a2a];
const SUIT = [0x16181d, 0x2a2f3a, 0x3a3226, 0xe8e2d4, 0x4a1a24];
const TROUSERS = [0x16181d, 0x2c2f36, 0x3a3226, 0x5a5448, 0x1d2a3e];
const SHOES = [0x0d0d0e, 0x3a2416, 0x1a1210];

/**
 * Brings the party to life: one PartyGuest per guest prop, each given a look, outfit, height and drink
 * from its seed, plus a small collision box so you can't walk through people. Needs the character
 * model; without it the party is just dressing.
 */
export class PartySystem {
  readonly guests: PartyGuest[] = [];
  private readonly boxes: AABB[] = [];

  constructor(
    root: THREE.Group, props: readonly PropDef[], private readonly colliders: AABB[],
    private readonly info: Map<AABB, { material: BlockMaterial; resistance: number; invisible: boolean }>,
  ) {
    const gltf = getModel(MODEL_FILES.player);
    if (!gltf) return;
    for (const p of props) {
      if (p.kind !== 'guest') continue;
      const guest = new PartyGuest(gltf, setupFor(p));
      guest.group.position.set(p.x, p.y, p.z);
      guest.group.rotation.y = p.yaw;
      root.add(guest.group);
      this.guests.push(guest);
      if (p.activity !== 'sit') {
        const box: AABB = { min: { x: p.x - 0.25, y: p.y, z: p.z - 0.25 }, max: { x: p.x + 0.25, y: p.y + 1.8, z: p.z + 0.25 } };
        colliders.push(box);
        // Soft for bullets, and no bullet holes on thin air.
        info.set(box, { material: 'fabric', resistance: 3, invisible: true });
        this.boxes.push(box);
      }
    }
  }

  private frame = 0;

  /**
   * Builds the guests' bodies ahead of time, one per idle moment (e.g. while the main menu is up), so
   * loading the party later only has to pose them. Safe to call more than once.
   */
  static prewarm(props: readonly PropDef[]): void {
    const gltf = getModel(MODEL_FILES.player);
    if (!gltf) return;
    const queue = props.filter((p): p is GuestProp => p.kind === 'guest');
    const idle = (cb: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 50));
    const next = () => {
      const p = queue.shift();
      if (!p) return;
      const setup = setupFor(p);
      const model = cloneSkinned(gltf.scene);
      scaleToHeight(model, findBones(model), setup.height);
      dressSoldier(model, setup.look, setup.style);
      idle(next);
    };
    idle(next);
  }

  /** Guests near the camera animate every frame; distant ones every second or third (they're small). */
  isGuestBox(box: AABB): boolean {
    return this.boxes.includes(box);
  }

  /** Where the guests are (for 'did the party notice' checks). */
  positions(): THREE.Vector3[] {
    return this.guests.map(g => g.group.position);
  }

  /** Something's gone wrong: everyone stops and cowers. */
  panic(): void {
    for (const g of this.guests) g.panic();
  }

  update(dt: number, time: number, camera?: THREE.Vector3): void {
    this.frame++;
    this.guests.forEach((g, i) => {
      const d = camera ? camera.distanceTo(g.group.position) : 0;
      const every = d > 26 ? 4 : d > 13 ? 3 : d > 5 ? 2 : 1;
      if ((this.frame + i) % every === 0) g.update(dt * every, time);
    });
  }

  dispose(): void {
    for (const b of this.boxes) {
      const i = this.colliders.indexOf(b);
      if (i >= 0) this.colliders.splice(i, 1);
      this.info.delete(b);
    }
  }
}

function setupFor(p: GuestProp): GuestSetup {
  let s = p.seed * 7919 + 13;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length) % a.length];
  if (p.dress === 'worker') return workerSetup(p, r, pick);
  // Staff dress the part; guests are about half in dresses, half in shirts, tees or blazers.
  const staff = p.activity === 'bartender' || p.activity === 'dj';
  const dress = !staff && r() < 0.5;
  const top: CivilianStyle['top'] = p.activity === 'bartender' ? 'shirt' : p.activity === 'dj' ? 'tee' : dress ? 'dress' : pick(['shirt', 'blazer', 'blazer', 'tee'] as const);
  const style: CivilianStyle = {
    top,
    topColor: p.activity === 'bartender' ? 0x111113 : p.activity === 'dj' ? 0x1a1a1c : dress ? pick(DRESS) : top === 'blazer' ? pick(SUIT) : pick(SHIRT),
    bottomColor: pick(TROUSERS),
    accent: dress ? (r() < 0.4 ? 0xd8b45c : undefined) : top === 'blazer' ? pick([0xf4f4f2, 0x111113, 0xe8d8e8]) : undefined,
    shoes: pick(SHOES),
    hairStyle: dress ? pick(['long', 'long', 'bun'] as const) : pick(['short', 'short', 'buzz'] as const),
  };
  const look: CharacterLook = {
    ...DEFAULT_LOOK,
    skin: pick(LOOK_OPTIONS.skin).id,
    hair: pick(LOOK_OPTIONS.hair).id,
    face: dress ? 'clean' : pick(['clean', 'clean', 'stubble', 'short', 'beard', 'goatee', 'moustache']),
    headgear: p.activity === 'dj' ? 'cap' : 'none',
    vest: 'none',
    gloves: 'none',
  };
  const drinkable = p.activity !== 'dj' && p.activity !== 'bartender';
  return {
    activity: p.activity,
    seed: p.seed,
    height: dress ? 1.6 + r() * 0.12 : 1.72 + r() * 0.14,
    look,
    style,
    lookAt: p.lookAt ? new THREE.Vector3(p.lookAt.x, p.lookAt.y, p.lookAt.z) : undefined,
    seat: p.seat,
    crew: p.crew,
    drink: drinkable ? pick(['flute', 'flute', 'wine', 'tumbler'] as const) : undefined,
  };
}

/** The night shift at the port: work clothes under hi-vis vests, hard hats on, nothing in their hands. */
function workerSetup(p: GuestProp, r: () => number, pick: <T>(a: readonly T[]) => T): GuestSetup {
  const style: CivilianStyle = {
    top: pick(['tee', 'shirt'] as const),
    topColor: pick([0x2b3440, 0x3a3a36, 0x1d2a44, 0x4a3b2a, 0x2e3a2e]),
    bottomColor: pick([0x1d2a44, 0x2a2a2c, 0x3b3a34]),
    accent: pick([0xd8e637, 0xf27a1a, 0xd8e637]),
    shoes: 0x1a1612,
    hairStyle: pick(['short', 'buzz'] as const),
    hiVis: true,
    hardHat: p.activity !== 'sit',
  };
  const look: CharacterLook = {
    ...DEFAULT_LOOK,
    skin: pick(LOOK_OPTIONS.skin).id,
    hair: pick(LOOK_OPTIONS.hair).id,
    face: pick(['clean', 'stubble', 'short', 'beard', 'moustache', 'stubble']),
    headgear: 'none', vest: 'none', gloves: 'none',
  };
  return {
    activity: p.activity, seed: p.seed, height: 1.7 + r() * 0.16, look, style,
    lookAt: p.lookAt ? new THREE.Vector3(p.lookAt.x, p.lookAt.y, p.lookAt.z) : undefined,
    seat: p.seat, crew: p.crew, drink: undefined,
  };
}
