import { P } from './palette';
import type { Builder } from './types';

/** Container liveries: the reds, blues, greens, greys and browns of a working yard. */
const LIVERY = [0x9c2b23, 0x1f4e79, 0x2e6b3a, 0xc7c2b8, 0x7a4a2a, 0xc9741a, 0x2c2f33, 0x5a7d9a, 0x8a1c1c, 0x1d5c63, 0xb8b2a4, 0x3e4a7a];
const TIER = 2.59;

/** A deterministic sequence from a seed (so a stack looks the same every load). */
const seeded = (seed: number) => {
  let s = (seed * 7919 + 17) % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

/** The Meridian's container numbers stencilled on the doors (variant ≥ 100000 is the number). */
const stencil = (code: number) => P.screenOn(`mrdu${code}`, (g, s) => {
  g.fillStyle = '#284a34'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#e9e6dc';
  g.font = `bold ${s * 0.16}px monospace`;
  g.fillText('MRDU', s * 0.1, s * 0.28);
  g.fillText(String(code), s * 0.1, s * 0.48);
  g.font = `${s * 0.07}px monospace`;
  g.fillText('MERIDIAN TRADING S.A.', s * 0.1, s * 0.66);
  g.fillText('MAX GROSS 30480 KG', s * 0.1, s * 0.78);
});

/** Shipping-yard and quayside kit: containers, the cranes and carriers that move them, floodlight masts. */
export const port: Record<string, Builder> = {
  shippingContainer: (k, p) => {
    const tiers = Math.max(1, Math.round(p.h / TIER));
    const r = seeded(p.variant);
    for (let t = 0; t < tiers; t++) {
      const color = p.color ?? LIVERY[Math.floor(r() * LIVERY.length) % LIVERY.length];
      const y0 = t * TIER;
      const frame = P.paint(color === 0xc7c2b8 || color === 0xb8b2a4 ? 0x8d8a84 : 0x24262a);
      // The ribbed box, a frame round it (corner posts, top and bottom rails), and the doors on the +x end.
      k.box(p.w - 0.1, TIER - 0.06, p.d - 0.06, 0, y0 + TIER / 2, 0, P.corrugated(color));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.16, TIER - 0.02, 0.16, sx * (p.w / 2 - 0.08), y0 + TIER / 2, sz * (p.d / 2 - 0.08), frame, { castShadow: false });
      for (const y of [y0 + 0.08, y0 + TIER - 0.08]) for (const sz of [-1, 1]) k.box(p.w - 0.3, 0.14, 0.08, 0, y, sz * (p.d / 2 - 0.04), frame, { castShadow: false });
      const door = p.variant >= 100000 && t === 0 ? stencil(p.variant) : P.paint(color);
      for (const sz of [-1, 1]) {
        k.box(0.05, TIER - 0.3, p.d / 2 - 0.12, p.w / 2 - 0.02, y0 + TIER / 2, sz * (p.d / 4 - 0.02), sz < 0 ? door : P.paint(color), { castShadow: false });
        for (const off of [0.25, 0.75]) k.box(0.05, TIER - 0.4, 0.035, p.w / 2 + 0.02, y0 + TIER / 2, sz * (p.d / 2 - 0.12) * off, P.steel(), { castShadow: false });
      }
    }
  },

  gantryCrane: (k, p) => {
    // Local +z is out over the water. Legs at the corners, the portal beam, the A-frame, the boom and its trolley.
    const blue = P.paint(0x2c5f8f), white = P.paint(0xe8e6e0), dark = P.blackMetal();
    const hw = p.w / 2, hd = p.d / 2, portal = 18;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        k.box(1.6, portal, 1.6, sx * hw, portal / 2, sz * hd, blue);
        for (const dz of [-0.9, 0.9]) k.cyl(0.45, 0.45, 0.5, sx * hw, 0.5, sz * hd + dz, dark, { rot: [0, 0, Math.PI / 2], seg: 12 });
      }
      // Sill beam low between each side's legs, and a diagonal brace up the side.
      k.box(1.2, 1.4, p.d, sx * hw, 1.6, 0, blue);
      k.box(0.6, 0.6, Math.hypot(p.d, portal - 4), sx * hw, portal / 2 + 1, 0, blue, { rot: [Math.atan2(portal - 4, p.d), 0, 0] });
      // Portal girders along the top.
      k.box(1.4, 2.4, p.d + 1.6, sx * hw, portal + 1.2, 0, blue);
    }
    for (const sz of [-1, 1]) k.box(p.w + 1.6, 2, 1.4, 0, portal + 1, sz * hd, blue);
    // The A-frame rising behind and in front, the apex carrying the boom stays.
    const apex = 46;
    for (const sx of [-1, 1]) {
      for (const [z0, z1] of [[-hd, -hd + 6], [hd, hd - 6]]) {
        const len = Math.hypot(apex - portal, z1 - z0);
        k.box(1.1, len, 1.1, sx * 3.2, (apex + portal) / 2, (z0 + z1) / 2, white, { rot: [Math.atan2(z1 - z0, apex - portal), 0, 0] });
      }
    }
    k.box(8, 1.4, 1.6, 0, apex, 0, white);
    // The boom: twin girders from the back reach out past the front legs over the ship, braced across.
    const back = -hd - 16, front = hd + 46, by = 31;
    for (const sx of [-1, 1]) k.box(1.2, 2.2, front - back, sx * 3, by, (front + back) / 2, white);
    for (let z = back + 3; z < front; z += 6) k.box(6, 0.4, 0.4, 0, by - 0.9, z, white, { castShadow: false });
    // Stays from the apex to the boom tip and the back.
    for (const tz of [front - 2, back + 2]) for (const sx of [-1, 1]) k.rod(0.12, [sx * 3, apex, 0], [sx * 3, by + 1, tz], dark, 6);
    // Machinery house on the back reach; the trolley and the operator's cab hanging under it; the spreader on its ropes.
    k.box(7.5, 4, 10, 0, by + 3, back + 6, white);
    k.box(7.6, 0.3, 10.1, 0, by + 5.1, back + 6, P.paint(0xb33a2a));
    const tz = hd + 14;
    k.box(6.4, 1.8, 5, 0, by - 1.9, tz, P.paint(0x3a4048));
    k.box(2.6, 2.6, 3, -1.6, by - 4.4, tz + 0.6, P.paint(0xe8e6e0));
    k.box(2.4, 1.6, 0.06, -1.6, by - 4.2, tz + 2.12, P.glass(0x9fc4dd, 0.55), { castShadow: false });
    const sy = 16;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod(0.04, [sx * 2, by - 2.8, tz + sz * 1.8], [sx * 2, sy + 0.4, tz + sz * 5], dark, 4);
    k.box(2.6, 0.5, 12.2, 0, sy, tz + 3.2, P.paint(0xd9a21c));
    // Red aircraft-warning lamps at the apex and the boom tip; floodlights under the portal.
    for (const at of [[0, apex + 0.9, 0], [3, by + 1.4, front - 0.5], [-3, by + 1.4, front - 0.5]] as const) k.sphere(0.25, at[0], at[1], at[2], P.emissive(0xff2a1a, 3), { seg: 8, castShadow: false });
    for (const sz of [-1, 1]) for (const sx of [-1, 0, 1]) k.box(0.9, 0.25, 0.5, sx * 5, portal - 0.2, sz * (hd - 1.2), P.emissive(0xfff1d6, 2), { castShadow: false });
  },

  straddleCarrier: (k, p) => {
    // Four tall legs on wheels, a frame across the top with the driver's cab, the spreader hanging inside.
    const yel = P.paint(0xd9a21c), dark = P.blackMetal();
    const hw = p.w / 2, hd = p.d / 2;
    for (const sx of [-1, 1]) {
      k.box(0.7, 1.2, p.d, sx * hw, 1.5, 0, yel);
      for (const sz of [-1, -0.33, 0.33, 1]) k.cyl(0.55, 0.55, 0.45, sx * hw, 0.55, sz * (hd - 0.6), P.rubber(), { rot: [0, 0, Math.PI / 2], seg: 14 });
      for (const sz of [-1, 1]) k.box(0.6, p.h - 2.4, 0.8, sx * hw, (p.h + 2.4) / 2 - 0.6, sz * (hd - 0.8), yel);
      k.box(0.8, 1.2, p.d, sx * hw, p.h - 0.6, 0, yel);
    }
    for (const sz of [-1, 1]) k.box(p.w + 0.8, 1, 0.8, 0, p.h - 0.5, sz * (hd - 0.8), yel);
    k.box(2, 2.2, 2.4, -hw + 0.3, p.h + 1, hd - 1.6, P.paint(0xf0ede6));
    k.box(1.9, 1.2, 0.05, -hw + 0.3, p.h + 1.3, hd - 0.38, P.glass(0x9fc4dd, 0.55), { castShadow: false });
    k.box(p.w - 1.2, 0.4, p.d - 2.5, 0, p.h - 3.6, 0, dark);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.rod(0.04, [sx * (hw - 0.8), p.h - 1, sz * (hd - 1.6)], [sx * (hw - 0.8), p.h - 3.4, sz * (hd - 1.6)], dark, 4);
    k.sphere(0.18, hw - 0.3, p.h + 0.2, hd - 0.4, P.emissive(0xff9a1a, 3), { seg: 8, castShadow: false });
  },

  lightMast: (k, p) => {
    // A tapered steel pole with a service ring and a crown of floodlights angled down at the yard.
    k.cyl(0.18, 0.38, p.h, 0, p.h / 2, 0, P.paint(0x8f979e), { seg: 10 });
    k.cyl(1.4, 1.4, 0.12, 0, p.h - 1.2, 0, P.steel(), { seg: 16, castShadow: false });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 1.1, z = Math.sin(a) * 1.1;
      k.box(0.7, 0.18, 0.5, x, p.h - 0.7, z, P.blackMetal(), { rot: [0, -a, 0.5], castShadow: false });
      k.box(0.62, 0.02, 0.42, x + Math.cos(a) * 0.05, p.h - 0.82, z + Math.sin(a) * 0.05, P.emissive(0xfff1d6, 3), { rot: [0, -a, 0.5], castShadow: false });
    }
  },

  xrayScanner: (k, p) => {
    // A drive-through portal: two pillars, the beam across the top, hazard stripes, a lamp.
    const yel = P.paint(0xe2b21e), dark = P.paint(0x24262a);
    for (const sx of [-1, 1]) {
      k.box(1, p.h, p.d, sx * (p.w / 2 - 0.5), p.h / 2, 0, P.paint(0xe9e7e2));
      for (let i = 0; i < 5; i++) k.box(1.02, 0.3, p.d + 0.02, sx * (p.w / 2 - 0.5), 0.3 + i * 0.6, 0, i % 2 ? yel : dark, { castShadow: false });
    }
    k.box(p.w, 1.2, p.d, 0, p.h - 0.6, 0, P.paint(0xe9e7e2));
    k.box(p.w - 0.4, 0.04, 0.3, 0, p.h - 1.22, 0, P.emissive(0x7fd3ff, 1.5), { castShadow: false });
    k.sphere(0.2, p.w / 2 - 0.5, p.h + 0.2, 0, P.emissive(0xff3b30, 3), { seg: 8, castShadow: false });
  },

  trailer: (k, p) => {
    const dark = P.paint(0x1f2124);
    for (const sz of [-1, 1]) k.box(p.w, 0.28, 0.18, 0, p.h - 0.15, sz * 0.5, dark);
    for (let x = -p.w / 2 + 0.5; x < p.w / 2; x += 1.5) k.box(0.12, 0.2, p.d - 0.1, x, p.h - 0.12, 0, dark, { castShadow: false });
    for (const x of [p.w / 2 - 1.2, p.w / 2 - 2.5]) for (const sz of [-1, 1]) k.cyl(0.5, 0.5, 0.35, x, 0.5, sz * (p.d / 2 - 0.3), P.rubber(), { rot: [Math.PI / 2, 0, 0], seg: 14 });
    for (const sz of [-1, 1]) k.box(0.12, p.h - 0.3, 0.12, -p.w / 2 + 2.5, (p.h - 0.3) / 2, sz * 0.8, P.steel());
  },

  jerseyBarrier: (k, p) => {
    k.box(p.w, 0.3, p.d, 0, 0.15, 0, P.concrete());
    k.box(p.w, p.h - 0.3, p.d * 0.45, 0, 0.3 + (p.h - 0.3) / 2, 0, P.concrete());
  },

  vendingMachine: (k, p) => {
    k.box(p.w, p.h, p.d, 0, p.h / 2, 0, P.paint(0xb31b1b));
    k.box(p.w * 0.62, p.h * 0.62, 0.02, -p.w * 0.12, p.h * 0.6, p.d / 2 + 0.01, P.screenOn('vend', (g, s) => {
      g.fillStyle = '#e8eef2'; g.fillRect(0, 0, s, s);
      const cols = ['#c1121f', '#1d3557', '#2a9d8f', '#f4a261', '#6a4c93'];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { g.fillStyle = cols[(r + c) % cols.length]; g.fillRect(6 + c * (s - 12) / 4, 6 + r * (s - 12) / 5, (s - 12) / 4 - 6, (s - 12) / 5 - 8); }
    }), { castShadow: false });
    k.box(p.w * 0.62, p.h * 0.62, 0.01, -p.w * 0.12, p.h * 0.6, p.d / 2 + 0.03, P.glass(0xffffff, 0.15), { castShadow: false });
    k.box(0.16, 0.5, 0.03, p.w * 0.36, p.h * 0.62, p.d / 2 + 0.01, P.blackMetal(), { castShadow: false });
    k.box(p.w * 0.5, 0.18, 0.05, -p.w * 0.12, 0.35, p.d / 2 + 0.02, P.blackMetal(), { castShadow: false });
  },

  warningSign: (k, p) => {
    // White panel with a red band, black lettering; on posts, or flat on a wall or fence.
    const posts = p.h > 1;
    const ph = 0.8, pw = p.w;
    const y = posts ? p.h - ph / 2 : ph / 2;
    if (posts) for (const sx of [-1, 1]) k.box(0.06, p.h, 0.06, sx * pw * 0.42, p.h / 2, -0.03, P.paint(0x8f979e));
    k.box(pw + 0.04, ph + 0.04, 0.03, 0, y, 0, P.paint(0x2a2c2e), { castShadow: false });
    k.box(pw, ph, 0.02, 0, y, 0.02, SIGNS[p.variant % SIGNS.length](), { castShadow: false });
  },
};

/** The signs' faces (lit a little, so they read at night). */
const SIGNS = [
  ['AUTHORISED', 'PERSONNEL ONLY', 'Terminal security · no entry'],
  ['STAFF ONLY', 'ID REQUIRED', 'Beyond this point, terminal staff only'],
  ['PRIVATE', 'NO ENTRY', 'Meridian Trading S.A. · keep out'],
  ['DOUANE · CUSTOMS', 'NO ENTRY', 'Authorised personnel only'],
].map(([head, big, small], i) => () => P.screenOn(`sign${i}`, (g, s) => {
  g.fillStyle = '#f4f2ec'; g.fillRect(0, 0, s, s);
  g.fillStyle = i === 2 ? '#1b3a26' : '#c0281f'; g.fillRect(0, 0, s, s * 0.34);
  // Each line shrunk to fit the panel's width.
  const line = (text: string, size: number, weight: string, y: number) => {
    g.font = `${weight} ${size}px sans-serif`;
    const w = g.measureText(text).width;
    if (w > s * 0.9) g.font = `${weight} ${size * (s * 0.9) / w}px sans-serif`;
    g.fillText(text, s / 2, y);
  };
  g.textAlign = 'center';
  g.fillStyle = '#ffffff'; line(head, s * 0.15, 'bold', s * 0.24);
  g.fillStyle = '#16181a'; line(big, s * 0.15, 'bold', s * 0.58);
  line(small, s * 0.07, '', s * 0.8);
  // Hazard stripes along the bottom edge.
  for (let x = -s; x < s; x += s * 0.12) { g.fillStyle = '#e2b21e'; g.beginPath(); g.moveTo(x, s); g.lineTo(x + s * 0.06, s * 0.9); g.lineTo(x + s * 0.12, s * 0.9); g.lineTo(x + s * 0.06, s); g.fill(); }
}));
