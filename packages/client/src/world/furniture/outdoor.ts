import * as THREE from 'three';
import type { Kit } from './kit';
import { createFire } from '../fire';
import { P } from './palette';
import type { Builder } from './types';

const GRAVITY = 9.8;
const droplet = new THREE.PointsMaterial({ color: 0xe6f6ff, size: 0.07, transparent: true, opacity: 0.8, depthWrite: false });

interface Jet {
  origin: THREE.Vector3;
  velocity: THREE.Vector3;
  spread: number;
  /** Droplets disappear below this height. */
  floor: number;
}

/** Arcing streams of water droplets, recycled continuously. */
function waterJets(k: Kit, jets: Jet[], perJet = 60): void {
  const n = jets.length * perJet;
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, droplet);
  points.frustumCulled = false;
  const spawn = (i: number) => {
    const j = jets[Math.floor(i / perJet)];
    pos[i * 3] = j.origin.x; pos[i * 3 + 1] = j.origin.y; pos[i * 3 + 2] = j.origin.z;
    vel[i * 3] = j.velocity.x + (Math.random() - 0.5) * j.spread;
    vel[i * 3 + 1] = j.velocity.y + (Math.random() - 0.5) * j.spread;
    vel[i * 3 + 2] = j.velocity.z + (Math.random() - 0.5) * j.spread;
  };
  // Start each droplet at a random point along its arc so the streams are full from frame one.
  for (let i = 0; i < n; i++) {
    spawn(i);
    const t = Math.random() * 1.2;
    pos[i * 3] += vel[i * 3] * t;
    pos[i * 3 + 1] += vel[i * 3 + 1] * t - 0.5 * GRAVITY * t * t;
    pos[i * 3 + 2] += vel[i * 3 + 2] * t;
    vel[i * 3 + 1] -= GRAVITY * t;
  }
  k.dynamic(points, dt => {
    for (let i = 0; i < n; i++) {
      vel[i * 3 + 1] -= GRAVITY * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < jets[Math.floor(i / perJet)].floor) spawn(i);
    }
    geo.attributes.position.needsUpdate = true;
  });
}

/** Velocity that throws a droplet from `from` to land at `to` after `t` seconds. */
const ballistic = (from: THREE.Vector3, to: THREE.Vector3, t: number) =>
  new THREE.Vector3((to.x - from.x) / t, (to.y - from.y + 0.5 * GRAVITY * t * t) / t, (to.z - from.z) / t);

/** Round basin wall (stone ring with a rolled lip) and its water surface. */
function basin(k: Kit, r: number, wallH: number, stone: THREE.Material, seg = 64): void {
  const t = 0.35;
  k.lathe([[r - t, 0], [r, 0], [r, wallH - 0.1], [r + 0.08, wallH - 0.05], [r + 0.06, wallH + 0.02], [r - t - 0.05, wallH + 0.02], [r - t - 0.04, wallH - 0.08], [r - t, wallH - 0.12], [r - t, 0.05]],
    0, 0, 0, stone, { seg });
  k.cyl(r - t, r - t, 0.06, 0, 0.03, 0, P.stone(0x9fb7c2), { seg });
  k.cyl(r - t - 0.01, r - t - 0.01, 0.02, 0, wallH - 0.2, 0, P.water(), { seg, castShadow: false });
}

/** A carved bowl (outer shell and inner surface) with water in it and a curtain of water falling from its lip. */
function bowl(k: Kit, r: number, y: number, stone: THREE.Material, fallTo: number): void {
  k.lathe([[0.15, -0.35], [r * 0.5, -0.3], [r * 0.85, -0.12], [r, 0.02], [r * 0.96, 0.06], [r * 0.82, -0.02], [r * 0.45, -0.18], [0.12, -0.2]], 0, y, 0, stone, { seg: 48 });
  k.cyl(r * 0.88, r * 0.88, 0.02, 0, y - 0.02, 0, P.water(), { seg: 48, castShadow: false });
  k.cyl(r * 0.99, r * 1.02, y - fallTo, 0, (y + fallTo) / 2, 0, P.waterfall(), { open: true, seg: 48, castShadow: false });
}

function frondGeometry(length: number, width: number, droop: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, length, 1, 10);
  geo.translate(0, length / 2, 0);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / length;
    const along = pos.getY(i);
    // Arc outwards then droop down towards the tip; fold the leaflets into a shallow V.
    pos.setXYZ(i, pos.getX(i), along * 0.55 - droop * t * t * length, along * 0.85 + Math.abs(pos.getX(i)) * -0.2);
  }
  geo.computeVertexNormals();
  return geo;
}
const fronds = new Map<string, THREE.BufferGeometry>();

export const outdoor: Record<string, Builder> = {
  grandFountain: (k, p) => {
    const stone = P.stone(0xece4d4);
    const r = p.w / 2;
    basin(k, r, 0.65, stone);
    // Central pedestal and two bowls.
    k.lathe([[0.75, 0], [0.75, 0.2], [0.55, 0.3], [0.42, 0.6], [0.36, 1.1], [0.42, 1.3], [0.3, 1.45]], 0, 0, 0, stone, { seg: 32 });
    bowl(k, 1.9, 1.6, stone, 0.45);
    k.lathe([[0.28, 0], [0.2, 0.3], [0.17, 0.8], [0.22, 1.0], [0.16, 1.15]], 0, 1.55, 0, stone, { seg: 24 });
    bowl(k, 1.05, 2.85, stone, 1.62);
    k.lathe([[0.16, 0], [0.12, 0.25], [0.1, 0.5], [0.18, 0.65], [0.2, 0.8], [0.12, 1.0], [0.05, 1.15], [0.0001, 1.25]], 0, 2.8, 0, stone, { seg: 24 });
    // Four urns on the rim.
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const x = Math.cos(a) * (r - 0.15);
      const z = Math.sin(a) * (r - 0.15);
      k.lathe([[0.16, 0], [0.18, 0.08], [0.1, 0.18], [0.12, 0.25], [0.24, 0.45], [0.26, 0.6], [0.2, 0.65]], x, 0.67, z, stone, { seg: 20 });
      k.sphere(0.24, x, 1.38, z, P.foliage(0x3c6e2c), { seg: 12 });
      for (let f = 0; f < 6; f++) k.sphere(0.05, x + Math.cos(f) * 0.17, 1.45 + (f % 2) * 0.08, z + Math.sin(f) * 0.17, P.flower(0xf2a7c0), { seg: 6 });
    }
    // Underwater lights.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.cyl(0.08, 0.08, 0.02, Math.cos(a) * (r - 0.6), 0.07, Math.sin(a) * (r - 0.6), P.led(0x9fe8ff), { seg: 10, castShadow: false });
    }
    // Jets: a plume from the top, and eight arcs from the rim into the basin.
    const jets: Jet[] = [{ origin: new THREE.Vector3(0, 4.1, 0), velocity: new THREE.Vector3(0, 4.2, 0), spread: 0.5, floor: 2.85 }];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const from = new THREE.Vector3(Math.cos(a) * (r - 0.45), 0.6, Math.sin(a) * (r - 0.45));
      const to = new THREE.Vector3(Math.cos(a) * 2.2, 0.45, Math.sin(a) * 2.2);
      jets.push({ origin: from, velocity: ballistic(from, to, 0.9), spread: 0.15, floor: 0.45 });
    }
    waterJets(k, jets, 55);
  },

  gardenFountain: (k, p) => {
    const stone = P.stone(0xe2dccd);
    const r = p.w / 2;
    // Octagonal basin.
    k.lathe([[r - 0.25, 0], [r, 0], [r, 0.45], [r + 0.05, 0.5], [r - 0.3, 0.5], [r - 0.25, 0.05]], 0, 0, 0, stone, { seg: 8 });
    k.cyl(r - 0.26, r - 0.26, 0.02, 0, 0.36, 0, P.water(), { seg: 8, castShadow: false });
    k.lathe([[0.3, 0], [0.22, 0.2], [0.15, 0.7], [0.2, 0.9]], 0, 0, 0, stone, { seg: 20 });
    bowl(k, 0.85, 1.25, stone, 0.36);
    k.lathe([[0.12, 0], [0.08, 0.3], [0.15, 0.55], [0.06, 0.8], [0.0001, 0.85]], 0, 1.2, 0, stone, { seg: 16 });
    waterJets(k, [{ origin: new THREE.Vector3(0, 2.05, 0), velocity: new THREE.Vector3(0, 2.4, 0), spread: 0.8, floor: 1.25 }], 70);
  },

  wallFountain: (k, p) => {
    const stone = P.stone(0xe8dfcc);
    const t = p.d;
    k.box(p.w, p.h, t * 0.6, 0, p.h / 2, -t * 0.2, stone);
    k.box(p.w + 0.2, 0.18, t * 0.8, 0, p.h + 0.09, -t * 0.1, stone);
    k.box(p.w + 0.1, 0.25, t, 0, 0.125, 0, stone);
    for (const sx of [-1, 1]) {
      k.box(0.5, p.h + 0.2, t * 0.8, sx * (p.w / 2 - 0.25), (p.h + 0.2) / 2, -t * 0.1, stone);
      k.lathe([[0.15, 0], [0.18, 0.08], [0.1, 0.16], [0.24, 0.45], [0.2, 0.55]], sx * (p.w / 2 - 0.25), p.h + 0.2, -t * 0.1, stone, { seg: 20 });
      k.sphere(0.2, sx * (p.w / 2 - 0.25), p.h + 0.9, -t * 0.1, P.foliage(), { seg: 12 });
    }
    // Recessed panels with lion-head spouts.
    const spouts = 3;
    const jets: Jet[] = [];
    for (let i = 0; i < spouts; i++) {
      const x = (i - (spouts - 1) / 2) * (p.w / spouts) * 0.9;
      k.box(1.2, 1.6, 0.04, x, p.h * 0.55, t * 0.1 + 0.005, P.stone(0xd9cfbb));
      const y = p.h * 0.5;
      const z = t * 0.1 + 0.1;
      k.sphere(0.22, x, y, z, stone, { seg: 16, scale: [1, 1, 0.6] });
      k.torus(0.24, 0.07, x, y, z - 0.03, P.stone(0xcfc3a8), { seg: 20 });
      k.rbox(0.14, 0.12, 0.16, 0.05, x, y - 0.06, z + 0.12, stone);
      for (const ex of [-0.07, 0.07]) k.sphere(0.025, x + ex, y + 0.07, z + 0.12, P.stone(0x8a7a5a), { seg: 6 });
      const from = new THREE.Vector3(x, y - 0.08, z + 0.22);
      jets.push({ origin: from, velocity: ballistic(from, new THREE.Vector3(x, -0.25, z + 1.6), 0.55), spread: 0.12, floor: -0.28 });
    }
    waterJets(k, jets, 60);
  },

  palm: (k, p) => {
    const h = p.h;
    const bark = P.bark();
    // Gently curving trunk built from tapered segments.
    const segs = 8;
    const lean = ((p.variant % 5) - 2) * 0.12;
    let prev = new THREE.Vector3(0, 0, 0);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const next = new THREE.Vector3(Math.sin(t * 1.2) * lean * h * 0.3, t * h, Math.sin(t * 0.9) * lean * h * 0.15);
      const r0 = 0.24 - (i - 1) / segs * 0.08;
      const seg = k.cyl(r0 - 0.01, r0, prev.distanceTo(next) + 0.02, (prev.x + next.x) / 2, (prev.y + next.y) / 2, (prev.z + next.z) / 2, bark, { seg: 10 });
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), next.clone().sub(prev).normalize());
      prev = next;
    }
    k.sphere(0.24, prev.x, prev.y, prev.z, P.bark(), { seg: 10, scale: [1, 1.3, 1] });
    for (let i = 0; i < 6; i++) k.sphere(0.09, prev.x + Math.cos(i) * 0.18, prev.y - 0.2, prev.z + Math.sin(i) * 0.18, P.paint(0x5a3a1e), { seg: 8 });
    const count = 14;
    for (let i = 0; i < count; i++) {
      const len = 2.8 + (i % 3) * 0.5;
      const key = `${len}`;
      let geo = fronds.get(key);
      if (!geo) fronds.set(key, (geo = frondGeometry(len, 0.9, 0.55 + (i % 2) * 0.15)));
      const m = k.mesh(geo, prev.x, prev.y + 0.1, prev.z, P.frond());
      m.rotation.order = 'YXZ';
      m.rotation.y = (i / count) * Math.PI * 2 + (i % 2) * 0.2;
      m.rotation.x = -0.15 + (i % 3) * 0.12;
    }
  },

  cypress: (k, p) => {
    k.cyl(0.08, 0.12, 0.8, 0, 0.4, 0, P.bark(), { seg: 8 });
    k.lathe([[0.3, 0], [0.5, 0.6], [0.55, p.h * 0.35], [0.45, p.h * 0.7], [0.2, p.h * 0.92 - 0.3], [0.0001, p.h - 0.3]], 0, 0.3, 0, P.foliage(0x2a4a24), { seg: 14 });
  },

  oliveTree: (k, p) => {
    const bark = P.bark();
    k.rod(0.14, [0, 0, 0], [0.15, 1.2, 0.1], bark);
    k.rod(0.09, [0.15, 1.2, 0.1], [-0.4, 2.2, 0.2], bark);
    k.rod(0.09, [0.15, 1.2, 0.1], [0.6, 2.1, -0.2], bark);
    k.rod(0.07, [0.15, 1.2, 0.1], [0.1, 2.4, -0.5], bark);
    const leaves = P.foliage(0x6f8a5c);
    for (const [x, y, z, r] of [[-0.5, 2.6, 0.2, 0.75], [0.7, 2.5, -0.2, 0.7], [0.1, 2.9, -0.5, 0.8], [0.1, 3.2, 0.2, 0.75], [-0.2, 2.5, -0.5, 0.6], [0.5, 2.9, 0.4, 0.6]]) {
      k.sphere(r, x, y, z, leaves, { seg: 12, scale: [1.1, 0.75, 1.1] });
    }
    if (p.variant === 1) k.lathe([[0.3, 0], [0.45, 0.6], [0.48, 0.65]], 0, 0, 0, P.terracotta(), { seg: 20 });
  },

  topiary: (k, p) => {
    const box = P.stone(0xe6dccb);
    k.lathe([[0.32, 0], [0.42, 0.05], [0.4, 0.55], [0.45, 0.6]], 0, 0, 0, box, { seg: 24 });
    k.cyl(0.4, 0.4, 0.02, 0, 0.58, 0, P.soil());
    k.cyl(0.04, 0.05, 0.7, 0, 0.9, 0, P.bark(), { seg: 6 });
    const leaves = P.foliage(0x2f5a28);
    if (p.variant === 1) {
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => {
        const t = i / 39;
        return new THREE.Vector3(Math.cos(t * Math.PI * 7) * 0.32 * (1 - t * 0.7), 0.7 + t * (p.h - 0.8), Math.sin(t * Math.PI * 7) * 0.32 * (1 - t * 0.7));
      }));
      k.mesh(new THREE.TubeGeometry(curve, 120, 0.13, 8), 0, 0, 0, leaves);
    } else {
      k.sphere(0.45, 0, 1.25, 0, leaves, { seg: 18 });
      k.sphere(0.3, 0, 1.9, 0, leaves, { seg: 16 });
    }
  },

  lampPost: (k, p) => {
    const iron = P.iron();
    k.lathe([[0.2, 0], [0.2, 0.15], [0.15, 0.25], [0.09, 0.35], [0.11, 0.5], [0.07, 0.6]], 0, 0, 0, iron, { seg: 16 });
    k.cyl(0.05, 0.065, p.h - 1.1, 0, 0.6 + (p.h - 1.1) / 2, 0, iron, { seg: 12 });
    const top = p.h - 0.5;
    const heads = p.variant === 1 ? [-0.45, 0.45] : [0];
    if (heads.length > 1) k.box(1.0, 0.05, 0.05, 0, top - 0.05, 0, iron);
    for (const x of heads) {
      k.cyl(0.13, 0.09, 0.06, x, top, 0, iron, { seg: 6 });
      k.cyl(0.16, 0.11, 0.38, x, top + 0.22, 0, P.glass(0xfff4d0, 0.4), { seg: 6, castShadow: false });
      k.sphere(0.07, x, top + 0.2, 0, P.emissive(0xffe0a0, 2.5), { seg: 10, castShadow: false });
      k.cone(0.2, 0.18, x, top + 0.5, 0, iron, { seg: 6 });
      k.sphere(0.035, x, top + 0.62, 0, iron, { seg: 8 });
    }
  },

  gardenBench: (k, p) => {
    const teak = P.wood(0xa8784a);
    const iron = P.iron();
    for (const sx of [-1, 1]) {
      const x = sx * (p.w / 2 - 0.08);
      k.box(0.05, 0.45, 0.5, x, 0.225, 0.02, iron);
      k.box(0.05, 0.5, 0.05, x, 0.65, -p.d / 2 + 0.1, iron, { rot: [-0.15, 0, 0] });
      k.box(0.05, 0.05, 0.5, x, 0.65, 0, iron);
      k.torus(0.06, 0.012, x, 0.3, 0.02, iron, { rot: [0, Math.PI / 2, 0] });
    }
    for (let i = 0; i < 5; i++) k.box(p.w, 0.03, 0.08, 0, 0.45, -0.2 + i * 0.1, teak);
    for (let i = 0; i < 3; i++) k.box(p.w - 0.1, 0.08, 0.025, 0, 0.6 + i * 0.1, -p.d / 2 + 0.09 + i * 0.015, teak, { rot: [-0.15, 0, 0] });
  },

  urnPlanter: (k, p) => {
    const stone = P.stone(0xe6dccb);
    k.box(0.5, 0.15, 0.5, 0, 0.075, 0, stone);
    k.lathe([[0.15, 0], [0.18, 0.08], [0.1, 0.2], [0.14, 0.3], [0.32, 0.6], [0.38, 0.85], [0.33, 0.9]], 0, 0.15, 0, stone, { seg: 24 });
    k.cyl(0.32, 0.32, 0.02, 0, 1.0, 0, P.soil());
    k.sphere(0.35, 0, 1.15, 0, P.foliage(0x3c6e2c), { seg: 14, scale: [1, 0.7, 1] });
    for (let i = 0; i < 10; i++) {
      const a = i * 0.63;
      k.sphere(0.05, Math.cos(a) * 0.3, 1.2 + (i % 3) * 0.04, Math.sin(a) * 0.3, P.flower(p.color ?? 0xffffff), { seg: 6 });
    }
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      k.sphere(0.1, Math.cos(a) * 0.38, 0.95, Math.sin(a) * 0.38, P.foliage(0x4a7a3a), { seg: 8, scale: [0.8, 1.6, 0.8] });
    }
  },

  flowerBed: (k, p) => {
    const box = P.foliage(0x2f5a28);
    k.box(p.w, 0.3, p.d, 0, 0.15, 0, P.soil());
    for (const sz of [-1, 1]) k.rbox(p.w, 0.38, 0.22, 0.09, 0, 0.19, sz * (p.d / 2 - 0.11), box);
    for (const sx of [-1, 1]) k.rbox(0.22, 0.38, p.d - 0.4, 0.09, sx * (p.w / 2 - 0.11), 0.19, 0, box);
    const colors = p.variant === 1 ? [0xffffff, 0xf4f1e8, 0xd9e8f6] : [0xd6336c, 0xf783ac, 0xffffff, 0xfab005, 0x9c36b5];
    const n = Math.floor(p.w * p.d * 30);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * (p.w - 0.5);
      const z = (Math.random() - 0.5) * (p.d - 0.5);
      k.cyl(0.006, 0.006, 0.2, x, 0.4, z, P.leaf(0x3f7a2a), { seg: 3, castShadow: false });
      k.sphere(0.05, x, 0.52, z, P.flower(colors[i % colors.length]), { seg: 6, castShadow: false });
    }
  },

  hedgeWall: (k, p) => { k.rbox(p.w, p.h, p.d, 0.18, 0, p.h / 2, 0, P.foliage(0x2c5226)); },

  lounger: (k, p) => {
    const teak = P.wood(0xa8784a);
    for (const sx of [-1, 1]) k.box(0.04, 0.08, p.d, sx * (p.w / 2 - 0.02), 0.28, 0, teak);
    for (let i = 0; i < 12; i++) k.box(p.w - 0.06, 0.02, 0.1, 0, 0.3, p.d / 2 - 0.65 - i * 0.11 + 0.6, teak);
    k.legs(p.w, p.d, 0.25, 0.04, teak, 0.025, false);
    k.rbox(p.w - 0.04, 0.08, p.d * 0.65, 0.04, 0, 0.36, p.d * 0.17, P.fabric(p.color ?? 0xf6f3ec));
    k.rbox(p.w - 0.04, 0.08, p.d * 0.36, 0.04, 0, 0.62, -p.d / 2 + 0.3, P.fabric(p.color ?? 0xf6f3ec), { rot: [0.9, 0, 0] });
    k.rbox(p.w - 0.1, 0.03, 0.4, 0.015, 0, 0.42, p.d * 0.15, P.fabric(0x2f6b8a));
    for (const sx of [-1, 1]) k.cyl(0.06, 0.06, 0.03, sx * (p.w / 2 + 0.01), 0.07, -p.d / 2 + 0.08, P.rubber(), { rot: [0, 0, Math.PI / 2], seg: 12 });
  },

  umbrella: (k, p) => {
    const r = p.w / 2;
    k.cyl(0.25, 0.28, 0.12, 0, 0.06, 0, P.stone(0x8a8a8a), { seg: 16 });
    k.cyl(0.025, 0.025, p.h, 0, p.h / 2, 0, P.wood(0xd9b98c), { seg: 8 });
    const canopy = new THREE.ConeGeometry(r, 0.55, 8, 1, true);
    k.mesh(canopy, 0, p.h - 0.25, 0, P.velvet(p.color ?? 0xf2efe8));
    k.mesh(canopy, 0, p.h - 0.26, 0, P.velvet(p.color ?? 0xf2efe8), { rot: [Math.PI, 0, 0], scale: [1, -1, 1] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.rod(0.008, [0, p.h - 0.6, 0], [Math.cos(a) * r * 0.9, p.h - 0.5, Math.sin(a) * r * 0.9], P.wood(0xd9b98c), 4);
    }
    k.sphere(0.04, 0, p.h + 0.03, 0, P.wood(0xd9b98c), { seg: 8 });
  },

  outdoorTable: (k, p) => {
    const teak = P.wood(0xa8784a);
    for (let i = 0; i < 6; i++) k.box(p.w, 0.03, p.d / 6 - 0.01, 0, p.h - 0.015, -p.d / 2 + (i + 0.5) * (p.d / 6), teak);
    k.legs(p.w, p.d, p.h - 0.03, 0.06, teak, 0.03, false);
    k.lathe([[0.08, 0], [0.1, 0.02], [0.06, 0.25], [0.08, 0.3]], 0, p.h, 0, P.glass(0xd9f0ff, 0.4), { seg: 14 });
    k.sphere(0.05, 0, p.h + 0.33, 0, P.flower(0xfab005), { seg: 8 });
  },

  outdoorChair: (k, p) => {
    const teak = P.wood(0xa8784a);
    k.legs(p.w, p.d, 0.42, 0.04, teak, 0.022, false);
    k.box(p.w, 0.04, p.d, 0, 0.44, 0, teak);
    k.rbox(p.w - 0.06, 0.07, p.d - 0.08, 0.03, 0, 0.5, 0.02, P.fabric(p.color ?? 0xf6f3ec));
    k.box(p.w, 0.42, 0.04, 0, 0.66, -p.d / 2 + 0.02, teak, { rot: [-0.12, 0, 0] });
    for (const sx of [-1, 1]) k.box(0.04, 0.04, p.d, sx * (p.w / 2 - 0.02), 0.65, 0, teak);
  },

  firePit: (k, p) => {
    const r = p.w / 2;
    k.lathe([[r - 0.25, 0], [r, 0], [r, p.h - 0.05], [r + 0.03, p.h], [r - 0.3, p.h], [r - 0.3, 0.1]], 0, 0, 0, P.stone(0x8f8a82), { seg: 32 });
    k.cyl(r - 0.3, r - 0.3, 0.02, 0, p.h - 0.08, 0, P.glass(0x3a6ea5, 0.9), { seg: 32 });
    // Gas burner ring under the fire glass.
    const fire = createFire({ kind: 'gas', width: 0, depth: 0, ring: Math.min(0.26, r - 0.4), height: 0.5, tongues: 22, light: 6, lightRange: 7 });
    fire.object.position.set(0, p.h - 0.07, 0);
    k.dynamic(fire.object, (_dt, t) => fire.update(t));
  },

  stringLights: (k, p) => {
    const iron = P.iron();
    for (const sx of [-1, 1]) k.cyl(0.04, 0.05, p.h, sx * p.w / 2, p.h / 2, 0, iron, { seg: 8 });
    const bulbs = Math.round(p.w / 0.5);
    let prev: [number, number, number] = [-p.w / 2, p.h - 0.05, 0];
    for (let i = 1; i <= bulbs; i++) {
      const t = i / bulbs;
      const pt: [number, number, number] = [-p.w / 2 + t * p.w, p.h - 0.05 - Math.sin(t * Math.PI) * 0.6, 0];
      k.rod(0.005, prev, pt, P.blackMetal(), 3);
      if (i < bulbs) k.sphere(0.04, pt[0], pt[1] - 0.06, 0, P.emissive(0xffd27a, 2.5), { seg: 8, castShadow: false });
      prev = pt;
    }
  },

  tennisNet: (k, p) => {
    for (const sx of [-1, 1]) k.cyl(0.04, 0.04, p.h + 0.05, sx * p.w / 2, (p.h + 0.05) / 2, 0, P.paint(0x1d3a2a), { seg: 10 });
    k.box(p.w, p.h - 0.1, 0.01, 0, (p.h - 0.1) / 2 + 0.03, 0, P.netMesh(), { castShadow: false });
    k.box(p.w, 0.06, 0.03, 0, p.h - 0.04, 0, P.paint(0xffffff));
    k.box(0.05, p.h - 0.15, 0.03, 0, (p.h - 0.15) / 2, 0, P.paint(0xffffff));
  },

  umpireChair: (k, _p) => {
    const white = P.paint(0xf2f2f2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod(0.03, [sx * 0.4, 0, sz * 0.5], [sx * 0.3, 1.5, sz * 0.25], white, 8);
    k.box(0.75, 0.05, 0.65, 0, 1.5, 0, white);
    k.box(0.6, 0.06, 0.5, 0, 1.55, 0, P.wood(0x1d3a2a));
    k.box(0.6, 0.6, 0.05, 0, 1.85, -0.25, P.wood(0x1d3a2a));
    for (let i = 0; i < 5; i++) k.box(0.6, 0.03, 0.05, 0, 0.25 + i * 0.27, 0.5 - i * 0.05, white);
  },

  helicopter: (k, p) => {
    const body = P.carPaint(p.color ?? 0x15171a);
    const stripe = P.carPaint(0xc9a24a);
    const glass = P.glass(0x1a2330, 0.7);
    // Fuselage: a stretched teardrop, cockpit glass at the nose (+z).
    k.sphere(1, 0, 1.45, 0.6, body, { seg: 28, scale: [0.95, 0.95, 2.1] });
    k.sphere(1, 0, 1.55, 1.65, glass, { seg: 24, scale: [0.85, 0.7, 1.15] });
    k.box(1.92, 0.08, 3.2, 0, 1.25, 0.5, stripe);
    k.cyl(0.18, 0.42, 4.4, 0, 1.6, -3.4, body, { rot: [Math.PI / 2, 0, 0], seg: 16 });
    k.box(0.08, 1.3, 0.8, 0, 2.2, -5.4, body, { rot: [-0.3, 0, 0] });
    k.box(1.4, 0.06, 0.5, 0, 1.65, -4.9, body);
    k.cyl(0.04, 0.04, 0.15, 0.1, 2.3, -5.5, P.blackMetal(), { rot: [0, 0, Math.PI / 2], seg: 8 });
    for (let i = 0; i < 2; i++) k.box(0.02, 1.1, 0.08, 0.17, 2.3, -5.5, P.blackMetal(), { rot: [i * Math.PI / 2, 0, 0] });
    // Rotor mast and four blades.
    k.cyl(0.1, 0.16, 0.5, 0, 2.55, 0.2, P.blackMetal(), { seg: 12 });
    k.cyl(0.22, 0.22, 0.12, 0, 2.82, 0.2, P.steel(), { seg: 16 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      k.box(0.32, 0.03, 5.4, Math.sin(a) * 2.75, 2.85, 0.2 + Math.cos(a) * 2.75, P.blackMetal(), { rot: [0, a, 0] });
    }
    // Skids.
    for (const sx of [-1, 1]) {
      k.cyl(0.05, 0.05, 3.6, sx * 1.1, 0.06, 0.6, P.steel(), { rot: [Math.PI / 2, 0, 0], seg: 10 });
      k.torus(0.15, 0.05, sx * 1.1, 0.21, 2.4, P.steel(), { arc: Math.PI / 2, rot: [0, Math.PI / 2, 0] });
      for (const z of [-0.3, 1.4]) k.rod(0.04, [sx * 1.1, 0.06, z], [sx * 0.6, 0.9, z], P.steel());
    }
    for (const sx of [-1, 1]) k.box(0.02, 0.7, 1.0, sx * 0.94, 1.45, 0.3, P.screen(), { castShadow: false });
    k.sphere(0.05, 0, 0.55, 0.6, P.led(0xff2020), { seg: 8, castShadow: false });
  },

  windsock: (k, p) => {
    k.cyl(0.04, 0.05, p.h, 0, p.h / 2, 0, P.steel(), { seg: 8 });
    const sock = new THREE.Group();
    sock.position.set(0, p.h - 0.15, 0);
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.2 - i * 0.03, 0.17 - i * 0.03, 0.26, 12, 1, true),
        P.velvet(i % 2 ? 0xffffff : 0xff6a10));
      seg.rotation.x = Math.PI / 2;
      seg.position.z = 0.15 + i * 0.26;
      sock.add(seg);
    }
    k.dynamic(sock, (_dt, t) => {
      sock.rotation.y = Math.sin(t * 0.4) * 0.5;
      sock.rotation.x = 0.1 + Math.sin(t * 1.7) * 0.06;
    });
  },

  poolFloat: (k, _p) => {
    const g = new THREE.Group();
    const pink = new THREE.MeshStandardMaterial({ color: 0xff7eb6, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.17, 12, 28), pink);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.1, 0.45), new THREE.Vector3(0, 0.55, 0.55), new THREE.Vector3(0, 0.8, 0.35), new THREE.Vector3(0, 0.8, 0.55),
    ]), 20, 0.07, 8), pink);
    g.add(neck);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    beak.position.set(0, 0.77, 0.66);
    beak.rotation.x = Math.PI / 2 + 0.5;
    g.add(beak);
    k.dynamic(g, (_dt, t) => {
      g.position.y = Math.sin(t * 1.3) * 0.03;
      g.rotation.y = t * 0.08;
      g.rotation.z = Math.sin(t * 0.9) * 0.05;
    });
  },

  gateLeaf: (k, p) => {
    const iron = P.iron();
    const gold = P.gold();
    k.box(p.w, 0.06, 0.06, 0, 0.2, 0, iron);
    k.box(p.w, 0.06, 0.06, 0, p.h - 0.6, 0, iron);
    k.box(p.w, 0.05, 0.05, 0, p.h - 0.95, 0, iron);
    for (const sx of [-1, 1]) k.box(0.08, p.h, 0.08, sx * (p.w / 2 - 0.04), p.h / 2, 0, iron);
    const bars = Math.round(p.w / 0.14);
    for (let i = 1; i < bars; i++) {
      const x = -p.w / 2 + (i * p.w) / bars;
      const top = p.h - 0.35 + Math.sin((i / bars) * Math.PI) * 0.3;
      k.cyl(0.015, 0.015, top - 0.05, x, (top + 0.05) / 2, 0, iron, { seg: 6 });
      k.cone(0.035, 0.14, x, top + 0.05, 0, gold, { seg: 6 });
    }
    for (let i = 0; i < Math.floor(p.w / 0.35); i++) {
      k.torus(0.14, 0.012, -p.w / 2 + 0.2 + i * 0.35, p.h - 0.78, 0, iron, { seg: 16 });
    }
    k.torus(0.35, 0.02, 0, 1.4, 0, gold, { seg: 24 });
    k.box(0.4, 0.4, 0.02, 0, 1.4, 0, gold, { rot: [0, 0, Math.PI / 4] });
  },

  statue: (k, p) => {
    const marble = P.marble(0xf8f6f2);
    k.box(0.9, 0.9, 0.9, 0, 0.45, 0, P.stone(0xd9cfbb));
    k.box(1.0, 0.1, 1.0, 0, 0.95, 0, P.stone(0xd9cfbb));
    if (p.variant === 1) {
      // Reclining lion.
      k.rbox(0.45, 0.35, 0.8, 0.12, 0, 1.18, -0.05, marble);
      k.sphere(0.2, 0, 1.45, 0.3, marble, { seg: 16 });
      k.torus(0.2, 0.08, 0, 1.45, 0.28, marble, { seg: 16 });
      k.rbox(0.12, 0.1, 0.16, 0.04, 0, 1.39, 0.48, marble);
      for (const sx of [-1, 1]) k.rbox(0.12, 0.1, 0.35, 0.04, sx * 0.13, 1.05, 0.35, marble);
      k.rod(0.03, [0, 1.15, -0.45], [0.2, 1.05, -0.6], marble);
    } else {
      // Classical figure on a plinth.
      k.lathe([[0.22, 0], [0.25, 0.3], [0.18, 0.7], [0.2, 0.95], [0.13, 1.15], [0.06, 1.25]], 0, 1.0, 0, marble, { seg: 20 });
      k.sphere(0.11, 0, 2.38, 0.02, marble, { seg: 16 });
      k.rod(0.04, [0.15, 2.1, 0], [0.35, 2.5, 0.05], marble);
      k.rod(0.04, [-0.15, 2.1, 0], [-0.25, 1.75, 0.1], marble);
      k.sphere(0.05, 0.36, 2.55, 0.05, marble, { seg: 8 });
    }
  },

  poolLight: (k) => { k.cyl(0.12, 0.12, 0.03, 0, 0.12, 0, P.led(0x9fe8ff), { rot: [Math.PI / 2, 0, 0], seg: 16, castShadow: false }); },

  sconce: (k, _p) => {
    k.box(0.12, 0.25, 0.03, 0, 0.2, 0.015, P.brass(), { castShadow: false });
    k.rod(0.012, [0, 0.2, 0.02], [0, 0.25, 0.14], P.brass());
    k.cyl(0.07, 0.09, 0.18, 0, 0.32, 0.15, P.glass(0xfff4e0, 0.55), { seg: 12, castShadow: false });
    k.sphere(0.03, 0, 0.3, 0.15, P.emissive(0xffe0a0, 2.5), { seg: 8, castShadow: false });
  },
};
