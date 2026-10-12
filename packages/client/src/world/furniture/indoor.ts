import * as THREE from 'three';
import type { Kit } from './kit';
import { charredLog, createFire, glowLogs } from '../fire';
import { P } from './palette';
import type { Builder } from './types';


/** Upholstered seating shared by sofas and armchairs. */
function upholstered(k: Kit, w: number, h: number, d: number, fabric: THREE.Material, seats: number, pillow?: THREE.Material): void {
  const legs = P.walnut();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.025, 0.018, 0.08, sx * (w / 2 - 0.08), 0.04, sz * (d / 2 - 0.08), legs, { seg: 8 });
  k.rbox(w, 0.26, d, 0.04, 0, 0.21, 0, fabric);
  const armW = 0.18;
  for (const sx of [-1, 1]) k.rbox(armW, 0.62 - 0.08, d, 0.07, sx * (w / 2 - armW / 2), 0.08 + 0.27, 0, fabric);
  k.rbox(w, h - 0.08, 0.2, 0.06, 0, 0.08 + (h - 0.08) / 2, -d / 2 + 0.1, fabric);
  const cw = (w - armW * 2) / seats;
  for (let i = 0; i < seats; i++) {
    const x = -w / 2 + armW + cw * (i + 0.5);
    k.rbox(cw - 0.02, 0.17, d - 0.3, 0.07, x, 0.34 + 0.085, 0.07, fabric);
    k.rbox(cw - 0.03, 0.44, 0.2, 0.09, x, 0.62, -d / 2 + 0.28, fabric, { rot: [-0.18, 0, 0] });
  }
  if (pillow) {
    for (const sx of [-1, 1]) {
      k.rbox(0.42, 0.42, 0.13, 0.07, sx * (w / 2 - armW - 0.26), 0.7, -d / 2 + 0.45, pillow, { rot: [-0.25, sx * 0.25, sx * 0.12] });
    }
  }
}

export const indoor: Record<string, Builder> = {
  sofa: (k, p) => upholstered(k, p.w, p.h, p.d, P.fabric(p.color ?? 0xdcd5c8), p.w > 2 ? 3 : 2, P.velvet(0x2f4a63)),
  armchair: (k, p) => upholstered(k, p.w, p.h, p.d, P.fabric(p.color ?? 0xdcd5c8), 1),
  outdoorSofa: (k, p) => {
    const teak = P.wood(0xa8784a);
    k.box(p.w, 0.08, p.d, 0, 0.18, 0, teak);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.07, 0.18, 0.07, sx * (p.w / 2 - 0.05), 0.09, sz * (p.d / 2 - 0.05), teak);
    for (const sx of [-1, 1]) k.box(0.08, 0.6, p.d, sx * (p.w / 2 - 0.04), 0.48, 0, teak);
    k.box(p.w, 0.55, 0.08, 0, 0.5, -p.d / 2 + 0.04, teak);
    const c = P.fabric(p.color ?? 0xf2efe8);
    const n = p.w > 1.8 ? 3 : 2;
    const cw = (p.w - 0.16) / n;
    for (let i = 0; i < n; i++) {
      const x = -p.w / 2 + 0.08 + cw * (i + 0.5);
      k.rbox(cw - 0.02, 0.16, p.d - 0.2, 0.06, x, 0.3, 0.05, c);
      k.rbox(cw - 0.03, 0.42, 0.16, 0.07, x, 0.6, -p.d / 2 + 0.2, c, { rot: [-0.15, 0, 0] });
    }
    k.rbox(0.42, 0.42, 0.12, 0.06, -p.w / 2 + 0.35, 0.62, -p.d / 2 + 0.36, P.fabric(0x2f6b8a), { rot: [-0.2, 0.3, 0.1] });
  },

  sectional: (k, p) => {
    const c = P.fabric(p.color ?? 0xcfc8bb);
    const legs = P.blackMetal();
    // Main run along the back (local -z), chaise along the left side.
    const mainD = 1.0;
    const z0 = -p.d / 2;
    k.rbox(p.w, 0.26, mainD, 0.04, 0, 0.21, z0 + mainD / 2, c);
    k.rbox(1.0, 0.26, p.d - mainD, 0.04, -p.w / 2 + 0.5, 0.21, z0 + mainD + (p.d - mainD) / 2, c);
    k.rbox(p.w, p.h - 0.08, 0.2, 0.06, 0, 0.08 + (p.h - 0.08) / 2, z0 + 0.1, c);
    k.rbox(0.2, 0.54, p.d, 0.07, -p.w / 2 + 0.1, 0.35, 0, c);
    k.rbox(0.2, 0.54, mainD, 0.07, p.w / 2 - 0.1, 0.35, z0 + mainD / 2, c);
    for (const [x, z] of [[-p.w / 2 + 0.1, -p.d / 2 + 0.1], [p.w / 2 - 0.1, -p.d / 2 + 0.1], [-p.w / 2 + 0.1, p.d / 2 - 0.1], [p.w / 2 - 0.1, z0 + mainD - 0.1], [-p.w / 2 + 0.9, p.d / 2 - 0.1]]) {
      k.box(0.05, 0.08, 0.05, x, 0.04, z, legs);
    }
    const seats = 3;
    const cw = (p.w - 1.2) / seats;
    for (let i = 0; i < seats; i++) {
      const x = -p.w / 2 + 1.0 + cw * (i + 0.5);
      k.rbox(cw - 0.02, 0.17, mainD - 0.3, 0.07, x, 0.43, z0 + 0.5 + 0.08, c);
      k.rbox(cw - 0.03, 0.44, 0.2, 0.09, x, 0.62, z0 + 0.3, c, { rot: [-0.18, 0, 0] });
    }
    k.rbox(0.78, 0.17, p.d - 0.3, 0.07, -p.w / 2 + 0.6, 0.43, 0.15, c);
    k.rbox(0.78, 0.44, 0.2, 0.09, -p.w / 2 + 0.6, 0.62, z0 + 0.3, c, { rot: [-0.18, 0, 0] });
    const accent = P.velvet(0x8a5a2b);
    k.rbox(0.45, 0.45, 0.13, 0.07, -p.w / 2 + 0.55, 0.72, z0 + 0.45, accent, { rot: [-0.25, 0.4, 0.1] });
    k.rbox(0.45, 0.45, 0.13, 0.07, p.w / 2 - 0.45, 0.72, z0 + 0.45, accent, { rot: [-0.25, -0.4, -0.1] });
  },

  chesterfield: (k, p) => {
    const l = P.leather(p.color ?? 0x5a2d1a);
    const legs = P.ebony();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.lathe([[0.04, 0], [0.05, 0.05], [0.03, 0.1]], sx * (p.w / 2 - 0.1), 0, sz * (p.d / 2 - 0.1), legs, { seg: 10 });
    k.rbox(p.w, 0.3, p.d, 0.05, 0, 0.25, 0, l);
    k.rbox(p.w - 0.4, 0.14, p.d - 0.25, 0.06, 0, 0.47, 0.08, l);
    k.rbox(p.w, p.h - 0.1, 0.22, 0.06, 0, 0.1 + (p.h - 0.1) / 2, -p.d / 2 + 0.11, l);
    for (const sx of [-1, 1]) {
      k.rbox(0.22, p.h - 0.16, p.d, 0.06, sx * (p.w / 2 - 0.11), 0.1 + (p.h - 0.16) / 2, 0, l);
      k.cyl(0.13, 0.13, p.d + 0.02, sx * (p.w / 2 - 0.08), p.h - 0.1, 0, l, { rot: [Math.PI / 2, 0, 0], seg: 16 });
    }
    // Deep button tufting on the back.
    const btn = P.leather(0x3a1c10);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
      k.sphere(0.018, -p.w / 2 + 0.35 + c * ((p.w - 0.7) / 8) + (r % 2) * 0.08, 0.5 + r * 0.1, -p.d / 2 + 0.225, btn, { seg: 6, castShadow: false });
    }
  },

  coffeeTable: (k, p) => {
    const brass = P.brass();
    k.rbox(p.w, 0.05, p.d, 0.015, 0, p.h - 0.025, 0, P.marble());
    k.box(p.w - 0.12, 0.012, p.d - 0.12, 0, 0.14, 0, P.glass(0xcfe6ef, 0.4));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.025, p.h - 0.05, 0.025, sx * (p.w / 2 - 0.05), (p.h - 0.05) / 2, sz * (p.d / 2 - 0.05), brass);
    for (const sz of [-1, 1]) k.box(p.w - 0.1, 0.02, 0.02, 0, 0.13, sz * (p.d / 2 - 0.05), brass);
    // Styling: books, a bowl, a candle.
    k.box(0.32, 0.04, 0.24, -p.w * 0.25, p.h + 0.02, 0, P.paint(0x1e3a5a));
    k.box(0.28, 0.035, 0.22, -p.w * 0.25, p.h + 0.058, 0.01, P.paint(0xd9cfb8), { rot: [0, 0.2, 0] });
    k.lathe([[0.0, 0], [0.09, 0.01], [0.13, 0.07], [0.12, 0.075], [0.08, 0.02]], p.w * 0.22, p.h, 0, P.ceramic(0x2b2b2b));
    for (let i = 0; i < 3; i++) k.sphere(0.035, p.w * 0.22 + (i - 1) * 0.05, p.h + 0.06, (i % 2) * 0.03, P.paint([0xe8a33c, 0x9bbf4a, 0xc0392b][i]), { seg: 10 });
  },

  sideTable: (k, p) => {
    const r = p.w / 2;
    k.cyl(r, r, 0.035, 0, p.h - 0.018, 0, P.marble());
    k.lathe([[0.04, 0], [0.06, 0.1], [0.035, 0.3], [0.05, p.h - 0.04]], 0, 0, 0, P.brass(), { seg: 16 });
    k.cyl(r * 0.7, r * 0.75, 0.03, 0, 0.015, 0, P.brass());
  },

  consoleTable: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, 0.04, p.d, 0, p.h - 0.02, 0, wd);
    k.box(p.w - 0.1, 0.12, p.d - 0.06, 0, p.h - 0.1, 0, wd);
    for (const sx of [-1, 1]) k.sphere(0.015, sx * p.w * 0.25, p.h - 0.1, p.d / 2 - 0.02, P.brass(), { seg: 8 });
    k.legs(p.w, p.d, p.h - 0.04, 0.05, P.brass(), 0.015);
    k.box(p.w - 0.1, 0.02, p.d - 0.1, 0, 0.18, 0, wd);
    k.lathe([[0, 0], [0.08, 0.01], [0.11, 0.15], [0.05, 0.32], [0.06, 0.38]], p.w * 0.3, p.h, 0, P.ceramic(0xf0ebe0));
    k.box(0.5, 0.6, 0.03, -p.w * 0.15, p.h + 0.3, -p.d / 2 + 0.05, P.art(11), { rot: [-0.12, 0, 0] });
  },

  floorLamp: (k, p) => {
    const m = P.brass();
    k.cyl(0.16, 0.18, 0.03, 0, 0.015, 0, P.blackMetal());
    k.cyl(0.012, 0.012, p.h - 0.35, 0, (p.h - 0.35) / 2, 0, m, { seg: 8 });
    k.cyl(0.19, 0.22, 0.3, 0, p.h - 0.15, 0, P.lampshade(), { open: true, seg: 24, castShadow: false });
    k.sphere(0.05, 0, p.h - 0.2, 0, P.emissive(0xfff0c8, 2), { seg: 10, castShadow: false });
  },

  tableLamp: (k, p) => {
    k.lathe([[0.0, 0], [0.07, 0], [0.1, 0.06], [0.11, 0.18], [0.06, 0.3], [0.03, 0.33]], 0, 0, 0, P.ceramic(p.color ?? 0x2f4a63), { seg: 20 });
    k.cyl(0.006, 0.006, 0.1, 0, 0.37, 0, P.brass(), { seg: 6 });
    k.cyl(0.13, 0.17, 0.2, 0, p.h - 0.1, 0, P.lampshade(), { open: true, seg: 20, castShadow: false });
    k.sphere(0.035, 0, p.h - 0.15, 0, P.emissive(0xfff0c8, 2), { seg: 8, castShadow: false });
  },

  tvWall: (k, p) => {
    k.rbox(p.w, p.h, 0.05, 0.01, 0, p.h / 2, 0, P.screen());
    const movie = P.screenOn('movie', (g, s) => {
      // Letterboxed film still: dusk over a desert highway.
      g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
      const sky = g.createLinearGradient(0, s * 0.12, 0, s * 0.6);
      sky.addColorStop(0, '#1b1f4a'); sky.addColorStop(0.6, '#c2185b'); sky.addColorStop(1, '#ff9e40');
      g.fillStyle = sky; g.fillRect(0, s * 0.12, s, s * 0.5);
      g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(s * 0.5, s * 0.6, s * 0.09, Math.PI, 0); g.fill();
      g.fillStyle = '#2a1430'; g.beginPath(); g.moveTo(0, s * 0.62);
      for (let x = 0; x <= s; x += s / 10) g.lineTo(x, s * (0.5 + Math.random() * 0.1));
      g.lineTo(s, s * 0.62); g.fill();
      g.fillStyle = '#120a14'; g.fillRect(0, s * 0.6, s, s * 0.28);
      g.fillStyle = '#3a2a2a'; g.beginPath(); g.moveTo(s * 0.46, s * 0.6); g.lineTo(s * 0.54, s * 0.6); g.lineTo(s * 0.8, s * 0.88); g.lineTo(s * 0.2, s * 0.88); g.fill();
      g.fillStyle = '#ffd27a'; for (let i = 0; i < 5; i++) g.fillRect(s * 0.497, s * (0.63 + i * 0.05), s * 0.006, s * 0.025);
    });
    k.box(p.w - 0.04, p.h - 0.04, 0.005, 0, p.h / 2, 0.026, p.variant === 1 ? movie : P.screenOn('tv', (g, s) => {
      const grd = g.createLinearGradient(0, 0, s, s);
      grd.addColorStop(0, '#1d3557');
      grd.addColorStop(0.5, '#457b9d');
      grd.addColorStop(1, '#e9c46a');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.font = `bold ${s * 0.1}px sans-serif`;
      g.fillText('GG+', s * 0.06, s * 0.9);
    }), { castShadow: false });
  },

  mediaConsole: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, p.h - 0.12, p.d, 0, 0.12 + (p.h - 0.12) / 2, 0, wd);
    for (let i = 0; i < 24; i++) k.box(0.012, p.h - 0.2, 0.01, -p.w / 2 + 0.1 + i * ((p.w - 0.2) / 23), 0.12 + (p.h - 0.12) / 2, p.d / 2 + 0.005, P.walnut(), { castShadow: false });
    k.legs(p.w, p.d, 0.12, 0.08, P.blackMetal(), 0.015);
    k.box(0.4, 0.06, 0.25, p.w * 0.3, p.h + 0.03, 0, P.blackMetal());
    k.lathe([[0, 0], [0.06, 0], [0.09, 0.12], [0.05, 0.3]], -p.w * 0.35, p.h, 0, P.ceramic(0xe8e1d4));
  },

  bookshelf: (k, p) => {
    const wd = P.walnut();
    const t = 0.04;
    k.box(t, p.h, p.d, -p.w / 2 + t / 2, p.h / 2, 0, wd);
    k.box(t, p.h, p.d, p.w / 2 - t / 2, p.h / 2, 0, wd);
    k.box(p.w, t, p.d, 0, p.h - t / 2, 0, wd);
    k.box(p.w, 0.08, p.d, 0, 0.04, 0, wd);
    const inner = p.h - 0.12;
    k.box(p.w - t * 2, inner, 0.05, 0, 0.08 + inner / 2, -p.d / 2 + 0.06, P.books());
    k.box(p.w - t * 2, inner, p.d - 0.12, 0, 0.08 + inner / 2, -p.d / 2 + 0.1 + (p.d - 0.12) / 2, P.books(), { castShadow: false, scale: [1, 1, 0.98] });
    for (let r = 1; r < 5; r++) k.box(p.w - t * 2, 0.025, p.d - 0.02, 0, 0.08 + inner * (r / 5), 0.01, wd);
    k.box(p.w + 0.06, 0.06, p.d + 0.04, 0, p.h + 0.03, 0.01, wd);
  },

  plantLarge: (k, p) => {
    const pot = p.variant === 1 ? P.terracotta() : P.ceramic(0xe9e4da);
    k.lathe([[0.18, 0], [0.24, 0.05], [0.28, 0.42], [0.3, 0.45], [0.27, 0.46]], 0, 0, 0, pot);
    k.cyl(0.26, 0.26, 0.02, 0, 0.43, 0, P.soil());
    const leaf = P.leaf(0x2f6b2a);
    const stem = P.bark();
    const top = p.h;
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI * 2;
      const tx = Math.cos(a) * 0.12;
      const tz = Math.sin(a) * 0.12;
      k.rod(0.012, [0, 0.43, 0], [tx, top - 0.3 - s * 0.15, tz], stem, 5);
      for (let i = 0; i < 9; i++) {
        const t = 0.35 + (i / 9) * 0.65;
        const la = a + i * 2.4;
        const y = 0.43 + (top - 0.3 - s * 0.15 - 0.43) * t;
        k.sphere(1, tx * t + Math.cos(la) * 0.1, y, tz * t + Math.sin(la) * 0.1, leaf,
          { seg: 8, scale: [0.12, 0.17, 0.015], rot: [0.6 + Math.random() * 0.4, la, 0.3], castShadow: true });
      }
    }
  },

  plantSmall: (k, p) => {
    k.lathe([[0.1, 0], [0.13, 0.02], [0.15, 0.2], [0.13, 0.21]], 0, 0, 0, P.ceramic(p.color ?? 0x2b2b2b), { seg: 16 });
    const leaf = P.leaf(0x3f8a3a);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.39;
      k.sphere(1, Math.cos(a) * 0.08, 0.3 + (i % 4) * 0.06, Math.sin(a) * 0.08, leaf, { seg: 6, scale: [0.04, 0.16, 0.012], rot: [Math.cos(a) * 0.5, a, Math.sin(a) * 0.5] });
    }
  },

  rug: (k, p) => { k.box(p.w, 0.012, p.d, 0, 0.006, 0, P.rug(p.variant), { castShadow: false }); },
  roundRug: (k, p) => { k.cyl(p.w / 2, p.w / 2, 0.012, 0, 0.006, 0, P.rug(p.variant), { seg: 48, castShadow: false }); },
  medallion: (k, p) => { k.cyl(p.w / 2, p.w / 2, 0.006, 0, 0.003, 0, P.medallion(), { seg: 64, castShadow: false }); },

  grandPiano: (k, _p) => {
    const black = P.ebony();
    // Outline in plan view (x, z): straight bass side, curved treble side, keyboard at +z.
    const pts: [number, number][] = [[-0.775, 1.05], [0.775, 1.05], [0.775, 0.45], [0.55, 0.05], [0.25, -0.3], [0.15, -0.75], [-0.1, -1.05], [-0.6, -1.0], [-0.775, -0.85]];
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], -pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const [x, z] = pts[i];
      if (i >= 3 && i <= 6) shape.quadraticCurveTo(pts[i - 1][0], -pts[i - 1][1] + 0.05, x, -z);
      else shape.lineTo(x, -z);
    }
    shape.closePath();
    const body = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2, curveSegments: 10 });
    body.rotateX(-Math.PI / 2);
    k.mesh(body, 0, 0.62, 0, black);
    const lid = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false, curveSegments: 10 });
    lid.rotateX(-Math.PI / 2);
    lid.translate(0.775, 0, 0); // hinge along the bass (left) edge
    k.mesh(lid, -0.775, 0.96, 0, black, { rot: [0, 0, 0.6] });
    k.rod(0.008, [0.25, 0.95, -0.1], [0.35, 1.45, -0.1], black, 6);
    // Gold plate and strings visible under the lid.
    k.box(1.3, 0.01, 1.6, -0.05, 0.945, -0.05, P.gold(), { castShadow: false });
    // Keyboard.
    k.box(1.4, 0.06, 0.18, 0, 0.72, 1.12, black);
    k.box(1.34, 0.025, 0.15, 0, 0.765, 1.13, P.ceramic(0xfdfbf6));
    for (let i = 0; i < 36; i++) {
      const oct = i % 5;
      if (oct === 2) continue;
      k.box(0.014, 0.018, 0.09, -0.65 + i * 0.037, 0.785, 1.1, black, { castShadow: false });
    }
    k.box(0.6, 0.25, 0.015, 0, 1.05, 0.98, black, { rot: [-0.25, 0, 0] });
    for (const [x, z] of [[-0.62, 0.9], [0.62, 0.9], [-0.2, -0.85]]) {
      k.lathe([[0.07, 0], [0.05, 0.05], [0.045, 0.3], [0.06, 0.55], [0.07, 0.62]], x, 0, z, black, { seg: 12 });
      k.cyl(0.03, 0.03, 0.04, x, 0.02, z, P.brass(), { seg: 8 });
    }
    k.box(0.12, 0.35, 0.04, 0, 0.3, 0.85, black);
    for (const x of [-0.04, 0, 0.04]) k.box(0.02, 0.01, 0.08, x, 0.12, 0.9, P.brass());
  },

  pianoBench: (k, p) => {
    k.rbox(p.w, 0.08, p.d, 0.03, 0, p.h - 0.04, 0, P.leather(0x111111));
    k.box(p.w - 0.04, 0.06, p.d - 0.04, 0, p.h - 0.11, 0, P.ebony());
    k.legs(p.w, p.d, p.h - 0.14, 0.05, P.ebony(), 0.022);
  },

  wallArt: (k, p) => {
    k.box(p.w, p.h, 0.04, 0, p.h / 2, 0, P.art(p.variant), { castShadow: false });
    k.box(p.w + 0.08, p.h + 0.08, 0.03, 0, p.h / 2, -0.02, P.gold(), { castShadow: false });
    k.box(0.3, 0.04, 0.08, 0, p.h + 0.12, 0.05, P.brass(), { castShadow: false });
    k.box(0.25, 0.015, 0.02, 0, p.h + 0.1, 0.09, P.emissive(0xfff0d0, 2), { castShadow: false });
  },

  curtain: (k, p) => {
    const geo = new THREE.PlaneGeometry(p.w, p.h - 0.1, 32, 1);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 18) * 0.05);
    geo.computeVertexNormals();
    const fabric = P.velvet(p.color ?? 0xe9e1d2);
    k.mesh(geo, 0, (p.h - 0.1) / 2, 0.05, fabric);
    k.mesh(geo, 0, (p.h - 0.1) / 2, 0.049, fabric, { rot: [0, Math.PI, 0] });
    k.cyl(0.015, 0.015, p.w + 0.3, 0, p.h - 0.04, 0.05, P.brass(), { rot: [0, 0, Math.PI / 2], seg: 8 });
    for (const sx of [-1, 1]) k.sphere(0.035, sx * (p.w / 2 + 0.15), p.h - 0.04, 0.05, P.brass(), { seg: 10 });
  },

  pendantLight: (k, p) => {
    // Hangs down from y = 0 (the ceiling).
    const drop = p.h;
    k.cyl(0.06, 0.06, 0.02, 0, -0.01, 0, P.brass(), { seg: 12 });
    k.cyl(0.004, 0.004, drop - 0.25, 0, -(drop - 0.25) / 2, 0, P.blackMetal(), { seg: 4, castShadow: false });
    if (p.variant === 1) {
      k.sphere(p.w / 2, 0, -drop + p.w / 2, 0, P.glass(0xfff4e0, 0.45), { seg: 20, castShadow: false });
      k.sphere(0.05, 0, -drop + p.w / 2, 0, P.emissive(0xfff0c8, 3), { seg: 10, castShadow: false });
    } else {
      k.lathe([[0.02, 0], [0.06, -0.02], [p.w / 2 * 0.7, -0.15], [p.w / 2, -0.25]], 0, -drop + 0.25, 0, P.brass(), { seg: 24, castShadow: false });
      k.sphere(0.05, 0, -drop + 0.05, 0, P.emissive(0xfff0c8, 3), { seg: 10, castShadow: false });
    }
  },

  fireplace: (k, p) => {
    const marble = P.marble(0xf2efe9);
    const fb = 1.0;
    // Chimney breast up to the ceiling, marble surround, mantel, firebox with logs and flames.
    k.box(p.w, p.h, 0.4, 0, p.h / 2, -p.d / 2 + 0.2, P.paint(0xefe9df));
    for (const sx of [-1, 1]) k.box(0.3, 1.2, 0.3, sx * 0.75, 0.6, -p.d / 2 + 0.55, marble);
    k.box(1.9, 0.12, 0.42, 0, 1.26, -p.d / 2 + 0.5, marble);
    k.box(1.8, 0.18, 0.3, 0, 1.11, -p.d / 2 + 0.55, marble);
    k.box(fb + 0.2, 0.05, 0.6, 0, 0.025, -p.d / 2 + 0.6, P.marble(0x2b2b2b));
    k.box(fb, 0.85, 0.05, 0, 0.45, -p.d / 2 + 0.42, P.iron());
    for (const sx of [-1, 1]) k.box(0.05, 0.85, 0.3, sx * fb / 2, 0.45, -p.d / 2 + 0.55, P.iron());
    k.box(fb, 0.05, 0.3, 0, 0.88, -p.d / 2 + 0.55, P.iron());
    // Charred logs with glowing cracks, on a bed of coals, burning.
    const log = charredLog();
    k.cyl(0.06, 0.06, 0.6, -0.05, 0.12, -p.d / 2 + 0.58, log, { rot: [0, 0.3, Math.PI / 2], seg: 10 });
    k.cyl(0.055, 0.055, 0.55, 0.08, 0.12, -p.d / 2 + 0.52, log, { rot: [0, -0.4, Math.PI / 2], seg: 10 });
    k.cyl(0.05, 0.05, 0.5, 0, 0.2, -p.d / 2 + 0.56, log, { rot: [0, 0.1, Math.PI / 2], seg: 10 });
    const fire = createFire({ kind: 'wood', width: 0.5, depth: 0.16, height: 0.42, tongues: 16, light: 6, lightRange: 6 });
    fire.object.position.set(0, 0.2, -p.d / 2 + 0.56);
    k.dynamic(fire.object, (_dt, t) => { fire.update(t); glowLogs(t); });
    // Mantel styling.
    k.lathe([[0, 0], [0.06, 0], [0.08, 0.1], [0.04, 0.25]], -0.6, 1.32, -p.d / 2 + 0.5, P.brass());
    k.lathe([[0, 0], [0.06, 0], [0.08, 0.1], [0.04, 0.25]], 0.6, 1.32, -p.d / 2 + 0.5, P.brass());
    k.box(1.1, 0.8, 0.04, 0, 1.85, -p.d / 2 + 0.42, P.art(p.variant + 3));
    k.box(1.18, 0.88, 0.03, 0, 1.85, -p.d / 2 + 0.405, P.gold());
  },

  globe: (k, _p) => {
    const wd = P.walnut();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.rod(0.02, [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25], [Math.cos(a) * 0.15, 0.55, Math.sin(a) * 0.15], wd, 6);
    }
    k.torus(0.25, 0.02, 0, 0.55, 0, wd, { rot: [Math.PI / 2, 0, 0] });
    k.sphere(0.22, 0, 0.8, 0, P.paint(0x3a6ea5), { seg: 24 });
    k.torus(0.25, 0.008, 0, 0.8, 0, P.brass(), { rot: [0, 0, 0.4] });
  },

  sculpture: (k, p) => {
    k.box(0.5, 1.1, 0.5, 0, 0.55, 0, P.marble(0xf6f4f0));
    k.box(0.56, 0.05, 0.56, 0, 1.125, 0, P.marble(0xf6f4f0));
    k.mesh(new THREE.TorusKnotGeometry(0.2, 0.06, 96, 10, 2, 3), 0, 1.5, 0, p.variant === 1 ? P.chrome() : P.brass());
  },

  column: (k, p) => {
    const s = P.stone(0xf4efe4);
    const h = p.h;
    const r = p.w / 2 - 0.08;
    k.box(p.w, 0.18, p.d, 0, 0.09, 0, s);
    k.lathe([[r + 0.06, 0], [r + 0.06, 0.06], [r + 0.02, 0.12], [r, 0.16]], 0, 0.18, 0, s, { seg: 24 });
    k.lathe([[r, 0], [r * 1.04, (h - 0.7) * 0.35], [r * 0.9, h - 0.7]], 0, 0.34, 0, s, { seg: 24 });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.box(0.02, h - 0.8, 0.02, Math.cos(a) * (r * 0.97), 0.34 + (h - 0.7) / 2, Math.sin(a) * (r * 0.97), P.stone(0xe2dccf), { castShadow: false });
    }
    k.lathe([[r * 0.9, 0], [r * 0.95, 0.04], [r * 1.25, 0.2], [r * 1.3, 0.22]], 0, h - 0.36, 0, s, { seg: 24 });
    k.box(p.w + 0.05, 0.14, p.d + 0.05, 0, h - 0.07, 0, s);
  },

  vase: (k, p) => {
    k.lathe([[0, 0], [0.12, 0], [0.18, 0.2], [0.15, 0.45], [0.08, 0.6], [0.1, 0.68]], 0, 0, 0, P.ceramic(p.color ?? 0x1e3a5a), { seg: 24 });
    const stem = P.leaf(0x4a7a3a);
    const bloom = P.flower(0xffffff);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26;
      const top: [number, number, number] = [Math.cos(a) * 0.15, p.h - 0.05 - (i % 2) * 0.1, Math.sin(a) * 0.15];
      k.rod(0.006, [0, 0.6, 0], top, stem, 4);
      for (let j = 0; j < 4; j++) k.sphere(0.035, top[0] * (1 - j * 0.15), top[1] - j * 0.06, top[2] * (1 - j * 0.15), bloom, { seg: 6 });
    }
  },

  roundTable: (k, p) => {
    const wd = P.walnut();
    const r = p.w / 2;
    k.cyl(r, r, 0.05, 0, p.h - 0.025, 0, wd, { seg: 40 });
    k.torus(r, 0.025, 0, p.h - 0.025, 0, wd, { rot: [Math.PI / 2, 0, 0], seg: 40 });
    k.lathe([[0.45, 0], [0.45, 0.05], [0.12, 0.15], [0.09, 0.4], [0.14, p.h - 0.05]], 0, 0, 0, wd, { seg: 24 });
    // Statement flower arrangement.
    k.lathe([[0, 0], [0.15, 0], [0.22, 0.2], [0.14, 0.42], [0.17, 0.48]], 0, p.h, 0, P.ceramic(0xf2efe9), { seg: 24 });
    const colors = [0xffffff, 0xf4b6c2, 0xe8d6a8, 0xffffff];
    for (let i = 0; i < 40; i++) {
      const a = i * 2.39996;
      const rr = Math.sqrt(i / 40) * 0.38;
      k.sphere(0.06, Math.cos(a) * rr, p.h + 0.62 + (0.38 - rr) * 0.5, Math.sin(a) * rr, P.flower(colors[i % 4]), { seg: 8 });
    }
    for (let i = 0; i < 16; i++) {
      const a = i * 0.39;
      k.sphere(1, Math.cos(a) * 0.32, p.h + 0.5, Math.sin(a) * 0.32, P.leaf(0x2f6b2a), { seg: 6, scale: [0.06, 0.16, 0.012], rot: [1.1, -a, 0] });
    }
  },

  diningTable: (k, p) => {
    const wd = P.walnut();
    k.rbox(p.w, 0.06, p.d, 0.02, 0, p.h - 0.03, 0, wd);
    for (const sx of [-1, 1]) {
      const x = sx * (p.w / 2 - 0.45);
      k.box(0.12, p.h - 0.06, 0.12, x, (p.h - 0.06) / 2, 0, wd);
      k.box(0.12, 0.08, p.d - 0.3, x, 0.04, 0, wd);
      k.box(0.08, 0.06, p.d - 0.4, x, p.h - 0.09, 0, wd);
    }
    k.box(p.w - 0.9, 0.06, 0.08, 0, 0.3, 0, wd);
    // Place settings and a centerpiece.
    const plate = P.ceramic();
    const glass = P.glass(0xe8f6ff, 0.35);
    const n = Math.max(1, Math.floor(p.w / 0.68));
    for (let i = 0; i < n; i++) {
      const x = -p.w / 2 + (p.w / n) * (i + 0.5);
      for (const sz of [-1, 1]) {
        const z = sz * (p.d / 2 - 0.22);
        k.cyl(0.13, 0.11, 0.015, x, p.h + 0.008, z, plate, { seg: 20, castShadow: false });
        k.box(0.012, 0.004, 0.18, x - 0.18, p.h + 0.002, z, P.chrome(), { castShadow: false });
        k.box(0.012, 0.004, 0.18, x + 0.18, p.h + 0.002, z, P.chrome(), { castShadow: false });
        k.lathe([[0.025, 0], [0.004, 0.01], [0.004, 0.09], [0.035, 0.12], [0.04, 0.18]], x + 0.12, p.h, z - sz * 0.15, glass, { seg: 12, castShadow: false });
      }
    }
    k.box(p.w * 0.5, 0.008, 0.35, 0, p.h + 0.004, 0, P.fabric(0xd9cfb8), { castShadow: false });
    for (const x of [-0.5, 0, 0.5]) {
      k.lathe([[0.04, 0], [0.025, 0.02], [0.015, 0.25], [0.03, 0.27]], x * p.w * 0.35, p.h, 0, P.brass(), { seg: 12 });
      k.cyl(0.01, 0.01, 0.15, x * p.w * 0.35, p.h + 0.345, 0, P.ceramic(0xfffbef), { seg: 8 });
      k.sphere(0.008, x * p.w * 0.35, p.h + 0.43, 0, P.emissive(0xffb04a, 3), { seg: 6, castShadow: false });
    }
  },

  diningChair: (k, p) => {
    const f = P.fabric(p.color ?? 0xc8b89e);
    k.legs(p.w, p.d, 0.45, 0.04, P.walnut(), 0.02, false);
    k.rbox(p.w, 0.09, p.d, 0.03, 0, 0.49, 0, f);
    k.rbox(p.w, 0.6, 0.07, 0.03, 0, 0.8, -p.d / 2 + 0.035, f, { rot: [-0.08, 0, 0] });
  },

  sideboard: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, p.h - 0.15, p.d, 0, 0.15 + (p.h - 0.15) / 2, 0, wd);
    k.legs(p.w, p.d, 0.15, 0.08, P.brass(), 0.018);
    const doors = 4;
    const dw = (p.w - 0.06) / doors;
    for (let i = 0; i < doors; i++) {
      const x = -p.w / 2 + 0.03 + dw * (i + 0.5);
      k.box(dw - 0.02, p.h - 0.25, 0.015, x, 0.15 + (p.h - 0.15) / 2, p.d / 2 + 0.008, P.wood(0x6a4328));
      k.box(0.012, 0.18, 0.02, x + (i % 2 ? -1 : 1) * (dw / 2 - 0.06), 0.15 + (p.h - 0.15) / 2, p.d / 2 + 0.025, P.brass());
    }
    k.box(p.w + 0.02, 0.03, p.d + 0.02, 0, p.h + 0.015, 0, P.marble());
    k.lathe([[0, 0], [0.09, 0], [0.12, 0.2], [0.06, 0.45], [0.08, 0.5]], -p.w * 0.3, p.h + 0.03, 0, P.ceramic(0x8a5a3a));
    k.lathe([[0, 0], [0.1, 0], [0.1, 0.01], [0.14, 0.08]], p.w * 0.25, p.h + 0.03, 0, P.brass());
  },

  counter: (k, p) => {
    const cab = P.lacquer(p.color ?? 0xf4f2ee);
    const kick = 0.1;
    k.box(p.w, kick, p.d - 0.08, 0, kick / 2, -0.04, P.blackMetal());
    k.box(p.w, p.h - kick - 0.04, p.d - 0.03, 0, kick + (p.h - kick - 0.04) / 2, -0.015, cab);
    const doors = Math.max(1, Math.round(p.w / 0.6));
    const dw = p.w / doors;
    const face = p.d / 2 - 0.015 + 0.01;
    for (let i = 0; i < doors; i++) {
      const x = -p.w / 2 + dw * (i + 0.5);
      k.box(dw - 0.006, 0.18, 0.02, x, p.h - 0.04 - 0.11, face, cab);
      k.box(dw - 0.006, p.h - kick - 0.28, 0.02, x, kick + (p.h - kick - 0.28) / 2 + 0.01, face, cab);
      k.box(dw * 0.5, 0.012, 0.025, x, p.h - 0.04 - 0.11, face + 0.02, P.steel());
      k.box(0.012, 0.25, 0.025, x + dw / 2 - 0.06, p.h - 0.4, face + 0.02, P.steel());
    }
    k.box(p.w, 0.04, p.d + 0.02, 0, p.h - 0.02, 0.01, P.marble());
    if (p.variant === 1) {
      k.box(0.7, 0.005, 0.42, 0, p.h + 0.002, 0.03, P.steel(), { castShadow: false });
      k.box(0.64, 0.004, 0.36, 0, p.h + 0.005, 0.03, P.blackMetal(), { castShadow: false });
      const ch = P.chrome();
      k.cyl(0.025, 0.03, 0.04, 0, p.h + 0.02, -p.d / 2 + 0.1, ch, { seg: 12 });
      k.cyl(0.012, 0.012, 0.35, 0, p.h + 0.2, -p.d / 2 + 0.1, ch, { seg: 8 });
      k.torus(0.12, 0.012, 0, p.h + 0.37, -p.d / 2 + 0.22, ch, { arc: Math.PI, rot: [0, Math.PI / 2, 0] });
    } else if (p.variant === 2) {
      k.box(0.8, 0.006, 0.52, 0, p.h + 0.003, 0.02, P.screen(), { castShadow: false });
      for (const [x, z, r] of [[-0.2, -0.1, 0.11], [0.2, -0.1, 0.09], [-0.2, 0.14, 0.08], [0.2, 0.14, 0.11]]) {
        k.torus(r, 0.006, x, p.h + 0.008, z, P.emissive(0x551a0a, 0.6), { rot: [Math.PI / 2, 0, 0], castShadow: false });
      }
      for (let i = 0; i < 4; i++) k.cyl(0.02, 0.02, 0.025, -0.3 + i * 0.2, p.h - 0.13, p.d / 2 + 0.03, P.steel(), { rot: [Math.PI / 2, 0, 0], seg: 10 });
    } else {
      k.box(0.35, 0.3, 0.25, p.w * 0.3, p.h + 0.15, -p.d / 2 + 0.2, P.steel());
      k.box(0.3, 0.12, 0.02, p.w * 0.3, p.h + 0.2, -p.d / 2 + 0.33, P.screen());
      k.lathe([[0, 0], [0.12, 0], [0.14, 0.12], [0.13, 0.13]], -p.w * 0.3, p.h, 0, P.ceramic(0xe9e4da));
      for (let i = 0; i < 5; i++) k.sphere(0.04, -p.w * 0.3 + (i - 2) * 0.04, p.h + 0.12, (i % 2) * 0.05, P.paint([0xe8a33c, 0x9bbf4a, 0xc0392b, 0xf1c40f, 0xe67e22][i]), { seg: 10 });
    }
  },

  wallCabinet: (k, p) => {
    const cab = P.lacquer(p.color ?? 0xf4f2ee);
    k.box(p.w, p.h, p.d, 0, p.h / 2, 0, cab);
    const doors = Math.max(1, Math.round(p.w / 0.6));
    const dw = p.w / doors;
    for (let i = 0; i < doors; i++) {
      const x = -p.w / 2 + dw * (i + 0.5);
      k.box(dw - 0.006, p.h - 0.01, 0.02, x, p.h / 2, p.d / 2 + 0.01, cab);
      k.box(0.012, 0.2, 0.025, x + dw / 2 - 0.06, 0.15, p.d / 2 + 0.03, P.steel());
    }
    k.box(p.w - 0.05, 0.01, 0.03, 0, -0.005, p.d / 2 - 0.05, P.emissive(0xfff2d8, 2), { castShadow: false });
  },

  island: (k, p) => {
    const cab = P.wood(p.color ?? 0x3a4450);
    const marble = P.marble();
    k.box(p.w - 0.1, p.h - 0.04, p.d - 0.35, 0, (p.h - 0.04) / 2, -0.15, cab);
    for (let i = 0; i < 4; i++) k.box(0.012, 0.25, 0.025, -p.w / 2 + 0.5 + i * ((p.w - 1) / 3), p.h - 0.35, -p.d / 2 - 0.02 + 0.005, P.brass());
    k.box(p.w, 0.05, p.d, 0, p.h - 0.025, 0, marble);
    for (const sx of [-1, 1]) k.box(0.05, p.h - 0.05, p.d, sx * (p.w / 2 - 0.025), (p.h - 0.05) / 2, 0, marble);
    k.lathe([[0, 0], [0.18, 0], [0.22, 0.08], [0.21, 0.09]], -p.w * 0.25, p.h, -0.2, P.walnut());
    for (let i = 0; i < 6; i++) k.sphere(0.045, -p.w * 0.25 + (i % 3 - 1) * 0.07, p.h + 0.09 + Math.floor(i / 3) * 0.05, -0.2 + (i % 2) * 0.05, P.paint([0x9bbf4a, 0xc0392b, 0xe8a33c][i % 3]), { seg: 10 });
    k.box(0.45, 0.03, 0.3, p.w * 0.25, p.h + 0.015, -0.2, P.wood(0xc9a27a));
  },

  barStool: (k, p) => {
    const ch = P.chrome();
    k.lathe([[0.2, 0], [0.2, 0.01], [0.04, 0.05]], 0, 0, 0, ch, { seg: 20 });
    k.cyl(0.025, 0.025, p.h - 0.1, 0, (p.h - 0.1) / 2, 0, ch, { seg: 10 });
    k.torus(0.17, 0.01, 0, 0.3, 0, ch, { rot: [Math.PI / 2, 0, 0] });
    k.rbox(0.42, 0.07, 0.4, 0.03, 0, p.h - 0.035, 0, P.leather(p.color ?? 0x2b2b2b));
    k.rbox(0.42, 0.2, 0.05, 0.02, 0, p.h + 0.1, -0.18, P.leather(p.color ?? 0x2b2b2b), { rot: [-0.15, 0, 0] });
  },

  fridge: (k, p) => {
    const st = P.steel();
    k.box(p.w, p.h, p.d - 0.05, 0, p.h / 2, -0.025, st);
    for (const sx of [-1, 1]) {
      k.box(p.w / 2 - 0.01, p.h * 0.62, 0.05, sx * p.w / 4, p.h - p.h * 0.31, p.d / 2 - 0.025, st);
      k.cyl(0.012, 0.012, p.h * 0.45, sx * 0.06, p.h - p.h * 0.31, p.d / 2 + 0.03, P.chrome(), { seg: 8 });
    }
    k.box(p.w - 0.01, p.h * 0.33, 0.05, 0, p.h * 0.17, p.d / 2 - 0.025, st);
    k.cyl(0.012, 0.012, p.w * 0.7, 0, p.h * 0.3, p.d / 2 + 0.03, P.chrome(), { rot: [0, 0, Math.PI / 2], seg: 8 });
    k.box(0.18, 0.3, 0.01, -p.w / 4, p.h * 0.72, p.d / 2 + 0.005, P.screen());
  },

  rangeHood: (k, p) => {
    const st = P.steel();
    k.mesh(new THREE.CylinderGeometry(0.2, p.w * 0.7, 0.3, 4, 1), 0, 0.15, 0, st, { rot: [0, Math.PI / 4, 0], scale: [1, 1, p.d / p.w] });
    k.box(0.3, p.h - 0.3, 0.25, 0, 0.3 + (p.h - 0.3) / 2, -p.d / 2 + 0.15, st);
    k.box(p.w * 0.9, 0.01, p.d * 0.7, 0, 0.0, 0, P.emissive(0xfff2d8, 1), { castShadow: false });
  },

  wineFridge: (k, p) => {
    k.box(p.w, p.h, p.d, 0, p.h / 2, 0, P.steel());
    k.box(p.w - 0.06, p.h - 0.08, 0.01, 0, p.h / 2, p.d / 2 + 0.002, P.bottles(), { castShadow: false });
    k.box(p.w - 0.06, p.h - 0.08, 0.01, 0, p.h / 2, p.d / 2 + 0.01, P.glass(0x223344, 0.45), { castShadow: false });
    k.box(0.015, p.h * 0.6, 0.03, p.w / 2 - 0.06, p.h / 2, p.d / 2 + 0.03, P.chrome());
  },

  bed: (k, p) => {
    const frame = P.fabric(0x8c8577);
    const linen = P.fabric(0xf6f3ec);
    const duvet = P.fabric(p.color ?? 0xd9d2c5);
    const [w, d] = [p.w, p.d];
    k.rbox(w + 0.08, 0.3, d + 0.04, 0.04, 0, 0.2, 0, frame);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(0.03, 0.025, 0.06, sx * (w / 2 - 0.05), 0.03, sz * (d / 2 - 0.05), P.walnut(), { seg: 8 });
    k.rbox(w - 0.04, 0.26, d - 0.08, 0.06, 0, 0.48, 0.02, linen);
    k.rbox(w + 0.04, 0.12, d * 0.7, 0.05, 0, 0.6, d * 0.15, duvet);
    k.rbox(w + 0.06, 0.25, 0.05, 0.02, 0, 0.5, d / 2 - 0.01, duvet);
    k.rbox(w * 0.98, 0.04, d * 0.22, 0.02, 0, 0.67, d * 0.32, P.fabric(0x8a7458));
    // Headboard with channel tufting.
    const hb = P.velvet(0xb9ab95);
    k.rbox(w + 0.25, p.h, 0.12, 0.04, 0, p.h / 2, -d / 2 - 0.02, hb);
    const ch = Math.round(w / 0.22);
    for (let i = 0; i < ch; i++) k.rbox((w + 0.15) / ch - 0.015, p.h - 0.2, 0.06, 0.025, -(w + 0.15) / 2 + ((w + 0.15) / ch) * (i + 0.5), p.h / 2 + 0.05, -d / 2 + 0.06, hb);
    const pillows = w > 1.6 ? 2 : 1;
    for (let i = 0; i < pillows; i++) {
      const x = pillows === 1 ? 0 : (i - 0.5) * (w * 0.5);
      k.rbox(w / pillows - 0.12, 0.16, 0.42, 0.07, x, 0.69, -d / 2 + 0.32, linen, { rot: [-0.5, 0, 0] });
      k.rbox(w / pillows - 0.2, 0.15, 0.38, 0.07, x, 0.7, -d / 2 + 0.52, P.fabric(0xece6da), { rot: [-0.25, 0, 0] });
    }
    k.rbox(0.42, 0.32, 0.12, 0.06, 0, 0.78, -d / 2 + 0.66, P.velvet(p.color ?? 0x8a6a3a), { rot: [-0.3, 0, 0] });
  },

  nightstand: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, p.h - 0.12, p.d, 0, 0.12 + (p.h - 0.12) / 2, 0, wd);
    k.legs(p.w, p.d, 0.12, 0.05, P.brass(), 0.012);
    for (let i = 0; i < 2; i++) {
      k.box(p.w - 0.04, (p.h - 0.16) / 2 - 0.01, 0.015, 0, 0.14 + (i + 0.5) * ((p.h - 0.16) / 2), p.d / 2 + 0.007, P.wood(0x6a4328));
      k.sphere(0.014, 0, 0.14 + (i + 0.5) * ((p.h - 0.16) / 2), p.d / 2 + 0.02, P.brass(), { seg: 8 });
    }
    k.lathe([[0, 0], [0.06, 0], [0.08, 0.05], [0.08, 0.16], [0.04, 0.25], [0.02, 0.27]], 0.06, p.h, -0.04, P.ceramic(0xe8e1d4), { seg: 16 });
    k.cyl(0.1, 0.13, 0.17, 0.06, p.h + 0.36, -0.04, P.lampshade(), { open: true, seg: 18, castShadow: false });
    k.sphere(0.03, 0.06, p.h + 0.32, -0.04, P.emissive(0xfff0c8, 2), { seg: 8, castShadow: false });
    k.box(0.15, 0.03, 0.22, -0.13, p.h + 0.015, 0.05, P.paint(0x7a1f24), { rot: [0, 0.3, 0] });
  },

  dresser: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, p.h - 0.1, p.d, 0, 0.1 + (p.h - 0.1) / 2, 0, wd);
    k.legs(p.w, p.d, 0.1, 0.05, P.walnut(), 0.025);
    const rows = 3;
    for (let r = 0; r < rows; r++) for (const sx of [-1, 1]) {
      const y = 0.12 + (r + 0.5) * ((p.h - 0.14) / rows);
      k.box(p.w / 2 - 0.03, (p.h - 0.14) / rows - 0.02, 0.015, sx * p.w / 4, y, p.d / 2 + 0.007, P.wood(0x6a4328));
      k.box(0.12, 0.012, 0.02, sx * p.w / 4, y, p.d / 2 + 0.02, P.brass());
    }
    k.box(0.9, 1.1, 0.03, 0, p.h + 0.6, -p.d / 2 + 0.05, P.mirror(), { rot: [-0.05, 0, 0] });
    k.box(0.98, 1.18, 0.025, 0, p.h + 0.6, -p.d / 2 + 0.035, P.brass(), { rot: [-0.05, 0, 0] });
    k.lathe([[0, 0], [0.05, 0], [0.07, 0.1], [0.03, 0.22]], p.w * 0.35, p.h, 0, P.ceramic(0x2f4a63));
  },

  wardrobe: (k, p) => {
    const wd = P.wood(0x5a3a24);
    k.box(p.w, p.h, p.d, 0, p.h / 2, 0, wd);
    for (const sx of [-1, 1]) {
      k.box(p.w / 2 - 0.02, p.h - 0.15, 0.02, sx * p.w / 4, p.h / 2, p.d / 2 + 0.01, P.wood(0x6a4328));
      k.box(p.w / 2 - 0.16, p.h - 0.45, 0.012, sx * p.w / 4, p.h / 2, p.d / 2 + 0.025, P.wood(0x5a3a24));
      k.box(0.015, 0.3, 0.025, sx * 0.05, p.h / 2, p.d / 2 + 0.035, P.brass());
    }
    k.box(p.w + 0.08, 0.08, p.d + 0.06, 0, p.h + 0.04, 0, wd);
  },

  desk: (k, p) => {
    const wd = P.oak();
    k.box(p.w, 0.04, p.d, 0, p.h - 0.02, 0, wd);
    for (const sx of [-1, 1]) {
      k.box(0.04, p.h - 0.04, p.d - 0.1, sx * (p.w / 2 - 0.05), (p.h - 0.04) / 2, 0, P.blackMetal());
    }
    k.box(0.4, 0.15, p.d - 0.1, p.w / 2 - 0.3, p.h - 0.115, 0, wd);
    // Laptop and lamp.
    k.box(0.34, 0.015, 0.24, -0.1, p.h + 0.008, 0.1, P.steel());
    k.box(0.34, 0.22, 0.01, -0.1, p.h + 0.11, -0.02, P.steel(), { rot: [-0.25, 0, 0] });
    k.box(0.31, 0.19, 0.003, -0.1, p.h + 0.11, -0.012, P.screenOn('laptop', (g, s) => {
      g.fillStyle = '#0f1720'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#3aa0ff'; for (let i = 0; i < 12; i++) g.fillRect(s * 0.1, s * (0.12 + i * 0.065), s * (0.3 + Math.random() * 0.5), s * 0.025);
    }), { rot: [-0.25, 0, 0], castShadow: false });
    k.cyl(0.08, 0.09, 0.02, p.w / 2 - 0.2, p.h + 0.01, -0.2, P.blackMetal());
    k.rod(0.01, [p.w / 2 - 0.2, p.h, -0.2], [p.w / 2 - 0.3, p.h + 0.4, -0.1], P.blackMetal());
    k.cone(0.08, 0.12, p.w / 2 - 0.35, p.h + 0.38, -0.05, P.blackMetal(), { rot: [0.5, 0, 0.4] });
  },

  executiveDesk: (k, p) => {
    const wd = P.walnut();
    k.rbox(p.w, 0.05, p.d, 0.015, 0, p.h - 0.025, 0, wd);
    k.box(p.w * 0.6, 0.004, p.d * 0.55, 0, p.h + 0.002, 0.05, P.leather(0x1f2a24), { castShadow: false });
    for (const sx of [-1, 1]) {
      k.box(0.55, p.h - 0.05, p.d - 0.1, sx * (p.w / 2 - 0.3), (p.h - 0.05) / 2, 0, wd);
      for (let i = 0; i < 3; i++) {
        const y = 0.12 + i * 0.22;
        k.box(0.5, 0.2, 0.015, sx * (p.w / 2 - 0.3), y, -p.d / 2 + 0.04, P.wood(0x6a4328));
        k.box(0.1, 0.012, 0.02, sx * (p.w / 2 - 0.3), y, -p.d / 2 + 0.025, P.brass());
      }
    }
    k.box(p.w - 1.2, p.h - 0.25, 0.03, 0, (p.h - 0.05) / 2 + 0.1, p.d / 2 - 0.1, wd);
    // Monitor, keyboard, banker's lamp, papers.
    k.box(0.6, 0.36, 0.03, 0, p.h + 0.32, 0.25, P.screen());
    k.box(0.57, 0.33, 0.004, 0, p.h + 0.32, 0.233, P.screenOn('exec', (g, s) => {
      const grd = g.createLinearGradient(0, s, s, 0);
      grd.addColorStop(0, '#0b3d2e'); grd.addColorStop(1, '#2a9d8f');
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
      g.strokeStyle = '#e9c46a'; g.lineWidth = 3; g.beginPath(); g.moveTo(10, s * 0.8);
      for (let x = 10; x < s; x += 12) g.lineTo(x, s * (0.8 - (x / s) * 0.5 + Math.sin(x) * 0.05));
      g.stroke();
    }), { rot: [0, Math.PI, 0], castShadow: false });
    k.box(0.04, 0.15, 0.04, 0, p.h + 0.08, 0.28, P.blackMetal());
    k.box(0.45, 0.015, 0.15, 0, p.h + 0.01, -0.1, P.blackMetal());
    k.box(0.12, 0.3, 0.05, -p.w / 2 + 0.25, p.h + 0.15, 0.2, P.brass());
    k.cyl(0.1, 0.1, 0.25, -p.w / 2 + 0.25, p.h + 0.32, 0.12, P.glass(0x1f6b3a, 0.8), { rot: [0, 0, Math.PI / 2], seg: 16 });
    k.box(0.21, 0.004, 0.3, p.w / 2 - 0.35, p.h + 0.003, -0.05, P.ceramic(), { rot: [0, 0.2, 0], castShadow: false });
  },

  officeChair: (k, p) => {
    const bm = P.blackMetal();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      k.rod(0.02, [0, 0.08, 0], [Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3], bm, 6);
      k.sphere(0.035, Math.cos(a) * 0.3, 0.035, Math.sin(a) * 0.3, P.rubber(), { seg: 8 });
    }
    k.cyl(0.03, 0.03, 0.35, 0, 0.25, 0, P.chrome(), { seg: 10 });
    const l = P.leather(p.color ?? 0x1d1d1d);
    k.rbox(0.55, 0.1, 0.52, 0.04, 0, 0.48, 0.02, l);
    k.rbox(0.5, 0.62, 0.1, 0.05, 0, 0.86, -0.25, l, { rot: [-0.1, 0, 0] });
    for (const sx of [-1, 1]) {
      k.rod(0.015, [sx * 0.27, 0.48, -0.1], [sx * 0.27, 0.68, -0.05], bm);
      k.rbox(0.07, 0.04, 0.3, 0.015, sx * 0.27, 0.69, 0.02, l);
    }
  },

  bench: (k, p) => {
    k.rbox(p.w, 0.16, p.d, 0.05, 0, p.h - 0.08, 0, P.velvet(p.color ?? 0xb9ab95));
    k.legs(p.w, p.d, p.h - 0.16, 0.06, P.brass(), 0.018);
  },

  bathtub: (k, p) => {
    const c = P.ceramic();
    const sx = p.w / 1.8;
    const sz = p.d / 0.85;
    k.lathe([[0.3, 0], [0.38, 0.05], [0.42, 0.35], [0.45, 0.6], [0.43, 0.62], [0.39, 0.4], [0.33, 0.12]], 0, 0, 0, c,
      { seg: 32, scale: [sx * 2, 1, sz] });
    k.cyl(0.38 * sx * 2, 0.38 * sz, 0.02, 0, 0.42, 0, P.water(), { seg: 32, scale: [1, 1, sz / (sx * 2)], castShadow: false });
    const ch = P.chrome();
    k.cyl(0.02, 0.02, 0.95, p.w / 2 + 0.15, 0.475, 0, ch, { seg: 8 });
    k.torus(0.1, 0.018, p.w / 2 + 0.05, 0.95, 0, ch, { arc: Math.PI, rot: [Math.PI / 2, 0, Math.PI / 2] });
    k.rbox(0.45, 0.06, 0.3, 0.03, -p.w / 2 + 0.35, 0.65, 0, P.fabric(0xffffff), { rot: [0, 0, 0.1] });
  },

  toilet: (k, p) => {
    const c = P.ceramic();
    k.lathe([[0.12, 0], [0.14, 0.15], [0.2, 0.38], [0.18, 0.4]], 0, 0, 0.08, c, { seg: 24, scale: [0.95, 1, 1.25] });
    k.torus(0.15, 0.025, 0, 0.42, 0.1, c, { rot: [Math.PI / 2, 0, 0], scale: [1, 1.25, 1] });
    k.rbox(0.38, 0.4, 0.18, 0.03, 0, 0.6, -p.d / 2 + 0.09, c);
    k.cyl(0.02, 0.02, 0.01, 0, 0.805, -p.d / 2 + 0.09, P.chrome(), { seg: 12 });
  },

  vanity: (k, p) => {
    const wd = P.walnut();
    k.box(p.w, 0.6, p.d - 0.02, 0, 0.3 + 0.25, -0.01, wd);
    for (const sx of [-1, 1]) {
      k.box(p.w / 2 - 0.03, 0.55, 0.015, sx * p.w / 4, 0.55, p.d / 2, P.wood(0x6a4328));
      k.box(0.2, 0.012, 0.02, sx * p.w / 4, 0.75, p.d / 2 + 0.015, P.brass());
    }
    k.box(p.w + 0.02, 0.04, p.d + 0.02, 0, 0.88, 0, P.marble());
    for (const sx of [-1, 1]) {
      const x = sx * p.w / 4;
      k.lathe([[0, 0], [0.16, 0.01], [0.2, 0.12], [0.19, 0.13], [0.15, 0.03]], x, 0.9, 0.04, P.ceramic(), { seg: 24 });
      k.cyl(0.012, 0.012, 0.25, x, 1.02, -p.d / 2 + 0.08, P.brass(), { seg: 8 });
      k.cyl(0.012, 0.012, 0.15, x, 1.14, -p.d / 2 + 0.15, P.brass(), { rot: [Math.PI / 2, 0, 0], seg: 8 });
      // Mirror with sconces either side.
      k.box(0.7, 0.95, 0.025, x, 1.6, -p.d / 2 + 0.02, P.mirror());
      k.box(0.76, 1.01, 0.02, x, 1.6, -p.d / 2 + 0.005, P.brass());
    }
    for (const sx of [-1, 0, 1]) {
      k.cyl(0.04, 0.04, 0.22, sx * p.w * 0.47, 1.62, -p.d / 2 + 0.12, P.glass(0xfff4e0, 0.6), { seg: 12, castShadow: false });
      k.cyl(0.015, 0.015, 0.18, sx * p.w * 0.47, 1.62, -p.d / 2 + 0.12, P.emissive(0xfff0c8, 2), { seg: 6, castShadow: false });
    }
  },

  towelRack: (k, p) => {
    const ch = P.chrome();
    for (const y of [0.45, 0.85]) k.cyl(0.012, 0.012, p.w, 0, y, 0.05, ch, { rot: [0, 0, Math.PI / 2], seg: 8 });
    for (const sx of [-1, 1]) k.box(0.03, 0.55, 0.06, sx * p.w / 2, 0.65, 0.02, ch);
    k.rbox(p.w * 0.4, 0.5, 0.04, 0.015, -p.w * 0.2, 0.62, 0.07, P.fabric(0xffffff));
    k.rbox(p.w * 0.4, 0.4, 0.04, 0.015, p.w * 0.2, 0.68, 0.07, P.fabric(0xd9cfb8));
  },
};
