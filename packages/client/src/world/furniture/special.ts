import * as THREE from 'three';
import type { Kit } from './kit';
import { P } from './palette';
import type { Builder } from './types';

const BALL_COLORS = [0xf1c40f, 0x2e5bd9, 0xd62828, 0x6a2c91, 0xf77f00, 0x1d7a3a, 0x7a1f1f, 0x111111];

function bottle(k: Kit, x: number, y: number, z: number, color: number, tall = 1): void {
  k.lathe([[0.035, 0], [0.037, 0.02], [0.037, 0.2 * tall], [0.014, 0.26 * tall], [0.012, 0.32 * tall], [0.014, 0.33 * tall]], x, y, z,
    P.glass(color, 0.85), { seg: 10, castShadow: false });
  k.box(0.05, 0.06, 0.002, x, y + 0.11 * tall, z + 0.037, P.paint(0xefe6d2), { castShadow: false });
}

function wheel(k: Kit, x: number, y: number, z: number, r: number, width: number, rim: THREE.Material): void {
  const side = Math.sign(x);
  k.cyl(r, r, width, x, y, z, P.rubber(), { rot: [0, 0, Math.PI / 2], seg: 24 });
  k.cyl(r * 0.68, r * 0.68, 0.02, x + side * (width / 2 + 0.002), y, z, rim, { rot: [0, 0, Math.PI / 2], seg: 24 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.box(0.02, r * 1.2, 0.04, x + side * (width / 2 + 0.012), y, z, rim, { rot: [a, 0, 0], castShadow: false });
  }
  k.cyl(0.05, 0.05, 0.03, x + side * (width / 2 + 0.015), y, z, P.chrome(), { rot: [0, 0, Math.PI / 2], seg: 12 });
}

export const special: Record<string, Builder> = {
  poolTable: (k, p) => {
    const wd = P.walnut();
    const ebony = P.ebony();
    k.box(p.w - 0.2, 0.18, p.d - 0.2, 0, p.h - 0.15, 0, wd);
    k.box(p.w - 0.3, 0.02, p.d - 0.3, 0, p.h - 0.05, 0, P.felt(p.color ?? 0x1f6b3a), { castShadow: false });
    for (const sz of [-1, 1]) k.box(p.w, 0.08, 0.15, 0, p.h - 0.04, sz * (p.d / 2 - 0.075), wd);
    for (const sx of [-1, 1]) k.box(0.15, 0.08, p.d - 0.3, sx * (p.w / 2 - 0.075), p.h - 0.04, 0, wd);
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
      k.cyl(0.055, 0.055, 0.02, sx * (p.w / 2 - 0.15), p.h + 0.001, sz * (p.d / 2 - 0.15), P.screen(), { seg: 12, castShadow: false });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.lathe([[0.1, 0], [0.08, 0.05], [0.06, 0.25], [0.09, 0.45], [0.1, p.h - 0.24]], sx * (p.w / 2 - 0.25), 0, sz * (p.d / 2 - 0.25), wd, { seg: 14 });
    }
    // Racked balls and the cue ball.
    let n = 0;
    for (let r = 0; r < 5; r++) for (let i = 0; i <= r; i++) {
      k.sphere(0.028, p.w * 0.25 + r * 0.05, p.h - 0.01, (i - r / 2) * 0.058, P.plastic(BALL_COLORS[n++ % 8]), { seg: 10, castShadow: false });
    }
    k.sphere(0.028, -p.w * 0.25, p.h - 0.01, 0, P.plastic(0xfaf8f0), { seg: 10, castShadow: false });
    k.rod(0.008, [-p.w * 0.25 - 0.05, p.h, 0.02], [-p.w * 0.25 - 1.3, p.h + 0.1, 0.25], ebony);
  },

  barCounter: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, p.h - 0.05, p.d - 0.15, 0, (p.h - 0.05) / 2, -0.07, P.ebony());
    for (let i = 0; i < Math.floor(p.w / 0.07); i++) k.box(0.035, p.h - 0.15, 0.03, -p.w / 2 + 0.05 + i * 0.07, (p.h - 0.05) / 2, p.d / 2 - 0.13, wd);
    k.rbox(p.w + 0.05, 0.06, p.d, 0.02, 0, p.h - 0.03, 0, P.marble(0x2b2b2b));
    k.cyl(0.025, 0.025, p.w - 0.1, 0, 0.2, p.d / 2 + 0.05, P.brass(), { rot: [0, 0, Math.PI / 2], seg: 10 });
    for (let i = 0; i < 4; i++) k.box(0.02, 0.2, 0.08, -p.w / 2 + 0.2 + i * ((p.w - 0.4) / 3), 0.12, p.d / 2 + 0.02, P.brass());
    const glass = P.glass(0xf0faff, 0.35);
    for (let i = 0; i < 5; i++) {
      k.lathe([[0.03, 0], [0.005, 0.01], [0.005, 0.08], [0.035, 0.1], [0.045, 0.17]], -p.w / 2 + 0.4 + i * 0.5, p.h, 0.05, glass, { seg: 10, castShadow: false });
    }
    bottle(k, p.w / 2 - 0.4, p.h, 0, 0x2a5a2a);
    k.box(0.3, 0.02, 0.2, p.w / 2 - 0.8, p.h + 0.01, 0, P.wood(0xc9a27a));
  },

  backBar: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, 0.9, p.d, 0, 0.45, 0, wd);
    k.box(p.w + 0.02, 0.03, p.d + 0.02, 0, 0.915, 0, P.marble(0x2b2b2b));
    k.box(p.w, p.h - 0.93, 0.03, 0, 0.93 + (p.h - 0.93) / 2, -p.d / 2 + 0.015, P.mirror(), { castShadow: false });
    const colors = [0x6b3a1e, 0x2a5a2a, 0xe8e6da, 0x8a2a1a, 0xc9a24a, 0x3a5a8a, 0x5a2a3a];
    for (let s = 0; s < 3; s++) {
      const y = 1.1 + s * 0.42;
      k.box(p.w - 0.1, 0.02, p.d - 0.12, 0, y, -0.03, P.glass(0xe0f0f8, 0.5), { castShadow: false });
      k.box(p.w - 0.1, 0.01, 0.01, 0, y - 0.015, p.d / 2 - 0.1, P.emissive(0xffc27a, 2), { castShadow: false });
      for (let i = 0; i < Math.floor((p.w - 0.2) / 0.12); i++) {
        bottle(k, -p.w / 2 + 0.15 + i * 0.12, y + 0.01, -0.03, colors[(i * 3 + s) % colors.length], 0.85 + ((i + s) % 3) * 0.12);
      }
    }
    for (const sx of [-1, 1]) k.box(0.05, p.h - 0.93, p.d, sx * (p.w / 2 - 0.025), 0.93 + (p.h - 0.93) / 2, 0, wd);
    k.box(p.w, 0.1, p.d, 0, p.h - 0.05, 0, wd);
  },

  arcadeMachine: (k, p) => {
    const body = P.paint(p.color ?? 0x1a1a40);
    const side = new THREE.Shape();
    side.moveTo(-0.4, 0); side.lineTo(0.35, 0); side.lineTo(0.35, 0.95); side.lineTo(0.45, 1.05);
    side.lineTo(0.2, 1.4); side.lineTo(0.25, 1.8); side.lineTo(-0.4, 1.8); side.closePath();
    const geo = new THREE.ExtrudeGeometry(side, { depth: 0.03, bevelEnabled: false });
    for (const sx of [-1, 1]) k.mesh(geo, sx * (p.w / 2) - (sx > 0 ? 0.03 : 0), 0, 0, P.paint(0xd62828), { rot: [0, -Math.PI / 2, 0] });
    k.box(p.w - 0.06, 0.95, 0.7, 0, 0.475, -0.03, body);
    k.box(p.w - 0.06, 0.35, 0.05, 0, 1.2, 0.27, P.screenOn('arcade', (g, s) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#ffd60a';
      g.beginPath(); g.arc(s * 0.3, s * 0.5, s * 0.1, 0.3, Math.PI * 2 - 0.3); g.lineTo(s * 0.3, s * 0.5); g.fill();
      g.fillStyle = '#f72585'; for (let i = 0; i < 6; i++) g.fillRect(s * (0.45 + i * 0.08), s * 0.48, s * 0.03, s * 0.03);
      g.fillStyle = '#4cc9f0'; g.fillRect(0, s * 0.3, s, 4); g.fillRect(0, s * 0.7, s, 4);
    }), { rot: [-0.45, 0, 0], castShadow: false });
    k.box(p.w - 0.06, 0.06, 0.32, 0, 1.0, 0.24, body, { rot: [0.25, 0, 0] });
    k.cyl(0.012, 0.012, 0.08, -0.15, 1.08, 0.24, P.blackMetal(), { seg: 6 });
    k.sphere(0.03, -0.15, 1.13, 0.24, P.plastic(0xd62828), { seg: 10 });
    for (let i = 0; i < 4; i++) k.cyl(0.022, 0.022, 0.02, 0.02 + i * 0.07, 1.05, 0.26, P.plastic([0xf1c40f, 0x2e86de, 0x2ecc71, 0xe74c3c][i]), { seg: 10 });
    k.box(p.w - 0.06, 0.2, 0.1, 0, 1.7, 0.18, P.emissive(0xff4fd8, 1.4));
  },

  dartboard: (k, p) => {
    const r = p.w / 2;
    const rings: [number, number][] = [[1, 0x111111], [0.85, 0x1d7a3a], [0.8, 0xe8dcc0], [0.5, 0xd62828], [0.46, 0x111111], [0.1, 0x1d7a3a], [0.05, 0xd62828]];
    rings.forEach(([f, c], i) => k.cyl(r * f, r * f, 0.02, 0, r, 0.01 + i * 0.002, P.paint(c), { rot: [Math.PI / 2, 0, 0], seg: 32, castShadow: false }));
    for (const [x, y] of [[0.03, 0.05], [-0.06, -0.02], [0.01, -0.08]]) k.rod(0.004, [x, r + y, 0.03], [x, r + y, 0.12], P.chrome(), 5);
  },

  recliner: (k, p) => {
    const l = P.leather(p.color ?? 0x3a1414);
    k.rbox(p.w - 0.3, 0.45, p.d - 0.1, 0.05, 0, 0.225, 0.02, l);
    k.rbox(p.w - 0.32, 0.16, p.d - 0.35, 0.06, 0, 0.53, 0.08, l);
    k.rbox(p.w - 0.28, p.h - 0.2, 0.24, 0.08, 0, 0.2 + (p.h - 0.2) / 2, -p.d / 2 + 0.14, l, { rot: [-0.12, 0, 0] });
    k.rbox(p.w - 0.38, 0.2, 0.12, 0.05, 0, p.h - 0.05, -p.d / 2 + 0.2, l);
    for (const sx of [-1, 1]) {
      k.rbox(0.16, 0.62, p.d - 0.05, 0.05, sx * (p.w / 2 - 0.08), 0.31, 0, l);
      k.cyl(0.04, 0.035, 0.08, sx * (p.w / 2 - 0.08), 0.6, p.d / 2 - 0.15, P.screen(), { seg: 12 });
      k.cyl(0.045, 0.045, 0.006, sx * (p.w / 2 - 0.08), 0.625, p.d / 2 - 0.15, P.led(0x3aa0ff), { seg: 12, castShadow: false });
    }
    k.box(p.w - 0.32, 0.06, 0.05, 0, 0.06, p.d / 2 - 0.02, P.led(0x3a4aff), { castShadow: false });
  },

  popcornMachine: (k, p) => {
    const red = P.paint(0xc0392b);
    k.box(p.w, 0.7, p.d, 0, 0.35 + 0.1, 0, red);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.05, 0.05, 0.04, sx * (p.w / 2 - 0.05), 0.05, sz * (p.d / 2 - 0.05), P.rubber(), { rot: [0, 0, Math.PI / 2], seg: 10 });
    k.box(p.w - 0.04, 0.55, p.d - 0.04, 0, 1.08, 0, P.glass(0xf8f4e0, 0.3), { castShadow: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.03, 0.55, 0.03, sx * (p.w / 2 - 0.02), 1.08, sz * (p.d / 2 - 0.02), red);
    const corn = P.paint(0xfff1b8);
    for (let i = 0; i < 70; i++) k.sphere(0.025, (Math.random() - 0.5) * (p.w - 0.1), 0.83 + Math.random() * 0.16, (Math.random() - 0.5) * (p.d - 0.1), corn, { seg: 5, castShadow: false });
    k.cyl(0.1, 0.12, 0.08, 0, 1.25, 0, P.steel(), { seg: 12 });
    k.box(p.w + 0.04, 0.12, p.d + 0.04, 0, 1.42, 0, red);
    k.box(p.w - 0.1, 0.06, 0.01, 0, 1.42, p.d / 2 + 0.025, P.emissive(0xffd166, 1.5), { castShadow: false });
  },

  wineRack: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, p.h, 0.04, 0, p.h / 2, -p.d / 2 + 0.02, wd);
    k.box(p.w - 0.08, p.h - 0.1, 0.02, 0, p.h / 2, p.d / 2 - 0.12, P.bottles(), { castShadow: false });
    const cols = Math.round(p.w / 0.2);
    for (let i = 0; i <= cols; i++) k.box(0.025, p.h, p.d, -p.w / 2 + i * (p.w / cols), p.h / 2, 0, wd);
    for (let r = 0; r <= 6; r++) k.box(p.w, 0.025, p.d, 0, 0.05 + r * ((p.h - 0.1) / 6), 0, wd);
    // A few bottle necks poking out.
    for (let i = 0; i < cols; i++) for (let r = 0; r < 6; r++) {
      if ((i * 7 + r * 3) % 4 === 0) continue;
      k.cyl(0.013, 0.016, 0.1, -p.w / 2 + (i + 0.5) * (p.w / cols), 0.05 + (r + 0.5) * ((p.h - 0.1) / 6), p.d / 2 - 0.06,
        P.glass((i + r) % 3 ? 0x2a0c10 : 0x16301a, 0.9), { rot: [Math.PI / 2, 0, 0], seg: 6, castShadow: false });
    }
  },

  wineBarrel: (k, p) => {
    const r = p.w / 2;
    k.lathe([[r * 0.85, 0], [r * 0.97, p.h * 0.25], [r, p.h * 0.5], [r * 0.97, p.h * 0.75], [r * 0.85, p.h], [0.0001, p.h]], 0, 0, 0, P.wood(0x8a5a33), { seg: 24 });
    for (const t of [0.08, 0.3, 0.7, 0.92]) {
      const rr = r * (t < 0.5 ? 0.85 + (t / 0.5) * 0.15 : 1 - ((t - 0.5) / 0.5) * 0.15) + 0.008;
      k.torus(rr, 0.012, 0, p.h * t, 0, P.iron(), { rot: [Math.PI / 2, 0, 0], seg: 24 });
    }
    k.lathe([[0.03, 0], [0.004, 0.01], [0.004, 0.09], [0.04, 0.11], [0.045, 0.18]], 0.1, p.h, 0, P.glass(0x6a1020, 0.6), { seg: 10 });
  },

  treadmill: (k, p) => {
    const bm = P.blackMetal();
    k.rbox(p.w, 0.18, p.d, 0.04, 0, 0.09, 0, P.paint(0x2b2d31));
    k.box(p.w - 0.2, 0.02, p.d - 0.3, 0, 0.19, 0.05, P.rubber(), { castShadow: false });
    for (const sx of [-1, 1]) {
      k.rod(0.03, [sx * (p.w / 2 - 0.05), 0.18, -p.d / 2 + 0.2], [sx * (p.w / 2 - 0.05), 1.3, -p.d / 2 + 0.05], bm);
      k.rod(0.018, [sx * (p.w / 2 - 0.05), 1.05, -p.d / 2 + 0.1], [sx * (p.w / 2 - 0.05), 1.05, -p.d / 2 + 0.55], P.chrome());
    }
    k.rbox(p.w - 0.05, 0.3, 0.12, 0.03, 0, 1.32, -p.d / 2 + 0.08, bm, { rot: [0.6, 0, 0] });
    k.box(0.35, 0.2, 0.01, 0, 1.35, -p.d / 2 + 0.15, P.screenOn('gym', (g, s) => {
      g.fillStyle = '#04121f'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#2bff7a'; g.font = `bold ${s * 0.2}px monospace`; g.fillText('6.5 KM/H', s * 0.08, s * 0.4);
      g.fillStyle = '#ffb020'; g.fillText('142 BPM', s * 0.08, s * 0.75);
    }), { rot: [0.6 - Math.PI / 2 + Math.PI / 2, 0, 0], castShadow: false });
  },

  exerciseBike: (k, _p) => {
    const bm = P.blackMetal();
    k.box(0.5, 0.05, 1.1, 0, 0.03, 0, bm);
    k.cyl(0.25, 0.25, 0.06, 0, 0.35, 0.35, P.chrome(), { rot: [0, 0, Math.PI / 2], seg: 24 });
    k.rod(0.035, [0, 0.05, -0.35], [0, 0.85, -0.2], bm);
    k.rod(0.035, [0, 0.05, 0.4], [0, 1.05, 0.35], bm);
    k.rbox(0.22, 0.07, 0.3, 0.03, 0, 0.88, -0.22, P.leather(0x111111));
    k.rod(0.015, [-0.2, 1.08, 0.3], [0.2, 1.08, 0.3], P.chrome());
    k.box(0.25, 0.16, 0.02, 0, 1.18, 0.38, P.screenOn('gym', () => {}), { rot: [-0.4, 0, 0], castShadow: false });
  },

  weightBench: (k, _p) => {
    const bm = P.blackMetal();
    k.rbox(0.3, 0.08, 1.2, 0.03, 0, 0.45, 0.1, P.leather(0x111111));
    k.box(0.06, 0.4, 0.06, 0, 0.2, 0.55, bm);
    k.box(0.06, 0.4, 0.06, 0, 0.2, -0.35, bm);
    for (const sx of [-1, 1]) k.box(0.06, 1.5, 0.06, sx * 0.5, 0.75, -0.5, bm);
    k.box(1.1, 0.05, 0.05, 0, 0.02, -0.5, bm);
    // Barbell resting on the uprights.
    k.cyl(0.014, 0.014, 2.0, 0, 1.25, -0.48, P.chrome(), { rot: [0, 0, Math.PI / 2], seg: 8 });
    for (const sx of [-1, 1]) for (const [off, r] of [[0.68, 0.22], [0.74, 0.17]] as const) {
      k.cyl(r, r, 0.04, sx * off, 1.25, -0.48, P.rubber(), { rot: [0, 0, Math.PI / 2], seg: 20 });
    }
  },

  dumbbellRack: (k, p) => {
    const bm = P.blackMetal();
    for (const sx of [-1, 1]) k.box(0.05, p.h, p.d, sx * (p.w / 2 - 0.025), p.h / 2, 0, bm);
    for (const [y, z] of [[0.45, 0.08], [0.85, -0.08]]) {
      k.box(p.w, 0.03, 0.25, 0, y, z, bm, { rot: [0.25, 0, 0] });
      for (let i = 0; i < 6; i++) {
        const x = -p.w / 2 + 0.17 + i * ((p.w - 0.34) / 5);
        const r = 0.05 + i * 0.008;
        k.cyl(0.014, 0.014, 0.2, x, y + 0.06, z, P.chrome(), { rot: [Math.PI / 2, 0, 0], seg: 6 });
        for (const e of [-1, 1]) k.cyl(r, r, 0.07, x, y + 0.06, z + e * 0.12, P.rubber(), { rot: [Math.PI / 2, 0, 0], seg: 6 });
      }
    }
  },

  punchingBag: (k, p) => {
    k.lathe([[0.18, 0], [0.24, 0.08], [0.25, 1.3], [0.2, 1.48], [0.02, 1.5]], 0, 0.7, 0, P.leather(p.color ?? 0x7a1f1f), { seg: 20 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      k.rod(0.006, [Math.cos(a) * 0.15, 2.18, Math.sin(a) * 0.15], [0, 2.5, 0], P.steel(), 4);
    }
    k.rod(0.01, [0, 2.5, 0], [0, p.h, 0], P.steel(), 4);
  },

  serverRack: (k, p) => {
    const bm = P.blackMetal();
    k.box(p.w, p.h, p.d, 0, p.h / 2, 0, bm);
    for (const sz of [-1, 1]) k.box(p.w - 0.06, p.h - 0.12, 0.01, 0, p.h / 2, sz * (p.d / 2 + 0.003), P.serverFace(), { castShadow: false, rot: [0, sz < 0 ? Math.PI : 0, 0] });
    k.box(p.w, 0.05, p.d, 0, p.h + 0.025, 0, bm);
    k.box(0.02, 0.4, 0.03, p.w / 2 - 0.05, p.h / 2, p.d / 2 + 0.02, P.chrome());
    // Cable bundle up to the overhead tray.
    for (let i = 0; i < 3; i++) k.cyl(0.015, 0.015, 0.6, -0.2 + i * 0.05, p.h + 0.3, -p.d / 2 + 0.1, P.plastic([0x2e86de, 0xf1c40f, 0x111111][i]), { seg: 6 });
  },

  securityDesk: (k, p) => {
    const bm = P.blackMetal();
    k.rbox(p.w, 0.05, p.d, 0.015, 0, p.h - 0.025, 0, P.wood(0x2d3640));
    k.box(p.w, p.h - 0.05, 0.04, 0, (p.h - 0.05) / 2, p.d / 2 - 0.05, P.wood(0x2d3640));
    for (const sx of [-1, 1]) k.box(0.05, p.h - 0.05, p.d, sx * (p.w / 2 - 0.025), (p.h - 0.05) / 2, 0, bm);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 1.1;
      k.box(0.55, 0.33, 0.03, x, p.h + 0.3, -p.d / 2 + 0.2, P.screen(), { rot: [0, (1 - i) * 0.2, 0] });
      k.box(0.52, 0.3, 0.004, x, p.h + 0.3, -p.d / 2 + 0.218, P.screenOn(`sec${i}`, (g, s) => {
        g.fillStyle = '#0a0f0a'; g.fillRect(0, 0, s, s);
        g.strokeStyle = '#2bff7a'; g.lineWidth = 2;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.strokeRect(6 + c * s / 3, 6 + r * s / 3, s / 3 - 12, s / 3 - 12);
        g.fillStyle = '#2bff7a'; g.font = `${s * 0.06}px monospace`; g.fillText(`SECTOR ${i + 1}  ARMED`, 10, s - 10);
      }), { rot: [0, (1 - i) * 0.2, 0], castShadow: false });
      k.box(0.05, 0.16, 0.05, x, p.h + 0.08, -p.d / 2 + 0.2, bm);
      k.box(0.44, 0.015, 0.14, x, p.h + 0.008, 0.05, bm);
    }
    k.cyl(0.05, 0.06, 0.04, 0.6, p.h + 0.02, 0.15, bm, { seg: 12 });
    k.cyl(0.012, 0.012, 0.12, 0.6, p.h + 0.1, 0.15, P.rubber(), { seg: 6 });
    k.lathe([[0.04, 0], [0.045, 0.1], [0.04, 0.11]], -0.6, p.h, 0.2, P.ceramic(0xf2efe9), { seg: 12 });
    k.box(0.18, 0.06, 0.2, -1.4, p.h + 0.03, 0.1, bm);
  },

  gunLocker: (k, p) => {
    const st = P.steel();
    k.box(p.w, p.h, p.d, 0, p.h / 2, 0, P.blackMetal());
    k.box(p.w - 0.1, p.h - 0.15, 0.01, 0, p.h / 2, p.d / 2 + 0.004, P.glass(0x2a3540, 0.45), { castShadow: false });
    for (let i = 0; i < 5; i++) {
      const x = -p.w / 2 + 0.15 + i * ((p.w - 0.3) / 4);
      k.box(0.05, 1.0, 0.03, x, 0.8, p.d / 2 - 0.08, P.screen());
      k.box(0.06, 0.25, 0.04, x, 0.42, p.d / 2 - 0.08, P.wood(0x4a2e1a));
      k.box(0.04, 0.12, 0.05, x, 1.0, p.d / 2 - 0.06, P.screen());
    }
    k.box(0.04, 0.3, 0.04, p.w / 2 - 0.08, p.h / 2, p.d / 2 + 0.03, st);
    k.cyl(0.04, 0.04, 0.02, p.w / 2 - 0.08, p.h / 2 + 0.25, p.d / 2 + 0.015, st, { rot: [Math.PI / 2, 0, 0], seg: 12 });
  },

  safe: (k, p) => {
    k.rbox(p.w, p.h, p.d, 0.03, 0, p.h / 2, 0, P.paint(0x2b2d31));
    k.box(p.w - 0.1, p.h - 0.1, 0.02, 0, p.h / 2, p.d / 2 + 0.005, P.paint(0x33363b));
    k.cyl(0.08, 0.08, 0.03, 0, p.h * 0.62, p.d / 2 + 0.03, P.chrome(), { rot: [Math.PI / 2, 0, 0], seg: 24 });
    k.torus(0.08, 0.008, 0, p.h * 0.62, p.d / 2 + 0.045, P.chrome());
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.rod(0.012, [0, p.h * 0.35, p.d / 2 + 0.03], [Math.cos(a) * 0.12, p.h * 0.35 + Math.sin(a) * 0.12, p.d / 2 + 0.06], P.chrome());
    }
    for (const y of [0.2, p.h - 0.2]) k.cyl(0.025, 0.025, 0.12, -p.w / 2 + 0.02, y, p.d / 2, P.steel(), { seg: 8 });
  },

  goldStack: (k, _p) => {
    const gold = P.gold();
    // Trapezoidal ingots stacked in a stepped pyramid, alternating direction each layer like a real vault stack.
    const bar = new THREE.CylinderGeometry(0.1, 0.125, 0.065, 4, 1);
    bar.rotateY(Math.PI / 4);
    bar.scale(1, 1, 2.0);
    const layers: [number, number][] = [[5, 3], [4, 3], [4, 2], [3, 2], [2, 1]];
    layers.forEach(([nx, nz], y) => {
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        k.mesh(bar, (i - (nx - 1) / 2) * 0.18, 0.0325 + y * 0.066, (j - (nz - 1) / 2) * 0.36, gold);
      }
    });
  },

  cashPallet: (k, p) => {
    const wd = P.wood(0xb08a5a);
    for (let i = 0; i < 5; i++) k.box(p.w, 0.025, 0.14, 0, 0.13, -p.d / 2 + 0.07 + i * ((p.d - 0.14) / 4), wd);
    for (const sx of [-1, 0, 1]) k.box(0.1, 0.11, p.d, sx * (p.w / 2 - 0.05), 0.055, 0, wd);
    const money = P.money();
    const rows = 4;
    for (let y = 0; y < rows; y++) for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      k.box(0.27, 0.18, 0.3, -p.w / 2 + 0.16 + i * 0.29, 0.25 + y * 0.185, -p.d / 2 + 0.18 + j * 0.32, money);
    }
    k.box(p.w - 0.02, rows * 0.185 + 0.02, p.d - 0.02, 0, 0.15 + (rows * 0.185) / 2 + 0.01, 0, P.glass(0xf0f8ff, 0.18), { castShadow: false });
  },

  depositBoxes: (k, p) => {
    k.box(p.w, p.h, p.d - 0.03, 0, p.h / 2, -0.015, P.steel());
    const cols = Math.round(p.w / 0.3);
    const rows = 8;
    const cw = p.w / cols;
    const rh = p.h / rows;
    for (let i = 0; i < cols; i++) for (let r = 0; r < rows; r++) {
      const x = -p.w / 2 + cw * (i + 0.5);
      const y = rh * (r + 0.5);
      k.box(cw - 0.015, rh - 0.015, 0.02, x, y, p.d / 2 - 0.01, P.steel(), { castShadow: false });
      k.cyl(0.012, 0.012, 0.01, x + cw * 0.3, y, p.d / 2 + 0.005, P.brass(), { rot: [Math.PI / 2, 0, 0], seg: 6, castShadow: false });
      k.box(0.06, 0.02, 0.004, x - cw * 0.15, y + rh * 0.25, p.d / 2 + 0.002, P.paint(0xe8e1d4), { castShadow: false });
    }
  },

  vaultDoor: (k, p) => {
    const st = P.steel();
    const r = p.d / 2;
    const cy = 1.25;
    k.cyl(r, r, p.w, 0, cy, 0, st, { rot: [0, 0, Math.PI / 2], seg: 48 });
    for (const sx of [-1, 1]) {
      k.cyl(r * 0.8, r * 0.8, 0.02, sx * (p.w / 2 + 0.01), cy, 0, P.paint(0x8f979f), { rot: [0, 0, Math.PI / 2], seg: 40 });
      k.torus(r * 0.55, 0.03, sx * (p.w / 2 + 0.03), cy, 0, P.chrome(), { rot: [0, Math.PI / 2, 0], seg: 32 });
      for (let i = 0; i < 4; i++) k.box(0.03, r * 1.1, 0.05, sx * (p.w / 2 + 0.05), cy, 0, P.chrome(), { rot: [(i * Math.PI) / 4, 0, 0] });
      k.cyl(0.12, 0.12, 0.06, sx * (p.w / 2 + 0.05), cy, 0, P.chrome(), { rot: [0, 0, Math.PI / 2], seg: 16 });
    }
    // Locking bolts around the rim, and the hinge.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.cyl(0.05, 0.05, 0.25, 0, cy + Math.sin(a) * (r - 0.12), Math.cos(a) * (r - 0.12), P.chrome(), { rot: [0, 0, Math.PI / 2], seg: 10 });
    }
    k.box(0.3, 2.2, 0.25, 0.1, 1.15, -r - 0.05, st);
  },

  displayCase: (k, p) => {
    k.box(p.w, 0.85, p.d, 0, 0.425, 0, P.walnut());
    k.box(p.w - 0.04, 0.01, p.d - 0.04, 0, 0.855, 0, P.velvet(0x1e2a5a), { castShadow: false });
    k.box(p.w, p.h - 0.86, p.d, 0, 0.86 + (p.h - 0.86) / 2, 0, P.glass(0xf0faff, 0.15), { castShadow: false });
    for (let i = 0; i < 6; i++) {
      const x = -p.w / 2 + 0.15 + (i % 3) * ((p.w - 0.3) / 2);
      const z = i < 3 ? -0.12 : 0.12;
      k.torus(0.04, 0.008, x, 0.88, z, P.gold(), { rot: [1.2, 0, 0] });
      k.sphere(0.018, x, 0.92, z, P.emissive([0xd62828, 0x3aa0ff, 0x2ecc71][i % 3], 0.8), { seg: 8 });
    }
  },

  toolChest: (k, p) => {
    const red = P.paint(0xb3122a);
    k.box(p.w, p.h - 0.1, p.d, 0, 0.1 + (p.h - 0.1) / 2, 0, red);
    for (let i = 0; i < 7; i++) {
      const y = 0.15 + i * ((p.h - 0.2) / 7);
      k.box(p.w - 0.04, 0.005, 0.01, 0, y, p.d / 2 + 0.003, P.blackMetal(), { castShadow: false });
      k.box(p.w * 0.7, 0.02, 0.03, 0, y + 0.06, p.d / 2 + 0.015, P.chrome());
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.04, 0.04, 0.03, sx * (p.w / 2 - 0.06), 0.05, sz * (p.d / 2 - 0.06), P.rubber(), { rot: [0, 0, Math.PI / 2], seg: 10 });
    k.box(p.w + 0.02, 0.02, p.d + 0.02, 0, p.h, 0, P.rubber());
  },

  car: (k, p) => {
    const paint = P.carPaint(p.color ?? 0xb3122a);
    const glass = P.glass(0x1a2330, 0.75);
    const rim = p.variant === 1 ? P.blackMetal() : P.chrome();
    const style = [
      { bodyH: 0.5, ride: 0.18, cabinH: 0.42, cabinL: 1.9, cabinZ: -0.25, wheelR: 0.34 }, // sports coupe
      { bodyH: 0.75, ride: 0.3, cabinH: 0.6, cabinL: 2.6, cabinZ: -0.3, wheelR: 0.4 },  // SUV
      { bodyH: 0.6, ride: 0.2, cabinH: 0.5, cabinL: 2.3, cabinZ: -0.15, wheelR: 0.36 },  // luxury sedan
    ][p.variant % 3];
    const w = p.w;
    const l = p.d;
    const y0 = style.ride;
    k.rbox(w, style.bodyH, l, 0.18, 0, y0 + style.bodyH / 2, 0, paint);
    k.rbox(w * 0.98, 0.18, l * 0.32, 0.09, 0, y0 + style.bodyH + 0.02, l * 0.3, paint, { rot: [0.06, 0, 0] });
    k.rbox(w * 0.86, style.cabinH, style.cabinL, 0.16, 0, y0 + style.bodyH + style.cabinH / 2 - 0.03, style.cabinZ, glass);
    k.rbox(w * 0.84, 0.06, style.cabinL * 0.75, 0.03, 0, y0 + style.bodyH + style.cabinH - 0.02, style.cabinZ, paint);
    for (const sx of [-1, 1]) {
      k.box(0.004, style.bodyH * 0.5, 0.004, sx * (w / 2 + 0.001), y0 + style.bodyH * 0.55, style.cabinZ + 0.1, P.screen(), { castShadow: false });
      k.box(0.06, 0.012, 0.18, sx * (w / 2 + 0.01), y0 + style.bodyH * 0.72, style.cabinZ + 0.35, P.chrome(), { castShadow: false });
      k.rbox(0.18, 0.1, 0.12, 0.03, sx * (w / 2 + 0.06), y0 + style.bodyH + 0.08, style.cabinZ + style.cabinL / 2 - 0.1, paint);
      for (const sz of [-1, 1]) {
        const wz = sz * (l / 2 - 0.75);
        wheel(k, sx * (w / 2 - 0.08), style.wheelR, wz, style.wheelR, 0.26, rim);
        k.torus(style.wheelR + 0.06, 0.04, sx * (w / 2 - 0.02), style.wheelR, wz, P.screen(), { arc: Math.PI, rot: [0, Math.PI / 2, 0], castShadow: false });
      }
      // Headlights and tail lights.
      k.rbox(0.38, 0.08, 0.06, 0.03, sx * (w / 2 - 0.3), y0 + style.bodyH * 0.72, l / 2 - 0.01, P.emissive(0xf4f8ff, 1.2));
      k.rbox(0.42, 0.07, 0.05, 0.025, sx * (w / 2 - 0.3), y0 + style.bodyH * 0.75, -l / 2 + 0.01, P.emissive(0xd10f1f, 1.5));
    }
    k.box(w * 0.42, style.bodyH * 0.3, 0.03, 0, y0 + style.bodyH * 0.4, l / 2 + 0.005, P.screen());
    for (let i = 0; i < 6; i++) k.box(w * 0.4, 0.008, 0.035, 0, y0 + style.bodyH * 0.28 + i * 0.03, l / 2 + 0.01, P.chrome(), { castShadow: false });
    k.box(0.52, 0.11, 0.01, 0, y0 + style.bodyH * 0.35, -l / 2 - 0.003, P.paint(0xf2f2f2), { castShadow: false });
    k.box(0.3, 0.02, 0.06, 0, y0 + 0.02, -l / 2 + 0.1, P.chrome());
  },

  toyChest: (k, p) => {
    k.rbox(p.w, p.h, p.d, 0.04, 0, p.h / 2, 0, P.paint(p.color ?? 0x5dade2));
    k.rbox(p.w + 0.03, 0.06, p.d + 0.03, 0.03, 0, p.h, 0, P.paint(0xf4d03f));
    k.sphere(0.12, -0.2, p.h + 0.13, 0, P.plastic(0xe74c3c), { seg: 14 });
    k.box(0.15, 0.15, 0.15, 0.15, p.h + 0.105, 0.05, P.plastic(0x2ecc71), { rot: [0, 0.4, 0] });
  },

  beanBag: (k, p) => {
    k.sphere(0.5, 0, 0.3, 0, P.fabric(p.color ?? 0xe74c3c), { seg: 20, scale: [0.9, 0.6, 0.9] });
    k.sphere(0.35, 0, 0.55, -0.2, P.fabric(p.color ?? 0xe74c3c), { seg: 16, scale: [1, 0.7, 0.6] });
  },

  teepee: (k, p) => {
    const poles = 5;
    for (let i = 0; i < poles; i++) {
      const a = (i / poles) * Math.PI * 2;
      k.rod(0.02, [Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7], [-Math.cos(a) * 0.12, p.h, -Math.sin(a) * 0.12], P.wood(0xd9b98c), 6);
    }
    k.mesh(new THREE.CylinderGeometry(0.05, 0.68, p.h - 0.35, 5, 1, true, 0.6, Math.PI * 2 - 1.2), 0, (p.h - 0.35) / 2, 0,
      P.fabric(0xf5ecd7));
    k.cyl(0.6, 0.6, 0.05, 0, 0.025, 0, P.fabric(0x9b59b6), { seg: 20 });
    for (let i = 0; i < 4; i++) k.rbox(0.3, 0.3, 0.1, 0.05, Math.cos(i * 1.6) * 0.3, 0.2, Math.sin(i * 1.6) * 0.3, P.fabric([0xf1c40f, 0xe74c3c, 0x2ecc71, 0x3498db][i]), { rot: [0.3, i, 0] });
  },

  rockingHorse: (k, _p) => {
    const wd = P.wood(0xd9b98c);
    for (const sx of [-1, 1]) k.torus(0.9, 0.025, sx * 0.15, 0.95, 0, wd, { arc: 1.1, rot: [Math.PI / 2 + 0, Math.PI / 2, 0], scale: [1, 1, 1] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod(0.02, [sx * 0.15, 0.1, sz * 0.35], [sx * 0.08, 0.45, sz * 0.25], wd, 6);
    const horse = P.paint(0xf5ecd7);
    k.rbox(0.2, 0.22, 0.6, 0.08, 0, 0.55, 0, horse);
    k.rbox(0.14, 0.3, 0.14, 0.06, 0, 0.75, 0.28, horse, { rot: [-0.4, 0, 0] });
    k.rbox(0.13, 0.13, 0.25, 0.05, 0, 0.88, 0.38, horse);
    k.box(0.03, 0.25, 0.2, 0, 0.82, 0.22, P.paint(0x8a4a1e), { rot: [-0.4, 0, 0] });
    k.rbox(0.22, 0.05, 0.25, 0.02, 0, 0.68, -0.02, P.leather(0xc0392b));
  },

  kidsTable: (k, p) => {
    k.rbox(p.w, 0.04, p.d, 0.015, 0, p.h - 0.02, 0, P.paint(0xfdfefe));
    k.legs(p.w, p.d, p.h - 0.04, 0.06, P.paint(0x5dade2), 0.025);
    for (const [x, z, c] of [[-0.35, 0.5, 0xe74c3c], [0.35, 0.5, 0x2ecc71], [0, -0.5, 0xf4d03f]] as const) {
      k.rbox(0.3, 0.03, 0.3, 0.01, x, 0.3, z, P.paint(c));
      k.legs(0.3, 0.3, 0.3, 0.03, P.paint(c), 0.015);
      k.rbox(0.3, 0.25, 0.03, 0.01, x, 0.45, z + Math.sign(z) * 0.14, P.paint(c));
    }
    for (let i = 0; i < 6; i++) k.box(0.06, 0.06, 0.06, -0.2 + i * 0.07, p.h + 0.03 + (i % 2) * 0.06, (i % 3) * 0.05, P.plastic([0xe74c3c, 0x3498db, 0xf1c40f][i % 3]));
  },

  telescope: (k, _p) => {
    const brass = P.brass();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.rod(0.015, [Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], [0, 1.0, 0], P.walnut(), 6);
    }
    k.cyl(0.07, 0.05, 1.1, 0, 1.15, 0.1, brass, { rot: [-1.0, 0, 0], seg: 16 });
    k.cyl(0.075, 0.075, 0.08, 0, 1.38, 0.55, brass, { rot: [-1.0, 0, 0], seg: 16 });
    k.cyl(0.015, 0.015, 0.1, 0, 0.88, -0.32, brass, { rot: [-1.0, 0, 0], seg: 8 });
  },

  barCart: (k, p) => {
    const brass = P.brass();
    for (const y of [0.25, p.h - 0.05]) k.box(p.w, 0.015, p.d, 0, y, 0, P.glass(0xe0f0f8, 0.5), { castShadow: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.012, 0.012, p.h, sx * (p.w / 2 - 0.02), p.h / 2, sz * (p.d / 2 - 0.02), brass, { seg: 6 });
    k.torus(0.18, 0.012, p.w / 2 + 0.05, p.h - 0.05, 0, brass, { arc: Math.PI, rot: [0, Math.PI / 2, -Math.PI / 2] });
    for (const sz of [-1, 1]) k.cyl(0.09, 0.09, 0.02, -p.w / 2 + 0.1, 0.09, sz * (p.d / 2 - 0.02), brass, { rot: [Math.PI / 2, 0, 0], seg: 16 });
    [0x6b3a1e, 0xe8e6da, 0x2a5a2a].forEach((c, i) => bottle(k, -0.25 + i * 0.12, p.h - 0.04, -0.05, c));
    k.lathe([[0.05, 0], [0.05, 0.08], [0.06, 0.09]], 0.2, p.h - 0.04, 0.05, P.glass(0xf0faff, 0.35), { seg: 10 });
    k.lathe([[0.05, 0], [0.05, 0.08], [0.06, 0.09]], 0.32, p.h - 0.04, 0.05, P.glass(0xf0faff, 0.35), { seg: 10 });
  },

  clothesRail: (k, p) => {
    const ch = P.chrome();
    k.cyl(0.015, 0.015, p.w, 0, p.h - 0.05, 0, ch, { rot: [0, 0, Math.PI / 2], seg: 8 });
    for (const sx of [-1, 1]) {
      k.cyl(0.015, 0.015, p.h - 0.05, sx * p.w / 2, (p.h - 0.05) / 2, 0, ch, { seg: 8 });
      k.box(0.04, 0.02, p.d, sx * p.w / 2, 0.01, 0, ch);
    }
    const colors = [0x1d1d1d, 0xf2efe8, 0x2f4a63, 0x8a6a3a, 0x7a1f24, 0xd9cfb8, 0x3b4a3a];
    const n = Math.floor(p.w / 0.11);
    for (let i = 0; i < n; i++) {
      const x = -p.w / 2 + 0.08 + i * ((p.w - 0.16) / (n - 1));
      const long = (i * 5) % 3 === 0;
      k.torus(0.08, 0.004, x, p.h - 0.15, 0, ch, { arc: Math.PI, rot: [0, Math.PI / 2, 0], castShadow: false });
      k.rbox(0.035, long ? 1.2 : 0.75, 0.42, 0.015, x, p.h - 0.2 - (long ? 0.6 : 0.375), 0, P.fabric(colors[i % colors.length]));
    }
  },

  shoeWall: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, p.h, 0.03, 0, p.h / 2, -p.d / 2 + 0.015, wd);
    const rows = 7;
    const colors = [0x111111, 0x7a1f24, 0xf2efe8, 0x8a6a3a, 0xd4a94d, 0x2f4a63];
    for (let r = 0; r < rows; r++) {
      const y = 0.15 + r * ((p.h - 0.3) / (rows - 1));
      k.box(p.w, 0.02, p.d, 0, y, 0, P.glass(0xe8f4f8, 0.5), { castShadow: false });
      k.box(p.w, 0.01, 0.01, 0, y + 0.3, p.d / 2 - 0.02, P.emissive(0xfff2d8, 1.5), { castShadow: false });
      for (let i = 0; i < Math.floor(p.w / 0.3); i++) {
        const x = -p.w / 2 + 0.15 + i * 0.3;
        const c = P.leather(colors[(i + r * 2) % colors.length]);
        for (const off of [-0.05, 0.05]) k.rbox(0.08, 0.09, 0.26, 0.035, x + off, y + 0.055, 0, c);
      }
    }
  },

  closetIsland: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, p.h - 0.06, p.d, 0, (p.h - 0.06) / 2, 0, wd);
    for (let i = 0; i < 4; i++) for (const sz of [-1, 1]) {
      const y = 0.15 + i * 0.2;
      k.box(p.w - 0.06, 0.17, 0.015, 0, y, sz * (p.d / 2 + 0.007), P.wood(0x6a4328));
      k.box(0.2, 0.012, 0.02, 0, y, sz * (p.d / 2 + 0.02), P.brass());
    }
    k.box(p.w, 0.02, p.d, 0, p.h - 0.06, 0, P.velvet(0x1e2a3a));
    for (let i = 0; i < 8; i++) {
      const x = -p.w / 2 + 0.15 + (i % 4) * ((p.w - 0.3) / 3);
      const z = i < 4 ? -0.18 : 0.18;
      k.cyl(0.035, 0.035, 0.012, x, p.h - 0.044, z, i % 2 ? P.gold() : P.chrome(), { seg: 16 });
      k.box(0.025, 0.006, 0.1, x, p.h - 0.047, z, P.leather(0x2b2b2b));
    }
    k.box(p.w, 0.04, p.d, 0, p.h - 0.02, 0, P.glass(0xf0faff, 0.2), { castShadow: false });
  },
};
