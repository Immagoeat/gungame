import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getAttachment, normalizeLoadout, type AttachmentDef, type Loadout, type WeaponId } from '@gungame/shared';
import { getModel } from '../assets/AssetLibrary';
import { Kit } from '../world/furniture/kit';
import { P } from '../world/furniture/palette';
import { canvasTexture } from '../world/textures';
import { normalMapFrom } from '../world/normalMaps';
import { GUN_ASSETS, type GunAsset } from './gunAssets';
import { buildGlock } from './glock';

/**
 * Weapon models, real size in meters: a scanned-quality model file where one exists (see gunAssets),
 * otherwise built from parts. Attachments are added the same way to both.
 * Local space: the gun points down -z, +y is up, and the origin is where the shooting hand grips.
 */
export interface GunModel {
  group: THREE.Group;
  /** Barrel tip (after any muzzle device). */
  muzzle: THREE.Vector3;
  /** Point on the line of sight: lined up with the eye when aiming. */
  sight: THREE.Vector3;
  /** Where the support hand holds the gun. */
  supportHand: THREE.Vector3;
  /** Laser and light emitters, if fitted. */
  laser?: THREE.Vector3;
  light?: THREE.Vector3;
  /** Magnified optic (draw the scope overlay instead of the gun when aiming). */
  magnified: boolean;
  dispose(): void;
}

type V = [number, number, number];

interface Skin {
  body: THREE.Material;
  accent: THREE.Material;
  metal: THREE.Material;
  dark: THREE.Material;
}

const skinCache = new Map<string, Skin>();
/** Barrels and bolts: dark, slightly polished steel. */
const gunmetal = new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.32, metalness: 0.85 });

function patternTexture(pattern: string, a: number, b: number): THREE.CanvasTexture {
  const ca = `#${a.toString(16).padStart(6, '0')}`;
  const cb = `#${b.toString(16).padStart(6, '0')}`;
  return canvasTexture(128, (g, s) => {
    g.fillStyle = ca;
    g.fillRect(0, 0, s, s);
    if (pattern === 'digital') {
      const cols = [cb, '#7a8a5a', '#3f4a30', ca];
      for (let i = 0; i < 260; i++) {
        g.fillStyle = cols[i % cols.length];
        const x = Math.floor(Math.random() * 32) * 4, y = Math.floor(Math.random() * 32) * 4;
        g.fillRect(x, y, 4 * (1 + Math.floor(Math.random() * 3)), 4 * (1 + Math.floor(Math.random() * 2)));
      }
    } else if (pattern === 'tiger') {
      g.fillStyle = cb;
      for (let i = 0; i < 14; i++) {
        const y = Math.random() * s;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin(x * 0.08 + i) * 6 + Math.random() * 3);
        for (let x = s; x >= 0; x -= 8) g.lineTo(x, y + 4 + Math.sin(x * 0.07 + i) * 4);
        g.fill();
      }
    } else if (pattern === 'carbon') {
      for (let y = 0; y < s; y += 8) for (let x = 0; x < s; x += 8) {
        const grd = g.createLinearGradient(x, y, x + 8, y + 8);
        const flip = ((x + y) / 8) % 2 === 0;
        grd.addColorStop(0, flip ? cb : ca);
        grd.addColorStop(1, flip ? ca : cb);
        g.fillStyle = grd;
        g.fillRect(x, y, 8, 8);
      }
    } else if (pattern === 'damascus') {
      for (let i = 0; i < 40; i++) {
        g.strokeStyle = i % 2 ? cb : '#c8ccd2';
        g.lineWidth = 1.5;
        g.beginPath();
        for (let x = 0; x <= s; x += 4) {
          const y = (i / 40) * s + Math.sin(x * 0.06 + i * 0.7) * 10 + Math.sin(x * 0.17) * 3;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    // Subtle wear on edges and a matte grain.
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.05})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
  });
}

function skinFor(skinId: string | undefined): Skin {
  const def = getAttachment(skinId) ?? getAttachment('black')!;
  const cached = skinCache.get(def.id);
  if (cached) return cached;
  const [a, b] = def.colors ?? [0x1d1f22, 0x2c2f33];
  const gold = def.id === 'gold';
  const map = def.pattern && def.pattern !== 'solid' ? patternTexture(def.pattern, a, b) : patternTexture('solid', a, b);
  map.repeat.set(3, 3);
  const skin: Skin = {
    body: new THREE.MeshStandardMaterial({
      map, normalMap: normalMapFrom(map, 0.6), color: 0xffffff,
      roughness: gold ? 0.2 : def.pattern === 'carbon' ? 0.35 : 0.55, metalness: gold ? 1 : def.id === 'damascus' ? 0.8 : 0.25,
    }),
    accent: new THREE.MeshStandardMaterial({ color: gold ? 0x8a6a1a : 0x2a2c30, roughness: 0.5, metalness: gold ? 1 : 0.4 }),
    metal: gunmetal,
    dark: P.blackMetal(),
  };
  skinCache.set(def.id, skin);
  return skin;
}

/**
 * A curved box magazine: a smooth banana-shaped profile in the y/z plane extruded to `width`.
 * Hangs down from (0, topY, topZ); `curve` sweeps the bottom forward.
 */
function curvedMag(k: Kit, topY: number, topZ: number, length: number, depth: number, width: number, curve: number, mat: THREE.Material): void {
  const shape = new THREE.Shape();
  const steps = 8;
  const pt = (t: number, side: number): [number, number] => {
    const y = -t * length;
    const z = -curve * t * t * length + side * depth / 2;
    return [z, y];
  };
  shape.moveTo(...pt(0, -1));
  for (let i = 1; i <= steps; i++) shape.lineTo(...pt(i / steps, -1));
  for (let i = steps; i >= 0; i--) shape.lineTo(...pt(i / steps, 1));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 1 });
  geo.translate(0, 0, -width / 2);
  // Shape x is our z (forward is -z), shape y is up; extrusion runs across the gun.
  geo.rotateY(-Math.PI / 2);
  k.mesh(geo, 0, topY, topZ, mat);
  // Floor plate.
  const [bz, by] = pt(1, 0);
  k.box(width + 0.006, 0.01, depth + 0.012, 0, topY + by - 0.004, topZ + bz, mat);
}

/** Picatinny rail: a strip with cross slots, along -z from z0 to z1 at height y. */
function rail(k: Kit, z0: number, z1: number, y: number, m: THREE.Material, width = 0.022): void {
  const len = Math.abs(z1 - z0);
  k.box(width, 0.006, len, 0, y - 0.003, (z0 + z1) / 2, m);
  for (let z = Math.min(z0, z1) + 0.005; z < Math.max(z0, z1); z += 0.01) k.box(width + 0.002, 0.004, 0.005, 0, y + 0.002, z, m);
}

/** Builds a complete weapon with its attachments. */
export function buildGun(weapon: WeaponId, loadoutIn: Loadout = {}): GunModel {
  const loadout = normalizeLoadout(weapon, loadoutIn);
  const s = skinFor(loadout.skin);
  const k = new Kit();
  const r = (geo: [number, number, number, number], pos: V, mat: THREE.Material, rot?: V) =>
    k.rbox(geo[0], geo[1], geo[2], geo[3], pos[0], pos[1], pos[2], mat, rot ? { rot } : undefined);

  // Per-weapon mount points (filled by the base model).
  let muzzle = new THREE.Vector3();
  let railY = 0;
  let railZ = 0;
  let ironSight = new THREE.Vector3();
  let under = new THREE.Vector3();
  let supportHand = new THREE.Vector3();
  let boreY = 0;
  const barrelExtra = loadout.barrel === 'long-barrel' ? 0.1 : loadout.barrel === 'short-barrel' ? -0.07 : 0;
  const mag = loadout.magazine ?? 'standard-mag';
  const isPistol = weapon === 'pistol' || weapon === 'golden';
  const asset = GUN_ASSETS[weapon];
  const real = asset ? modelBase(asset, loadout) : null;

  if (asset && real) {
    const p = (v: V) => toGun(asset, v);
    muzzle = p(asset.muzzle);
    boreY = muzzle.y;
    ironSight = p(asset.ironSight);
    const rp = p(asset.rail);
    railY = rp.y;
    railZ = rp.z;
    under = p(asset.under);
    supportHand = asset.supportHand ? p(asset.supportHand) : new THREE.Vector3(-0.022, -0.045, 0.015);
    if (barrelExtra > 0) {
      // Threaded barrel extension.
      const r0 = asset.compact ? 0.0075 : 0.01;
      const bl = asset.compact ? barrelExtra * 0.4 : barrelExtra;
      k.cyl(r0, r0, bl, 0, boreY, muzzle.z - bl / 2, s.metal, { rot: [Math.PI / 2, 0, 0], seg: 14 });
      muzzle.z -= bl;
    }
    const mb = p(asset.magBottom);
    if (mag === 'extended-mag' && !asset.magazine) {
      r([0.03, 0.05, 0.075, 0.006], [0, mb.y - 0.022, mb.z], s.dark);
      mb.y -= 0.045;
    } else if (mag === 'extended-mag') mb.y -= 0.035;
    if (mag === 'fast-mag') k.box(0.012, 0.012, 0.014, 0, mb.y - 0.008, mb.z + 0.01, P.paint(0xd62828));
    if (!isPistol && loadout.stock === 'heavy-stock') {
      // Leather cheek riser and a thicker recoil pad.
      r([0.046, 0.03, 0.16, 0.01], [0, ironSight.y - 0.03, 0.17], P.leather(0x3a2a1c));
    }
  } else if (weapon === 'pistol') {
    const finish = loadout.skin && loadout.skin !== 'factory' ? { body: s.body, metal: s.metal } : null;
    const m = buildGlock(k, loadout, finish, barrelExtra);
    ({ muzzle, ironSight, railY, railZ, under, supportHand } = m);
    boreY = muzzle.y;
  } else if (isPistol) {
    boreY = 0.045;
    const len = 0.19;
    r([0.031, 0.034, len, 0.006], [0, 0.046, -0.065], s.accent);
    for (let i = 0; i < 7; i++) k.box(0.033, 0.024, 0.002, 0, 0.048, 0.015 - i * 0.005, s.dark);
    k.box(0.012, 0.012, 0.03, 0.016, 0.05, -0.02, s.dark);
    r([0.028, 0.026, 0.15, 0.006], [0, 0.019, -0.06], s.body);
    r([0.03, 0.115, 0.052, 0.01], [0, -0.048, 0.018], s.body, [0.28, 0, 0]);
    for (let i = 0; i < 6; i++) k.box(0.031, 0.002, 0.04, 0, -0.01 - i * 0.014, 0.014 + i * 0.004, s.dark);
    k.torus(0.022, 0.004, 0, 0.0, -0.035, s.body, { arc: Math.PI, rot: [0, Math.PI / 2, Math.PI] });
    k.box(0.005, 0.02, 0.006, 0, 0.0, -0.032, s.dark);
    rail(k, -0.09, -0.135, 0.004, s.body, 0.02);
    const bl = 0.02 + Math.max(0, barrelExtra) * 0.4;
    k.cyl(0.007, 0.007, bl, 0, boreY, -0.16 - bl / 2 + 0.01, s.metal, { rot: [Math.PI / 2, 0, 0], seg: 10 });
    k.box(0.004, 0.007, 0.004, 0, 0.066, -0.15, s.dark);
    k.box(0.016, 0.006, 0.006, 0, 0.066, 0.016, s.dark);
    k.sphere(0.0018, 0, 0.069, -0.15, P.emissive(0xffffff, 0.8), { seg: 6, castShadow: false });
    if (weapon === 'golden') for (let i = 0; i < 3; i++) k.torus(0.008, 0.0012, 0.0158, 0.046, -0.08 - i * 0.025, P.gold(), { rot: [0, Math.PI / 2, 0], seg: 12 });
    const magLen = mag === 'extended-mag' ? 0.05 : 0;
    r([0.024, 0.012 + magLen, 0.04, 0.004], [0, -0.108 - magLen / 2, 0.034], s.dark, [0.28, 0, 0]);
    if (mag === 'fast-mag') k.box(0.012, 0.012, 0.012, 0, -0.12, 0.04, P.paint(0xd62828));
    muzzle = new THREE.Vector3(0, boreY, -0.165 - bl + 0.02);
    railY = 0.063;
    railZ = -0.02;
    ironSight = new THREE.Vector3(0, 0.069, 0.016);
    under = new THREE.Vector3(0, 0.004, -0.11);
    supportHand = new THREE.Vector3(-0.022, -0.045, 0.015);
  } else if (weapon === 'smg') {
    boreY = 0.04;
    r([0.046, 0.07, 0.36, 0.01], [0, 0.04, -0.12], s.body);
    k.box(0.047, 0.012, 0.06, 0.0, 0.045, -0.02, s.dark);
    r([0.052, 0.05, 0.16, 0.012], [0, 0.03, -0.34], s.body);
    for (let i = 0; i < 4; i++) k.box(0.054, 0.012, 0.02, 0, 0.03, -0.29 - i * 0.03, s.dark);
    k.cyl(0.014, 0.014, 0.05, 0, 0.07, -0.33, s.dark, { rot: [Math.PI / 2, 0, 0], seg: 10 });
    const bl = 0.04 + barrelExtra;
    k.cyl(0.009, 0.009, bl, 0, boreY, -0.42 - bl / 2, s.metal, { rot: [Math.PI / 2, 0, 0], seg: 10 });
    r([0.032, 0.11, 0.05, 0.01], [0, -0.05, 0.02], s.accent, [0.25, 0, 0]);
    k.torus(0.025, 0.004, 0, -0.005, -0.04, s.body, { arc: Math.PI, rot: [0, Math.PI / 2, Math.PI] });
    rail(k, -0.28, 0.04, 0.083, s.dark);
    k.box(0.006, 0.02, 0.006, 0, 0.09, -0.27, s.dark);
    k.box(0.02, 0.016, 0.01, 0, 0.09, 0.03, s.dark);
    // Magazine: curved stick, extended, or drum.
    if (mag === 'drum-mag') {
      k.cyl(0.06, 0.06, 0.05, 0, -0.1, -0.12, s.dark, { rot: [0, 0, Math.PI / 2], seg: 24 });
      k.box(0.03, 0.05, 0.035, 0, -0.03, -0.12, s.dark);
    } else {
      const len = mag === 'extended-mag' ? 0.24 : 0.16;
      curvedMag(k, 0.005, -0.12, len, 0.034, 0.024, 0.18, s.dark);
      if (mag === 'fast-mag') k.box(0.014, 0.02, 0.01, 0, -len - 0.01, -0.12 - 0.18 * len, P.paint(0xd62828));
    }
    muzzle = new THREE.Vector3(0, boreY, -0.42 - bl);
    railY = 0.086;
    railZ = -0.12;
    ironSight = new THREE.Vector3(0, 0.1, 0.03);
    under = new THREE.Vector3(0, 0.002, -0.34);
    supportHand = new THREE.Vector3(0, -0.005, -0.33);
  } else if (weapon === 'shotgun') {
    boreY = 0.055;
    r([0.05, 0.07, 0.25, 0.01], [0, 0.035, -0.085], s.body);
    k.box(0.051, 0.02, 0.07, 0, 0.04, -0.05, s.dark);
    const bl = 0.52 + barrelExtra;
    k.cyl(0.012, 0.012, bl, 0, boreY, -0.21 - bl / 2, s.metal, { rot: [Math.PI / 2, 0, 0], seg: 12 });
    const tube = mag === 'tube-ext' ? 0.48 : 0.4;
    k.cyl(0.014, 0.014, tube, 0, 0.022, -0.21 - tube / 2, s.dark, { rot: [Math.PI / 2, 0, 0], seg: 12 });
    r([0.046, 0.045, 0.2, 0.012], [0, 0.025, -0.42], s.accent);
    for (let i = 0; i < 8; i++) k.box(0.048, 0.04, 0.004, 0, 0.025, -0.34 - i * 0.022, s.dark);
    k.sphere(0.003, 0, boreY + 0.014, -0.2 - bl, P.emissive(0xffffff, 0.6), { seg: 6 });
    r([0.032, 0.1, 0.05, 0.01], [0, -0.045, 0.03], s.accent, [0.3, 0, 0]);
    k.torus(0.025, 0.004, 0, -0.005, -0.04, s.body, { arc: Math.PI, rot: [0, Math.PI / 2, Math.PI] });
    for (let i = 0; i < 4; i++) k.cyl(0.009, 0.009, 0.05, 0.03, 0.04, -0.06 - i * 0.022, P.paint(0xb3122a), { seg: 8 });
    rail(k, -0.19, 0.02, 0.073, s.dark);
    muzzle = new THREE.Vector3(0, boreY, -0.21 - bl);
    railY = 0.076;
    railZ = -0.07;
    ironSight = new THREE.Vector3(0, 0.072, 0.02);
    under = new THREE.Vector3(0, -0.005, -0.42);
    supportHand = new THREE.Vector3(0, 0.0, -0.42);
  } else if (weapon === 'rifle') {
    boreY = 0.05;
    r([0.05, 0.06, 0.2, 0.006], [0, 0.048, -0.07], s.body);
    r([0.045, 0.045, 0.17, 0.006], [0, 0.002, -0.05], s.body);
    k.box(0.006, 0.018, 0.05, 0.026, 0.05, -0.05, s.dark);
    k.cyl(0.008, 0.008, 0.03, 0.03, 0.06, -0.015, s.dark, { rot: [0, 0, Math.PI / 2], seg: 8 });
    k.box(0.04, 0.012, 0.02, 0, 0.08, 0.035, s.dark);
    r([0.056, 0.056, 0.32, 0.01], [0, 0.048, -0.33], s.body);
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) k.box(0.002, 0.008, 0.032, side * 0.0285, 0.045, -0.21 - i * 0.045, s.dark);
    rail(k, -0.49, 0.03, 0.08, s.body);
    const bl = 0.16 + barrelExtra;
    k.cyl(0.009, 0.009, bl, 0, boreY, -0.49 - bl / 2, s.metal, { rot: [Math.PI / 2, 0, 0], seg: 10 });
    k.box(0.02, 0.018, 0.02, 0, boreY + 0.008, -0.5, s.dark);
    r([0.032, 0.11, 0.045, 0.01], [0, -0.055, 0.025], s.accent, [0.3, 0, 0]);
    k.torus(0.026, 0.004, 0, -0.02, -0.035, s.body, { arc: Math.PI, rot: [0, Math.PI / 2, Math.PI] });
    k.box(0.005, 0.02, 0.006, 0, -0.012, -0.035, s.dark);
    // Folding sights: front post, rear ring aperture you look through.
    k.box(0.022, 0.012, 0.012, 0, 0.087, -0.47, s.dark);
    k.box(0.004, 0.02, 0.004, 0, 0.096, -0.47, s.dark);
    k.box(0.022, 0.012, 0.014, 0, 0.087, 0.02, s.dark);
    k.torus(0.0065, 0.0028, 0, 0.106, 0.02, s.dark, { seg: 18 });
    for (const sx of [-1, 1]) k.box(0.004, 0.02, 0.014, sx * 0.011, 0.1, 0.02, s.dark);
    if (mag === 'drum-mag') {
      k.cyl(0.07, 0.07, 0.055, 0, -0.11, -0.085, s.dark, { rot: [0, 0, Math.PI / 2], seg: 24 });
      k.box(0.03, 0.06, 0.04, 0, -0.035, -0.085, s.dark);
    } else {
      const len = mag === 'extended-mag' ? 0.24 : 0.16;
      curvedMag(k, -0.01, -0.085, len, 0.062, 0.024, 0.25, s.dark);
      if (mag === 'fast-mag') k.box(0.014, 0.02, 0.01, 0, -len - 0.02, -0.085 - 0.25 * len, P.paint(0xd62828));
    }
    muzzle = new THREE.Vector3(0, boreY, -0.49 - bl);
    railY = 0.083;
    railZ = -0.06;
    ironSight = new THREE.Vector3(0, 0.106, 0.02);
    under = new THREE.Vector3(0, 0.018, -0.36);
    supportHand = new THREE.Vector3(0, 0.012, -0.33);
  } else {
    // Bolt-action sniper on a chassis stock.
    boreY = 0.055;
    k.cyl(0.026, 0.026, 0.24, 0, boreY, -0.06, s.metal, { rot: [Math.PI / 2, 0, 0], seg: 16 });
    k.cyl(0.006, 0.006, 0.06, 0.04, boreY, 0.03, s.metal, { rot: [0, 0, Math.PI / 2], seg: 8 });
    k.sphere(0.01, 0.07, boreY, 0.03, s.dark, { seg: 10 });
    const bl = 0.6 + barrelExtra;
    k.lathe([[0.017, 0], [0.013, bl * 0.7], [0.012, bl]], 0, boreY, -0.18, s.metal, { rot: [-Math.PI / 2, 0, 0], seg: 14 });
    r([0.055, 0.06, 0.42, 0.012], [0, 0.015, -0.2], s.body);
    r([0.034, 0.11, 0.05, 0.01], [0, -0.055, 0.025], s.accent, [0.25, 0, 0]);
    k.torus(0.026, 0.004, 0, -0.01, -0.035, s.body, { arc: Math.PI, rot: [0, Math.PI / 2, Math.PI] });
    const magLen = mag === 'extended-mag' ? 0.05 : 0;
    r([0.03, 0.06 + magLen, 0.09, 0.006], [0, -0.04 - magLen / 2, -0.08], s.dark);
    if (mag === 'fast-mag') k.box(0.014, 0.02, 0.01, 0, -0.08 - magLen, -0.08, P.paint(0xd62828));
    rail(k, -0.16, 0.06, 0.088, s.dark);
    muzzle = new THREE.Vector3(0, boreY, -0.18 - bl);
    railY = 0.091;
    railZ = -0.05;
    ironSight = new THREE.Vector3(0, 0.1, 0.03);
    under = new THREE.Vector3(0, -0.015, -0.36);
    supportHand = new THREE.Vector3(0, -0.01, -0.3);
  }

  // Stock.
  if (!real && !isPistol && weapon !== 'shotgun' && weapon !== 'sniper') {
    k.cyl(0.015, 0.015, 0.2, 0, 0.035, 0.12, s.dark, { rot: [Math.PI / 2, 0, 0], seg: 12 });
  }
  if (!real && !isPistol) {
    const st = loadout.stock ?? 'standard-stock';
    const z0 = weapon === 'shotgun' ? 0.05 : weapon === 'sniper' ? 0.04 : 0.15;
    if (st === 'light-stock') {
      k.rod(0.006, [0, 0.05, z0], [0, 0.04, z0 + 0.22], s.dark);
      k.rod(0.006, [0, -0.02, z0], [0, -0.03, z0 + 0.22], s.dark);
      r([0.035, 0.1, 0.02, 0.006], [0, 0.005, z0 + 0.22], P.rubber());
    } else {
      const heavy = st === 'heavy-stock' || weapon === 'sniper';
      r([0.042, heavy ? 0.12 : 0.09, 0.2, 0.012], [0, 0.0, z0 + 0.1], s.body, [-0.05, 0, 0]);
      if (heavy) r([0.04, 0.025, 0.12, 0.008], [0, 0.07, z0 + 0.11], s.accent);
      r([0.044, heavy ? 0.13 : 0.1, 0.02, 0.008], [0, -0.005, z0 + 0.205], P.rubber());
    }
  }

  // Optic. Iron sights are part of the base model.
  let sight = ironSight.clone();
  let magnified = false;
  const optic = loadout.optic ?? 'iron';
  const scope = asset?.builtinScope;
  if (real && scope && scope.optics.includes(optic)) {
    sight = toGun(asset, scope.eyepiece);
    magnified = true;
  } else if (optic !== 'iron') {
    const y = railY;
    k.box(0.024, 0.012, 0.04, 0, y + 0.006, railZ, s.dark);
    const lens = P.glass(0x6fd3ff, 0.3);
    if (optic === 'reddot') {
      const h = isPistol ? 0.022 : 0.032;
      k.cyl(0.016, 0.016, 0.05, 0, y + h, railZ, s.dark, { rot: [Math.PI / 2, 0, 0], seg: 18, open: true });
      k.torus(0.016, 0.003, 0, y + h, railZ - 0.025, s.dark, { seg: 18 });
      k.cyl(0.015, 0.015, 0.002, 0, y + h, railZ - 0.022, lens, { rot: [Math.PI / 2, 0, 0], seg: 18, castShadow: false });
      k.sphere(0.0014, 0, y + h, railZ - 0.021, P.emissive(0xff2020, 4), { seg: 6, castShadow: false });
      k.box(0.012, 0.008, 0.012, 0.018, y + h, railZ, s.dark);
      sight = new THREE.Vector3(0, y + h, railZ + 0.03);
    } else if (optic === 'holo') {
      const h = 0.038;
      k.box(0.05, 0.016, 0.075, 0, y + 0.014, railZ, s.dark);
      k.box(0.004, 0.04, 0.03, -0.022, y + h, railZ - 0.02, s.dark);
      k.box(0.004, 0.04, 0.03, 0.022, y + h, railZ - 0.02, s.dark);
      k.box(0.048, 0.004, 0.03, 0, y + h + 0.02, railZ - 0.02, s.dark);
      k.box(0.044, 0.036, 0.002, 0, y + h, railZ - 0.03, lens, { castShadow: false });
      k.torus(0.006, 0.0007, 0, y + h, railZ - 0.029, P.emissive(0xff2020, 4), { seg: 20, castShadow: false });
      k.sphere(0.0008, 0, y + h, railZ - 0.029, P.emissive(0xff2020, 4), { seg: 4, castShadow: false });
      sight = new THREE.Vector3(0, y + h, railZ + 0.04);
    } else {
      // Magnified scopes.
      const big = optic === 'scope8x';
      const h = big ? 0.05 : 0.042;
      const len = big ? 0.3 : 0.14;
      magnified = true;
      if (big) {
        for (const dz of [-0.06, 0.05]) {
          k.box(0.02, h - 0.01, 0.02, 0, y + (h - 0.01) / 2, railZ + dz, s.dark);
          k.torus(0.017, 0.004, 0, y + h, railZ + dz, s.dark, { seg: 16 });
        }
      }
      k.lathe([[big ? 0.026 : 0.022, 0], [big ? 0.016 : 0.018, len * 0.25], [big ? 0.016 : 0.018, len * 0.7], [big ? 0.021 : 0.019, len]],
        0, y + h, railZ + len / 2 - (big ? 0.02 : 0), s.dark, { rot: [Math.PI / 2, 0, 0], seg: 20 });
      k.cyl(0.02, 0.02, 0.002, 0, y + h, railZ - len / 2, lens, { rot: [Math.PI / 2, 0, 0], seg: 18, castShadow: false });
      if (big) {
        k.cyl(0.009, 0.009, 0.025, 0, y + h + 0.025, railZ, s.dark, { seg: 12 });
        k.cyl(0.009, 0.009, 0.025, 0.025, y + h, railZ, s.dark, { rot: [0, 0, Math.PI / 2], seg: 12 });
      }
      sight = new THREE.Vector3(0, y + h, railZ + len / 2);
    }
  }

  // Muzzle device.
  const md = loadout.muzzle ?? 'none-muzzle';
  if (md === 'suppressor') {
    const len = isPistol ? 0.13 : 0.18;
    if (real) k.cyl(0.006, 0.006, 0.012, 0, muzzle.y, muzzle.z + 0.004, s.metal, { rot: [Math.PI / 2, 0, 0], seg: 12 });
    k.cyl(isPistol ? 0.015 : 0.02, isPistol ? 0.015 : 0.02, len, 0, muzzle.y, muzzle.z - len / 2, s.dark, { rot: [Math.PI / 2, 0, 0], seg: 18 });
    for (let i = 0; i < 3; i++) k.torus(isPistol ? 0.015 : 0.02, 0.0015, 0, muzzle.y, muzzle.z - 0.02 - i * (len / 3), s.accent, { seg: 18 });
    muzzle = muzzle.clone().setZ(muzzle.z - len);
  } else if (md === 'compensator') {
    k.cyl(0.013, 0.013, 0.05, 0, muzzle.y, muzzle.z - 0.025, s.dark, { rot: [Math.PI / 2, 0, 0], seg: 12 });
    for (let i = 0; i < 3; i++) k.box(0.028, 0.006, 0.005, 0, muzzle.y + 0.006, muzzle.z - 0.01 - i * 0.012, P.screen());
    muzzle = muzzle.clone().setZ(muzzle.z - 0.05);
  } else if (md === 'flashhider') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      k.box(0.004, 0.004, 0.045, Math.cos(a) * 0.009, muzzle.y + Math.sin(a) * 0.009, muzzle.z - 0.022, s.dark);
    }
    muzzle = muzzle.clone().setZ(muzzle.z - 0.045);
  } else if (md === 'choke') {
    k.cyl(0.015, 0.014, 0.03, 0, muzzle.y, muzzle.z - 0.015, s.metal, { rot: [Math.PI / 2, 0, 0], seg: 14 });
    muzzle = muzzle.clone().setZ(muzzle.z - 0.03);
  }

  // Underbarrel.
  const ub = loadout.underbarrel ?? 'none-under';
  let laser: THREE.Vector3 | undefined;
  let light: THREE.Vector3 | undefined;
  if (ub === 'vgrip') {
    k.cyl(0.014, 0.016, 0.1, 0, under.y - 0.055, under.z, s.accent, { seg: 14 });
    for (let i = 0; i < 5; i++) k.torus(0.0155, 0.002, 0, under.y - 0.02 - i * 0.016, under.z, s.dark, { rot: [Math.PI / 2, 0, 0], seg: 14 });
  } else if (ub === 'agrip') {
    k.box(0.026, 0.035, 0.08, 0, under.y - 0.018, under.z + 0.01, s.accent, { rot: [-0.45, 0, 0] });
  } else if (ub === 'laser') {
    k.box(0.024, 0.024, 0.06, 0, under.y - 0.014, under.z, s.dark);
    k.cyl(0.006, 0.006, 0.002, 0, under.y - 0.014, under.z - 0.031, P.emissive(0xff2020, 3), { rot: [Math.PI / 2, 0, 0], seg: 10, castShadow: false });
    laser = new THREE.Vector3(0, under.y - 0.014, under.z - 0.032);
  } else if (ub === 'flashlight') {
    k.cyl(0.015, 0.015, 0.09, 0, under.y - 0.018, under.z, s.dark, { rot: [Math.PI / 2, 0, 0], seg: 16 });
    k.cyl(0.019, 0.016, 0.02, 0, under.y - 0.018, under.z - 0.05, s.dark, { rot: [Math.PI / 2, 0, 0], seg: 16 });
    k.cyl(0.017, 0.017, 0.002, 0, under.y - 0.018, under.z - 0.061, P.emissive(0xfff6e0, 1.5), { rot: [Math.PI / 2, 0, 0], seg: 16, castShadow: false });
    light = new THREE.Vector3(0, under.y - 0.018, under.z - 0.065);
  } else if (ub === 'bipod') {
    k.box(0.03, 0.02, 0.03, 0, under.y - 0.01, under.z - 0.05, s.dark);
    for (const side of [-1, 1]) k.rod(0.005, [side * 0.01, under.y - 0.015, under.z - 0.05], [side * 0.03, under.y - 0.03, under.z + 0.13], s.dark);
  }

  // Merge the static parts by material to keep draw calls low.
  const group = mergeKit(k);
  // Attachment geometry is ours to free; the model file's geometry is shared by every copy.
  const own = group.children.slice();
  if (real) group.add(real);
  return {
    group, muzzle, sight, supportHand, laser, light, magnified,
    dispose: () => own.forEach(o => o.traverse(c => { if (c instanceof THREE.Mesh) c.geometry.dispose(); })),
  };
}

/** Model space (+x forward) to gun space (-z forward, grip at the origin). */
function toGun(asset: GunAsset, [x, y, z]: V): THREE.Vector3 {
  return new THREE.Vector3(z - asset.grip[2], y - asset.grip[1], -(x - asset.grip[0]));
}

/** The model file's parts, turned into gun space, in the chosen finish. Null if the file isn't loaded. */
function modelBase(asset: GunAsset, loadout: Loadout): THREE.Group | null {
  const gltf = getModel(asset.file);
  if (!gltf) return null;
  const out = new THREE.Group();
  out.rotation.y = Math.PI / 2;
  out.position.set(-asset.grip[2], -asset.grip[1], asset.grip[0]);
  const optic = loadout.optic ?? 'iron';
  const skin = getAttachment(loadout.skin);
  for (const node of gltf.scene.children) {
    if (!asset.parts.includes(node.name)) continue;
    if (asset.builtinScope?.part === node.name && !asset.builtinScope.optics.includes(optic)) continue;
    const part = node.clone(true);
    if (asset.magazine?.part === node.name) {
      part.position.set(...(loadout.magazine === 'extended-mag' ? asset.magazine.extendedOffset : asset.magazine.offset));
    }
    if (skin && skin.id !== 'factory') {
      part.traverse(o => {
        if (o instanceof THREE.Mesh) o.material = refinish(o.material as THREE.MeshStandardMaterial, skin);
      });
    }
    out.add(part);
  }
  return out;
}

const refinished = new Map<string, THREE.Material>();

/**
 * Repaints a model's material in a skin, keeping its surface detail (normal and roughness maps):
 * cerakote colors, printed camo patterns, or polished gold. Glass is left alone.
 */
function refinish(mat: THREE.MeshStandardMaterial, skin: AttachmentDef): THREE.Material {
  if (mat.transparent || /glass/i.test(mat.name)) return mat;
  const key = `${mat.uuid}:${skin.id}`;
  const cached = refinished.get(key);
  if (cached) return cached;
  const m = mat.clone();
  const gold = skin.id === 'gold';
  m.metalnessMap = null;
  if (gold) {
    m.map = null;
    m.color.setHex(0xf0c040);
    m.metalness = 1;
    m.roughness = 0.45;
  } else if (skin.pattern && skin.pattern !== 'solid') {
    m.map = (skinFor(skin.id).body as THREE.MeshStandardMaterial).map;
    m.color.setHex(0xffffff);
    m.metalness = skin.id === 'damascus' ? 0.8 : 0.2;
    m.roughness = 0.9;
  } else {
    m.map = null;
    m.color.setHex(skin.colors?.[0] ?? 0x1d1f22);
    m.metalness = 0.15;
    m.roughness = 0.95;
  }
  m.needsUpdate = true;
  refinished.set(key, m);
  return m;
}

function mergeKit(k: Kit): THREE.Group {
  k.group.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  k.group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    const m = o.material as THREE.Material;
    buckets.set(m, [...(buckets.get(m) ?? []), g]);
  });
  const out = new THREE.Group();
  for (const [m, geos] of buckets) {
    const merged = mergeGeometries(geos);
    geos.forEach(g => g.dispose());
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
