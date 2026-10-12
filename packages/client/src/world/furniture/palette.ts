import * as THREE from 'three';
import { canvasTexture } from '../textures';
import { normalMapFrom } from '../normalMaps';
import { paint } from './paint';

/** Shared materials for furniture. Every call with the same arguments returns the same material, which lets meshes merge. */
const cache = new Map<string, THREE.Material>();
const get = <T extends THREE.Material>(key: string, make: () => T): T => {
  let m = cache.get(key) as T | undefined;
  if (!m) cache.set(key, (m = make()));
  return m;
};
const textures = new Map<string, THREE.Texture>();
const tex = (key: string, make: () => THREE.Texture, repeat = 1) => {
  let t = textures.get(key);
  if (!t) {
    t = make();
    t.repeat.set(repeat, repeat);
    textures.set(key, t);
  }
  return t;
};

/** Normal map derived from a cached texture (see normalMaps.ts). */
const nrm = (key: string, strength: number) => {
  const k = `n:${key}`;
  let t = textures.get(k);
  if (!t) textures.set(k, (t = normalMapFrom(textures.get(key)!, strength)));
  return t;
};

type Std = THREE.MeshStandardMaterialParameters;
const std = (key: string, p: Std) => get(key, () => new THREE.MeshStandardMaterial(p));

/** Textures that scroll every frame (water). */
export const scrollingTextures: { texture: THREE.Texture; speed: [number, number] }[] = [];

export const P = {
  fabric: (color: number) => std(`fabric${color}`, {
    color, map: tex('weave', () => canvasTexture(64, paint.weave), 4), normalMap: nrm('weave', 2), roughness: 0.95,
  }),
  velvet: (color: number) => std(`velvet${color}`, {
    color, map: tex('velvetT', () => canvasTexture(64, paint.velvet), 2), normalMap: nrm('velvetT', 1), roughness: 0.75, metalness: 0.05,
  }),
  leather: (color = 0x5a3220) => std(`leather${color}`, {
    color, map: tex('leatherT', () => canvasTexture(128, paint.leather), 2), normalMap: nrm('leatherT', 2.5), roughness: 0.45, metalness: 0.05,
  }),
  wood: (color = 0xffffff) => std(`wood${color}`, {
    color, map: tex('woodgrain', () => canvasTexture(128, paint.woodGrain), 1), normalMap: nrm('woodgrain', 1.2), roughness: 0.55,
  }),
  walnut: () => P.wood(0x7a5134),
  oak: () => P.wood(0xd9b98c),
  ebony: () => std('ebony', { color: 0x141210, roughness: 0.15, metalness: 0.1 }),
  lacquer: (color = 0xf4f2ee) => std(`lacq${color}`, { color, roughness: 0.25 }),
  paint: (color: number) => std(`paint${color}`, { color, roughness: 0.6 }),
  chrome: () => std('chrome', { color: 0xe8ecef, roughness: 0.08, metalness: 1 }),
  brass: () => std('brass', { color: 0xd4a94d, roughness: 0.25, metalness: 1 }),
  gold: () => std('gold', { color: 0xf5c84a, roughness: 0.18, metalness: 1 }),
  blackMetal: () => std('blackmetal', { color: 0x1c1d20, roughness: 0.4, metalness: 0.7 }),
  steel: () => std('steel', { color: 0x9aa2aa, roughness: 0.3, metalness: 0.9 }),
  iron: () => std('iron', { color: 0x222426, roughness: 0.55, metalness: 0.6 }),
  marble: (color = 0xffffff) => std(`marble${color}`, {
    color, map: tex('marbleF', () => canvasTexture(256, paint.marble), 1), normalMap: nrm('marbleF', 0.4), roughness: 0.15,
  }),
  stone: (color = 0xe8e0d0) => std(`stone${color}`, {
    color, map: tex('stoneF', () => canvasTexture(128, paint.stone), 1), normalMap: nrm('stoneF', 3), roughness: 0.85,
  }),
  travertine: () => P.stone(0xe6d6bb),
  concrete: () => std('concreteF', { color: 0xa9a7a2, map: tex('stoneF', () => canvasTexture(128, paint.stone), 1), normalMap: nrm('stoneF', 3), roughness: 0.9 }),
  ceramic: (color = 0xfbfbfb) => std(`ceramic${color}`, { color, roughness: 0.12 }),
  terracotta: () => std('terracotta', { color: 0xb8643c, roughness: 0.85 }),
  glass: (color = 0xd8eef8, opacity = 0.25) => std(`glass${color}${opacity}`, {
    color, transparent: true, opacity, roughness: 0.02, metalness: 0.2, depthWrite: false,
  }),
  mirror: () => std('mirror', { color: 0xdfe6ea, roughness: 0.02, metalness: 1 }),
  rubber: () => std('rubberF', { color: 0x1a1b1d, roughness: 0.95 }),
  plastic: (color: number) => std(`plastic${color}`, { color, roughness: 0.35 }),
  screen: () => std('screenF', { color: 0x050608, roughness: 0.08, metalness: 0.5 }),
  screenOn: (key: string, draw: (g: CanvasRenderingContext2D, s: number) => void) => std(`screenOn${key}`, {
    color: 0x000000, emissive: 0xffffff, emissiveMap: tex(`scr${key}`, () => canvasTexture(256, draw), 1), roughness: 0.1,
  }),
  emissive: (color: number, intensity = 1.5) => std(`emit${color}${intensity}`, { color, emissive: color, emissiveIntensity: intensity }),
  lampshade: (color = 0xf7efe0) => std(`shade${color}`, { color, emissive: 0xffd9a0, emissiveIntensity: 0.35, roughness: 0.9, side: THREE.DoubleSide }),
  leaf: (color = 0x3f7a2a) => std(`leaf${color}`, { color, roughness: 0.8, side: THREE.DoubleSide }),
  frond: () => get('frond', () => new THREE.MeshStandardMaterial({
    map: tex('frondTex', () => canvasTexture(128, paint.frond), 1), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8,
  })),
  foliage: (color = 0x3c6e2c) => std(`foliage${color}`, {
    color, map: tex('foliageT', () => canvasTexture(64, paint.foliage), 1), normalMap: nrm('foliageT', 4), roughness: 0.95,
  }),
  bark: () => std('bark', { color: 0x8a6f4e, map: tex('barkT', () => canvasTexture(64, paint.bark), 1), normalMap: nrm('barkT', 4), roughness: 1 }),
  soil: () => std('soil', { color: 0x3b2a1e, roughness: 1 }),
  water: () => get('waterF', () => {
    const t = canvasTexture(128, paint.ripples);
    t.repeat.set(2, 2);
    scrollingTextures.push({ texture: t, speed: [0.03, 0.02] });
    return new THREE.MeshStandardMaterial({
      color: 0x5cc3ee, map: t, transparent: true, opacity: 0.7, roughness: 0.05, metalness: 0.2, depthWrite: false,
    });
  }),
  waterfall: () => get('waterfall', () => {
    const t = canvasTexture(64, paint.streaks);
    t.repeat.set(4, 1);
    scrollingTextures.push({ texture: t, speed: [0, 1.2] });
    return new THREE.MeshStandardMaterial({
      color: 0xdff4ff, map: t, alphaMap: t, transparent: true, opacity: 0.85, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false,
    });
  }),
  books: () => std('booksF', { map: tex('booksT', () => canvasTexture(256, paint.books), 1), normalMap: nrm('booksT', 2), roughness: 0.8 }),
  bottles: () => std('bottlesF', { map: tex('bottlesT', () => canvasTexture(128, paint.bottles), 1), roughness: 0.3 }),
  rug: (style: number) => std(`rug${style}`, {
    map: tex(`rugT${style}`, () => canvasTexture(512, (g, s) => paint.rug(g, s, style)), 1), normalMap: nrm(`rugT${style}`, 1.5), roughness: 1,
  }),
  medallion: () => std('medallion', {
    map: tex('medallionT', () => canvasTexture(512, paint.medallion), 1), roughness: 0.15, transparent: true, alphaTest: 0.5,
  }),
  art: (seed: number) => std(`art${seed}`, { map: tex(`artT${seed}`, () => canvasTexture(256, (g, s) => paint.art(g, s, seed)), 1), roughness: 0.7 }),
  carPaint: (color: number) => std(`car${color}`, { color, roughness: 0.15, metalness: 0.7 }),
  felt: (color = 0x1f6b3a) => std(`felt${color}`, { color, roughness: 1 }),
  led: (color: number) => std(`led${color}`, { color, emissive: color, emissiveIntensity: 3 }),
  serverFace: () => std('serverFaceF', {
    color: 0x22262c, map: tex('serverT', () => canvasTexture(128, paint.serverFace), 1),
    emissive: 0xffffff, emissiveMap: tex('serverE', () => canvasTexture(128, paint.serverLeds), 1), roughness: 0.4, metalness: 0.5,
  }),
  money: () => std('money', { map: tex('moneyT', () => canvasTexture(64, paint.money), 1), roughness: 0.9 }),
  netMesh: () => get('netMesh', () => new THREE.MeshStandardMaterial({
    map: tex('netT', () => canvasTexture(64, paint.net), 6), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1,
  })),
  flower: (color: number) => std(`flower${color}`, { color, roughness: 0.7 }),
};

export type Mat = THREE.Material;
