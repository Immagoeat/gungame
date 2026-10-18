import { doorway, glazing, MapBuilder, rect, subtractRects, type FurnitureOptions, type Opening, type Rect, type WallMaterial } from './builder';
import type { Facing, FurnitureType } from './furniture';
import type { BlockMaterial, ClueModel, GuestActivity, MapDef, PropDef } from './types';

/**
 * "The Aurelia": a luxury cruise liner at sea, for Chapter 2.
 *
 * Coordinates: +x towards the bow, +z starboard, -z port, y up, meters. Deck floor tops are
 * AURELIA_DECKS (decks 2 to 7); the waterline is SEA_LEVEL, below deck 2.
 *
 *   Deck 7  bridge, radio room, sun deck round the funnel
 *   Deck 6  the Meridian's private deck: VIP lounge, Vale's suite, Castell's suite, security office, aft terrace
 *   Deck 5  lido: pool deck aft, buffet, atrium gallery, lido bar, spa; observation deck forward
 *   Deck 4  promenade: restaurant, casino, atrium, shops, Starlight Lounge; open promenades both sides, foredeck
 *   Deck 3  staterooms (yours is 3110), atrium, purser's office, embarkation lobby, medical
 *   Deck 2  crew: engine room, laundry, galley, crew mess, crew cabins, stores, cargo hold
 *
 * Getting about: the grand staircase in the three-deck atrium (3 to 5), crew stairwells aft and
 * forward (2 to 5), the guarded Meridian stair (5 to 6) and the bridge stair (6 to 7).
 * The sea is invisible water (you can swim, and the mission knows you went overboard).
 */
export const AURELIA_DECKS = [0, 3.5, 7, 10.5, 14, 17.5] as const;
const [D2, D3, D4, D5, D6, D7] = AURELIA_DECKS;
export const SEA_LEVEL = -2.4;
const SLAB = 0.3;
const ceil = (y: number) => y + 3.5 - SLAB;
/** How far below the ceiling a ceiling light goes: its fixture (dome, stem, canopy) is built upwards from there. */
const CEILING_LIGHT = 0.88;

/** Hull plan: half the beam at x. Full width amidships, an elliptical bow, a rounded stern. */
export const SHIP = { bow: 70, stern: -70, beam: 12 } as const;
export function halfBeam(x: number): number {
  if (x > 34) return SHIP.beam * Math.sqrt(Math.max(0, 1 - ((x - 34) / (SHIP.bow - 34)) ** 2));
  if (x < -62) return SHIP.beam - ((-62 - x) ** 2) / 22;
  return SHIP.beam;
}

/** The hull's windows ([x from, x to, bottom, top] in world space, both sides): deck 3's cabin windows and deck 2's portholes. */
export const AURELIA_HULL_WINDOWS: [number, number, number, number][] = [];
for (let x = -62; x < 34; x += 4) if (x < -9 || x > 9) AURELIA_HULL_WINDOWS.push([x + 1.2, x + 2.8, D3 + 0.9, D3 + 2.3]);
for (const x of [-30, -22, -14, -6, 2, 10, 18, 26]) AURELIA_HULL_WINDOWS.push([x - 0.35, x + 0.35, D2 + 1.2, D2 + 1.9]);

const DECK2 = 'Deck 2 · Crew', DECK3 = 'Deck 3 · Staterooms', DECK4 = 'Deck 4 · Promenade', DECK5 = 'Deck 5 · Lido',
  DECK6 = 'Deck 6 · Meridian', DECK7 = 'Deck 7 · Bridge';

type Place = (type: FurnitureType, x: number, y: number, z: number, face?: Facing | number, opts?: FurnitureOptions) => void;
let f: Place;
/** Floor coverings: like MapBuilder.overlay, but leaving the stair holes open. */
let cover: (x0: number, z0: number, x1: number, z1: number, y: number, material: BlockMaterial, tint?: number) => void;

export function createAureliaMap(): MapDef {
  const m = new MapBuilder();
  // The ship's lamps were authored dim; the light pool makes brighter, longer-reaching ones cheap.
  m.lightGain = 1.8;
  m.lightReach = 1.25;
  f = (type, x, y, z, face = 'south', opts = {}) => m.furniture(type, x, y, z, face, opts);
  const holes = buildStairs(m);
  cover = (x0, z0, x1, z1, y, material, tint) => {
    for (const r of subtractRects(rect(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)), holes.get(y) ?? [])) {
      m.overlay(r.x0, r.z0, r.x1, r.z1, y, material, tint);
    }
  };
  buildHull(m);
  hullBarrier(m);
  buildDeck2(m, holes);
  buildDeck3(m, holes);
  buildDeck4(m, holes);
  buildDeck5(m, holes);
  buildDeck6(m, holes);
  buildDeck7(m, holes);
  buildPassengers(m);
  buildCrew(m);
  buildSea(m);
  buildZones(m);
  return {
    id: 'aurelia',
    name: 'The Aurelia',
    halfSize: 80,
    groundMaterial: 'concrete',
    noGround: true,
    blocks: m.blocks,
    props: m.props,
    zones: m.zones,
    // Your stateroom, 3110, facing the door.
    playerSpawn: { x: -18, y: D3, z: 7.0 },
    spawnYaw: 0,
    timeOfDay: 22.5,
    backdrop: 'openSea',
  };
}

// ---------------------------------------------------------------------------
// Stairs (built first: the decks need their holes)

type Holes = Map<number, Rect[]>;

/**
 * A switchback stairwell in a shaft x0..x0+8.4, on the given side of the centreline: flights along x
 * in two lanes, a landing at each end. Returns where each deck's slab needs a hole.
 */
function stairwell(m: MapBuilder, x0: number, side: 1 | -1, levels: readonly number[], holes: Holes, material: BlockMaterial = 'deckPaint', roof = false): void {
  const z = (a: number) => side * a;
  const laneA: [number, number] = [z(1.4), z(3.2)];
  const laneB: [number, number] = [z(3.4), z(5.2)];
  const [w0, w1] = [x0 + 2.1, x0 + 6.3];
  for (let i = 0; i < levels.length - 1; i++) {
    const lane = i % 2 === 0 ? laneA : laneB;
    const [s, e] = i % 2 === 0 ? [w0, w1] : [w1, w0];
    m.stairs('x', lane, s, e, levels[i], levels[i + 1], material);
    // The opening above runs right to the shaft wall (not just the lane's edge), so there's no lip to catch your head on.
    const open = i % 2 === 0 ? [z(1.3), z(3.2)] : [z(3.4), z(5.3)];
    const arr = holes.get(levels[i + 1]) ?? [];
    arr.push(rect(w0, Math.min(...open), w1, Math.max(...open)));
    holes.set(levels[i + 1], arr);
  }
  m.box(w0, levels[0], Math.min(z(3.2), z(3.4)), w1, ceil(levels[levels.length - 1]), Math.max(z(3.2), z(3.4)), 'plaster');
  // Shaft walls on each deck, a door at the landing where you come and go.
  levels.forEach((y, k) => {
    const doorX = k % 2 === 0 ? x0 + 1.05 : x0 + 7.35;
    const near = z(1.3), far = z(5.3);
    m.wall(x0, near, x0 + 8.4, near, y, ceil(y), 'plaster', { thickness: 0.15, openings: [doorway(doorX, 1.2)] });
    m.wall(x0, far, x0 + 8.4, far, y, ceil(y), 'plaster', { thickness: 0.15 });
    m.wall(x0, Math.min(near, far), x0, Math.max(near, far), y, ceil(y), 'plaster', { thickness: 0.15 });
    m.wall(x0 + 8.4, Math.min(near, far), x0 + 8.4, Math.max(near, far), y, ceil(y), 'plaster', { thickness: 0.15 });
    if (k > 0) m.light(x0 + 4.2, ceil(y) - CEILING_LIGHT, z(3.3), 0xf2f6ff, 5, 8);
  });
  // Out on an open deck, the top of the shaft gets a roof.
  if (roof) m.box(x0 - 0.1, ceil(levels[levels.length - 1]), Math.min(z(1.2), z(5.4)), x0 + 8.5, ceil(levels[levels.length - 1]) + 0.3, Math.max(z(1.2), z(5.4)), 'hull');
}

/** Where crew stairwell A (aft) and B (forward) start; their doors are at x0 + 1.05 and x0 + 7.35. */
const STAIR_A = -38.6, STAIR_B = 42;

/** The crew stairwells, the grand staircase in the atrium, the Meridian stair and the bridge stair. */
function buildStairs(m: MapBuilder): Holes {
  const holes: Holes = new Map();
  stairwell(m, STAIR_A, 1, [D2, D3, D4, D5], holes, 'deckPaint', true);
  stairwell(m, STAIR_B, 1, [D2, D3, D4, D5], holes, 'deckPaint', true);
  // Grand staircase: two sweeping flights up the atrium well (x -6..6, z -5..5 on decks 4 and 5).
  m.stairs('z', [-5.6, -3.6], -5, 5, D3, D4, 'marble', { rails: true, runner: 0x6e1b2a });
  m.stairs('z', [3.6, 5.6], 5, -5, D4, D5, 'marble', { rails: true, runner: 0x6e1b2a });
  for (const y of [D4, D5]) (holes.get(y) ?? holes.set(y, []).get(y)!).push(rect(-6, -5, 6, 5));
  // The Meridian stair, deck 5 lobby up into the VIP lounge.
  m.stairs('x', [-7.7, -5.9], -10.5, -5, D5, D6, 'marble', { runner: 0x1d2a44 });
  (holes.get(D6) ?? holes.set(D6, []).get(D6)!).push(rect(-10.5, -7.7, -5, -5.9));
  // The bridge stair, from the security office up to the sun deck.
  m.stairs('x', [6.0, 7.6], 7.5, 12.8, D6, D7, 'deckPaint');
  (holes.get(D7) ?? holes.set(D7, []).get(D7)!).push(rect(7.5, 6.0, 12.8, 7.6));
  return holes;
}

// ---------------------------------------------------------------------------
// Hull

/** The hull's sides from `y0` to `y1` between two stations: straight amidships, stepped where it curves. */
function hullSides(m: MapBuilder, y0: number, y1: number, xFrom: number, xTo: number, windows: (side: 1 | -1) => Opening[] = () => [], inner: BlockMaterial = 'plaster'): void {
  const a = Math.max(xFrom, -62), b = Math.min(xTo, 34);
  for (const side of [1, -1] as const) {
    const zc = side * SHIP.beam;
    const mat: WallMaterial = side > 0 ? [inner, 'hull'] : ['hull', inner];
    if (b > a) m.wall(a, zc, b, zc, y0, y1, mat, { thickness: 0.4, openings: windows(side), trim: false });
    // Forward of amidships the sides follow the bow's curve in slices, finer where it sweeps in fastest.
    for (let x = 34; x < xTo;) {
      const dx = x < 52 ? 1 : x < 62 ? 0.5 : 0.25;
      const hb = halfBeam(Math.min(xTo, x + dx));
      const hb0 = halfBeam(x);
      m.box(x, y0, side * (Math.max(hb, 0.2) - 0.35), Math.min(xTo, x + dx), y1, side * (hb0 + 0.05), 'hull');
      x += dx;
    }
    for (let x = xFrom; x < -62; x += 1) {
      const hb = halfBeam(x);
      const hb1 = halfBeam(x + 1);
      m.box(x, y0, side * (Math.min(hb, hb1) - 0.35), x + 1, y1, side * (Math.max(hb, hb1) + 0.05), 'hull');
    }
  }
  if (xFrom <= -69) m.box(xFrom - 0.4, y0, -halfBeam(xFrom) - 0.05, xFrom, y1, halfBeam(xFrom) + 0.05, 'hull');
}

/**
 * An invisible skin round the outside of the hull, deck 2 to well above the sun deck, so nobody
 * jumps or climbs over a rail into the sea. Each 1 m slice runs from just outside the hull out
 * past the widest beam, so the bow and stern curves leave no gaps between slices.
 */
function hullBarrier(m: MapBuilder): void {
  const y0 = D2, y1 = D7 + 4, out = SHIP.beam + 2;
  const stern = -68.4, bow = SHIP.bow;
  for (let x = Math.floor(stern); x < bow; x += 1) {
    const hb = Math.max(halfBeam(Math.max(x, stern)), halfBeam(x + 1));
    for (const side of [1, -1] as const) m.barrier(Math.max(x, stern), y0, side * (hb + 0.05), x + 1, y1, side * out);
  }
  m.barrier(stern - 1, y0, -out, stern - 0.05, y1, out);
  // And over the promenade's bulwark, so there's no standing on top of it.
  for (let x = Math.floor(stern); x < bow; x += 1) {
    const a = Math.max(x, stern), hb = Math.min(halfBeam(a), halfBeam(x + 1));
    for (const side of [1, -1] as const) m.barrier(a, D4 + 1.1, side * (hb - 0.2), x + 1, D4 + 3.2, side * (hb + 0.05));
  }
  m.barrier(stern, D4 + 1.1, -halfBeam(stern), stern + 0.45, D4 + 3.2, halfBeam(stern));
  m.barrier(bow, y0, -out, bow + 1, y1, out);
}

/** A deck slab following the hull, from xFrom to xTo, at most `inset` in from the side. */
function deckSlab(m: MapBuilder, y: number, xFrom: number, xTo: number, floor: BlockMaterial, holes: Rect[], ceiling: BlockMaterial | undefined = 'ceiling', maxHalf: number = SHIP.beam): void {
  const a = Math.max(xFrom, -62), b = Math.min(xTo, 34);
  const opts = { ceiling, holes };
  if (b > a) m.slab(rect(a, -maxHalf, b, maxHalf), y, floor, opts);
  for (let x = 34; x < xTo; x += 1) {
    const hb = Math.min(maxHalf, halfBeam(x + 0.5));
    if (hb > 0.5) m.slab(rect(x, -hb, Math.min(xTo, x + 1), hb), y, floor, opts);
  }
  for (let x = xFrom; x < -62; x += 1) {
    const hb = Math.min(maxHalf, halfBeam(x + 0.5));
    m.slab(rect(x, -hb, x + 1, hb), y, floor, opts);
  }
}

/** Glass railing along the deck edge between two stations (both sides), following the hull's curve. */
function edgeRail(m: MapBuilder, y: number, xFrom: number, xTo: number, maxHalf: number = SHIP.beam): void {
  for (const side of [1, -1] as const) {
    for (let x = xFrom; x < xTo; x += 2) {
      const x1 = Math.min(xTo, x + 2);
      const hb = Math.min(maxHalf, halfBeam(x1), halfBeam(x)) - 0.2;
      m.railing(x, side * hb, x1, side * hb, y);
      // Nothing to stand on along the top of it either.
      m.barrier(x, y + 1.05, side * hb - 0.05, x1, y + 3.2, side * hb + 0.05);
      const next = Math.min(maxHalf, halfBeam(Math.min(xTo, x1 + 2)), halfBeam(x1)) - 0.2;
      if (x1 < xTo && Math.abs(next - hb) > 0.05) {
        m.railing(x1, side * Math.min(hb, next), x1, side * Math.max(hb, next), y);
        m.barrier(x1 - 0.05, y + 1.05, side * Math.min(hb, next), x1 + 0.05, y + 3.2, side * Math.max(hb, next));
      }
    }
  }
}

function buildHull(m: MapBuilder): void {
  // Below deck 2 and the shell up to the promenade's bulwark (the client draws the smooth outer hull over this).
  deckSlab(m, D2, -68, 58, 'deckPaint', [], undefined);
  // Cabin windows on deck 3, one per four-metre module; portholes on deck 2.
  const windowsOn = (deck: number) => (): Opening[] => AURELIA_HULL_WINDOWS
    .filter(w => w[2] >= deck && w[3] <= deck + 3.5).map(([a, b, y0, y1]) => glazing(a, b, y0 - deck, y1 - deck));
  const cabinWindows = windowsOn(D3);
  const portholes = windowsOn(D2);
  hullSides(m, D2, D3, -68, 52, portholes);
  hullSides(m, D3, D4, -68, 58, cabinWindows);
  // The promenade's bulwark (rail height), round the whole of deck 4.
  hullSides(m, D4, D4 + 1.1, -68, SHIP.bow);
  m.box(-68.4, D2, -halfBeam(-68) - 0.05, -68, D4 + 1.1, halfBeam(-68) + 0.05, 'hull');
  // Forward bulkheads close the bow below the foredeck.
  m.wall(52, -halfBeam(52), 52, halfBeam(52), D2, D3, 'plaster', { thickness: 0.3 });
  m.wall(58, -halfBeam(58), 58, halfBeam(58), D3, D4, 'plaster', { thickness: 0.3 });
  m.wall(-66, -halfBeam(-66), -66, halfBeam(-66), D2, D4, 'plaster', { thickness: 0.3 });
}

// ---------------------------------------------------------------------------
// Deck 2: crew

function buildDeck2(m: MapBuilder, holes: Holes): void {
  const y = D2, t = ceil(y);
  cover(-40, -1.2, 52, 1.2, y, 'deckPaint', 0x5f6b68);
  // Engine room aft, behind a bulkhead.
  m.wall(-40, -11.6, -40, 11.6, y, t, 'plaster', { openings: [doorway(0, 1.4)] });
  for (const z of [-4.2, 4.2]) f('shipEngine', -53, y, z, 'south');
  f('desk', -42.5, y, -8, 'east', { w: 2.4 });
  f('officeChair', -43.4, y, -8, 'west');
  for (const x of [-60, -47]) m.box(x, y, -11.5, x + 0.5, t, -10.8, 'metal');
  m.box(-64, y + 2.4, -0.3, -41, y + 2.7, 0.3, 'metal');
  // The engine control station, pipework overhead, spares and tools along the sides.
  f('controlPanel', -41, y, 6.5, 'west', { w: 3.2 });
  f('officeChair', -42.2, y, 6.5, 'east');
  for (const z of [-9.4, 9.4]) f('pipeRun', -53, y + 2.55, z, 'south', { w: 22 });
  f('pipeRun', -53, y + 2.55, 0, 'south', { w: 22, d: 0.5 });
  for (const x of [-66.5, -63.5]) f('storageRack', x, y, 10.9, 'north', { w: 2.4 });
  f('toolChest', -46, y, 10.95, 'north');
  f('gunLocker', -44.2, y, 11.05, 'north');
  for (const z of [-7, 7]) m.light(-62, t - CEILING_LIGHT, z, 0xe8f0ff, 6, 12);
  m.light(-53, t - CEILING_LIGHT, 0, 0xe8f0ff, 10, 16);
  m.light(-45, t - CEILING_LIGHT, 0, 0xffd9a8, 5, 10);
  // The long crew corridor ("I-95") from the engine room to the forward stores.
  const corridorDoors = (side: 1 | -1): Opening[] => (side > 0
    ? [doorway(STAIR_A + 1.05, 1.2), doorway(-20, 1.4), doorway(-6, 1.2), doorway(2, 1.2), doorway(10, 1.2), doorway(18, 1.2), doorway(25, 1.2)]
    : [doorway(-33, 1.2), doorway(-15, 1.4), doorway(8, 1.4), doorway(30, 1.8)]);
  m.wall(-40, 1.2, STAIR_A, 1.2, y, t, 'plaster', { thickness: 0.15 });
  m.wall(STAIR_A + 8.4, 1.2, 42, 1.2, y, t, 'plaster', { openings: corridorDoors(1).filter(o => o.from > STAIR_A + 8.4), thickness: 0.15 });
  m.wall(-40, -1.2, 52, -1.2, y, t, 'plaster', { openings: corridorDoors(-1), thickness: 0.15 });
  m.wall(50.4, 1.2, 52, 1.2, y, t, 'plaster', { thickness: 0.15 });
  for (const x of [-30, -6]) m.light(x, t - CEILING_LIGHT, 0, 0xf2f6ff, 6, 12);
  m.light(22, t - CEILING_LIGHT, 0, 0xf2f6ff, 6, 12);
  // Port side: laundry, galley, provisions, cargo hold.
  m.wall(-28, -11.6, -28, -1.3, y, t, 'plaster', { thickness: 0.15 });
  m.wall(-4, -11.6, -4, -1.3, y, t, 'plaster', { thickness: 0.15 });
  m.wall(20, -11.6, 20, -1.3, y, t, 'plaster', { thickness: 0.15 });
  for (const x of [-38.4, -37.3, -36.2, -35.1, -34, -32.9]) f('washer', x, y, -11.15, 'south', { w: 1.0 });
  f('counter', -33.5, y, -6, 'north', { w: 4 });
  for (const [x, z] of [[-37.5, -7.5], [-30.5, -9.5], [-29.6, -3.6]]) f('laundryCart', x, y, z, 'south');
  f('storageRack', -28.45, y, -7, 'west', { w: 3 });
  m.light(-34, t - CEILING_LIGHT, -7, 0xf2f6ff, 6, 10);
  cover(-28, -11.6, -4, -1.3, y, 'tile');
  f('counter', -16, y, -11.25, 'south', { w: 20 });
  f('island', -16, y, -6);
  f('fridge', -27.3, y, -4, 'east');
  f('rangeHood', -16, y + 1.7, -11.5);
  f('galleyRange', -10, y, -6, 'south');
  f('galleyRange', -22, y, -6, 'south');
  f('storageRack', -4.45, y, -8, 'west', { w: 3 });
  f('wallCabinet', -16, y + 1.5, -11.45, 'south', { w: 6 });
  m.light(-16, t - CEILING_LIGHT, -6, 0xffffff, 7, 12);
  for (let i = 0; i < 7; i++) m.box(-2 + i * 3, y, -11.2, -0.6 + i * 3, y + 1.6 + (i % 3) * 0.3, -9.8, 'crate');
  for (const x of [-1.5, 2, 13, 16.5]) f('storageRack', x, y, -5.6, 'south', { w: 3 });
  f('fridge', 19.4, y, -3, 'west');
  m.light(8, t - CEILING_LIGHT, -6, 0xf2f6ff, 6, 12);
  // Crates in rows with room to walk between (Castell's money is in them).
  for (let i = 0; i < 9; i++) m.box(22 + (i % 3) * 4.4, y, -10.8 + Math.floor(i / 3) * 3.6, 24.6 + (i % 3) * 4.4, y + 1.2 + (i % 2) * 1.2, -8.6 + Math.floor(i / 3) * 3.6, i % 2 ? 'crateGreen' : 'crate');
  m.light(34, t - CEILING_LIGHT, -6, 0xfff2dc, 6, 12);
  m.light(45, t - CEILING_LIGHT, -6, 0xfff2dc, 5, 12);
  f('pipeRun', 36, y + 2.55, -11.1, 'south', { w: 30 });
  // Starboard: crew stair A (aft), crew mess, crew cabins, brig, crew stair B (forward).
  diningTable(m, -20, y, 6.5, 6, 1.1);
  m.wall(-28, 1.3, -28, 11.6, y, t, 'plaster', { thickness: 0.15 });
  m.wall(-12, 1.3, -12, 11.6, y, t, 'plaster', { thickness: 0.15 });
  f('counter', -14, y, 11.2, 'north', { w: 3 });
  f('fridge', -12.5, y, 8.5, 'west');
  f('sofa', -26.9, y, 9, 'east', { w: 2.2, color: 0x4a5560 });
  f('coffeeTable', -25.6, y, 9, 'east', { w: 1.0 });
  f('dartboard', -20, y + 1.5, 11.55, 'north');
  m.light(-20, t - CEILING_LIGHT, 6.5, 0xfff2dc, 6, 12);
  for (const x of [-8, 0, 8, 16]) {
    m.wall(x + 4, 1.3, x + 4, 11.6, y, t, 'plaster', { thickness: 0.15 });
    f('bunkBed', x + 1.3, y, 10.9, 'north');
    f('bunkBed', x + 1.3, y, 7.6, 'south');
    f('wardrobe', x + 3.4, y, 4, 'west', { w: 1.0 });
    f('crewLocker', x + 1.3, y, 5.85, 'north', { w: 1.6 });
    m.light(x + 2, t - CEILING_LIGHT, 7, 0xffe6c4, 3, 6);
  }
  // Brig: two cells behind bars.
  m.wall(20, 1.3, 20, 11.6, y, t, 'plaster', { thickness: 0.15 });
  m.wall(30, 1.3, 30, 11.6, y, t, 'plaster', { thickness: 0.15 });
  for (const x of [22, 26]) for (let k = 0; k < 7; k++) m.box(x + k * 0.5, y, 6.4, x + k * 0.5 + 0.06, t, 6.46, 'metal');
  m.wall(20, 6.4, 30, 6.4, y + 2.4, t, 'plaster', { thickness: 0.1, trim: false });
  m.light(25, t - CEILING_LIGHT, 3.5, 0xf2f6ff, 4, 8);
  deckSlab(m, D3, -68, 58, 'carpet', holes.get(D3) ?? []);
}

// ---------------------------------------------------------------------------
// Deck 3: staterooms

/** A stateroom (4 m along the corridor): bed, nightstands, desk, a wardrobe, a little bathroom. */
function stateroom(m: MapBuilder, x: number, side: 1 | -1, open: boolean, y: number): void {
  const t = ceil(y);
  const z = (a: number) => side * a;
  m.wall(x + 4, z(1.3), x + 4, z(11.6), y, t, 'plaster', { thickness: 0.15 });
  if (!open) return;
  f('bed', x + 2, y, z(8.6), side > 0 ? 'north' : 'south', { w: 1.8 });
  f('nightstand', x + 0.55, y, z(10.9), side > 0 ? 'north' : 'south');
  f('nightstand', x + 3.45, y, z(10.9), side > 0 ? 'north' : 'south');
  f('desk', x + 3.55, y, z(5.2), 'west', { w: 1.3 });
  f('officeChair', x + 2.9, y, z(5.2), 'east');
  f('wardrobe', x + 0.45, y, z(5.0), 'east', { w: 1.1 });
  f('rug', x + 2, y, z(7.2), 'south', { w: 2.2, d: 1.6, variant: 1 });
  // The bathroom in the corner by the door.
  m.wall(x, z(3.4), x + 1.8, z(3.4), y, t, 'plaster', { thickness: 0.1 });
  m.wall(x + 1.8, z(1.35), x + 1.8, z(3.4), y, t, 'plaster', { thickness: 0.1, openings: [doorway(side > 0 ? 2.6 : -2.6, 0.7)] });
  f('toilet', x + 0.45, y, z(2.9), side > 0 ? 'north' : 'south');
  f('vanity', x + 1.3, y, z(3.1), side > 0 ? 'north' : 'south', { w: 0.8 });
  cover(x, Math.min(z(1.35), z(3.4)), x + 1.8, Math.max(z(1.35), z(3.4)), y, 'tile');
  m.light(x + 2.4, t - CEILING_LIGHT, z(7.5), 0xffe6c4, 4, 7);
}

/** A row of staterooms along the corridor; `open` lists the ones you can get into. */
function staterooms(m: MapBuilder, from: number, count: number, side: 1 | -1, open: number[], y: number): Opening[] {
  const doors: Opening[] = [];
  for (let i = 0; i < count; i++) {
    const x = from + i * 4;
    const isOpen = open.includes(i);
    stateroom(m, x, side, isOpen, y);
    if (isOpen) doors.push(doorway(x + 2.6, 0.95));
    else {
      // A cabin door you can't open: panel, frame and number plate on the corridor wall.
      const zc = side * 1.2 - side * 0.11;
      m.box(x + 2.15, y, zc - 0.03, x + 3.05, y + 2.1, zc + 0.03, 'darkWood');
      m.box(x + 2.5, y + 1.5, zc - side * 0.04, x + 2.7, y + 1.62, zc - side * 0.02, 'brass');
    }
  }
  if (from + count * 4 < 1e9) m.wall(from, side * 1.3, from, side * 11.6, y, ceil(y), 'plaster', { thickness: 0.15 });
  return doors;
}

function buildDeck3(m: MapBuilder, holes: Holes): void {
  const y = D3, t = ceil(y);
  cover(-64, -1.2, 52, 1.2, y, 'carpet', 0x6e1b2a);
  // Starboard: staterooms 3101-3105, housekeeping round crew stair A, 3106-3111 (yours is the fifth),
  // the purser's office, 3112-3116, the forward stores round crew stair B.
  const starboard: Opening[] = [
    ...staterooms(m, -64, 6, 1, [], y),
    // Housekeeping: a passage beside the stair shaft to the linen room behind it.
    doorway(-39.3, 1.2),
    doorway(STAIR_A + 7.35, 1.2),
    ...staterooms(m, -28, 4, 1, [0, 2], y),
    doorway(10, 1.6),
    ...staterooms(m, 19, 5, 1, [1], y),
    doorway(STAIR_B + 7.35, 1.2),
  ];
  m.wall(-40, 1.3, -40, 11.6, y, t, 'plaster', { thickness: 0.15 });
  m.wall(-12, 1.3, -12, 11.6, y, t, 'plaster', { thickness: 0.15 });
  // Purser's office and guest services.
  m.wall(7, 1.3, 7, 11.6, y, t, 'plaster', { thickness: 0.15 });
  m.wall(19, 1.3, 19, 11.6, y, t, 'plaster', { thickness: 0.15 });
  f('executiveDesk', 13, y, 7.5, 'north');
  f('officeChair', 13, y, 8.6, 'north');
  f('safe', 18.4, y, 10.9, 'west');
  f('bookshelf', 8, y, 10.9, 'south', { w: 1.8, h: 2.2 });
  f('counter', 13, y, 3.4, 'north', { w: 4 });
  m.light(13, t - CEILING_LIGHT, 6, 0xfff0d8, 6, 10);
  // Housekeeping's linen room behind crew stair A, and the forward stores behind stair B.
  f('storageRack', -39.6, y, 8.4, 'east', { w: 3.6 });
  f('storageRack', -28.45, y, 8.4, 'west', { w: 3.6 });
  f('laundryCart', -31.4, y, 7, 'south');
  f('laundryCart', -36.6, y, 6.6, 'south');
  m.light(-34, t - CEILING_LIGHT, 8.4, 0xf2f6ff, 5, 9);
  for (const x of [44, 47.4]) f('storageRack', x, y, 11.3, 'north', { w: 3 });
  f('storageRack', 50.6, y, 8.4, 'west', { w: 3 });
  for (const [x, z] of [[43.2, 7.2], [44.6, 7.4]]) m.box(x - 0.55, y, z - 0.55, x + 0.55, y + 1.1, z + 0.55, 'crate');
  m.light(46.5, t - CEILING_LIGHT, 8.4, 0xf2f6ff, 4, 9);
  m.wall(-64, 1.2, -7, 1.2, y, t, 'plaster', { thickness: 0.15, openings: starboard.filter(o => o.to < -7) });
  m.wall(7, 1.2, 52, 1.2, y, t, 'plaster', { thickness: 0.15, openings: starboard.filter(o => o.from > 7) });
  // Port: staterooms 3151-3164, the embarkation lobby, medical, 3165-3170.
  const port: Opening[] = [
    ...staterooms(m, -63, 14, -1, [3, 9], y),
    doorway(14, 3.0),
    doorway(24, 1.2),
    ...staterooms(m, 27, 6, -1, [2], y),
  ];
  m.wall(-64, -1.2, -7, -1.2, y, t, 'plaster', { thickness: 0.15, openings: port.filter(o => o.to < -7) });
  m.wall(7, -1.2, 52, -1.2, y, t, 'plaster', { thickness: 0.15, openings: port.filter(o => o.from > 7) });
  m.wall(-64, -11.6, -64, 11.6, y, t, 'plaster', { thickness: 0.15 });
  m.wall(51, -11.6, 51, 11.6, y, t, 'plaster', { thickness: 0.15 });
  // Embarkation lobby: where you came aboard (the shell door is shut now), and medical.
  m.wall(7, -11.6, 7, -1.3, y, t, 'plaster', { thickness: 0.15 });
  m.wall(21, -11.6, 21, -1.3, y, t, 'plaster', { thickness: 0.15 });
  m.wall(27, -11.6, 27, -1.3, y, t, 'plaster', { thickness: 0.15 });
  cover(7.1, -11.6, 20.9, -1.3, y, 'marble');
  m.box(11.5, y, -11.75, 16.5, y + 2.6, -11.6, 'steel');
  f('consoleTable', 9, y, -8, 'east', { w: 1.6 });
  f('plantLarge', 20.2, y, -11);
  f('plantLarge', 7.8, y, -11);
  m.light(14, t - CEILING_LIGHT, -6.5, 0xfff0d8, 7, 12);
  f('bed', 24, y, -10.6, 'north', { w: 1.1 });
  f('desk', 25.8, y, -4, 'west', { w: 1.2 });
  m.light(24, t - CEILING_LIGHT, -6.5, 0xf2f6ff, 4, 8);
  // The atrium's lowest floor: marble, the grand staircase rising out of it, a piano.
  m.wall(-7, -7, -7, -1.2, y, t, 'plaster', { thickness: 0.2 });
  m.wall(-7, 1.2, -7, 7, y, t, 'plaster', { thickness: 0.2 });
  m.wall(7, -7, 7, -1.2, y, t, 'plaster', { thickness: 0.2 });
  m.wall(7, 1.2, 7, 7, y, t, 'plaster', { thickness: 0.2 });
  m.wall(-7, -7, 7, -7, y, t, 'plaster', { thickness: 0.2 });
  m.wall(-7, 7, 7, 7, y, t, 'plaster', { thickness: 0.2 });
  cover(-6.9, -6.9, 6.9, 6.9, y, 'marble');
  f('grandPiano', 1.2, y, -1.5, 'west');
  f('pianoBench', 2.4, y, -1.5, 'west');
  f('medallion', 0.5, y, 3.5, 'south', { w: 2.6 });
  for (const sx of [-1, 1]) f('plantLarge', sx * 6.3, y, 6.3);
  deckSlab(m, D4, -68, 64, 'carpet', holes.get(D4) ?? []);
}

// ---------------------------------------------------------------------------
// Deck 4: promenade

function buildDeck4(m: MapBuilder, holes: Holes): void {
  const y = D4, t = ceil(y);
  const SUP = 9;
  // The superstructure (z ±9) with big windows; the open promenade outside it, teak to the bulwark.
  const sideWindows = (): Opening[] => {
    const out: Opening[] = [];
    for (let x = -56; x < 38; x += 4) if (![-46, -22, 14, 30].some(d => Math.abs(d - (x + 2)) < 2.1)) out.push(glazing(x + 0.4, x + 3.6, 0.7, 2.7));
    return out;
  };
  const doors = [-46, -22, 14, 30].map(x => doorway(x, 1.6));
  for (const side of [1, -1] as const) {
    m.wall(-58, side * SUP, 40, side * SUP, y, t, side > 0 ? ['plaster', 'hull'] : ['hull', 'plaster'], { thickness: 0.3, openings: [...sideWindows(), ...doors] });
    cover(-68, side > 0 ? SUP : -SHIP.beam, 64, side > 0 ? SHIP.beam : -SUP, y, 'teak');
  }
  m.wall(-58, -SUP, -58, SUP, y, t, ['hull', 'plaster'], { thickness: 0.3, openings: [doorway(-4, 1.6), doorway(4, 1.6), glazing(-2.6, 2.6, 0.7, 2.7)] });
  m.wall(40, -SUP, 40, SUP, y, t, ['plaster', 'hull'], { thickness: 0.3, openings: [doorway(-6, 1.4)] });
  // Aft mooring deck and the foredeck, open to the sky.
  cover(-68, -SUP, -58, SUP, y, 'deckPaint', 0x6a7472);
  cover(40, -SUP, 64, SUP, y, 'deckPaint', 0x6a7472);
  // The foredeck runs right up into the bow (there's nothing under it but the forepeak).
  for (let x = 64; x < SHIP.bow; x += 1) {
    const hb = halfBeam(x + 0.5);
    if (hb > 0.5) m.box(x, y - 0.3, -hb, x + 1, y + 0.03, hb, 'deckPaint', 0x6a7472);
  }
  for (const [x, z] of [[-64, -6], [-64, 6], [-61, 0], [52.5, -5], [52.5, 7], [58, 0]]) f('bollard', x, y, z, 'south');
  m.box(54, y, -1.2, 56, y + 1.1, 1.2, 'metal', 0x2b2f33);
  for (const side of [1, -1]) for (const x of [-30, -6, 18]) f('lifeRing', x, y + 0.35, side * (SHIP.beam - 0.28), side > 0 ? 'north' : 'south');
  // Lifeboats hang outboard of the promenade.
  for (const side of [1, -1]) for (const x of [-44, -30, -16, -2, 12, 26]) f('lifeboat', x, y + 1.4, side * (SHIP.beam + 1.6), side > 0 ? 'north' : 'south');

  // Restaurant aft: tables for two and four, a bandstand, chandeliers.
  m.wall(-30, -SUP, -30, SUP, y, t, 'plaster', { openings: [doorway(-5, 2.4), doorway(5, 2.4)] });
  cover(-57.8, -8.8, -30.1, 8.8, y, 'carpet', 0x2c3e66);
  for (let i = 0; i < 4; i++) for (const z of [-6, 6.6]) if (z < 0 || i < 3) diningTable(m, -55 + i * 5, y, z, 1.4, 1.0, 0xf4f1ea);
  for (let i = 0; i < 3; i++) diningTable(m, -52 + i * 5.5, y, -1.2, 1.8, 1.1, 0xf4f1ea);
  for (const x of [-52, -40]) m.props.push({ kind: 'chandelier', x, y: t - 0.3, z: 0 });
  // Casino: slots along the walls, card tables, roulette, the cashier's cage and a bar.
  cover(-29.9, -8.8, -8.1, 8.8, y, 'casinoCarpet');
  for (let i = 0; i < 9; i++) {
    f('slotMachine', -28 + i * 1.0, y, -8.4, 'south', { color: [0x7a1424, 0x1d3557, 0x5a189a][i % 3] });
    f('slotMachine', -28 + i * 1.0, y, 8.4, 'north', { color: [0x1d3557, 0x7a1424, 0x5a189a][i % 3] });
  }
  for (const [x, z] of [[-24, -3.2], [-24, 3.2], [-12.5, 3.4]]) {
    f('cardTable', x, y, z, 'south');
    for (const a of [0.6, 1.6, 2.6, -0.6, -1.6, -2.6]) f('barStool', x + Math.sin(a) * 1.45, y, z + Math.cos(a) * 0.95, a);
  }
  f('rouletteTable', -17.5, y, 0, 'south');
  f('rouletteTable', -12.5, y, -3.6, 'south');
  m.wall(-9, -SUP, -9, -5.5, y, t, 'plaster', { thickness: 0.15 });
  for (let k = 0; k < 8; k++) m.box(-9.05, y + 1.1, -5.5 + k * 0.42, -8.95, t - 0.6, -5.48 + k * 0.42, 'brass');
  m.box(-9.4, y, -5.5, -9.2, y + 1.1, -2, 'darkWood');
  f('barCounter', -20, y, 7.3, 'south', { w: 4 });
  f('backBar', -20, y, 8.6, 'south', { w: 4 });
  for (const x of [-26, -18, -12]) m.light(x, t - CEILING_LIGHT, 0, 0xffd29a, 7, 12);
  // Atrium gallery: railings round the well, the staircase arriving and leaving at z = 5.
  cover(-8, -8.8, 8, 8.8, y, 'marble');
  m.railing(-6, -5, 6, -5, y);
  m.railing(-6, -5, -6, 5, y);
  m.railing(6, -5, 6, 5, y);
  m.railing(-3.5, 5, 3.5, 5, y);
  m.props.push({ kind: 'chandelier', x: 0, y: D6 - 0.6, z: 0, castShadow: false });
  // Boutiques: watches and jewellery in cases, a clothes rail, a perfume counter.
  m.wall(8, -SUP, 8, -5.5, y, t, 'plaster', { thickness: 0.15 });
  m.wall(8, 5.5, 8, SUP, y, t, 'plaster', { thickness: 0.15 });
  m.wall(14, -SUP, 14, -2, y, t, 'plaster', { thickness: 0.15, openings: [doorway(-5, 1.6)] });
  for (const z of [-7, -4.5]) f('displayCase', 11, y, z, 'south');
  f('clothesRail', 18, y, -7.8, 'north');
  f('clothesRail', 18, y, 7.8, 'south');
  f('counter', 11, y, 7.8, 'south', { w: 3 });
  m.light(11, t - CEILING_LIGHT, -5.5, 0xfff4e6, 5, 9);
  m.light(17, t - CEILING_LIGHT, 5, 0xfff4e6, 5, 9);
  // The Starlight Lounge: a stage at the bow end, seats, a bar, a dance floor.
  m.wall(20, -SUP, 20, SUP, y, t, 'plaster', { openings: [doorway(-4, 2.4), doorway(4, 2.4)] });
  cover(20.1, -8.8, 39.9, 8.8, y, 'carpet', 0x241a3a);
  m.box(35, y, -7, 40, y + 0.6, 7, 'wood');
  cover(27, -3.5, 34, 3.5, y, 'marble', 0x1a1a24);
  for (let i = 0; i < 4; i++) for (const z of [-6.5, 6.5]) {
    f('armchair', 23 + i * 3, y, z, z > 0 ? 'north' : 'south', { color: 0x5a2a4a });
    f('sideTable', 23 + i * 3 + 1.1, y, z);
  }
  f('barCounter', 23, y, 0, 'east', { w: 3.6 });
  f('speakerStack', 37, y + 0.6, -6, 'west');
  f('speakerStack', 37, y + 0.6, 6, 'west');
  f('grandPiano', 37.5, y + 0.6, -2.5, 'west');
  m.light(30, t - CEILING_LIGHT, 0, 0xc49aff, 7, 14);
  m.light(37, t - CEILING_LIGHT, 0, 0xffd6a0, 6, 9);
  // Warm pools over the seats along each side, and the bar.
  for (const z of [-6, 6]) m.light(27.5, t - CEILING_LIGHT, z, 0xffc890, 4, 9);
  m.light(23, t - CEILING_LIGHT, 0, 0xffd6a0, 4, 8);
  f('discoBall', 30.5, y, 0, 'south', { h: t - y });
  // Outside lights along the promenades.
  for (const side of [1, -1]) for (const x of [-40, -10, 22]) m.light(x, t - CEILING_LIGHT, side * 10.5, 0xffe2b8, 4, 9, false);
  // Deck 5 overhead (covers the promenades too).
  deckSlab(m, D5, -66, 50, 'teak', holes.get(D5) ?? []);
}

// ---------------------------------------------------------------------------
// Deck 5: lido

function buildDeck5(m: MapBuilder, holes: Holes): void {
  const y = D5, t = ceil(y);
  const SUP = 9;
  // The superstructure from -22 to 34.
  const windows = (): Opening[] => [-20, -14, -8, 2, 8, 20, 26].map(x => glazing(x, x + 4, 0.6, 2.7));
  for (const side of [1, -1] as const) {
    m.wall(-22, side * SUP, 34, side * SUP, y, t, side > 0 ? ['plaster', 'hull'] : ['hull', 'plaster'], { thickness: 0.3, openings: [...windows(), doorway(-17, 1.6), doorway(14, 1.6)] });
  }
  m.wall(-22, -SUP, -22, SUP, y, t, ['hull', 'plaster'], { thickness: 0.3, openings: [doorway(-3, 2.2), doorway(3, 2.2), glazing(-8.5, -4.5, 0.6, 2.7), glazing(4.5, 8.5, 0.6, 2.7)] });
  m.wall(34, -SUP, 34, SUP, y, t, ['plaster', 'hull'], { thickness: 0.3, openings: [doorway(0, 1.6), glazing(-7, -2, 0.6, 2.7), glazing(2, 7, 0.6, 2.7)] });
  edgeRail(m, y, -66, 50);
  m.railing(-66, -halfBeam(-66) + 0.2, -66, halfBeam(-66) - 0.2, y);
  // Pool deck aft: a raised pool, hot tubs, loungers under umbrellas, a bar and the DJ.
  m.box(-60.4, y, -4.4, -45.6, y + 0.9, -4, 'poolTile');
  m.box(-60.4, y, 4, -45.6, y + 0.9, 4.4, 'poolTile');
  m.box(-60.4, y, -4, -60, y + 0.9, 4, 'poolTile');
  m.box(-46, y, -4, -45.6, y + 0.9, 4, 'poolTile');
  m.box(-60, y, -4, -46, y + 0.05, 4, 'poolTile');
  m.box(-60, y + 0.05, -4, -46, y + 0.75, 4, 'water');
  for (const z of [-2, 2]) m.box(-45.6, y, z - 0.6, -44.6, y + 0.45, z + 0.6, 'poolTile');
  for (const [x, z] of [[-40, -7.5], [-40, 7.5]]) {
    m.box(x - 1.3, y, z - 1.3, x + 1.3, y + 0.8, z + 1.3, 'poolTile');
    m.box(x - 1.1, y + 0.1, z - 1.1, x + 1.1, y + 0.7, z + 1.1, 'water');
  }
  for (let i = 0; i < 7; i++) for (const z of [-9.6, 9.6]) f('lounger', -63 + i * 2.2, y, z, z > 0 ? 'north' : 'south');
  for (const x of [-60, -53, -46]) for (const z of [-7.6, 7.6]) f('umbrella', x, y, z);
  f('partyBar', -28, y, 6.8, 'west');
  // The DJ plays aft, over the pool (facing forward, the lasers would shine through the buffet).
  f('djBooth', -27, y, -6.5, 'west');
  f('speakerStack', -27, y, -9.2, 'west');
  f('stringLights', -45, y + 3.4, 0, 'south', { w: 36 });
  for (const x of [-56, -40]) for (const side of [1, -1]) m.light(x, y + 3.2, side * 5, 0xffd6a0, 4, 10, false);
  m.light(-48, y + 0.5, 0, 0x2fb9ff, 4, 9, false);
  // Buffet.
  // (Its port end is the Meridian stair lobby's wall.)
  m.wall(-10, 6.2, -10, SUP, y, t, 'plaster', { thickness: 0.15 });
  cover(-21.9, -8.8, -10.1, 8.8, y, 'tile');
  f('counter', -16, y, 0, 'south', { w: 7 });
  f('counter', -16, y, 1.0, 'north', { w: 7 });
  for (const [x, z] of [[-19, -6], [-13, -6], [-19, 6.2], [-13, 6.2]]) diningTable(m, x, y, z, 1.4, 1.0);
  m.light(-16, t - CEILING_LIGHT, -4, 0xfff2dc, 6, 10);
  m.light(-16, t - CEILING_LIGHT, 4, 0xfff2dc, 6, 10);
  // The Meridian stair lobby: guarded, up to deck 6.
  m.wall(-12, -5.6, -3.5, -5.6, y, t, 'plaster', { thickness: 0.15, openings: [doorway(-11.2, 1.2)] });
  m.wall(-3.5, -SUP, -3.5, -5.6, y, t, 'plaster', { thickness: 0.15 });
  m.wall(-12, -SUP, -12, -5.6, y, t, 'plaster', { thickness: 0.15 });
  m.light(-8, t - CEILING_LIGHT, -7.6, 0xfff0d8, 3, 6);
  // Atrium gallery at the top of the well; deck 4's flight arrives at z = -5.
  cover(-8, -6.1, 8, 8.8, y, 'marble');
  m.railing(-6, 5, 6, 5, y);
  m.railing(-6, -5, -6, 5, y);
  m.railing(6, -5, 6, 5, y);
  m.railing(-6, -5, 3.5, -5, y);
  // Lido bar and lounge.
  m.wall(8, -SUP, 8, -5.5, y, t, 'plaster', { thickness: 0.15 });
  m.wall(8, 5.5, 8, SUP, y, t, 'plaster', { thickness: 0.15 });
  f('barCounter', 12, y, -7, 'south', { w: 5 });
  f('backBar', 12, y, -8.6, 'south', { w: 5 });
  for (let i = 0; i < 4; i++) f('barStool', 10 + i * 1.3, y, -5.9, 'north');
  f('sofa', 12, y, 7.8, 'north', { color: 0x2c5a6a });
  f('coffeeTable', 12, y, 6.2);
  m.light(12, t - CEILING_LIGHT, -4, 0xffc98a, 6, 10);
  // Spa: treatment beds, a sauna, a plunge pool.
  m.wall(16, -SUP, 16, SUP, y, t, 'plaster', { thickness: 0.15, openings: [doorway(0, 1.6)] });
  cover(16.1, -8.8, 33.9, 8.8, y, 'tile');
  for (const x of [19, 23]) f('bed', x, y, -7, 'south', { w: 0.9, color: 0xf4f1ea });
  m.box(27, y, 4, 33.6, y + 0.7, 8.6, 'poolTile');
  m.box(27.3, y + 0.1, 4.3, 33.3, y + 0.6, 8.3, 'water');
  m.wall(27, -SUP, 27, -3.5, y, t, 'wood', { thickness: 0.12, openings: [doorway(-5, 0.8)] });
  m.wall(27, -3.5, 33.8, -3.5, y, t, 'wood', { thickness: 0.12 });
  m.light(22, t - CEILING_LIGHT, 0, 0xe6f6ff, 6, 12);
  // Observation deck forward.
  cover(34, -10, 50, 10, y, 'teak');
  for (const z of [-4, 4]) f('gardenBench', 40, y, z, z > 0 ? 'north' : 'south');
  // Deck 6 overhead: covers the superstructure; aft of it the pool deck is open to the sky.
  deckSlab(m, D6, -30, 34, 'teak', holes.get(D6) ?? [], 'ceiling', 10.5);
}

// ---------------------------------------------------------------------------
// Deck 6: the Meridian

function buildDeck6(m: MapBuilder, holes: Holes): void {
  const y = D6, t = ceil(y);
  const SUP = 8;
  for (const side of [1, -1] as const) {
    m.wall(-12, side * SUP, 30, side * SUP, y, t, side > 0 ? ['plaster', 'hull'] : ['hull', 'plaster'], {
      thickness: 0.3, openings: [glazing(-10, -6, 0.6, 2.7), glazing(-4, 2, 0.6, 2.7), glazing(9, 13, 0.6, 2.7), glazing(24, 28, 0.6, 2.7),
        // Vale's balcony door (starboard); a window to port.
        ...(side > 0 ? [glazing(17.4, 21.4, 0.6, 2.7), doorway(22.6, 1.3, 2.4)] : [glazing(18, 22, 0.6, 2.7)])],
    });
  }
  m.wall(-12, -SUP, -12, SUP, y, t, ['hull', 'plaster'], { thickness: 0.3, openings: [doorway(0, 2.2), glazing(-6, -2, 0.4, 2.8), glazing(2, 6, 0.4, 2.8)] });
  m.wall(30, -SUP, 30, SUP, y, t, ['plaster', 'hull'], { thickness: 0.3, openings: [glazing(-6, 6, 0.6, 2.8)] });
  edgeRail(m, y, -30, 34, 10.5);
  m.railing(-30, -10.3, -30, 10.3, y);
  m.railing(30, -10.3, 34, -10.3, y);
  // VIP lounge: the Meridian's club. Deep sofas, a bar, a piano; the stair from deck 5 arrives here.
  cover(-11.8, -7.8, 6, 7.8, y, 'paneling');
  for (const [x, z] of [[-8, 3.5], [-2, 3.5]]) {
    f('sofa', x, y, z + 2.6, 'north', { color: 0x1d2a44 });
    f('coffeeTable', x, y, z);
    f('armchair', x - 1.8, y, z, 'east', { color: 0x3a2a1a });
    f('armchair', x + 1.8, y, z, 'west', { color: 0x3a2a1a });
  }
  f('barCounter', 2, y, -3, 'west', { w: 3.4 });
  f('backBar', 4.6, y, -3, 'west', { w: 3.4 });
  f('grandPiano', -9, y, -2, 'east');
  m.railing(-10.5, -5.9, -5, -5.9, y);
  m.light(-6, t - CEILING_LIGHT, 2, 0xffc98a, 6, 10);
  m.light(0, t - CEILING_LIGHT, -2, 0xffc98a, 5, 9);
  // Corridor between the suites.
  m.wall(6, -SUP, 6, -1.2, y, t, 'plaster', { thickness: 0.15 });
  m.wall(6, 1.2, 6, SUP, y, t, 'plaster', { thickness: 0.15 });
  m.wall(6, -1.2, 16, -1.2, y, t, 'paneling', { thickness: 0.15, openings: [doorway(11, 1.1)] });
  m.wall(6, 1.2, 16, 1.2, y, t, 'paneling', { thickness: 0.15, openings: [doorway(14.5, 1.1)] });
  cover(6, -1.2, 16, 1.2, y, 'carpet', 0x1d2a44);
  // Castell's suite (port): where he's lying low.
  m.wall(16, -SUP, 16, -1.2, y, t, 'plaster', { thickness: 0.15 });
  f('bed', 9.2, y, -6.6, 'north', { w: 2, color: 0xe9e1d0 });
  f('desk', 14.6, y, -6.8, 'north', { w: 1.6 });
  f('officeChair', 14.6, y, -5.9, 'north');
  f('armchair', 13.5, y, -3, 'west', { color: 0x6a4a3a });
  m.light(11, t - CEILING_LIGHT, -4.5, 0xffe2b8, 5, 8);
  // Security office (starboard): monitors, a gun locker, and the bridge stair.
  m.wall(16, 1.2, 16, SUP, y, t, 'plaster', { thickness: 0.15 });
  m.props.push({ kind: 'monitorBank', x: 15.85, y: y + 1.9, z: 4.5, yaw: Math.PI / 2, cols: 3, rows: 2 });
  f('securityDesk', 14.6, y, 4.5, 'west', { w: 2.4 });
  f('gunLocker', 6.6, y, 3.6, 'east');
  m.light(11, t - CEILING_LIGHT, 3.5, 0xf2f6ff, 5, 8);
  m.light(11, t - CEILING_LIGHT, 0, 0xffe6c4, 3, 6);
  // Augustin Vale's suite: the whole bow end of the deck.
  m.wall(16, -1.2, 16, 1.2, y, t, 'paneling', { thickness: 0.15, openings: [doorway(0, 1.2)] });
  cover(16.1, -7.8, 29.8, 7.8, y, 'carpet', 0xd8cbb0);
  f('bed', 26.8, y, -4.6, 'west', { w: 2.2, color: 0xf4efe6 });
  f('sofa', 22, y, 4.6, 'north', { color: 0x8a7a5a });
  f('coffeeTable', 22, y, 3);
  f('executiveDesk', 27.6, y, 4.5, 'west');
  f('officeChair', 28.5, y, 4.5, 'west');
  f('barCart', 18, y, 6.8, 'south');
  f('safe', 29.4, y, -7.4, 'west');
  // Furnished like the owner's suite it is (kept clear of his walk from the door to the desk and the balcony).
  f('rug', 22, y, 3.1, 'south', { w: 3.6, d: 2.8, variant: 2 });
  f('armchair', 19.9, y, 3, 'east', { color: 0x8a7a5a });
  f('armchair', 24.1, y, 3, 'west', { color: 0x8a7a5a });
  for (const z of [-6.15, -3.05]) f('nightstand', 29.1, y, z, 'west');
  for (const z of [-6.15, -3.05]) f('tableLamp', 29.1, y + 0.6, z, 'west');
  f('dresser', 21.5, y, -7.35, 'south', { w: 2 });
  f('wallArt', 21.5, y + 1.9, -7.7, 'south', { w: 1.6, h: 1.0 });
  f('wallArt', 26.8, y + 1.9, -7.7, 'south', { w: 2.2, h: 1.2, variant: 2 });
  f('bookshelf', 16.35, y, -4.6, 'east', { w: 2.4, h: 2.4 });
  f('plantLarge', 16.8, y, 7.1);
  f('plantLarge', 29.2, y, 7.1);
  f('floorLamp', 24.6, y, 6.9);
  f('globe', 26.4, y, 6.8);
  m.light(26, t - CEILING_LIGHT, 2, 0xffe6c4, 5, 9);
  // Aft terrace: a hot tub and loungers, the Meridian's own deck.
  cover(-30, -10.5, -12, 10.5, y, 'teak');
  m.box(-27, y, -2, -23, y + 0.8, 2, 'poolTile');
  m.box(-26.8, y + 0.1, -1.8, -23.2, y + 0.7, 1.8, 'water');
  for (const z of [-7, 7]) for (const x of [-26, -22, -18]) f('lounger', x, y, z, z > 0 ? 'north' : 'south');
  m.light(-21, y + 3, 0, 0xffd6a0, 4, 10, false);
  deckSlab(m, D7, -26, 30, 'teak', holes.get(D7) ?? [], 'ceiling', 9);
}

// ---------------------------------------------------------------------------
// Deck 7: bridge and sun deck

function buildDeck7(m: MapBuilder, holes: Holes): void {
  const y = D7, t = ceil(y);
  void holes;
  edgeRail(m, y, -26, 30, 9);
  m.railing(-26, -8.8, -26, 8.8, y);
  // The bridge: windows across the front and sides, consoles, the helm.
  for (const side of [1, -1] as const) m.wall(18, side * 7, 30, side * 7, y, t, side > 0 ? ['plaster', 'hull'] : ['hull', 'plaster'], { thickness: 0.3, openings: [glazing(20.4, 29, 0.9, 2.8), doorway(19.2, 1.2)] });
  m.wall(18, -7, 18, 7, y, t, 'plaster', { thickness: 0.2, openings: [doorway(0, 1.2)] });
  m.wall(30, -7, 30, 7, y, t, ['plaster', 'hull'], { thickness: 0.3, openings: [glazing(-6.5, 6.5, 0.9, 2.9)] });
  cover(18, -7, 30, 7, y, 'deckPaint', 0x2a3138);
  for (const z of [-3.7, 0, 3.7]) f('controlPanel', 28.6, y, z, 'west', { w: 3.6, color: 0x2b3138 });
  f('helm', 26.4, y, 0, 'west');
  f('radarConsole', 26.2, y, 4.6, 'west');
  f('radarConsole', 26.2, y, -4.6, 'west');
  f('officeChair', 27.2, y, -2.2, 'east');
  f('officeChair', 27.2, y, 2.2, 'east');
  f('desk', 19.5, y, -5.4, 'south', { w: 2 });
  m.light(24, t - CEILING_LIGHT, 0, 0xc8d8ff, 4, 9);
  m.light(28, y + 1.4, 0, 0x3ad1ff, 2, 4, false);
  m.slab(rect(18, -9.5, 30.5, 9.5), t + SLAB, 'roof', { ceiling: 'ceiling' });
  m.box(23, t + SLAB, -0.3, 23.6, t + 5, 0.3, 'metal');
  m.box(21, t + 4, -2.5, 25.6, t + 4.2, 2.5, 'metal');
  // Radio room behind it.
  m.wall(12, -4, 18, -4, y, t, 'plaster', { thickness: 0.2 });
  m.wall(12, 4, 18, 4, y, t, 'plaster', { thickness: 0.2, openings: [doorway(15, 1.2)] });
  m.wall(12, -4, 12, 4, y, t, 'plaster', { thickness: 0.2 });
  f('desk', 16.6, y, -2, 'west', { w: 2 });
  m.box(17, y + 0.75, -3.5, 17.8, y + 2.2, -0.5, 'serverRack');
  m.slab(rect(12, -4.1, 18, 4.1), t + SLAB, 'roof', { ceiling: 'ceiling' });
  m.light(15, t - CEILING_LIGHT, 0, 0xf2f6ff, 3, 6);
  // Sun deck round the funnel.
  m.box(-22, y, -3.6, -12, y + 8, 3.6, 'hull');
  m.box(-22.1, y + 6.2, -3.7, -11.9, y + 7.2, 3.7, 'carPaint', 0x1d2a44);
  m.box(-22.1, y + 8, -3.7, -11.9, y + 8.2, 3.7, 'metal', 0x111111);
  for (let i = 0; i < 6; i++) for (const z of [-6.6, 6.6]) f('lounger', -8 + i * 2.6, y, z, z > 0 ? 'north' : 'south');
  for (const x of [-2, 6]) f('umbrella', x, y, 0);
}

// ---------------------------------------------------------------------------
// Security: the ship's own officers (uniformed) and the Meridian's men (suits); cameras; uniforms

function buildCrew(m: MapBuilder): void {
  type GuardDef = Extract<PropDef, { kind: 'guard' }>;
  const guard = (g: Omit<GuardDef, 'kind'>) => m.props.push({ kind: 'guard', ...g });
  const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
  const p = (x: number, y: number, z: number, wait?: number) => ({ x, y, z, wait });
  // Ship's security.
  guard({ id: 'sec-lobby', look: 'crew', weapon: 'pistol', relaxed: true, x: 17.5, y: D3, z: -8.5, yaw: W, scan: 0.7 });
  guard({ id: 'sec-atrium', look: 'crew', weapon: 'pistol', relaxed: true, x: -7.4, y: D4, z: -7.2, yaw: E,
    route: [p(-7.4, D4, -7.2, 4), p(7.4, D4, -7.2, 2), p(7.4, D4, 7.6, 4), p(-7.4, D4, 7.6, 2)] });
  guard({ id: 'sec-casino', look: 'crew', weapon: 'pistol', relaxed: true, x: -10.2, y: D4, z: 1.6, yaw: W, scan: 0.9 });
  guard({ id: 'sec-crew', look: 'crew', weapon: 'pistol', x: -26, y: D2, z: 0, yaw: E,
    route: [p(-26, D2, 0, 3), p(38, D2, 0, 5)] });
  guard({ id: 'sec-foredeck', look: 'crew', weapon: 'pistol', x: 41, y: D4, z: -7, yaw: E,
    route: [p(41, D4, -7, 3), p(56, D4, -4, 4), p(56, D4, 7, 3), p(41, D4, 7, 2)] });
  guard({ id: 'sec-monitors', look: 'crew', weapon: 'pistol', x: 13.4, y: D6, z: 4.5, yaw: E, seated: true });
  guard({ id: 'bridge-officer', name: 'Officer Hale', look: 'crew', weapon: 'pistol', x: 25.6, y: D7, z: -2.6, yaw: E, scan: 0.6 });
  // The Meridian's own.
  guard({ id: 'mer-stair', look: 'suit', weapon: 'pistol', x: -4.6, y: D5, z: -7.6, yaw: W, scan: 0.3 });
  guard({ id: 'mer-lounge', look: 'suit', weapon: 'smg', x: -10, y: D6, z: -2, yaw: E,
    route: [p(-10, D6, -2, 5), p(4, D6, 4.5, 4), p(-3, D6, 6.4, 5)] });
  guard({ id: 'mer-vale', name: 'Bruno', look: 'chief', weapon: 'smg', x: 15.2, y: D6, z: 0.4, yaw: W, scan: 0.4 });
  guard({ id: 'mer-castell', look: 'suit', weapon: 'pistol', x: 11, y: D6, z: 0.5, yaw: N, scan: 0.5 });
  guard({ id: 'mer-terrace', look: 'suit', weapon: 'pistol', x: -28, y: D6, z: -8, yaw: E,
    route: [p(-28, D6, -8, 3), p(-14, D6, -8, 2), p(-14, D6, 8, 3), p(-28, D6, 8, 2)] });
  guard({ id: 'mer-hold', look: 'suit', weapon: 'smg', x: 30, y: D2, z: -6, yaw: W, scan: 1.0 });
  guard({ id: 'mer-sundeck', look: 'suit', weapon: 'pistol', x: -24, y: D7, z: 6, yaw: E,
    route: [p(-24, D7, 6, 3), p(10, D7, 6.5, 4), p(10, D7, -6.5, 3), p(-24, D7, -6, 4)] });
  void S;

  // CCTV, watched from the security office on deck 6.
  m.securityCamera('crew-aft', 'Crew Corridor Aft', -27, D2 + 2.9, 1.0, 4, D2, 0, 0.3);
  m.securityCamera('crew-fwd', 'Crew Corridor Fwd', 41, D2 + 2.9, -1.0, 10, D2, 0, 0.3);
  m.securityCamera('hold', 'Cargo Hold', 21, D2 + 2.9, -11.2, 34, D2, -5, 0.4);
  m.securityCamera('stair-lobby', 'Meridian Stair', -11.7, D5 + 2.9, -8.7, -6, D5, -6.8, 0.25);
  m.securityCamera('vip-lounge', 'Meridian Lounge', -11.5, D6 + 2.9, -7.5, 0, D6, 2, 0.5);
  m.securityCamera('suites', 'Suite Corridor', 6.4, D6 + 2.9, 0, 16, D6, 0, 0.15);
  m.securityCamera('casino', 'Casino Floor', -29.6, D4 + 3.0, -8.6, -15, D4, 0, 0.5);

  // Two of the Meridian's men having a drink at the pool bar (you can overhear them).
  guard({ id: 'mer-pool-1', name: 'Lenny', look: 'suit', weapon: 'pistol', relaxed: true, x: -25.6, y: D5, z: 4.2, yaw: W - 0.6, scan: 0.2 });
  guard({ id: 'mer-pool-2', name: 'Sal', look: 'suit', weapon: 'pistol', relaxed: true, x: -24.4, y: D5, z: 5.3, yaw: E + 0.9, scan: 0.2 });

  // People you talk to: Felix at the casino bar, Castell in his suite's armchair.
  m.props.push({ kind: 'character', id: 'felix', x: -21.6, y: D4, z: 6.2, yaw: N + 0.4 });
  m.props.push({ kind: 'character', id: 'castell', x: 13.5, y: D6, z: -3, yaw: W, seat: 0.45 });
  // Augustin Vale, at his desk until the Board meets.
  m.props.push({ kind: 'character', id: 'vale', x: 28.5, y: D6, z: 4.5, yaw: W, seat: 0.47 });
  // Where Vale goes: his place at the Board, his balcony.
  m.props.push({ kind: 'marker', id: 'vale-board', x: -5, y: D6, z: 1.0, yaw: S });
  m.props.push({ kind: 'marker', id: 'vale-desk', x: 28.5, y: D6, z: 4.5, yaw: W });
  m.props.push({ kind: 'marker', id: 'vale-balcony', x: 24, y: D6, z: 9.6, yaw: S });
  // The decanter on the lounge bar (the Board's toast), and a vial in the medical centre that would do.
  m.props.push({ kind: 'clue', id: 'decanter', model: 'decanter', x: 2.2, y: D6 + 1.1, z: -2.2, yaw: 0 });
  m.props.push({ kind: 'clue', id: 'vial', model: 'vial', x: 25.6, y: D3 + 0.76, z: -4.3, yaw: 0.3 });
  // Overwatch's boat comes alongside the stern.
  m.props.push({ kind: 'marker', id: 'extract', x: -64, y: D4, z: 0 });

  // Locker 12 in the spa, where Felix left you a gun.
  f('gunLocker', 33.4, D5, -1.2, 'west', { w: 1.0 });
  m.props.push({ kind: 'clue', id: 'spa-locker', model: 'listen', x: 32.9, y: D5 + 1.2, z: -1.2, yaw: 0 });

  // What there is to learn about the Meridian.
  const clue = (id: string, model: ClueModel, x: number, y: number, z: number, yaw: number) => m.props.push({ kind: 'clue', id, model, x, y, z, yaw });
  clue('m-manifest', 'ticket', 13.4, D3 + 0.78, 7.2, 0.3);
  clue('m-hold', 'ledger', 24.3, D2 + 1.2, -9.7, 0.1);
  clue('m-schedule', 'laptop', 14.4, D6 + 0.78, 5.2, Math.PI / 2);
  clue('m-telex', 'ticket', 16.2, D7 + 0.78, -1.6, -0.4);
  clue('m-overheard', 'listen', -25, D5, 4.8, 0);

  // Doors: Castell's suite, and Vale's (it takes Vale's own keycard).
  m.props.push({ kind: 'door', id: 'castell-door', x: 11, y: D6, z: -1.2, axis: 'x', width: 1.1, height: 2.3 });
  m.props.push({ kind: 'door', id: 'vale-door', x: 16, y: D6, z: 0, axis: 'z', width: 1.2, height: 2.3, lock: 'valeCard' });

  // Uniforms you can change into (the mission puts them out and keeps track of them).
  m.props.push({ kind: 'clue', id: 'uniform-steward-laundry', model: 'uniform', x: -34.6, y: D2 + 0.93, z: -6, yaw: 0.3 });
  f('counter', -34, D3, 11.0, 'north', { w: 4 });
  m.props.push({ kind: 'clue', id: 'uniform-steward-linen', model: 'uniform', x: -33.4, y: D3 + 0.93, z: 11.0, yaw: -0.2 });
}

// ---------------------------------------------------------------------------
// Passengers (party guests on the client): playing, drinking, dancing, talking

function buildPassengers(m: MapBuilder): void {
  let seed = 7000;
  const guest = (x: number, y: number, z: number, yaw: number, activity: GuestActivity, extra: { crew?: number; seat?: number; lookAt?: { x: number; y: number; z: number } } = {}) =>
    m.props.push({ kind: 'guest', x, y, z, yaw, activity, seed: seed++, ...extra });
  const pair = (x: number, y: number, z: number, a: number) => {
    const dx = Math.cos(a) * 0.55, dz = Math.sin(a) * 0.55;
    guest(x - dx, y, z - dz, Math.atan2(dx, dz) + Math.PI, 'chat', { lookAt: { x: x + dx, y: y + 1.6, z: z + dz } });
    guest(x + dx, y, z + dz, Math.atan2(-dx, -dz) + Math.PI, 'chat', { lookAt: { x: x - dx, y: y + 1.6, z: z - dz } });
  };
  // Casino: players round the tables and at the slots, drinkers at the bar, a bartender.
  for (const [x, z] of [[-24, -3.2], [-24, 3.2], [-12.5, 3.4]]) {
    for (const a of [0.6, -0.6, 1.6]) guest(x + Math.sin(a) * 1.45, D4, z + Math.cos(a) * 0.95, a + Math.PI, 'sit', { seat: 0.62, lookAt: { x, y: D4 + 0.9, z } });
  }
  for (const x of [-27, -24, -21]) guest(x, D4, -7.6, Math.PI, 'drink');
  guest(-17.5, D4, 1.3, Math.PI, 'drink', { lookAt: { x: -17.5, y: D4 + 0.9, z: 0 } });
  guest(-20, D4, 8.2, Math.PI, 'bartender');
  guest(-21, D4, 6.4, 0, 'drink');
  guest(-19, D4, 6.4, 0, 'drink');
  pair(-15, D4, -6.5, 0.4);
  // Starlight Lounge: a crowd dancing to the band, couples at the bar.
  for (let i = 0; i < 10; i++) guest(28 + (i % 4) * 1.5, D4, -2.5 + Math.floor(i / 4) * 2.1, Math.PI / 2 + (i % 3 - 1) * 0.6, 'dance', { crew: i < 4 ? 300 : undefined });
  pair(25, D4, -4.5, 0.2);
  guest(22.5, D4, 0, Math.PI / 2, 'bartender');
  // Atrium and promenades.
  pair(-2, D3, 5.8, 1.2);
  pair(3, D4, 7, 0.1);
  pair(-36, D4, 10.4, 0);
  pair(6, D4, -10.4, 0);
  // Pool deck party.
  for (let i = 0; i < 12; i++) guest(-44.6 + (i % 4) * 1.5, D5, -3.4 + Math.floor(i / 4) * 2.0, -Math.PI / 2 + (i % 3 - 1) * 0.5, 'dance', { crew: i < 6 ? 310 : undefined });
  guest(-25.8, D5, -6.5, Math.PI / 2, 'dj');
  guest(-28.8, D5, 6.8, -Math.PI / 2, 'bartender');
  for (const z of [5.4, 8.2]) guest(-26.6, D5, z, Math.PI / 2, 'drink');
  pair(-55, D5, 7.6, 0.6);
  pair(-58, D5, -7.2, 0.3);
  // Lido bar.
  for (let i = 0; i < 3; i++) guest(10 + i * 1.3, D5, -5.9, Math.PI, 'sit', { seat: 0.75 });
  guest(12, D5, -8.1, 0, 'bartender');
  // The Board: four of the families, waiting in the Meridian lounge.
  for (const [x, z, yaw] of [[-9.8, 3.5, -Math.PI / 2], [-6.2, 3.5, Math.PI / 2], [-3.8, 3.5, -Math.PI / 2], [-0.2, 3.5, Math.PI / 2]]) {
    guest(x, D6, z, yaw, 'sit', { seat: 0.45, lookAt: { x: -5, y: D6 + 1.6, z: 1 } });
  }
  // Restaurant diners.
  for (let i = 0; i < 4; i++) for (const z of [-6, 6]) {
    if ((i + (z > 0 ? 1 : 0)) % 2) continue;
    guest(-54 + i * 5, D4, z - 0.8, 0, 'sit', { seat: 0.47 });
    guest(-54 + i * 5, D4, z + 0.8, Math.PI, 'sit', { seat: 0.47 });
  }
}

/** A table with chairs down its long sides. */
function diningTable(m: MapBuilder, x: number, y: number, z: number, w: number, d: number, cloth?: number): void {
  void m;
  f('diningTable', x, y, z, 'south', { w, d, color: cloth });
  const per = Math.max(1, Math.round(w / 0.8));
  for (let i = 0; i < per; i++) {
    const cx = x - w / 2 + (w / per) * (i + 0.5);
    f('diningChair', cx, y, z - d / 2 - 0.32, 'south');
    f('diningChair', cx, y, z + d / 2 + 0.32, 'north');
  }
}

// ---------------------------------------------------------------------------
// The sea, and where everything is

function buildSea(m: MapBuilder): void {
  // Invisible: the client draws the ocean. Swimmable, over an unseen bed so nothing falls forever.
  m.box(-400, SEA_LEVEL - 8, -400, 400, SEA_LEVEL, 400, 'water', undefined, true);
  m.box(-400, SEA_LEVEL - 9, -400, 400, SEA_LEVEL - 8, 400, 'concrete', undefined, true);
}

function buildZones(m: MapBuilder): void {
  const z = (name: string, floor: string, x0: number, z0: number, x1: number, z1: number, y: number, h = 3.5) => m.zone(name, floor, x0, z0, x1, z1, y - 0.5, y + h - 0.5);
  // Deck 7
  z('Bridge', DECK7, 18, -9, 30, 9, D7);
  z('Radio Room', DECK7, 12, -4, 18, 4, D7);
  z('Sun Deck', DECK7, -27, -10, 30, 10, D7, 12);
  // Deck 6
  z("Vale's Suite", DECK6, 16, -8, 30, 8, D6);
  z("Castell's Suite", DECK6, 6, -8, 16, -1.2, D6);
  z('Security Office', DECK6, 6, 1.2, 16, 8, D6);
  z('Suite Corridor', DECK6, 6, -1.2, 16, 1.2, D6);
  z('Meridian Lounge', DECK6, -12, -8, 6, 8, D6);
  z('Meridian Terrace', DECK6, -31, -11, -12, 11, D6);
  z('Deck 6 Walkway', DECK6, -12, -11, 34, 11, D6);
  // Deck 5
  z('Meridian Stair', DECK5, -12, -9, -3.5, -5.6, D5);
  z('Buffet', DECK5, -22, -9, -10, 9, D5);
  z('Atrium', DECK5, -10, -9, 8, 9, D5);
  z('Lido Bar', DECK5, 8, -9, 16, 9, D5);
  z('Spa', DECK5, 16, -9, 34, 9, D5);
  z('Observation Deck', DECK5, 34, -12, 52, 12, D5, 6);
  z('Pool Deck', DECK5, -68, -12, -22, 12, D5, 6);
  z('Lido Walkway', DECK5, -22, -12, 34, 12, D5);
  // Deck 4
  z('Riviera Restaurant', DECK4, -58, -9, -30, 9, D4);
  z('Casino', DECK4, -30, -9, -8, 9, D4);
  z('Atrium', DECK4, -8, -9, 8, 9, D4);
  z('Boutiques', DECK4, 8, -9, 20, 9, D4);
  z('Starlight Lounge', DECK4, 20, -9, 40, 9, D4);
  z('Aft Deck', DECK4, -69, -12, -58, 12, D4);
  z('Foredeck', DECK4, 40, -12, SHIP.bow, 12, D4, 6);
  z('Port Promenade', DECK4, -58, -12.5, 40, -9, D4);
  z('Starboard Promenade', DECK4, -58, 9, 40, 12.5, D4);
  // Deck 3
  z('Atrium', DECK3, -7, -7, 7, 7, D3);
  z('Stateroom 3110', DECK3, -20, 1.2, -16, 12, D3);
  z("Purser's Office", DECK3, 7, 1.2, 19, 12, D3);
  z('Embarkation Lobby', DECK3, 7, -12, 21, -1.2, D3);
  z('Medical Centre', DECK3, 21, -12, 27, -1.2, D3);
  z('Housekeeping', DECK3, -40, 1.2, -28, 12, D3);
  z('Forward Stores', DECK3, 42, 1.2, 52, 12, D3);
  z('Staterooms', DECK3, -66, -12, 52, 12, D3);
  // Deck 2
  z('Engine Room', DECK2, -68, -12, -40, 12, D2);
  z('Laundry', DECK2, -40, -12, -28, -1.2, D2);
  z('Galley', DECK2, -28, -12, -4, -1.2, D2);
  z('Provisions', DECK2, -4, -12, 20, -1.2, D2);
  z('Cargo Hold', DECK2, 20, -12, 52, -1.2, D2);
  z('Crew Mess', DECK2, -28, 1.2, -12, 12, D2);
  z('Crew Quarters', DECK2, -12, 1.2, 20, 12, D2);
  z('Brig', DECK2, 20, 1.2, 30, 12, D2);
  z('Crew Corridor', DECK2, -40, -12, 52, 12, D2);
}
