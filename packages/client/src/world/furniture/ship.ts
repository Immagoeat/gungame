import * as THREE from 'three';
import { P } from './palette';
import type { Builder } from './types';

/** Shipboard pieces: the casino, the crew decks, and the deck fittings. */
export const ship: Record<string, Builder> = {
  slotMachine: (k, p) => {
    const body = P.paint(p.color ?? 0x7a1424);
    k.rbox(p.w, 1.0, p.d - 0.1, 0.04, 0, 0.5, -0.05, body);
    k.rbox(p.w - 0.04, 0.12, p.d - 0.05, 0.03, 0, 1.06, 0, P.chrome());
    // The reels behind glass, and the topper screen.
    k.box(p.w - 0.16, 0.34, 0.04, 0, 1.3, p.d / 2 - 0.2, P.screenOn('slot', (g, s) => {
      g.fillStyle = '#f7f2e4'; g.fillRect(0, 0, s, s);
      const sym = ['7', '♦', 'BAR', '♣', '★'];
      g.font = `bold ${s * 0.18}px sans-serif`; g.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        g.fillStyle = ['#c1121f', '#1d3557', '#2a9d8f'][i];
        g.fillText(sym[(i * 2) % sym.length], s * (0.2 + i * 0.3), s * 0.6);
      }
    }), { castShadow: false });
    k.rbox(p.w, 0.5, p.d - 0.25, 0.04, 0, 1.4, -0.12, body);
    k.box(p.w - 0.12, 0.2, 0.03, 0, 1.62, p.d / 2 - 0.32, P.emissive(0xffc04d, 1.6), { castShadow: false });
    k.box(p.w - 0.06, 0.05, 0.25, 0, 1.02, p.d / 2 - 0.05, P.blackMetal(), { rot: [0.3, 0, 0] });
    for (let i = 0; i < 4; i++) k.cyl(0.02, 0.02, 0.012, -0.18 + i * 0.12, 1.06, p.d / 2 + 0.02, P.led([0xff3b30, 0x34c759, 0xffcc00, 0x0a84ff][i]), { seg: 10, castShadow: false });
    k.rod(0.012, [p.w / 2 + 0.03, 0.95, 0], [p.w / 2 + 0.03, 1.35, 0], P.chrome(), 6);
    k.sphere(0.04, p.w / 2 + 0.03, 1.37, 0, P.plastic(0xd62828), { seg: 10 });
  },

  cardTable: (k, p) => {
    const rim = P.leather(0x2a1610);
    const top = new THREE.Shape();
    const rx = p.w / 2, rz = p.d / 2;
    top.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    const felt = new THREE.ExtrudeGeometry(top, { depth: 0.04, bevelEnabled: false });
    k.mesh(felt, 0, p.h - 0.02, 0, P.felt(p.color ?? 0x14532d), { rot: [Math.PI / 2, 0, 0], castShadow: false });
    k.torus(1, 0.06, 0, p.h, 0, rim, { rot: [Math.PI / 2, 0, 0], scale: [rx, rz, 1] });
    k.cyl(0.2, 0.32, p.h - 0.06, 0, (p.h - 0.06) / 2, 0, P.ebony(), { seg: 16 });
    // Chips and cards.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      k.cyl(0.02, 0.02, 0.05, Math.cos(a) * rx * 0.62, p.h + 0.04, Math.sin(a) * rz * 0.62, P.plastic([0xd62828, 0x1d3557, 0x2a9d8f, 0xf4a261, 0xffffff, 0x111111][i]), { seg: 10, castShadow: false });
      k.box(0.06, 0.003, 0.09, Math.cos(a + 0.3) * rx * 0.5, p.h + 0.02, Math.sin(a + 0.3) * rz * 0.5, P.paint(0xfafafa), { rot: [0, a, 0], castShadow: false });
    }
    k.box(0.1, 0.003, 0.14, 0, p.h + 0.02, -rz * 0.3, P.paint(0xfafafa), { castShadow: false });
  },

  rouletteTable: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, p.h - 0.08, p.d, 0, (p.h - 0.08) / 2, 0, wd);
    k.box(p.w - 0.16, 0.02, p.d - 0.16, 0.25, p.h - 0.07, 0, P.screenOn('roulette', (g, s) => {
      g.fillStyle = '#145a32'; g.fillRect(0, 0, s, s);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) {
        g.fillStyle = (r + c) % 2 ? '#a4161a' : '#111';
        g.fillRect(4 + c * (s - 8) / 12, 8 + r * (s * 0.6) / 3, (s - 8) / 12 - 2, (s * 0.6) / 3 - 3);
      }
      g.fillStyle = '#eee'; g.fillRect(4, s * 0.78, s - 8, 2);
    }), { castShadow: false });
    // The wheel, sunk into the near end.
    k.cyl(0.42, 0.38, 0.12, -p.w / 2 + 0.55, p.h - 0.04, 0, wd, { seg: 28 });
    k.cyl(0.34, 0.3, 0.06, -p.w / 2 + 0.55, p.h + 0.02, 0, P.paint(0x8b1a1a), { seg: 28, castShadow: false });
    k.cyl(0.08, 0.1, 0.12, -p.w / 2 + 0.55, p.h + 0.08, 0, P.brass(), { seg: 12 });
    for (let i = 0; i < 4; i++) k.box(0.3, 0.015, 0.02, -p.w / 2 + 0.55, p.h + 0.14, 0, P.brass(), { rot: [0, (i * Math.PI) / 4, 0], castShadow: false });
    k.box(p.w, 0.06, 0.08, 0, p.h - 0.03, p.d / 2 - 0.04, P.leather(0x2a1610));
  },

  lifeboat: (k, p) => {
    // An enclosed orange lifeboat on two davits (local +z faces the ship's side).
    const hull = new THREE.Shape();
    const L = p.w / 2, B = p.d / 2;
    hull.moveTo(-L, 0);
    hull.quadraticCurveTo(-L * 0.4, -B, L * 0.3, -B);
    hull.quadraticCurveTo(L, -B * 0.8, L, 0);
    hull.quadraticCurveTo(L, B * 0.8, L * 0.3, B);
    hull.quadraticCurveTo(-L * 0.4, B, -L, 0);
    const lower = new THREE.ExtrudeGeometry(hull, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3 });
    k.mesh(lower, 0, 0.6, 0, P.paint(0xf26a1b), { rot: [Math.PI / 2, 0, 0] });
    const upper = new THREE.ExtrudeGeometry(hull, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.3, bevelSegments: 4 });
    upper.scale(0.92, 0.88, 1);
    k.mesh(upper, 0, 1.75, 0, P.paint(0xf3f1ea), { rot: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 6; i++) k.box(0.4, 0.22, 0.02, -L * 0.6 + i * L * 0.24, 1.55, B * 0.92, P.glass(0x1a2633, 0.85), { castShadow: false });
    // Davits and falls.
    for (const sx of [-1, 1]) {
      const x = sx * (L - 1.2);
      k.box(0.25, p.h + 0.6, 0.25, x, (p.h + 0.6) / 2 - 0.6, -B - 0.7, P.paint(0xe9eaec));
      k.box(0.2, 0.2, 1.2, x, p.h - 0.1, -B - 0.15, P.paint(0xe9eaec));
      k.rod(0.015, [x, p.h - 0.1, -B + 0.3], [x, 1.9, 0], P.blackMetal(), 5);
    }
  },

  bollard: (k, p) => {
    const iron = P.paint(0x1f2328);
    k.box(p.w * 1.6, 0.06, p.d, 0, 0.03, 0, iron);
    for (const sx of [-1, 1]) {
      k.cyl(p.w * 0.24, p.w * 0.26, p.h - 0.08, sx * p.w * 0.45, 0.06 + (p.h - 0.08) / 2, 0, iron, { seg: 14 });
      k.cyl(p.w * 0.32, p.w * 0.32, 0.06, sx * p.w * 0.45, p.h - 0.03, 0, iron, { seg: 14 });
    }
  },

  bunkBed: (k, p) => {
    const frame = P.paint(0x8a9198);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.05, p.h, 0.05, sx * (p.w / 2 - 0.03), p.h / 2, sz * (p.d / 2 - 0.03), frame);
    for (const y of [0.35, 1.25]) {
      k.box(p.w, 0.06, p.d, 0, y, 0, frame);
      k.rbox(p.w - 0.08, 0.14, p.d - 0.08, 0.04, 0, y + 0.1, 0, P.fabric(0xe9ecef));
      k.rbox(0.5, 0.1, p.d - 0.2, 0.04, -p.w / 2 + 0.35, y + 0.22, 0, P.fabric(0xfafafa));
      k.box(p.w * 0.55, 0.05, p.d - 0.06, 0.25, y + 0.2, 0, P.fabric(0x2e4a6b));
    }
    for (let i = 0; i < 4; i++) k.box(0.04, 0.03, 0.03, p.w / 2 - 0.03, 0.55 + i * 0.22, p.d / 2 + 0.02, frame);
  },

  shipEngine: (k, p) => {
    const green = P.paint(0x3d5a4a), grey = P.paint(0x6e767d);
    k.rbox(p.w, p.h * 0.55, p.d, 0.1, 0, p.h * 0.275, 0, green);
    for (let i = 0; i < 6; i++) {
      const x = -p.w / 2 + 0.6 + i * ((p.w - 1.2) / 5);
      k.rbox(0.7, p.h * 0.35, p.d * 0.62, 0.08, x, p.h * 0.55 + p.h * 0.175, 0, grey);
      k.cyl(0.08, 0.08, 0.6, x, p.h * 0.95, -p.d * 0.15, P.steel(), { seg: 8 });
    }
    k.cyl(0.35, 0.35, p.w, 0, p.h * 0.45, p.d / 2 + 0.3, P.steel(), { rot: [0, 0, Math.PI / 2], seg: 14 });
    k.box(0.5, 0.6, 0.06, p.w / 2 - 0.5, 1.1, p.d / 2 + 0.03, P.screenOn('gauge', (g, s) => {
      g.fillStyle = '#e6e2d6'; g.fillRect(0, 0, s, s);
      for (const [cx, cy] of [[0.3, 0.3], [0.7, 0.3], [0.5, 0.72]]) {
        g.strokeStyle = '#222'; g.lineWidth = 3; g.beginPath(); g.arc(cx * s, cy * s, s * 0.16, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(cx * s, cy * s); g.lineTo(cx * s + s * 0.1, cy * s - s * 0.08); g.stroke();
      }
    }), { castShadow: false });
    k.box(p.w + 0.4, 0.1, p.d + 0.6, 0, 0.05, 0, P.paint(0x2b2f33));
  },

  lifeRing: (k, p) => {
    k.torus(p.w * 0.36, p.w * 0.12, 0, p.h / 2, 0, P.paint(0xf26a1b), { rot: [0, 0, 0], seg: 16 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.box(0.12, 0.2, 0.2, Math.cos(a) * p.w * 0.36, p.h / 2 + Math.sin(a) * p.w * 0.36, 0, P.paint(0xfafafa), { rot: [0, 0, a], castShadow: false });
    }
  },

  washer: (k, p) => {
    // An industrial front-loader: steel cabinet, round door with a dark drum behind it, a control strip.
    const steel = P.steel();
    k.rbox(p.w, p.h, p.d, 0.03, 0, p.h / 2, 0, P.paint(0xd9dde1));
    k.box(p.w - 0.06, 0.22, 0.03, 0, p.h - 0.15, p.d / 2 + 0.005, P.paint(0x3a4048), { castShadow: false });
    for (let i = 0; i < 3; i++) k.cyl(0.025, 0.025, 0.02, -0.25 + i * 0.12, p.h - 0.15, p.d / 2 + 0.02, P.led([0x34c759, 0xffcc00, 0xff3b30][i]), { rot: [Math.PI / 2, 0, 0], seg: 10, castShadow: false });
    k.box(0.16, 0.08, 0.02, 0.22, p.h - 0.15, p.d / 2 + 0.02, P.screenOn('washer', (g, s) => { g.fillStyle = '#0b1a10'; g.fillRect(0, 0, s, s); g.fillStyle = '#5cff8a'; g.font = `bold ${s * 0.5}px monospace`; g.fillText('42', s * 0.15, s * 0.7); }), { castShadow: false });
    const cy = p.h * 0.48;
    k.torus(0.3, 0.05, 0, cy, p.d / 2 + 0.02, steel, { seg: 24 });
    k.cyl(0.29, 0.29, 0.02, 0, cy, p.d / 2 + 0.01, P.glass(0x1c242c, 0.8), { rot: [Math.PI / 2, 0, 0], seg: 24, castShadow: false });
    k.cyl(0.26, 0.26, 0.02, 0, cy, p.d / 2 - 0.02, P.fabric(0x5b7290), { rot: [Math.PI / 2, 0, 0], seg: 20, castShadow: false });
    k.box(0.05, 0.16, 0.05, 0.32, cy, p.d / 2 + 0.05, steel);
    k.box(p.w, 0.08, p.d, 0, 0.04, 0, P.paint(0x2b2f33));
  },

  laundryCart: (k, p) => {
    // A canvas bin on a steel frame, heaped with linen.
    const frame = P.steel();
    k.box(p.w, 0.03, p.d, 0, 0.18, 0, frame);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      k.rod(0.015, [sx * (p.w / 2 - 0.03), 0.18, sz * (p.d / 2 - 0.03)], [sx * (p.w / 2 - 0.03), p.h, sz * (p.d / 2 - 0.03)], frame, 6);
      k.cyl(0.05, 0.05, 0.04, sx * (p.w / 2 - 0.08), 0.05, sz * (p.d / 2 - 0.08), P.rubber(), { rot: [Math.PI / 2, 0, 0], seg: 10 });
    }
    k.box(p.w - 0.04, p.h - 0.25, p.d - 0.04, 0, 0.2 + (p.h - 0.25) / 2, 0, P.fabric(0x6b7f8f));
    for (let i = 0; i < 5; i++) k.rbox(0.42, 0.14, 0.32, 0.06, -0.25 + (i % 3) * 0.25, p.h - 0.02 + (i > 2 ? 0.08 : 0), -0.12 + (i % 2) * 0.22, P.fabric(i % 2 ? 0xf4f4f2 : 0xe9eef3), { rot: [0, i * 0.7, 0.15], castShadow: false });
  },

  storageRack: (k, p) => {
    // Steel shelving, four shelves, stocked with cartons, tins and sacks.
    const steel = P.paint(0x7d858c);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.04, p.h, 0.04, sx * (p.w / 2 - 0.02), p.h / 2, sz * (p.d / 2 - 0.02), steel);
    const shelves = 4;
    for (let i = 0; i < shelves; i++) {
      const y = 0.12 + i * ((p.h - 0.2) / (shelves - 0.6));
      k.box(p.w, 0.03, p.d, 0, y, 0, steel);
      let x = -p.w / 2 + 0.08;
      let n = 0;
      while (x < p.w / 2 - 0.25) {
        const kind = (i * 7 + n * 3) % 5;
        const w = kind === 4 ? 0.22 : 0.3 + ((i + n) % 3) * 0.08;
        const h = kind === 4 ? 0.2 : 0.22 + ((i * 3 + n) % 4) * 0.05;
        if (kind === 4) for (let t = 0; t < 3; t++) k.cyl(0.05, 0.05, 0.16, x + 0.05 + t * 0.07, y + 0.1, 0, P.paint([0xc1121f, 0x2a9d8f, 0xe9c46a][t]), { seg: 10, castShadow: false });
        else if (kind === 3) k.rbox(w, h, p.d - 0.12, 0.06, x + w / 2, y + 0.015 + h / 2, 0, P.fabric(0xc9b48a), { castShadow: false });
        else k.box(w, h, p.d - 0.1, x + w / 2, y + 0.015 + h / 2, 0, P.paint([0xb08d57, 0xa47c48, 0xc8a46e][kind]), { castShadow: false });
        x += w + 0.05;
        n++;
      }
    }
  },

  crewLocker: (k, p) => {
    // A bank of grey steel lockers with vents, handles and name cards.
    const doors = Math.max(2, Math.round(p.w / 0.4));
    const dw = p.w / doors;
    k.box(p.w, p.h, p.d - 0.04, 0, p.h / 2, -0.02, P.paint(0x5d6670));
    for (let i = 0; i < doors; i++) {
      const x = -p.w / 2 + dw * (i + 0.5);
      k.box(dw - 0.03, p.h - 0.08, 0.03, x, p.h / 2, p.d / 2 - 0.02, P.paint(0x6c7680));
      for (let v = 0; v < 4; v++) k.box(dw * 0.5, 0.012, 0.01, x, p.h - 0.25 - v * 0.04, p.d / 2 + 0.002, P.blackMetal(), { castShadow: false });
      k.box(0.03, 0.12, 0.03, x + dw / 2 - 0.07, p.h * 0.5, p.d / 2 + 0.01, P.chrome(), { castShadow: false });
      k.box(0.1, 0.05, 0.005, x, p.h * 0.62, p.d / 2 + 0.002, P.paint(0xf2efe8), { castShadow: false });
    }
  },

  galleyRange: (k, p) => {
    // A stainless commercial range: six burners, a griddle, oven doors, pots on the go.
    const ss = P.steel();
    k.rbox(p.w, p.h - 0.05, p.d, 0.02, 0, (p.h - 0.05) / 2, 0, ss);
    k.box(p.w, 0.04, p.d, 0, p.h - 0.03, 0, P.blackMetal());
    for (let i = 0; i < 6; i++) {
      const x = -p.w / 2 + 0.25 + (i % 3) * 0.3, z = i < 3 ? -0.18 : 0.18;
      k.torus(0.09, 0.015, x, p.h + 0.005, z, P.iron(), { rot: [Math.PI / 2, 0, 0], seg: 14 });
    }
    k.box(0.6, 0.02, p.d - 0.15, p.w / 2 - 0.4, p.h + 0.005, 0, P.iron(), { castShadow: false });
    for (const [x, z, r, h] of [[-p.w / 2 + 0.25, -0.18, 0.13, 0.22], [-p.w / 2 + 0.55, 0.18, 0.11, 0.12], [-p.w / 2 + 0.85, -0.18, 0.15, 0.3]]) {
      k.cyl(r, r, h, x, p.h + h / 2 + 0.01, z, ss, { seg: 16 });
    }
    for (const sx of [-1, 1]) {
      k.box(p.w / 2 - 0.08, 0.45, 0.02, sx * p.w / 4, 0.38, p.d / 2 + 0.005, P.paint(0xb9bfc5), { castShadow: false });
      k.rod(0.012, [sx * p.w / 4 - 0.25, 0.66, p.d / 2 + 0.04], [sx * p.w / 4 + 0.25, 0.66, p.d / 2 + 0.04], P.chrome(), 6);
    }
    for (let i = 0; i < 7; i++) k.cyl(0.025, 0.025, 0.03, -p.w / 2 + 0.15 + i * (p.w - 0.3) / 6, p.h - 0.15, p.d / 2 + 0.01, P.blackMetal(), { rot: [Math.PI / 2, 0, 0], seg: 10, castShadow: false });
  },

  controlPanel: (k, p) => {
    // A sloped console: screens along the top, switches and gauges on the desk.
    const body = P.paint(p.color ?? 0x3a434c);
    k.box(p.w, 0.85, p.d, 0, 0.425, 0, body);
    k.box(p.w, 0.06, p.d * 0.55, 0, 0.88, p.d * 0.18, body, { rot: [0.35, 0, 0] });
    k.box(p.w, p.h - 0.9, 0.12, 0, 0.9 + (p.h - 0.9) / 2, -p.d / 2 + 0.06, body);
    const screens = Math.max(1, Math.floor(p.w / 0.75));
    for (let i = 0; i < screens; i++) {
      const x = -p.w / 2 + (p.w / screens) * (i + 0.5);
      k.box(p.w / screens - 0.12, p.h - 1.0, 0.02, x, 0.92 + (p.h - 0.98) / 2, -p.d / 2 + 0.13, P.screenOn(`ctl${i % 3}`, (g, s) => {
        g.fillStyle = '#06121b'; g.fillRect(0, 0, s, s);
        g.strokeStyle = ['#3ad1ff', '#5cff8a', '#ffcc00'][i % 3]; g.lineWidth = 2;
        for (let r = 0; r < 4; r++) { g.beginPath(); g.moveTo(4, s * (0.2 + r * 0.2)); for (let x2 = 0; x2 < s; x2 += 8) g.lineTo(x2, s * (0.2 + r * 0.2) + Math.sin(x2 * 0.08 + r + i) * s * 0.05); g.stroke(); }
      }), { castShadow: false });
    }
    for (let i = 0; i < Math.floor(p.w / 0.12); i++) {
      k.box(0.04, 0.02, 0.05, -p.w / 2 + 0.1 + i * 0.12, 0.93, p.d * 0.1, P.led([0x34c759, 0xff3b30, 0xffcc00, 0x0a84ff, 0xffffff][(i * 7) % 5]), { rot: [0.35, 0, 0], castShadow: false });
    }
  },

  helm: (k, p) => {
    // A pedestal with a small wheel, the throttle levers and a compass binnacle.
    const body = P.paint(0x2b3138);
    k.rbox(0.5, 1.0, 0.45, 0.06, 0, 0.5, 0, body);
    k.box(p.w, 0.08, p.d, 0, 1.04, 0, body, { rot: [0.3, 0, 0] });
    k.torus(0.2, 0.02, 0, 1.15, p.d / 2 - 0.02, P.chrome(), { rot: [0.3, 0, 0], seg: 20 });
    for (let i = 0; i < 4; i++) k.box(0.4, 0.02, 0.02, 0, 1.15, p.d / 2 - 0.02, P.chrome(), { rot: [0.3, 0, (i * Math.PI) / 4] });
    for (const sx of [-1, 1]) k.rod(0.015, [sx * 0.3, 1.05, -0.05], [sx * 0.3, 1.25, 0.03], P.chrome(), 6);
    k.sphere(0.09, 0, 1.17, -p.d / 2 + 0.12, P.brass(), { seg: 12 });
    k.cyl(0.07, 0.07, 0.03, 0, 1.25, -p.d / 2 + 0.12, P.glass(0x88a0b0, 0.4), { seg: 14, castShadow: false });
  },

  radarConsole: (k, p) => {
    const body = P.paint(0x2b3138);
    k.box(p.w, 1.0, p.d * 0.7, 0, 0.5, -p.d * 0.15, body);
    k.box(p.w, 0.7, 0.12, 0, 1.0 + 0.2, -p.d * 0.15, body, { rot: [-0.5, 0, 0] });
    k.cyl(0.32, 0.32, 0.02, 0, 1.22, -p.d * 0.15 + 0.07, P.screenOn('radar', (g, s) => {
      g.fillStyle = '#021208'; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#1f8f4a'; g.lineWidth = 1.5;
      for (let r = 1; r <= 4; r++) { g.beginPath(); g.arc(s / 2, s / 2, (s / 2) * (r / 4.2), 0, 7); g.stroke(); }
      g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
      const grad = g.createLinearGradient(s / 2, s / 2, s, s * 0.2);
      grad.addColorStop(0, 'rgba(92,255,138,0.9)'); grad.addColorStop(1, 'rgba(92,255,138,0)');
      g.fillStyle = grad; g.beginPath(); g.moveTo(s / 2, s / 2); g.arc(s / 2, s / 2, s * 0.47, -0.9, -0.3); g.fill();
      g.fillStyle = '#9dffbd'; for (const [x, y] of [[0.7, 0.32], [0.3, 0.62], [0.58, 0.8]]) g.fillRect(x * s, y * s, 4, 4);
    }), { rot: [Math.PI / 2 - 0.5, 0, 0], seg: 28, castShadow: false });
    k.torus(0.33, 0.025, 0, 1.22, -p.d * 0.15 + 0.08, body, { rot: [-0.5, 0, 0], seg: 24 });
  },

  pipeRun: (k, p) => {
    // Lagged and bare pipes on hangers, with a valve wheel or two.
    const lag = P.paint(0xd8d4c8), bare = P.paint(0x8a6a4a), red = P.paint(0xa4161a);
    const runs: [number, number, THREE.Material][] = [[-p.d * 0.3, 0.14, lag], [0, 0.09, bare], [p.d * 0.3, 0.07, red]];
    for (const [z, r, m] of runs) k.cyl(r, r, p.w, 0, p.h - 0.25 + (r > 0.1 ? 0 : 0.05), z, m, { rot: [0, 0, Math.PI / 2], seg: 12, castShadow: false });
    for (let x = -p.w / 2 + 0.5; x < p.w / 2; x += 1.5) {
      k.box(0.04, 0.3, p.d, x, p.h - 0.1, 0, P.blackMetal(), { castShadow: false });
    }
    k.torus(0.12, 0.015, p.w * 0.2, p.h - 0.42, p.d * 0.3, red, { seg: 14 });
    k.torus(0.1, 0.015, -p.w * 0.25, p.h - 0.4, 0, red, { seg: 14 });
  },
};
