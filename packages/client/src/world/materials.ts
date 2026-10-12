import * as THREE from 'three';
import type { BlockMaterial } from '@gungame/shared';
import { paint } from './furniture/paint';
import { scrollingTextures } from './furniture/palette';
import { normalMapFrom } from './normalMaps';
import { canvasTexture, concreteTexture, crateTexture, floorTexture } from './textures';

/**
 * How each block material looks. `scale` is meters per texture tile; 'world' UVs tile evenly across
 * blocks of any size, 'box' UVs stretch one tile over each face (crates, paintings).
 */
interface MaterialSpec {
  color: number;
  texture?: () => THREE.Texture;
  scale?: number;
  uv?: 'world' | 'box';
  roughness?: number;
  metalness?: number;
  opacity?: number;
  alphaTest?: number;
  emissive?: number;
  castShadow?: boolean;
  /** Strength of the normal map derived from the texture (0 = flat). */
  bump?: number;
}

type Ctx = CanvasRenderingContext2D;

const noise = (g: Ctx, s: number, n: number, alpha: number, px: number, light = false) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = light ? `rgba(255,255,255,${Math.random() * alpha})` : `rgba(0,0,0,${Math.random() * alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, px, px);
  }
};
const fill = (g: Ctx, s: number, color: string) => { g.fillStyle = color; g.fillRect(0, 0, s, s); };

const tex = {
  grass: () => canvasTexture(128, (g, s) => {
    fill(g, s, '#5d8a3c');
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(30,60,15,.25)' : 'rgba(150,200,90,.2)';
      g.fillRect(Math.random() * s, Math.random() * s, 1, 3);
    }
  }),
  hedge: () => canvasTexture(64, (g, s) => {
    fill(g, s, '#2f5a26');
    noise(g, s, 500, 0.35, 3);
    noise(g, s, 200, 0.15, 2, true);
  }),
  speckled: (base: string, amount = 0.08) => () => canvasTexture(128, (g, s) => {
    fill(g, s, base);
    noise(g, s, 1400, amount, 2);
    noise(g, s, 400, amount * 0.6, 2, true);
  }),
  marble: () => canvasTexture(256, (g, s) => {
    fill(g, s, '#efebe4');
    g.strokeStyle = 'rgba(120,115,110,.25)';
    for (let i = 0; i < 9; i++) {
      g.lineWidth = Math.random() * 1.6 + 0.4;
      g.beginPath();
      g.moveTo(Math.random() * s, 0);
      g.bezierCurveTo(Math.random() * s, s * 0.3, Math.random() * s, s * 0.7, Math.random() * s, s);
      g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,.08)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, s, s);
  }),
  wood: () => canvasTexture(256, (g, s) => {
    const plank = s / 8;
    for (let i = 0; i < 8; i++) {
      const l = 38 + Math.random() * 14;
      g.fillStyle = `hsl(30, 45%, ${l}%)`;
      g.fillRect(0, i * plank, s, plank);
      g.fillStyle = 'rgba(0,0,0,.08)';
      for (let k = 0; k < 6; k++) g.fillRect(0, i * plank + Math.random() * plank, s, 1);
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(0, i * plank, s, 1);
      g.fillRect(((i * 97) % 8) * plank, i * plank, 1, plank);
    }
  }),
  tile: () => canvasTexture(128, (g, s) => {
    fill(g, s, '#f3f1ec');
    noise(g, s, 300, 0.04, 2);
    g.strokeStyle = 'rgba(0,0,0,.18)';
    g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      g.beginPath(); g.moveTo(i * s / 2, 0); g.lineTo(i * s / 2, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * s / 2); g.lineTo(s, i * s / 2); g.stroke();
    }
  }),
  pavers: () => canvasTexture(256, (g, s) => {
    fill(g, s, '#d9cdb5');
    noise(g, s, 1500, 0.07, 2);
    g.strokeStyle = 'rgba(80,65,40,.35)';
    g.lineWidth = 3;
    const row = s / 4;
    for (let r = 0; r < 4; r++) {
      g.beginPath(); g.moveTo(0, r * row); g.lineTo(s, r * row); g.stroke();
      const off = r % 2 ? s / 4 : 0;
      for (let c = 0; c < 3; c++) {
        const x = off + c * s / 2;
        g.beginPath(); g.moveTo(x, r * row); g.lineTo(x, (r + 1) * row); g.stroke();
      }
    }
  }),
  poolTile: () => canvasTexture(128, (g, s) => {
    fill(g, s, '#3fa7d6');
    g.strokeStyle = 'rgba(255,255,255,.45)';
    g.lineWidth = 1.5;
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(i * s / 8, 0); g.lineTo(i * s / 8, s); g.stroke();
      g.beginPath(); g.moveTo(0, i * s / 8); g.lineTo(s, i * s / 8); g.stroke();
    }
  }),
  books: () => canvasTexture(256, (g, s) => {
    fill(g, s, '#3b2414');
    const shelf = s / 4;
    const colors = ['#7b1e1e', '#1e3a7b', '#1e6b3a', '#a67c1e', '#5a1e6b', '#d9d0b8', '#2b2b2b', '#8a4a1e'];
    for (let r = 0; r < 4; r++) {
      let x = 4;
      while (x < s - 6) {
        const w = 5 + Math.random() * 9;
        const h = shelf * (0.6 + Math.random() * 0.3);
        g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        g.fillRect(x, (r + 1) * shelf - 6 - h, w, h);
        x += w + 1;
      }
      g.fillStyle = '#5a3a20';
      g.fillRect(0, (r + 1) * shelf - 6, s, 6);
    }
  }),
  serverRack: () => canvasTexture(128, (g, s) => {
    fill(g, s, '#16191d');
    for (let r = 0; r < 16; r++) {
      g.fillStyle = '#23272d';
      g.fillRect(6, r * 8 + 1, s - 12, 6);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = Math.random() < 0.7 ? '#36e07a' : '#ffb020';
        g.fillRect(12 + k * 6, r * 8 + 3, 2, 2);
      }
    }
  }),
  painting: () => canvasTexture(128, (g, s) => {
    const hue = Math.floor(Math.random() * 360);
    fill(g, s, `hsl(${hue},40%,25%)`);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `hsla(${(hue + Math.random() * 120) % 360},60%,${40 + Math.random() * 40}%,.7)`;
      g.beginPath();
      g.arc(Math.random() * s, Math.random() * s, 6 + Math.random() * 30, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#c9a24a';
    g.lineWidth = 10;
    g.strokeRect(0, 0, s, s);
  }),
  helipad: () => canvasTexture(256, (g, s) => {
    fill(g, s, '#3a3d42');
    noise(g, s, 800, 0.1, 2);
    g.strokeStyle = '#f2c230';
    g.lineWidth = 10;
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(s * 0.33, s * 0.28, s * 0.08, s * 0.44);
    g.fillRect(s * 0.59, s * 0.28, s * 0.08, s * 0.44);
    g.fillRect(s * 0.33, s * 0.46, s * 0.34, s * 0.08);
  }),
  ironGate: () => canvasTexture(64, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = '#1b1b1b';
    for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 4, s);
    g.fillRect(0, 0, s, 4);
  }),
  fence: () => canvasTexture(64, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = '#3c4a3c';
    g.lineWidth = 2;
    for (let i = -s; i < s * 2; i += 12) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke();
      g.beginPath(); g.moveTo(i, s); g.lineTo(i + s, 0); g.stroke();
    }
  }),
  cobble: () => canvasTexture(256, (g, s) => {
    fill(g, s, '#8f877a');
    const n = 8;
    const c = s / n;
    for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) {
      const off = r % 2 ? c / 2 : 0;
      g.fillStyle = `hsl(35, ${8 + Math.random() * 10}%, ${45 + Math.random() * 18}%)`;
      g.beginPath();
      g.roundRect((i * c + off) % s + 2, r * c + 2, c - 4, c - 4, 6);
      g.fill();
    }
    noise(g, s, 1500, 0.08, 2);
  }),
  waterRipples: () => {
    const t = canvasTexture(128, paint.ripples);
    scrollingTextures.push({ texture: t, speed: [0.02, 0.015] });
    return t;
  },
  palmTrunk: () => canvasTexture(64, (g, s) => {
    fill(g, s, '#8a6f4e');
    g.fillStyle = 'rgba(40,25,10,.35)';
    for (let y = 0; y < s; y += 8) g.fillRect(0, y, s, 2);
  }),
};

export const MATERIAL_SPECS: Record<BlockMaterial, MaterialSpec> = {
  arenaFloor: { color: 0xffffff, texture: floorTexture, scale: 2, bump: 1.5 },
  wall: { color: 0xc8c2b4, texture: concreteTexture, scale: 4, bump: 2 },
  pillar: { color: 0xb9b3a6, texture: concreteTexture, scale: 3, bump: 2 },
  lowWall: { color: 0x8f9aa3, texture: concreteTexture, scale: 2, bump: 2 },
  crate: { color: 0xffffff, texture: crateTexture, uv: 'box', bump: 2.5 },
  crateLight: { color: 0xd8c8a8, texture: crateTexture, uv: 'box', bump: 2.5 },
  crateGreen: { color: 0x9fb08a, texture: crateTexture, uv: 'box', bump: 2.5 },

  grass: { color: 0xffffff, texture: tex.grass, scale: 3, roughness: 1, bump: 2.5 },
  hedge: { color: 0xffffff, texture: tex.hedge, scale: 1.5, roughness: 1, bump: 3 },
  asphalt: { color: 0xffffff, texture: tex.speckled('#3d3f42', 0.15), scale: 3, roughness: 0.95, bump: 2 },
  stone: { color: 0xffffff, texture: tex.pavers, scale: 3, bump: 3 },
  poolTile: { color: 0xffffff, texture: tex.poolTile, scale: 1.2, roughness: 0.4, bump: 2.5 },
  water: { color: 0x3aa6e0, texture: tex.waterRipples, scale: 3, opacity: 0.68, roughness: 0.05, metalness: 0.1, emissive: 0x08304a, castShadow: false },
  court: { color: 0x3f7f9a, texture: tex.speckled('#ffffff', 0.05), scale: 4, roughness: 0.9, bump: 0.6 },
  courtLine: { color: 0xffffff, roughness: 0.8 },
  fence: { color: 0xffffff, texture: tex.fence, scale: 0.6, alphaTest: 0.5, castShadow: false },
  ironGate: { color: 0xffffff, texture: tex.ironGate, scale: 0.8, alphaTest: 0.5, metalness: 0.6 },
  palmTrunk: { color: 0xffffff, texture: tex.palmTrunk, scale: 1, bump: 3 },

  marble: { color: 0xffffff, texture: tex.marble, scale: 2, roughness: 0.25, bump: 0.5 },
  wood: { color: 0xffffff, texture: tex.wood, scale: 2.5, roughness: 0.6, bump: 2 },
  carpet: { color: 0xffffff, texture: tex.speckled('#d8d4cc', 0.12), scale: 1.5, roughness: 1, bump: 1.5 },
  tile: { color: 0xffffff, texture: tex.tile, scale: 1.2, roughness: 0.35, bump: 2.5 },
  plaster: { color: 0xf1ede6, texture: tex.speckled('#ffffff', 0.03), scale: 3, roughness: 0.9, bump: 0.8 },
  stucco: { color: 0xeadfc8, texture: tex.speckled('#ffffff', 0.09), scale: 2, roughness: 1, bump: 2.5 },
  ceiling: { color: 0xfafafa, roughness: 0.95 },
  concrete: { color: 0xb5b2aa, texture: concreteTexture, scale: 3, bump: 2.2 },
  roof: { color: 0xffffff, texture: tex.speckled('#5c5f63', 0.15), scale: 2, roughness: 0.9, bump: 2 },
  glass: { color: 0xbfe6ff, opacity: 0.22, roughness: 0.05, metalness: 0.1, castShadow: false },
  helipad: { color: 0xffffff, texture: tex.helipad, uv: 'box', roughness: 0.8, bump: 1 },
  trim: { color: 0xfbfaf6, roughness: 0.4 },
  windowFrame: { color: 0x2b2a28, roughness: 0.35, metalness: 0.6 },
  cobble: { color: 0xffffff, texture: tex.cobble, scale: 2.5, roughness: 0.9, bump: 5 },
  travertine: { color: 0xf0e6d2, texture: tex.pavers, scale: 2.5, roughness: 0.7, bump: 2.5 },

  darkWood: { color: 0xffffff, texture: tex.speckled('#4a2e1a', 0.12), scale: 1, roughness: 0.55, bump: 1.5 },
  metal: { color: 0x9aa0a6, roughness: 0.35, metalness: 0.8 },
  steel: { color: 0x7d858d, texture: tex.speckled('#c8ccd0', 0.06), scale: 2, roughness: 0.3, metalness: 0.85, bump: 0.6 },
  gold: { color: 0xf2c230, roughness: 0.2, metalness: 1 },
  fabric: { color: 0xffffff, texture: tex.speckled('#ffffff', 0.06), scale: 0.5, roughness: 1, bump: 1 },
  leather: { color: 0x5a3a24, roughness: 0.5 },
  books: { color: 0xffffff, texture: tex.books, scale: 1.8, roughness: 0.8, bump: 2.5 },
  screen: { color: 0x0d0f12, roughness: 0.15, metalness: 0.3 },
  serverRack: { color: 0xffffff, texture: tex.serverRack, scale: 2.2, roughness: 0.5, emissive: 0x0a1a0f, bump: 1.5 },
  painting: { color: 0xffffff, texture: tex.painting, uv: 'box', roughness: 0.7 },
  carPaint: { color: 0xffffff, roughness: 0.2, metalness: 0.6 },
  rubber: { color: 0x1e1f21, roughness: 1 },
};

const textureCache = new Map<BlockMaterial, THREE.Texture>();
const normalCache = new Map<BlockMaterial, THREE.Texture>();

export function createBlockMaterial(kind: BlockMaterial, tint?: number): THREE.MeshStandardMaterial {
  const spec = MATERIAL_SPECS[kind];
  let map: THREE.Texture | null = null;
  if (spec.texture) {
    map = textureCache.get(kind) ?? null;
    if (!map) textureCache.set(kind, (map = spec.texture()));
  }
  let normalMap: THREE.Texture | null = null;
  if (map && spec.bump) {
    normalMap = normalCache.get(kind) ?? null;
    if (!normalMap) normalCache.set(kind, (normalMap = normalMapFrom(map, spec.bump)));
  }
  const color = new THREE.Color(spec.color);
  if (tint !== undefined) color.multiply(new THREE.Color(tint));
  const transparent = spec.opacity !== undefined;
  if (kind === 'water') return waterMaterial(map, color);
  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    color,
    roughness: spec.roughness ?? 0.85,
    metalness: spec.metalness ?? 0,
    transparent,
    opacity: spec.opacity ?? 1,
    depthWrite: !transparent,
    alphaTest: spec.alphaTest ?? 0,
    side: spec.alphaTest ? THREE.DoubleSide : THREE.FrontSide,
    emissive: spec.emissive ?? 0x000000,
  });
}

/** Water: glossy with rippling normals that reflect the sky, tinted and see-through. */
function waterMaterial(map: THREE.Texture | null, color: THREE.Color): THREE.MeshStandardMaterial {
  const normalMap = map ? normalMapFrom(map, 4, 2) : null;
  if (normalMap) scrollingTextures.push({ texture: normalMap, speed: [-0.015, 0.02] });
  const m = new THREE.MeshStandardMaterial({
    color, normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
    transparent: true, opacity: 0.72, roughness: 0.04, metalness: 0.15, depthWrite: false, emissive: 0x062a40,
  });
  m.userData.envIntensity = 1.1;
  return m;
}

export const castsShadow = (kind: BlockMaterial) => MATERIAL_SPECS[kind].castShadow ?? true;
export const uvMode = (kind: BlockMaterial) => MATERIAL_SPECS[kind].uv ?? 'world';
export const uvScale = (kind: BlockMaterial) => MATERIAL_SPECS[kind].scale ?? 2;

/** Textures are shared across maps; call when the app shuts down (not on map change). */
export function disposeTextureCache(): void {
  for (const t of textureCache.values()) t.dispose();
  textureCache.clear();
}
