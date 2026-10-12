import { doorway, glazing, MapBuilder, rect, type FurnitureOptions, type Opening, type Rect, type WallMaterial } from './builder';
import type { Facing, FurnitureType } from './furniture';
import type { BlockMaterial, MapDef } from './types';

/**
 * "The Mansion": a Beverly Hills estate.
 *
 * Coordinates: +x east, -z north (the back of the house), y up, meters.
 * The front gate is on the south edge of the lot; the house faces south onto a fountain court.
 *
 * Storeys (floor-top heights): basement 0, ground 4.2, second 8.4, third 12.6, roof 16.8.
 * Outdoor ground is at ground-floor height, so the basement is truly underground.
 *
 * Layout at a glance (house footprint x -22..22, z -18..6; garage x 22..36, z -10..6):
 *
 *   Ground:  Library | Dining | Grand Foyer | Service stairs | Office | Mudroom   (front, z -6..6)
 *            Kitchen          | Great Room  | Media Lounge & Bar                  (back,  z -18..-6)
 *   Second:  bedrooms + playroom (west), gallery over the foyer, upper lounge,
 *            master suite with walk-in closet and bath (east)
 *   Third:   penthouse study over the foyer, wraparound rooftop terrace
 *   Roof:    helipad
 *   Basement: gallery hall, home theater, wine cellar, gym, server room,
 *             security room (live camera monitors), vault
 *
 * Structure is built from blocks; furniture and landscaping are detailed props (see furniture.ts)
 * with invisible collision boxes.
 */
export const MANSION_LEVELS = [0, 4.2, 8.4, 12.6, 16.8] as const;
const [B, G, F2, F3, R] = MANSION_LEVELS;
const SLAB = 0.3;
/** Top of the walls on a storey (underside of the slab above). */
const ceil = (floorTop: number) => floorTop + 4.2 - SLAB;

const LOT = 45;
const HX0 = -22, HX1 = 22, HZ0 = -18, HZ1 = 6;
const EXT = 0.4;
const HOUSE = rect(HX0 - 0.2, HZ0 - 0.2, HX1 + 0.2, HZ1 + 0.2);
const GARAGE = rect(22.2, -10.2, 36.2, 6.2);
const POOL = rect(-10, -36, 10, -28);

// Service stairwell (x 6..10, z -6..6): two lanes split by a divider; flights switch lanes and direction each storey.
const LANE_A: [number, number] = [6.1, 7.7];
const LANE_B: [number, number] = [7.9, 9.9];
const FLIGHT_N = -3.6;
const FLIGHT_S = 1.0;
const laneRect = (lane: [number, number]): Rect => rect(lane[0], FLIGHT_N, lane[1], FLIGHT_S);

const IN: WallMaterial = 'plaster';
/** Exterior wall whose +z / +x face is outside. */
const OUT_POS: WallMaterial = ['plaster', 'stucco'];
/** Exterior wall whose -z / -x face is outside. */
const OUT_NEG: WallMaterial = ['stucco', 'plaster'];

const BASEMENT = 'Basement', GROUND = 'Ground Floor', SECOND = 'Second Floor', THIRD = 'Third Floor', ROOF = 'Roof', GROUNDS = 'Grounds';

/** Furniture placement shorthand used throughout this file. */
type Place = (type: FurnitureType, x: number, y: number, z: number, face?: Facing, opts?: FurnitureOptions) => void;
let f: Place;

export function createMansionMap(): MapDef {
  const m = new MapBuilder();
  f = (type, x, y, z, face = 'south', opts = {}) => m.furniture(type, x, y, z, face, opts);
  buildGrounds(m);
  buildExterior(m);
  buildBasement(m);
  buildGroundFloor(m);
  buildGarage(m);
  buildSecondFloor(m);
  buildThirdFloor(m);
  buildRoof(m);
  buildServiceStairs(m);
  buildSecurityCameras(m);
  buildZones(m);
  return {
    id: 'mansion',
    name: 'The Mansion',
    halfSize: LOT,
    groundMaterial: 'concrete',
    blocks: m.blocks,
    props: m.props,
    zones: m.zones,
    playerSpawn: { x: 0, y: G, z: 41 },
    spawnYaw: 0,
  };
}

// ---------------------------------------------------------------------------
// Shared pieces

/** The four exterior walls of the house for one storey. */
function shell(m: MapBuilder, y0: number, y1: number,
  open: { s?: Opening[]; n?: Opening[]; w?: Opening[]; e?: Opening[] }, inner: BlockMaterial = 'plaster', outer: BlockMaterial = 'stucco'): void {
  m.wall(HX0 - 0.2, HZ1, HX1 + 0.2, HZ1, y0, y1, [inner, outer], { thickness: EXT, openings: open.s });
  m.wall(HX0 - 0.2, HZ0, HX1 + 0.2, HZ0, y0, y1, [outer, inner], { thickness: EXT, openings: open.n });
  m.wall(HX0, HZ0 + 0.2, HX0, HZ1 - 0.2, y0, y1, [outer, inner], { thickness: EXT, openings: open.w });
  m.wall(HX1, HZ0 + 0.2, HX1, HZ1 - 0.2, y0, y1, [inner, outer], { thickness: EXT, openings: open.e });
}

/** A table with chairs on its long sides (and optionally the ends). The table runs along x. */
function diningSet(x: number, y: number, z: number, w: number, d: number, perSide: number, ends: boolean, chair: FurnitureType = 'diningChair', color?: number): void {
  f('diningTable', x, y, z, 'south', { w, d });
  const spacing = w / perSide;
  for (let i = 0; i < perSide; i++) {
    const cx = x - w / 2 + spacing * (i + 0.5);
    f(chair, cx, y, z - d / 2 - 0.32, 'south', { color });
    f(chair, cx, y, z + d / 2 + 0.32, 'north', { color });
  }
  if (ends) {
    f(chair, x - w / 2 - 0.35, y, z, 'east', { color });
    f(chair, x + w / 2 + 0.35, y, z, 'west', { color });
  }
}

/** A bedroom suite: bed against a wall plus a nightstand each side. `head` is the wall the headboard is on. */
function bedroom(x: number, y: number, z: number, head: 'north' | 'east' | 'west', w: number, color: number): void {
  const face: Facing = head === 'north' ? 'south' : head === 'east' ? 'west' : 'east';
  f('bed', x, y, z, face, { w, color });
  const side = w / 2 + 0.35;
  const back = 2.25 / 2 - 0.25;
  if (head === 'north') {
    f('nightstand', x - side, y, z - back, 'south');
    f('nightstand', x + side, y, z - back, 'south');
  } else {
    const dx = head === 'east' ? back : -back;
    f('nightstand', x + dx, y, z - side, face);
    f('nightstand', x + dx, y, z + side, face);
  }
}

// ---------------------------------------------------------------------------
// Grounds

function buildGrounds(m: MapBuilder): void {
  // Land beyond the property line, so the estate doesn't float in the sky.
  m.slab(rect(-160, -160, 160, 160), G, 'grass', { holes: [rect(-LOT, -LOT, LOT, LOT)] });
  m.slab(rect(-LOT, -LOT, LOT, LOT), G, 'grass', { holes: [HOUSE, GARAGE, POOL] });

  // Perimeter wall with stone piers and caps; the main gate is on the south side.
  const W = LOT - 0.3;
  const top = G + 3.2;
  m.wall(-LOT, W, LOT, W, G, top, 'stucco', { thickness: 0.6, openings: [{ from: -4, to: 4, bottom: 0, top: 3.2 }] });
  m.wall(-LOT, -W, LOT, -W, G, top, 'stucco', { thickness: 0.6 });
  m.wall(-W, -W + 0.3, -W, W - 0.3, G, top, 'stucco', { thickness: 0.6 });
  m.wall(W, -W + 0.3, W, W - 0.3, G, top, 'stucco', { thickness: 0.6 });
  m.box(-LOT, top, -W - 0.4, LOT, top + 0.12, -W + 0.4, 'travertine');
  m.box(-LOT, top, W - 0.4, -4, top + 0.12, W + 0.4, 'travertine');
  m.box(4, top, W - 0.4, LOT, top + 0.12, W + 0.4, 'travertine');
  m.box(-W - 0.4, top, -W + 0.4, -W + 0.4, top + 0.12, W - 0.4, 'travertine');
  m.box(W - 0.4, top, -W + 0.4, W + 0.4, top + 0.12, W - 0.4, 'travertine');
  for (let t = -LOT + 5; t < LOT; t += 10) {
    for (const [x, z] of [[t, W], [t, -W], [W, t], [-W, t]]) {
      if (z === W && Math.abs(x) < 8) continue;
      m.box(x - 0.5, G, z - 0.5, x + 0.5, top + 0.5, z + 0.5, 'stucco');
      m.box(x - 0.6, top + 0.5, z - 0.6, x + 0.6, top + 0.62, z + 0.6, 'travertine');
    }
  }
  // Gate piers with lanterns, and ornate gates swung open.
  for (const sx of [-1, 1]) {
    m.box(sx * 4, G, W - 0.7, sx * 5.4, G + 4.4, W + 0.7, 'stone');
    m.box(sx * 3.9, G + 4.4, W - 0.8, sx * 5.5, G + 4.6, W + 0.8, 'travertine');
    f('urnPlanter', sx * 4.7, G + 4.6, W, 'south');
  }
  f('gateLeaf', -3.95, G, W - 2.3, 'east');
  f('gateLeaf', 3.95, G, W - 2.3, 'west');
  f('hedgeWall', -26, G, W - 0.95, 'south', { w: 36 });
  f('hedgeWall', 26, G, W - 0.95, 'south', { w: 36 });

  // Cobbled driveway: entry drive, fountain loop, motor court and garage apron.
  m.overlay(-4, 32, 4, W - 0.3, G, 'cobble');
  m.overlay(-9, 16, 9, 32, G, 'cobble');
  m.overlay(-14, 6.2, 37, 16, G, 'cobble');
  f('grandFountain', 0, G, 24);
  for (const z of [34, 38, 42]) {
    f('palm', -6.5, G, z, 'south', { h: 8.5, variant: z });
    f('palm', 6.5, G, z, 'south', { h: 8.5, variant: z + 1 });
  }
  for (const z of [36, 40]) {
    f('lampPost', -4.6, G, z);
    f('lampPost', 4.6, G, z);
  }
  for (const z of [18, 24, 30]) {
    f('palm', -11, G, z, 'south', { h: 9.5, variant: z });
    f('palm', 11, G, z, 'south', { h: 9.5, variant: z + 3 });
  }
  for (const x of [-12, 12, 24, 35]) f('lampPost', x, G, 15.2, 'south', { variant: 1 });
  // Lamp light after dark, by the gate and in front of the house.
  for (const [x, z] of [[-4.6, 38], [4.6, 38], [-12, 15.2], [12, 15.2]]) {
    m.props.push({ kind: 'light', x, y: G + 3.4, z, color: 0xffc98a, intensity: 18, distance: 18, fixture: false, nightOnly: true });
  }
  f('car', 8, G, 12, 'east', { variant: 2, color: 0x1b2a4a });
  f('flowerBed', -11.8, G, 16.6, 'south', { w: 4.4, d: 1 });
  f('flowerBed', 23, G, 16.6, 'south', { w: 26, d: 1 });
  for (const sx of [-1, 1]) {
    f('flowerBed', sx * 14, G, 40, 'south', { w: 8, d: 1.6, variant: 1 });
    f('oliveTree', sx * 26, G, 30);
    f('oliveTree', sx * 34, G, 36);
    f('statue', sx * 20, G, 34, 'south', { variant: 1 });
  }
  // Cypress rows along the side walls.
  for (let z = -40; z <= 40; z += 8) {
    if (z > -22 && z < 20) f('cypress', 42.5, G, z, 'south', { h: 6.5 });
    if (z < -20 || z > 18) f('cypress', -42.5, G, z, 'south', { h: 6.5 });
  }

  // West garden: fountain, flower beds, benches, statue.
  m.overlay(-37, 5.5, -26, 10.5, G, 'travertine');
  f('gardenFountain', -33, G, 8);
  f('flowerBed', -33, G, 3.2, 'south', { w: 6, d: 1.2 });
  f('flowerBed', -33, G, 12.8, 'south', { w: 6, d: 1.2 });
  f('gardenBench', -37.8, G, 8, 'east');
  f('statue', -33, G, 20);
  for (const [x, z] of [[-30, 26], [-38, 22], [-38, -2], [-29, -6], [40, -10], [40, 2], [40, 12]]) f('palm', x, G, z, 'south', { h: 9, variant: x + z });
  f('gardenBench', 38, G, -4, 'west');
  f('oliveTree', 34, G, -18);

  // Back patio: outdoor dining by the kitchen, fire-pit lounge by the media room.
  m.overlay(HX0, -26, HX1, HZ0 - 0.2, G, 'travertine');
  f('outdoorTable', -14.5, G, -22.3);
  for (const [dx, dz, face] of [[0, -0.9, 'south'], [0, 0.9, 'north'], [-0.9, 0, 'east'], [0.9, 0, 'west']] as const) {
    f('outdoorChair', -14.5 + dx, G, -22.3 + dz, face);
  }
  f('umbrella', -14.5, G, -22.3, 'south', { color: 0xf2efe8 });
  f('firePit', 12, G, -22.2);
  f('outdoorSofa', 12, G, -24.4, 'north');
  f('outdoorChair', 10, G, -22.2, 'east');
  f('outdoorChair', 14, G, -22.2, 'west');
  f('urnPlanter', -4, G, -19, 'south', { color: 0xf783ac });
  f('urnPlanter', 4, G, -19, 'south', { color: 0xf783ac });

  // Pool deck (laid in strips around the pool opening) with travertine coping.
  m.overlay(-15, -41, 15, -36, G, 'travertine');
  m.overlay(-15, -28, 15, -26, G, 'travertine');
  m.overlay(-15, -36, -10, -28, G, 'travertine');
  m.overlay(10, -36, 15, -28, G, 'travertine');
  m.box(POOL.x0 - 0.4, G, POOL.z0 - 0.4, POOL.x1 + 0.4, G + 0.06, POOL.z0, 'travertine');
  m.box(POOL.x0 - 0.4, G, POOL.z1, POOL.x1 + 0.4, G + 0.06, POOL.z1 + 0.4, 'travertine');
  m.box(POOL.x0 - 0.4, G, POOL.z0, POOL.x0, G + 0.06, POOL.z1, 'travertine');
  m.box(POOL.x1, G, POOL.z0, POOL.x1 + 0.4, G + 0.06, POOL.z1, 'travertine');

  // Pool: 1.3 m shallow end with entry steps (west), stepped slope down to a 3.2 m deep end (east),
  // tiled, lit, with a lion-head wall fountain spilling into it.
  const shallow = G - 1.3;
  const deep = G - 3.2;
  const [ix0, ix1, iz0, iz1] = [POOL.x0 + 0.3, POOL.x1 - 0.3, POOL.z0 + 0.3, POOL.z1 - 0.3];
  m.box(POOL.x0, deep - 0.3, POOL.z0, POOL.x1, deep, POOL.z1, 'poolTile');
  m.box(ix0, deep, iz0, -2, shallow, iz1, 'poolTile');
  m.stairs('x', [iz0, iz1], 2, -2, deep, shallow, 'poolTile');
  m.box(POOL.x0, deep, POOL.z0, POOL.x1, G, POOL.z0 + 0.3, 'poolTile');
  m.box(POOL.x0, deep, POOL.z1 - 0.3, POOL.x1, G, POOL.z1, 'poolTile');
  m.box(POOL.x0, deep, iz0, ix0, G, iz1, 'poolTile');
  m.box(ix1, deep, iz0, POOL.x1, G, iz1, 'poolTile');
  m.stairs('x', [-33, -31], -7.2, ix0, shallow, G, 'poolTile');
  m.box(ix0, deep, iz0, ix1, G - 0.25, iz1, 'water');
  for (const x of [-6, -2, 2, 6]) {
    const y = x < 0 ? G - 1.0 : G - 2.2;
    f('poolLight', x, y, iz0 + 0.01, 'south');
    f('poolLight', x, y, iz1 - 0.01, 'north');
  }
  f('wallFountain', 0, G, -37.1, 'south');
  f('poolFloat', 5, G - 0.3, -31);
  for (const x of [-12, -8.5, -5.5, 5.5, 8.5, 12]) f('lounger', x, G, -39.6, 'south', { color: 0xf6f3ec });
  for (const x of [-10.25, 7]) f('umbrella', x, G, -40.3, 'south', { color: 0x2f6b8a });
  for (const [x, z] of [[-16, -24], [16, -24], [-16, -42], [16, -42]]) f('palm', x, G, z, 'south', { h: 9, variant: x * z });

  // Pool cabana: columns, timber roof, bar with stools, lounge.
  m.overlay(16, -40, 24, -33, G, 'wood');
  for (const [x, z] of [[16.4, -39.6], [23.6, -39.6], [16.4, -33.4], [23.6, -33.4]]) f('column', x, G, z, 'south', { h: 3.2, w: 0.5, d: 0.5 });
  m.box(15.8, G + 3.2, -40.2, 24.2, G + 3.5, -32.8, 'wood');
  m.box(15.7, G + 3.5, -40.3, 24.3, G + 3.62, -32.7, 'trim');
  f('barCounter', 20, G, -38.9, 'south', { w: 4.5 });
  for (const x of [18.6, 20, 21.4]) f('barStool', x, G, -37.9, 'north');
  f('outdoorSofa', 20, G, -34.2, 'north', { w: 3 });
  f('sconce', 20, G + 2.4, -39.95, 'south');
  m.light(20, G + 3.0, -36.5, 0xffd9a0, 8, 10);

  // Tennis court, fenced, entrance on the east side.
  m.overlay(-41.5, -43.5, -26.5, -20.5, G, 'court');
  const ly = G + 0.03;
  const lines: [number, number, number, number][] = [
    [-39.5, -43, -28.5, -42.9], [-39.5, -21.1, -28.5, -21], [-39.5, -43, -39.4, -21], [-28.6, -43, -28.5, -21],
    [-38.2, -43, -38.1, -21], [-29.9, -43, -29.8, -21],
    [-34.05, -38, -33.95, -26], [-38.2, -38.05, -29.8, -37.95], [-38.2, -26.05, -29.8, -25.95],
  ];
  for (const [x0, z0, x1, z1] of lines) m.overlay(x0, z0, x1, z1, ly, 'courtLine');
  f('tennisNet', -34, G, -32, 'south', { w: 12 });
  f('umpireChair', -40.7, G, -32, 'east');
  m.wall(-41.5, -43.5, -26.5, -43.5, G, G + 3.5, 'fence', { thickness: 0.05, trim: false });
  m.wall(-41.5, -20.5, -26.5, -20.5, G, G + 3.5, 'fence', { thickness: 0.05, trim: false });
  m.wall(-41.5, -43.5, -41.5, -20.5, G, G + 3.5, 'fence', { thickness: 0.05, trim: false });
  m.wall(-26.5, -43.5, -26.5, -20.5, G, G + 3.5, 'fence', { thickness: 0.05, trim: false, openings: [{ from: -33, to: -31, bottom: 0, top: 3.5 }] });
  f('gardenBench', -24.6, G, -36, 'west');
  f('gardenBench', -24.6, G, -28, 'west');

  // Garden paths: west side of the house, and patio to the tennis court.
  m.overlay(-26, HZ0 - 0.2, -23, 16, G, 'travertine');
  m.overlay(-26.5, -33, -15, -31, G, 'travertine');
}

// ---------------------------------------------------------------------------
// House exterior: entrance portico, cornices, planting and lighting against the facade

function buildExterior(m: MapBuilder): void {
  // Cornice bands at each floor line.
  for (const y of [F2, F3]) {
    m.box(HX0 - 0.45, y - 0.38, HZ1 + 0.2, HX1 + 0.45, y + 0.04, HZ1 + 0.42, 'trim');
    m.box(HX0 - 0.45, y - 0.38, HZ0 - 0.42, HX1 + 0.45, y + 0.04, HZ0 - 0.2, 'trim');
    m.box(HX0 - 0.42, y - 0.38, HZ0 - 0.2, HX0 - 0.2, y + 0.04, HZ1 + 0.2, 'trim');
    m.box(HX1 + 0.2, y - 0.38, HZ0 - 0.2, HX1 + 0.42, y + 0.04, -10.2, 'trim');
  }
  // Entrance portico: four columns carrying a canopy over the front door.
  const ch = ceil(G) - G;
  for (const x of [-6.5, -2.6, 2.6, 6.5]) f('column', x, G, 8.8, 'south', { h: ch });
  m.box(-7.3, ceil(G), 6.2, 7.3, ceil(G) + 0.45, 9.6, 'stucco');
  m.box(-7.45, ceil(G) + 0.45, 6.2, 7.45, ceil(G) + 0.6, 9.75, 'trim');
  m.box(-7, G, 6.2, 7, G + 0.06, 9.4, 'marble');
  // Front doors standing open.
  for (const sx of [-1, 1]) {
    m.box(sx * 1.46, G, 4.3, sx * 1.56, G + 3.3, 5.8, 'darkWood');
    m.box(sx * 1.38, G + 1.1, 4.4, sx * 1.46, G + 1.9, 4.46, 'gold');
  }
  for (const sx of [-1, 1]) {
    f('topiary', sx * 2.4, G, 6.95, 'south', { variant: 1 });
    f('statue', sx * 4.3, G, 10.2, 'south', { variant: 1 });
    f('sconce', sx * 2.05, G + 2.2, HZ1 + 0.2, 'south');
    f('sconce', sx * 2.05, G + 2.2, HZ0 - 0.2, 'north');
  }
  f('sconce', 20, G + 2.2, HZ1 + 0.2, 'south');
  f('flowerBed', -14, G, 7.0, 'south', { w: 12.8, d: 1.2 });
  f('flowerBed', 13.5, G, 7.0, 'south', { w: 10.6, d: 1.2 });
}

// ---------------------------------------------------------------------------
// Basement (y 0 .. 3.9)

function buildBasement(m: MapBuilder): void {
  const y0 = B, y1 = ceil(B);
  shell(m, y0, y1, {}, 'plaster', 'concrete');

  m.wall(HX0 + 0.2, 2, 5.9, 2, y0, y1, IN, { openings: [doorway(-15, 1.6), doorway(-1, 1.4)] });
  m.wall(-8, HZ0 + 0.2, -8, 1.9, y0, y1, IN);
  m.wall(HX0 + 0.2, -8, 5.9, -8, y0, y1, IN, { openings: [doorway(-11), doorway(2)] });
  m.wall(6, -8.1, 6, HZ1 - 0.2, y0, y1, IN, { openings: [doorway(3.7, 1.4)] });
  m.wall(6.1, -6, 9.9, -6, y0, y1, IN, { openings: [doorway(8.9, 1.4)] });
  m.wall(10, -6, 10, HZ1 - 0.2, y0, y1, IN, { openings: [doorway(3.7, 1.4)] });
  // Vault: steel walls; the round vault door stands open.
  m.wall(10, HZ0 + 0.2, 10, -6, y0, y1, 'steel', { thickness: 0.6 });
  m.wall(10.3, -6, HX1 - 0.2, -6, y0, y1, 'steel', { thickness: 0.6, openings: [doorway(19.4, 1.6, 2.6)] });
  f('vaultDoor', 20.43, y0, -4.75, 'south');

  // Floors.
  m.overlay(-21.8, 2.1, 5.9, 5.8, y0, 'marble');
  m.overlay(-21.8, -7.9, -8.1, 1.9, y0, 'carpet', 0x7a1f2a);
  m.overlay(-7.9, -7.9, 5.9, 1.9, y0, 'tile', 0xc0704a);
  m.overlay(-21.8, -17.8, -8.1, -8.1, y0, 'rubber');
  m.overlay(-7.9, -17.8, 9.9, -8.1, y0, 'tile', 0xcfd6dc);
  m.overlay(6.1, -8.1, 9.9, -6.1, y0, 'tile', 0xcfd6dc);
  m.overlay(10.1, -5.7, 21.8, 5.8, y0, 'carpet', 0x3b4250);
  m.overlay(10.3, -17.8, 21.8, -6.3, y0, 'steel');

  // Gallery hall: framed art under picture lights, sculptures, a runner.
  [-19, -11, -5, 3].forEach((x, i) => f('wallArt', x, y0 + 1.0, 2.12, 'south', { w: 1.6, h: 1.1, variant: i }));
  [-18, -12, -6, 0].forEach((x, i) => f('wallArt', x, y0 + 1.0, 5.78, 'north', { w: 1.6, h: 1.1, variant: i + 4 }));
  f('rug', -8, y0, 4, 'south', { w: 26, d: 1.4, variant: 2 });
  f('sculpture', -8.5, y0, 3.6);
  f('sculpture', -20.5, y0, 4, 'south', { variant: 1 });
  f('bench', 1.5, y0, 4.9, 'north');

  // Home theater: screen on the west wall, three tiers of leather recliners, popcorn machine.
  f('tvWall', -21.75, 0.6, -3, 'east', { w: 7.6, h: 2.9, variant: 1 });
  m.box(-21.8, 0.5, -7.1, -21.78, 3.6, 1.1, 'screen');
  m.box(-21.7, 0, -7.6, -21.1, 2.4, -7.0, 'screen');
  m.box(-21.7, 0, 1.0, -21.1, 2.4, 1.6, 'screen');
  // Dark acoustic panels on the side and back walls.
  for (const [x0, x1] of [[-21.1, -11.7], [-10.3, -8.2]]) m.box(x0, 0.3, -7.9, x1, 3.6, -7.85, 'fabric', 0x2a1e26);
  for (const [x0, x1] of [[-21.1, -15.9], [-14.1, -8.2]]) m.box(x0, 0.3, 1.85, x1, 3.6, 1.9, 'fabric', 0x2a1e26);
  m.box(-8.15, 0.9, -7.8, -8.1, 3.6, 1.8, 'fabric', 0x2a1e26);
  m.box(-15.2, y0, -7.9, -12.2, y0 + 0.3, 1.9, 'carpet', 0x5c1720);
  m.box(-12.2, y0, -7.9, -8.1, y0 + 0.6, 1.9, 'carpet', 0x5c1720);
  for (const [rx, base] of [[-17.5, 0], [-14.2, 0.3], [-10.8, 0.6]] as const) {
    for (const z of [-6.2, -4.2, -2.2, -0.2]) f('recliner', rx, base, z, 'west');
  }
  f('popcornMachine', -8.75, 0.6, 1.3, 'west');
  for (const x of [-18, -14, -10]) {
    f('sconce', x, y0 + 2.0, -7.83, 'south');
    f('sconce', x, y0 + 2.0, 1.83, 'north');
  }

  // Wine cellar: racks on two walls, barrels, a tasting table.
  for (const z of [-6.7, -5.1, -3.5, -1.9, -0.3]) f('wineRack', -7.68, y0, z, 'east');
  for (const x of [-6.2, -4.6, -3.0, -1.4, 0.2]) f('wineRack', x, y0, -7.68, 'south');
  for (const x of [3.6, 5.1]) f('wineRack', x, y0, -7.68, 'south', { w: 1.5 });
  for (const [x, z] of [[4.4, -0.5], [4.4, 0.6], [-6.6, 1.2]]) f('wineBarrel', x, y0, z);
  diningSet(-1.5, y0, -3, 2.0, 1.0, 2, true);
  f('pendantLight', -1.5, y1, -3, 'south', { variant: 1, h: 1.2 });

  // Gym.
  for (const z of [-16, -13.5, -11]) f('treadmill', -20.2, y0, z, 'west');
  f('exerciseBike', -17.2, y0, -16.9, 'north');
  f('exerciseBike', -15.8, y0, -16.9, 'north');
  f('weightBench', -14, y0, -12.5);
  f('dumbbellRack', -8.45, y0, -14, 'west');
  f('punchingBag', -10.3, y0, -10.3, 'south', { h: y1 - y0 });
  m.box(-8.15, 0.3, -17.5, -8.1, 2.6, -9, 'glass');
  f('plantLarge', -21.2, y0, -9, 'south', { variant: 1 });

  // Server room: four rows of racks facing alternate aisles, overhead cable trays.
  for (const [x, face] of [[-5.5, 'east'], [-2.5, 'west'], [0.5, 'east'], [3.5, 'west']] as const) {
    for (let z = -16.7; z <= -10.3; z += 0.71) f('serverRack', x, y0, z, face);
    m.box(x - 0.3, 2.85, -17.2, x + 0.3, 2.9, -9.8, 'metal');
  }
  m.box(7, y0, -17.6, 9.6, 2.0, -16.6, 'metal');

  // Security room: monitor wall facing the console desk, gun locker, break table.
  m.props.push({ kind: 'monitorBank', x: 15, y: 2.05, z: -5.55, yaw: Math.PI, cols: 4, rows: 3 });
  m.box(12.8, y0, -5.7, 17.2, 0.9, -5.4, 'metal');
  f('securityDesk', 15, y0, -3.9);
  for (const x of [13.8, 15, 16.2]) f('officeChair', x, y0, -2.7, 'north');
  f('gunLocker', 21.5, y0, 1.5, 'west');
  f('safe', 21.35, y0, 4.6, 'west');
  diningSet(13.2, y0, 3.2, 1.2, 0.9, 1, false, 'officeChair');

  // Vault: deposit boxes, pallets of gold and cash, a jewelry case.
  f('depositBoxes', 21.55, y0, -15.2, 'west', { w: 4.6 });
  f('depositBoxes', 21.55, y0, -10.4, 'west', { w: 4.6 });
  for (const [x, z] of [[12.3, -16.8], [14.0, -16.8], [12.3, -15.2], [14.0, -15.2], [12.3, -13.6], [14.0, -13.6]]) f('goldStack', x, y0, z);
  for (const [x, z] of [[17.5, -16.4], [17.5, -14.2], [17.5, -12]]) f('cashPallet', x, y0, z);
  f('displayCase', 13.5, y0, -10.5);
  f('displayCase', 13.5, y0, -8.6);

  m.light(-8, 3.5, 4, 0xffe4bf, 12, 18);
  m.light(-15, 3.5, -3, 0x9c6bff, 5, 12);
  m.light(-1, 3.4, -3, 0xffb066, 10, 12);
  m.light(-15, 3.5, -13, 0xffffff, 12, 14);
  m.light(1, 3.5, -13, 0x5aa9ff, 12, 14);
  m.light(16, 3.5, 0, 0xbfd8ff, 12, 14);
  m.light(16, 3.5, -12, 0xfff4d6, 12, 14);
  m.light(8, 3.5, 0, 0xffffff, 6, 10);
}

// ---------------------------------------------------------------------------
// Ground floor (y 4.2 .. 8.1)

function buildGroundFloor(m: MapBuilder): void {
  const y0 = G, y1 = ceil(G);
  m.slab(HOUSE, G, 'marble', { ceiling: 'ceiling', holes: [laneRect(LANE_A)] });
  shell(m, y0, y1, {
    s: [glazing(-20, -16), glazing(-12, -8), { from: -1.5, to: 1.5, bottom: 0, top: 3.4 },
      glazing(-4.6, -2.4, 0, 3.4), glazing(2.4, 4.6, 0, 3.4), glazing(7.3, 9.3), glazing(12, 16), doorway(20)],
    n: [glazing(-14, -8), doorway(-17.4), glazing(-5.6, -1.6, 0, 3.6), { from: -1.5, to: 1.5, bottom: 0, top: 3.0 },
      glazing(1.6, 5.6, 0, 3.6), glazing(8, 12), doorway(14.6), glazing(17, 21)],
    w: [glazing(-16, -10)],
    e: [doorway(-2.4)],
  });

  // Partitions.
  m.wall(-14, -6, -14, HZ1 - 0.2, y0, y1, IN, { openings: [doorway(0, 1.4)] });
  m.wall(-6, HZ0 + 0.2, -6, -6.1, y0, y1, IN, { openings: [{ from: -14, to: -10, bottom: 0, top: 3.2 }] });
  // Foyer west wall runs the full double height; the upper door leads from the gallery to the west wing.
  m.wall(-6, -6.1, -6, HZ1 - 0.2, y0, ceil(F2), IN, {
    openings: [doorway(2, 1.8, 2.8), { from: -5.6, to: -4.2, bottom: F2 - G, top: F2 - G + 2.4 }],
  });
  m.wall(HX0 + 0.2, -6, -6.1, -6, y0, y1, IN, { openings: [doorway(-10, 1.4)] });
  m.wall(-5.9, -6, 5.9, -6, y0, y1, IN, {
    openings: [{ from: -5.6, to: -2.4, bottom: 0, top: 3.4 }, { from: 2.4, to: 5.6, bottom: 0, top: 3.4 }],
  });
  m.wall(6, HZ0 + 0.2, 6, -6.1, y0, y1, IN, { openings: [{ from: -14, to: -10, bottom: 0, top: 3.2 }] });
  m.wall(10.1, -6, HX1 - 0.2, -6, y0, y1, IN, { openings: [doorway(14.6, 1.4)] });
  m.wall(18, -5.9, 18, HZ1 - 0.2, y0, y1, IN, { openings: [doorway(0)] });

  // Floor finishes (the slab itself is marble).
  m.overlay(-21.8, -17.8, -6.1, -6.1, y0, 'tile');
  m.overlay(-21.8, -5.9, -14.1, 5.8, y0, 'wood');
  m.overlay(-13.9, -5.9, -6.1, 5.8, y0, 'wood', 0xc9a27a);
  m.overlay(10.1, -5.9, 17.9, 5.8, y0, 'wood');
  m.overlay(18.1, -5.9, 21.8, 5.8, y0, 'tile', 0xbfb6a8);
  m.overlay(6.1, -17.8, 21.8, -6.1, y0, 'carpet', 0x3a3f4a);

  // Grand foyer: marble staircase with a runner, inlaid medallion, chandelier, center table.
  m.stairs('z', [-2, 2], 0.6, -4, G, F2, 'marble', { rails: true, runner: 0x7a1f24 });
  m.props.push({ kind: 'chandelier', x: 0, y: 11.2, z: 1, castShadow: true });
  f('medallion', 0, y0, 3.2, 'south', { w: 3.6 });
  for (const sx of [-1, 1]) {
    f('urnPlanter', sx * 4.6, y0, 5.0);
    f('consoleTable', sx * 5.7, y0, -1.5, sx < 0 ? 'east' : 'west');
    f('wallArt', sx * 5.88, y0 + 1.5, -1.5, sx < 0 ? 'east' : 'west', { w: 1.3, h: 1.6, variant: sx < 0 ? 7 : 8 });
    f('sculpture', sx * 4.2, y0, -5.3, 'south', { variant: sx < 0 ? 0 : 1 });
  }

  // Great room: fireplace, sectional, armchairs by the glass, grand piano, shelves.
  f('fireplace', -5.55, y0, -8, 'east', { h: y1 - y0 });
  f('rug', -2.9, y0, -9, 'west', { w: 3.8, d: 4.2 });
  f('sectional', -2.4, y0, -9, 'west');
  f('coffeeTable', -4.2, y0, -9, 'west');
  f('floorLamp', -0.9, y0, -11.1);
  for (const x of [-4.5, -3]) f('armchair', x, y0, -12.5, 'north', { color: 0xb9ab95 });
  f('sideTable', -3.75, y0, -12.6);
  f('grandPiano', 3.2, y0, -15.2);
  f('pianoBench', 3.2, y0, -13.75, 'north');
  for (const z of [-7.6, -16.4]) f('bookshelf', 5.75, y0, z, 'west');
  f('plantLarge', -5.3, y0, -17.2);
  f('plantLarge', 5.3, y0, -9.3, 'south', { variant: 1 });
  for (const x of [-5.0, -2.2, 2.2, 5.0]) f('curtain', x, y0, -17.65, 'south', { h: 3.7 });
  f('wallArt', 0, y0 + 1.3, -6.12, 'north', { w: 2.2, h: 1.4, variant: 9 });

  // Kitchen: perimeter cabinets with sink and cooktop, wall cabinets, island with stools, fridge, breakfast table.
  const kz = -17.8 + 0.325;
  f('counter', -19.95, y0, kz, 'south', { w: 3.7 });
  f('counter', -15.4, y0, kz, 'south', { w: 2.6, variant: 2 });
  f('counter', -11.1, y0, kz, 'south', { w: 6, variant: 1 });
  f('counter', -7.15, y0, kz, 'south', { w: 1.9 });
  f('wallCabinet', -19.95, y0 + 1.5, -17.62, 'south', { w: 3.7 });
  f('wallCabinet', -7.15, y0 + 1.5, -17.62, 'south', { w: 1.9 });
  f('rangeHood', -15.4, y0 + 1.7, -17.52);
  f('fridge', -21.4, y0, -8.3, 'east');
  f('island', -14, y0, -12.2);
  for (const x of [-15.2, -14, -12.8]) {
    f('barStool', x, y0, -11.0, 'north');
    f('pendantLight', x, y1, -12.2, 'south', { variant: 1, h: 1.5 });
  }
  diningSet(-19.4, y0, -12.8, 1.6, 0.9, 2, false);
  f('plantLarge', -21.2, y0, -16.6, 'south', { variant: 1 });

  // Dining room: table for twelve, chandelier, sideboard, art.
  diningSet(-10, y0, 0, 3.6, 1.2, 5, true, 'diningChair', 0xc8b89e);
  f('rug', -10, y0, 0, 'south', { w: 5.2, d: 3.4, variant: 2 });
  m.props.push({ kind: 'chandelier', x: -10, y: 7.1, z: 0 });
  f('sideboard', -10, y0, 5.5, 'north', { w: 2.4 });
  f('wallArt', -13.88, y0 + 1.3, 3.0, 'east', { w: 1.6, h: 1.1, variant: 2 });
  f('wallArt', -10, y0 + 1.3, -5.88, 'south', { w: 2.0, h: 1.2, variant: 5 });
  f('plantLarge', -13.3, y0, 5.2);

  // Library: shelves on two walls, executive desk, chesterfield and reading chairs, globe.
  for (const z of [-5.2, -4.0, -2.8, -1.6, -0.4, 0.8, 2.0, 3.2, 4.4]) f('bookshelf', -21.6, y0, z, 'east', { h: 3.2 });
  for (const x of [-20.6, -19.4, -18.2, -17.0, -15.8]) f('bookshelf', x, y0, -5.7, 'south', { h: 3.2 });
  f('rug', -18, y0, 1.2, 'south', { w: 3.8, d: 3.4, variant: 0 });
  f('executiveDesk', -18, y0, -2.6);
  f('officeChair', -18, y0, -3.6, 'south', { color: 0x4a2a1a });
  f('chesterfield', -18, y0, 3.2, 'north');
  f('coffeeTable', -18, y0, 1.6);
  f('armchair', -20.3, y0, 1.4, 'east', { color: 0x7a4a2a });
  f('armchair', -15.7, y0, 1.4, 'west', { color: 0x7a4a2a });
  f('globe', -15.0, y0, -4.6);
  f('floorLamp', -20.6, y0, 4.8);
  f('plantLarge', -14.7, y0, 5.2);

  // Office.
  f('rug', 14, y0, -0.6, 'south', { w: 3.4, d: 3.0, variant: 3 });
  f('executiveDesk', 14, y0, -1.6);
  f('officeChair', 14, y0, -2.7, 'south');
  f('armchair', 13.1, y0, 0.7, 'north', { color: 0x5a3a24 });
  f('armchair', 14.9, y0, 0.7, 'north', { color: 0x5a3a24 });
  for (const z of [-4.4, -3.2, 3.2, 4.4]) f('bookshelf', 17.6, y0, z, 'west', { h: 3 });
  f('safe', 10.55, y0, -5.35, 'east');
  f('globe', 16.8, y0, 5.1);
  f('plantLarge', 10.7, y0, 5.2);
  f('wallArt', 10.12, y0 + 1.3, -2, 'east', { w: 1.6, h: 1.1, variant: 10 });

  // Mudroom: lockers, bench.
  for (const z of [1.0, 2.2, 3.4, 4.6]) f('wardrobe', 21.45, y0, z, 'west', { w: 1.2, h: 2.2 });
  f('bench', 19.2, y0, -5.4, 'north');
  f('plantSmall', 18.5, y0, 5.4);

  // Media lounge & bar: TV wall and sectional, pool table, bar with back bar, arcade corner.
  f('tvWall', 10, y0 + 1.2, -6.12, 'north', { w: 2.4, h: 1.35 });
  f('mediaConsole', 10, y0, -6.4, 'north', { w: 2.4 });
  f('rug', 10, y0, -10.2, 'south', { w: 4.2, d: 3.6, variant: 1 });
  f('sectional', 10, y0, -10.8);
  f('coffeeTable', 10, y0, -8.4);
  f('floorLamp', 7.2, y0, -8.6);
  f('poolTable', 15.2, y0, -12.5);
  for (const x of [14.6, 15.8]) f('pendantLight', x, y1, -12.5, 'south', { h: 1.3 });
  f('barCounter', 19, y0, -12.5, 'west');
  f('backBar', 21.58, y0, -12.5, 'west');
  for (const z of [-13.6, -12.5, -11.4]) f('barStool', 18.15, y0, z, 'east');
  f('arcadeMachine', 6.6, y0, -16.8, 'east');
  f('arcadeMachine', 6.6, y0, -15.9, 'east', { color: 0x401a1a });
  f('dartboard', 16.3, y0 + 1.5, -17.78, 'south');
  f('plantLarge', 21.2, y0, -17.2);

  m.light(0, 7.6, -12, 0xfff0d8, 14, 16);
  m.light(-14, 7.6, -12, 0xffffff, 14, 16);
  m.light(14, 7.6, -12, 0xffd9b0, 12, 16);
  m.light(-18, 7.6, 0, 0xffe0b0, 8, 12);
  m.light(14, 7.6, 0, 0xfff0d8, 8, 12);
}

function buildGarage(m: MapBuilder): void {
  const y0 = G, y1 = ceil(G);
  m.slab(GARAGE, G, 'concrete');
  m.slab(GARAGE, F2, 'roof', { ceiling: 'ceiling' });
  m.wall(22.2, HZ1, 36.2, HZ1, y0, y1, OUT_POS, {
    thickness: EXT,
    openings: [23.2, 27.2, 31.2].map(x => ({ from: x, to: x + 3.6, bottom: 0, top: 2.8 })),
  });
  m.wall(22.2, -10, 36.2, -10, y0, y1, OUT_NEG, { thickness: EXT, openings: [glazing(28, 31)] });
  m.wall(36, -9.8, 36, 5.8, y0, y1, OUT_POS, { thickness: EXT });
  f('car', 25, y0, -1.5, 'south', { variant: 0, color: 0xb3122a });
  f('car', 29, y0, -1.5, 'south', { variant: 1, color: 0x15171a });
  f('car', 33, y0, -1.5, 'south', { variant: 2, color: 0xeeeeee });
  for (const x of [23.2, 34.6]) f('toolChest', x, y0, -9.45, 'south');
  m.box(25, y0, -9.8, 30, y0 + 0.9, -9.2, 'wood');
  m.box(25, y0 + 1.4, -9.8, 30, y0 + 2.6, -9.75, 'darkWood');
  m.light(29, 7.6, -2, 0xffffff, 12, 14);
}

// ---------------------------------------------------------------------------
// Second floor (y 8.4 .. 12.3)

function buildSecondFloor(m: MapBuilder): void {
  const y0 = F2, y1 = ceil(F2);
  // Open over the grand foyer, and over the service stair flight below.
  m.slab(HOUSE, F2, 'wood', { ceiling: 'ceiling', holes: [rect(-5.9, -4, 5.9, 5.8), laneRect(LANE_B)] });
  shell(m, y0, y1, {
    s: [glazing(-20, -16), glazing(-12, -8), glazing(-4.5, 4.5, 0.4, 3.5), glazing(7.3, 9.3), glazing(12, 15), glazing(17, 20)],
    n: [glazing(-20, -16), glazing(-12, -8), glazing(-4.5, 4.5, 0.4, 3.5), glazing(8, 21, 0.4, 3.5)],
    w: [glazing(-2, 4), glazing(-16, -10)],
    e: [glazing(-4, 4), glazing(-16, -10)],
  });

  // West wing: hall (z -7..-4) with two bedrooms on each side.
  m.wall(HX0 + 0.2, -4, -6.1, -4, y0, y1, IN, { openings: [doorway(-8), doorway(-16)] });
  m.wall(HX0 + 0.2, -7, -6.1, -7, y0, y1, IN, { openings: [doorway(-10), doorway(-18)] });
  m.wall(-14, -3.9, -14, HZ1 - 0.2, y0, y1, IN);
  m.wall(-14, HZ0 + 0.2, -14, -7.1, y0, y1, IN);
  m.wall(-6, HZ0 + 0.2, -6, -6.1, y0, y1, IN);
  // Centre: gallery overlooking the foyer, upper lounge behind it.
  m.wall(-5.9, -6, 5.9, -6, y0, y1, IN, { openings: [{ from: -1.6, to: 1.6, bottom: 0, top: 3.0 }] });
  m.railing(-5.9, -4, -2, -4, F2);
  m.railing(2, -4, 5.9, -4, F2);
  // East wing: master suite, walk-in closet, master bath.
  m.wall(6, HZ0 + 0.2, 6, -6.1, y0, y1, IN);
  m.wall(10.1, -6, HX1 - 0.2, -6, y0, y1, IN, { openings: [doorway(12.7), doorway(19.2)] });
  m.wall(16, -5.9, 16, HZ1 - 0.2, y0, y1, IN);

  m.overlay(-13.9, -3.9, -6.1, 5.8, y0, 'carpet', 0xcfc6b5);
  m.overlay(-21.8, -3.9, -14.1, 5.8, y0, 'carpet', 0x8fa6c4);
  m.overlay(-13.9, -17.8, -6.1, -7.1, y0, 'carpet', 0x9bb59a);
  m.overlay(-21.8, -17.8, -14.1, -7.1, y0, 'carpet', 0xe0b84c);
  m.overlay(6.1, -17.8, 21.8, -6.1, y0, 'carpet', 0xe8e1d4);
  m.overlay(16.1, -5.9, 21.8, 5.8, y0, 'marble');

  // Gallery and west hall.
  for (const x of [-3.8, 3.8]) f('wallArt', x, y0 + 1.2, -5.88, 'south', { w: 1.4, h: 1.0, variant: x < 0 ? 11 : 12 });
  f('rug', -14, y0, -5.5, 'south', { w: 15, d: 1.2, variant: 2 });
  f('wallArt', -12, y0 + 1.2, -4.12, 'north', { w: 1.2, h: 0.9, variant: 13 });
  f('wallArt', -20, y0 + 1.2, -4.12, 'north', { w: 1.2, h: 0.9, variant: 14 });
  f('wallArt', -14, y0 + 1.2, -6.88, 'south', { w: 1.2, h: 0.9, variant: 15 });

  // Guest bedroom.
  bedroom(-7.25, y0, 1.0, 'east', 1.9, 0xa89a83);
  f('dresser', -13.6, y0, 1.0, 'east');
  f('armchair', -12.8, y0, 4.8, 'north', { color: 0xb9ab95 });
  f('rug', -8.8, y0, 1.0, 'west', { w: 3.4, d: 2.6, variant: 1 });
  f('plantLarge', -13.4, y0, -3.3);
  f('curtain', -12.4, y0, 5.65, 'north', { h: 3.6 });
  f('curtain', -7.6, y0, 5.65, 'north', { h: 3.6 });

  // Blue bedroom.
  bedroom(-20.65, y0, 1.0, 'west', 1.9, 0x4a6fa5);
  f('desk', -14.5, y0, 3.6, 'west');
  f('officeChair', -15.4, y0, 3.6, 'east', { color: 0x2f4a63 });
  f('wardrobe', -19.6, y0, -3.58, 'south');
  f('rug', -18.6, y0, 1.0, 'east', { w: 3.4, d: 2.6, variant: 2 });

  // Green bedroom.
  bedroom(-10, y0, -16.65, 'north', 1.9, 0x5f8a5c);
  f('dresser', -6.4, y0, -12, 'west');
  f('bench', -10, y0, -14.95);
  f('armchair', -13, y0, -8.4, 'south', { color: 0x9bb59a });
  f('rug', -10, y0, -14.8, 'south', { w: 3.2, d: 2.6, variant: 3 });

  // Playroom.
  f('teepee', -20.4, y0, -15.6);
  f('toyChest', -15.2, y0, -17.4);
  f('beanBag', -17.2, y0, -15.2, 'south', { color: 0xe74c3c });
  f('beanBag', -18.3, y0, -16.2, 'south', { color: 0x3498db });
  f('kidsTable', -17.6, y0, -11.4);
  f('rockingHorse', -20.8, y0, -9.6, 'east');
  f('bookshelf', -14.3, y0, -12, 'west', { h: 1.6 });
  f('rug', -18, y0, -12.5, 'south', { w: 5, d: 4, variant: 2 });

  // Upper lounge: TV, sofa and armchairs, game table, shelves.
  f('tvWall', -5.88, y0 + 1.1, -12, 'east', { w: 2.2, h: 1.25 });
  f('mediaConsole', -5.65, y0, -12, 'east', { w: 2.2 });
  f('rug', -2.8, y0, -12, 'west', { w: 4, d: 3.4, variant: 0 });
  f('sofa', -1.5, y0, -12, 'west');
  f('coffeeTable', -3.4, y0, -12, 'west');
  f('armchair', -3.4, y0, -14.6, 'north', { color: 0x6d7b8d });
  diningSet(3, y0, -12.5, 1.4, 1.4, 2, false);
  for (const z of [-15.6, -14.4, -8.8, -7.6]) f('bookshelf', 5.6, y0, z, 'west', { h: 2.6 });
  f('plantLarge', -5.3, y0, -17.2);
  f('floorLamp', -0.6, y0, -14.2);

  // Master suite: king bed, sitting area, TV, writing desk.
  bedroom(14.5, y0, -16.6, 'north', 2.2, 0xf5efe6);
  f('bench', 14.5, y0, -14.9, 'south', { w: 1.6 });
  f('rug', 14.5, y0, -15.3, 'south', { w: 4.2, d: 3.6, variant: 1 });
  f('sofa', 21.2, y0, -12, 'west', { color: 0xb9ab95 });
  f('coffeeTable', 19.6, y0, -12, 'west');
  f('armchair', 18, y0, -13.4, 'east', { color: 0xd9cfb8 });
  f('armchair', 18, y0, -10.6, 'east', { color: 0xd9cfb8 });
  f('tvWall', 15.9, y0 + 1.2, -6.12, 'north');
  f('mediaConsole', 15.9, y0, -6.4, 'north', { w: 2 });
  f('desk', 6.48, y0, -12, 'east');
  f('officeChair', 7.3, y0, -12, 'west', { color: 0xe8e1d4 });
  f('plantLarge', 21.3, y0, -17.2);
  f('plantLarge', 6.8, y0, -17.2, 'south', { variant: 1 });
  f('floorLamp', 21.3, y0, -8.4);

  // Walk-in closet.
  f('shoeWall', 10.28, y0, 2.0, 'east');
  f('shoeWall', 10.28, y0, 4.0, 'east');
  for (const z of [-3.6, -0.6, 2.4]) f('clothesRail', 15.6, y0, z, 'west');
  f('clothesRail', 10.4, y0, -3.0, 'east');
  f('closetIsland', 13, y0, 0);
  f('bench', 13, y0, 3.4, 'north');
  f('roundRug', 13, y0, 0, 'south', { w: 3.2, variant: 1 });
  f('pendantLight', 13, y1, 0, 'south', { variant: 1, h: 1.0, w: 0.7 });

  // Master bath.
  f('bathtub', 20, y0, 2.4);
  f('vanity', 16.38, y0, -2.5, 'east');
  f('toilet', 16.45, y0, 1.0, 'east');
  f('towelRack', 21.0, y0 + 0.2, 5.85, 'north');
  f('plantSmall', 21.4, y0, 5.3);
  f('plantLarge', 17, y0, 5.2, 'south', { variant: 1 });
  m.box(20, y0, -5.8, 20.05, y0 + 2.2, -3.5, 'glass');
  m.box(20, y0, -3.5, 21.8, y0 + 2.2, -3.45, 'glass');
  m.box(20.6, y0 + 2.25, -5.2, 21.2, y0 + 2.3, -4.6, 'metal');

  m.light(14, 11.8, -12, 0xfff0d8, 10, 14);
  m.light(-10, 11.8, -5.5, 0xfff0d8, 8, 14);
  m.light(0, 11.8, -12, 0xfff0d8, 8, 12);
}

// ---------------------------------------------------------------------------
// Third floor (y 12.6 .. 16.5): penthouse study surrounded by a rooftop terrace

function buildThirdFloor(m: MapBuilder): void {
  const y0 = F3, y1 = ceil(F3);
  m.slab(HOUSE, F3, 'travertine', { ceiling: 'ceiling', holes: [laneRect(LANE_A)] });

  // Penthouse (x -6..6, z -6..6); its east wall is the stairwell's.
  m.wall(-6, -6.2, -6, HZ1 - 0.2, y0, y1, OUT_NEG, { thickness: EXT, openings: [glazing(-4, 4, 0.3, 3.4)] });
  m.wall(-6.2, -6, 6, -6, y0, y1, OUT_NEG, {
    thickness: EXT, openings: [glazing(-5, -1.4, 0.3, 3.4), doorway(0, 2.2, 2.6), glazing(1.4, 5, 0.3, 3.4)],
  });
  m.wall(-6.2, HZ1, 10.2, HZ1, y0, y1, OUT_POS, { thickness: EXT, openings: [glazing(-5, 5, 0.3, 3.4), glazing(7.3, 9.3)] });
  m.overlay(-5.8, -5.8, 5.9, 5.8, y0, 'wood', 0x7a5236);

  f('rug', 0, y0, -0.8, 'south', { w: 4.6, d: 3.4, variant: 0 });
  f('executiveDesk', 0, y0, 3.7, 'north');
  f('officeChair', 0, y0, 4.8, 'north');
  f('sofa', -4.9, y0, -0.8, 'east', { color: 0x3a3a3a });
  f('coffeeTable', -3.3, y0, -0.8, 'east');
  f('armchair', -1.6, y0, -2.2, 'west', { color: 0x8a6a3a });
  f('armchair', -1.6, y0, 0.6, 'west', { color: 0x8a6a3a });
  for (const z of [-5.0, -3.8, -2.6]) f('bookshelf', 5.68, y0, z, 'west', { h: 3 });
  f('barCart', 5.45, y0, -0.8, 'west');
  f('telescope', -4.7, y0, 4.6, 'south');
  f('globe', 4.9, y0, 5.1);
  f('plantLarge', -5.3, y0, -5.3);
  f('wallArt', 5.88, y0 + 1.3, 1.0, 'west', { w: 1.2, h: 1.6, variant: 16 });
  m.light(0, 16, 0, 0xfff0d8, 10, 12);

  // Terrace edge: glass balustrade all the way round, except where the penthouse and stair walls meet the facade.
  m.railing(HX0 - 0.2, 6.1, -6.2, 6.1, F3);
  m.railing(10.2, 6.1, HX1 + 0.2, 6.1, F3);
  m.railing(HX0 - 0.2, HZ0 - 0.1, HX1 + 0.2, HZ0 - 0.1, F3);
  m.railing(HX0 - 0.1, HZ0 - 0.2, HX0 - 0.1, HZ1 + 0.2, F3);
  m.railing(HX1 + 0.1, HZ0 - 0.2, HX1 + 0.1, HZ1 + 0.2, F3);

  // West terrace: hot tub, fire-pit lounge under string lights, loungers.
  m.box(-18, y0, -14, -14, y0 + 0.9, -13.7, 'travertine');
  m.box(-18, y0, -10.3, -14, y0 + 0.9, -10, 'travertine');
  m.box(-18, y0, -13.7, -17.7, y0 + 0.9, -10.3, 'travertine');
  m.box(-14.3, y0, -13.7, -14, y0 + 0.9, -10.3, 'travertine');
  m.box(-17.7, y0, -13.7, -14.3, y0 + 0.2, -10.3, 'poolTile');
  m.box(-17.7, y0 + 0.2, -13.7, -14.3, y0 + 0.75, -10.3, 'water');
  m.stairs('x', [-12.4, -11.6], -13.2, -14, y0, y0 + 0.9, 'travertine');
  f('firePit', -12, y0, -1);
  f('outdoorSofa', -12, y0, 1.05, 'north');
  f('outdoorSofa', -12, y0, -3.05, 'south');
  f('outdoorChair', -14.3, y0, -1, 'east');
  f('outdoorChair', -9.7, y0, -1, 'west');
  f('stringLights', -14, y0, 4.6, 'south', { w: 12 });
  for (const x of [-21, -19.6]) f('lounger', x, y0, -6.5);

  // North terrace: alfresco dining under string lights.
  diningSet(0, y0, -12, 2.8, 1.1, 3, true, 'outdoorChair');
  f('stringLights', 0, y0, -15.5, 'south', { w: 12 });
  f('umbrella', -8.5, y0, -12, 'south', { color: 0xf2efe8 });

  // East terrace: loungers with umbrellas, olive trees in planters.
  for (const x of [13, 14.6, 17.4, 19]) f('lounger', x, y0, -2, 'south', { color: 0xf2efe8 });
  f('umbrella', 16, y0, -2.6, 'south', { color: 0x2f6b8a });
  f('oliveTree', 20.6, y0, 4.4, 'south', { variant: 1 });
  f('oliveTree', 20.6, y0, -16.4, 'south', { variant: 1 });
  for (const [x, z] of [[-21, 5], [21, -8], [-21, -17], [11, 5], [-7, 5]]) f('urnPlanter', x, y0, z);
}

// ---------------------------------------------------------------------------
// Roof (y 16.8): helipad over the penthouse

function buildRoof(m: MapBuilder): void {
  m.slab(rect(-6.2, -6.2, 10.2, 6.2), R, 'roof', { ceiling: 'ceiling', holes: [laneRect(LANE_B)] });
  m.railing(-6.2, 6.1, 10.2, 6.1, R);
  m.railing(-6.2, -6.1, 10.2, -6.1, R);
  m.railing(-6.1, -6.2, -6.1, 6.2, R);
  m.railing(10.1, -6.2, 10.1, 6.2, R);
  // Around the stair opening (the north end is where you arrive, so it stays open).
  m.railing(7.8, FLIGHT_N, 7.8, FLIGHT_S, R);
  m.railing(LANE_B[0], FLIGHT_S, LANE_B[1], FLIGHT_S, R);
  m.overlay(-5.6, -5.6, 5.6, 5.6, R, 'helipad');
  m.box(9.5, R, 5.5, 9.7, R + 2.6, 5.7, 'metal');
  f('helicopter', 0.3, R + 0.03, 0, 'east');
  f('windsock', -5.6, R, 5.6);
}

// ---------------------------------------------------------------------------
// Service stairs: basement to roof in one shaft (x 6..10, z -6..6).
//
// Each flight runs between z -3.6 and 1.0, alternating lane and direction, so you arrive at
// one end of the shaft and the next flight starts right there:
//   B->G lane A rising south, G->2 lane B rising north, 2->3 lane A rising south, 3->roof lane B rising north.

function buildServiceStairs(m: MapBuilder): void {
  m.stairs('z', LANE_A, FLIGHT_N, FLIGHT_S, B, G, 'stone');
  m.stairs('z', LANE_B, FLIGHT_S, FLIGHT_N, G, F2, 'stone');
  m.stairs('z', LANE_A, FLIGHT_N, FLIGHT_S, F2, F3, 'stone');
  m.stairs('z', LANE_B, FLIGHT_S, FLIGHT_N, F3, R, 'stone');
  m.box(LANE_A[1], B, FLIGHT_N, LANE_B[0], R - SLAB, FLIGHT_S, 'plaster');

  // Shaft walls for ground, second and third storeys (the basement walls are part of the basement).
  const levels: { y: number; west: Opening[]; east: Opening[]; north: Opening[]; exterior: boolean }[] = [
    { y: G, west: [doorway(3.3, 1.4)], east: [doorway(3.3, 1.4)], north: [], exterior: false },
    { y: F2, west: [doorway(-4.9, 1.4)], east: [], north: [doorway(8.9, 1.4)], exterior: false },
    { y: F3, west: [doorway(3.3, 1.4)], east: [doorway(3.3, 1.4)], north: [glazing(7.2, 8.8)], exterior: true },
  ];
  for (const l of levels) {
    const top = ceil(l.y);
    const t = l.exterior ? EXT : 0.2;
    m.wall(6, -6.1, 6, HZ1 - 0.2, l.y, top, IN, { openings: l.west });
    m.wall(10, -6.2, 10, HZ1 - 0.2, l.y, top, l.exterior ? OUT_POS : IN, { thickness: t, openings: l.east });
    m.wall(6.1, -6, l.exterior ? 10.2 : 9.9, -6, l.y, top, l.exterior ? OUT_NEG : IN, { thickness: t, openings: l.north });
  }
}

// ---------------------------------------------------------------------------
// Security cameras

function buildSecurityCameras(m: MapBuilder): void {
  const W = LOT - 0.3;
  const c = (id: string, label: string, x: number, y: number, z: number, tx: number, ty: number, tz: number, sweep = 0.5) =>
    m.securityCamera(id, label, x, y, z, tx, ty, tz, sweep);
  // Perimeter and grounds.
  c('gate-w', 'Front Gate W', -4.7, G + 4.7, W - 0.8, 2, G, 30, 0.4);
  c('gate-e', 'Front Gate E', 4.7, G + 4.7, W - 0.8, -2, G, 30, 0.4);
  c('front-door', 'Front Door', 0, G + 3.9, HZ1 + 0.45, 0, G, 18, 0.6);
  c('front-w', 'Front Lawn W', HX0 - 0.45, 7.6, HZ1 + 0.45, -12, G, 20);
  c('garage-ext', 'Motor Court', 36.45, 7.6, HZ1 + 0.45, 26, G, 14);
  c('back-w', 'Back Patio W', HX0 - 0.45, 7.6, HZ0 - 0.45, -8, G, -30);
  c('back-e', 'Back Patio E', HX1 + 0.45, 7.6, HZ0 - 0.45, 8, G, -30);
  c('tennis', 'Tennis Court', -44.2, G + 3.0, -24, -34, G, -32);
  c('east-lawn', 'East Lawn', 44.2, G + 3.0, 0, 34, G, -12);
  c('pool', 'Pool', 23.6, G + 3.0, -33.4, 0, G, -32, 0.4);
  // Interior.
  c('foyer', 'Grand Foyer', 5.7, 11.6, 5.7, 0, G, -1, 0.4);
  c('great-room', 'Great Room', 5.7, 7.6, -17.7, -2, G, -9);
  c('kitchen', 'Kitchen', -21.7, 7.6, -6.3, -12, G, -14);
  c('office', 'Office', 17.7, 7.6, 5.7, 13, G, -2);
  c('media', 'Media Lounge', 21.7, 7.6, -6.3, 12, G, -14);
  c('garage', 'Garage', 35.7, 7.6, -9.7, 28, G, 0);
  c('stairs', 'Service Stairs', 9.7, 7.6, 5.6, 7, G, 0, 0.3);
  c('gallery', 'Gallery', -5.7, 11.7, -5.7, 4, G + 2, 2, 0.4);
  c('master', 'Master Suite', 21.7, 11.7, -17.7, 12, F2, -10);
  c('penthouse', 'Penthouse', 5.7, 15.8, -5.7, -3, F3, 3);
  c('terrace', 'Rooftop Terrace', -6.45, 15.8, -6.45, -15, F3, -12);
  c('roof', 'Helipad', 9.6, R + 2.7, 5.6, 0, R, 0, 0.4);
  c('basement-hall', 'Basement Hall', -21.7, 3.6, 5.7, 0, B, 3);
  c('theater', 'Theater', -8.3, 3.6, 1.7, -18, B, -4);
  c('wine', 'Wine Cellar', 5.7, 3.6, -7.7, -3, B, -2);
  c('server', 'Server Room', -7.7, 3.6, -17.7, 3, B, -12);
  c('security', 'Security Room', 21.7, 3.6, 5.7, 14, B, -2, 0.3);
  c('vault-door', 'Vault Door', 10.4, 3.6, 5.6, 19.4, B + 1, -6, 0.2);
  c('vault', 'Vault', 10.6, 3.6, -17.4, 17, B, -10, 0.4);
}

// ---------------------------------------------------------------------------
// Named areas for the HUD. Earlier entries win where they overlap.

function buildZones(m: MapBuilder): void {
  const yB: [number, number] = [-1, 3.9];
  const yG: [number, number] = [3.9, 8.2];
  const y2: [number, number] = [8.2, 12.4];
  const y3: [number, number] = [12.4, 16.6];
  const z = (name: string, floor: string, x0: number, z0: number, x1: number, z1: number, [ya, yb]: [number, number]) =>
    m.zone(name, floor, x0, z0, x1, z1, ya, yb);

  z('Service Stairs', BASEMENT, 6, -6, 10, 6, yB);
  z('Service Stairs', GROUND, 6, -6, 10, 6, yG);
  z('Service Stairs', SECOND, 6, -6, 10, 6, y2);
  z('Service Stairs', THIRD, 6, -6, 10, 6, y3);

  z('Gallery Hall', BASEMENT, -22, 2, 6, 6, yB);
  z('Home Theater', BASEMENT, -22, -8, -8, 2, yB);
  z('Wine Cellar', BASEMENT, -8, -8, 6, 2, yB);
  z('Gym', BASEMENT, -22, -18, -8, -8, yB);
  z('Server Room', BASEMENT, -8, -18, 10, -6, yB);
  z('Security Room', BASEMENT, 10, -6, 22, 6, yB);
  z('Vault', BASEMENT, 10, -18, 22, -6, yB);

  z('Grand Foyer', GROUND, -6, -6, 6, 6, yG);
  z('Great Room', GROUND, -6, -18, 6, -6, yG);
  z('Dining Room', GROUND, -14, -6, -6, 6, yG);
  z('Library', GROUND, -22, -6, -14, 6, yG);
  z('Kitchen', GROUND, -22, -18, -6, -6, yG);
  z('Office', GROUND, 10, -6, 18, 6, yG);
  z('Mudroom', GROUND, 18, -6, 22, 6, yG);
  z('Media Lounge & Bar', GROUND, 6, -18, 22, -6, yG);
  z('Garage', GROUND, 22, -10, 36, 6, yG);

  z('Gallery', SECOND, -6, -6, 6, -4, y2);
  z('Grand Foyer', GROUND, -6, -4, 6, 6, [3.9, 12.4]);
  z('Upper Lounge', SECOND, -6, -18, 6, -6, y2);
  z('West Hall', SECOND, -22, -7, -6, -4, y2);
  z('Guest Bedroom', SECOND, -14, -4, -6, 6, y2);
  z('Blue Bedroom', SECOND, -22, -4, -14, 6, y2);
  z('Green Bedroom', SECOND, -14, -18, -6, -7, y2);
  z('Playroom', SECOND, -22, -18, -14, -7, y2);
  z('Master Suite', SECOND, 6, -18, 22, -6, y2);
  z('Walk-in Closet', SECOND, 10, -6, 16, 6, y2);
  z('Master Bath', SECOND, 16, -6, 22, 6, y2);

  z('Penthouse Study', THIRD, -6, -6, 6, 6, y3);
  z('Rooftop Terrace', THIRD, -23, -19, 23, 7, y3);
  z('Helipad', ROOF, -7, -7, 11, 7, [16.6, 40]);

  z('Pool', GROUNDS, -15, -41, 15, -26, [1, 10]);
  z('Pool Cabana', GROUNDS, 16, -40, 24, -33, [3, 10]);
  z('Tennis Court', GROUNDS, -42, -44, -26, -20, [3, 10]);
  z('Back Patio', GROUNDS, -22, -26, 22, -18, [3, 10]);
  z('Front Gate', GROUNDS, -8, 38, 8, 45, [3, 10]);
  z('Fountain Court', GROUNDS, -10, 16, 10, 38, [3, 10]);
  z('Motor Court', GROUNDS, -14, 6, 37, 16, [3, 10]);
  z('Garage Roof', GROUNDS, 22, -10, 36, 6, [8.2, 12]);
  z('Grounds', GROUNDS, -LOT, -LOT, LOT, LOT, [-1, 40]);
}
