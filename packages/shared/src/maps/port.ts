import { doorway, glazing, MapBuilder, rect, type FurnitureOptions, type Opening } from './builder';
import type { Facing, FurnitureType } from './furniture';
import type { GuestActivity, MapDef, PropDef } from './types';

/**
 * "The Port": Terminal Est, a container terminal at Marseille-Fos, at two in the morning, for Chapter 3.
 *
 * Coordinates: +x east, -z north (out to the water), y up, metres; the yard is at y = 0. The quay edge
 * runs along z = QUAY with the feeder ship Sirocco moored beyond it; the container yard, the cranes
 * and the Meridian's compound are inside the perimeter fence (z = FENCE); the road and the staff car
 * park, where you start, are outside it.
 *
 * Inside: the gate office and truck gate, the staff building (locker room and the night-shift canteen),
 * the customs shed with its X-ray portal, the two-storey Terminal Ops building (the control room
 * upstairs), the workshop, the reefer stack, four blocks of stacked containers with alleys between
 * the rows, and on the quay, under the cranes, the fenced compound where the Meridian's four boxes wait
 * to be loaded last.
 */

export const QUAY = -40;
export const FENCE = 60;
/** The harbour's water level (the quay stands 1.6 m above it). */
export const HARBOUR_LEVEL = -1.6;
/** Terminal Ops' upper floor. */
export const OPS_UPPER = 4.2;
/** A container's height (one tier). */
export const TIER = 2.59;
/** The Meridian's boxes: four in the compound, one that matters. */
export const MERIDIAN_BOXES = [600711, 600712, 600713, 600714] as const;
export const TARGET_BOX = 600714;

const N = 0, S = Math.PI, E = -Math.PI / 2, W = Math.PI / 2;
const MERIDIAN_GREEN = 0x284a34;
const TERMINAL = 'Terminal', OPS2 = 'Terminal Ops · Upper floor', OUTSIDE = 'Outside';

type Place = (type: FurnitureType, x: number, y: number, z: number, face?: Facing | number, opts?: FurnitureOptions) => void;
let f: Place;

export function createPortMap(): MapDef {
  const m = new MapBuilder();
  f = (type, x, y, z, face = 'south', opts = {}) => m.furniture(type, x, y, z, face, opts);
  buildGround(m);
  buildFence(m);
  buildOutside(m);
  buildGate(m);
  buildStaffBuilding(m);
  buildCustoms(m);
  buildOps(m);
  buildWorkshop(m);
  buildYard(m);
  buildQuay(m);
  buildShip(m);
  buildLights(m);
  buildPeople(m);
  buildStory(m);
  buildSigns(m);
  buildZones(m);
  return {
    id: 'port',
    name: 'The Port',
    halfSize: 125,
    groundMaterial: 'asphalt',
    noGround: true,
    blocks: m.blocks,
    props: m.props,
    zones: m.zones,
    // Beside Overwatch's van in the staff car park, looking at the fence and the cranes beyond.
    playerSpawn: { x: 59.2, y: 0, z: 65.5 },
    spawnYaw: N,
    timeOfDay: 2,
    backdrop: 'harbour',
  };
}

// ---------------------------------------------------------------------------
// Ground, fence, outside

function buildGround(m: MapBuilder): void {
  // The yard and the road (asphalt), the quay apron (concrete) down to the water, the harbour itself.
  m.box(-122, -1.2, -14, 122, 0, 76, 'asphalt');
  m.box(-122, -3, QUAY, 122, 0, -14, 'concrete');
  m.box(-400, HARBOUR_LEVEL - 10, -400, 400, HARBOUR_LEVEL, QUAY, 'water', undefined, true);
  // Nobody walks off the quay, or out past the ends of the map.
  m.barrier(-122, 0, QUAY - 0.4, 122, 6, QUAY - 0.05);
  m.barrier(-123, 0, QUAY, -122, 6, 76);
  m.barrier(122, 0, QUAY, 123, 6, 76);
  m.barrier(-122, 0, 76, 122, 6, 77);
  // Painted lanes: the yellow lines of the truck lanes and the apron's edge line.
  const line = (x0: number, z0: number, x1: number, z1: number) => m.overlay(x0, z0, x1, z1, 0, 'courtLine', 0xd9b31c);
  for (const z of [9.5, 14.5]) line(-88, z - 0.08, 72, z + 0.08);
  // (The top lane stops either side of the customs shed: trucks go through it, the paint doesn't.)
  for (const [a, b] of [[-88, -66.2], [-41.8, 72]]) line(a, 33.42, b, 33.58);
  line(-120, QUAY + 0.6, 120, QUAY + 0.75);
  // The road outside: a centre line, kerbs.
  for (let x = -116; x < 116; x += 6) m.overlay(x, 69.9, x + 3, 70.1, 0, 'courtLine', 0xf2f2f2);
  m.box(-122, 0, 75, 122, 0.15, 76, 'concrete');
}

function buildFence(m: MapBuilder): void {
  const H = 3;
  // The perimeter along z = FENCE: gaps for the truck gate, the staff turnstile and (hidden behind the
  // bushes at the far west end) a hole someone cut years ago.
  const gaps: [number, number][] = [[-8.2, 8.2], [41, 42.4], [-112, -110.6]];
  let x = -120;
  for (const [a, b] of gaps.sort((p, q) => p[0] - q[0])) {
    m.box(x, 0, FENCE - 0.04, a, H, FENCE + 0.04, 'fence');
    x = b;
  }
  m.box(x, 0, FENCE - 0.04, 120, H, FENCE + 0.04, 'fence');
  for (let px = -120; px <= 120; px += 4) if (!gaps.some(([a, b]) => px > a - 0.2 && px < b + 0.2)) m.box(px - 0.05, 0, FENCE - 0.05, px + 0.05, H + 0.2, FENCE + 0.05, 'metal', 0x6b7177);
  // The ends, down to the quay.
  for (const sx of [-1, 1]) m.box(sx * 120 - 0.04, 0, QUAY, sx * 120 + 0.04, H, FENCE, 'fence');
  // The cut: a flap of wire bent back, bushes outside.
  m.box(-113.3, 0, FENCE + 0.06, -112.1, 1.2, FENCE + 0.1, 'fence');
  for (const bx of [-114.5, -109]) f('topiary', bx, 0, FENCE + 1.6, 'south', { w: 1.8, h: 1.6 });
}

function buildOutside(m: MapBuilder): void {
  // Across the road: the backs of old warehouses, a wall of corrugated sheds.
  for (let x = -120; x < 120; x += 30) {
    m.box(x, 0, 76.5, x + 28, 7 + ((x / 30) % 2 ? 2 : 0), 84, 'stucco', [0x8c8478, 0x7a7469, 0x93897a][Math.abs(x / 30) % 3]);
    m.box(x, 7 + ((x / 30) % 2 ? 2 : 0), 76.5, x + 28, 7.4 + ((x / 30) % 2 ? 2 : 0), 84, 'roof');
  }
  // The staff car park: two rows nosed in to the fence and the kerb, the night shift's cars.
  const cars: [number, number, number][] = [];
  for (let i = 0; i < 11; i++) if (i !== 5 && i !== 9) cars.push([22 + i * 3.4, 63.2, N]);
  for (let i = 0; i < 9; i++) if (i % 3 !== 1) cars.push([24 + i * 3.4, 72.6, S]);
  const colors = [0x1c2a3a, 0x8a8f95, 0x2b2b2e, 0x6b1d1d, 0x1f3d2b, 0xc9c6bf, 0x3b4a6b];
  cars.forEach(([x, z, yaw], i) => f('car', x, 0, z, yaw, { color: colors[i % colors.length], variant: i % 3 }));
  // Nadia's white hatchback, the boot up: your kit's behind it.
  f('car', 39, 0, 63.2, N, { color: 0xf2f0ea, variant: 1 });
  for (let x = 20; x <= 56; x += 4) m.overlay(x - 0.06, 61, x + 0.06, 66, 0, 'courtLine', 0xf2f2f2);
  for (const [x, z] of [[30, 67.5], [64, 61.6], [-30, 64], [-70, 64], [90, 64], [-107.5, 62.2]]) f('lampPost', x, 0, z);
  // A truck waiting to come in at the gate.
  f('trailer', -4.2, 0, 69.5, W);
  f('shippingContainer', -4.2, 1.45, 69.5, W, { variant: 41 });
}

// ---------------------------------------------------------------------------
// Buildings

/** A flat-roofed building: walls (doors and windows given per side), roof slab, a light or two. */
function shed(m: MapBuilder, x0: number, z0: number, x1: number, z1: number, h: number,
  sides: { n?: Opening[]; s?: Opening[]; e?: Opening[]; w?: Opening[] }, look: 'stucco' | 'metal' = 'stucco'): void {
  const outer = look === 'metal' ? 'metal' : 'stucco';
  const t = 0.25;
  m.wall(x0, z0, x1, z0, 0, h, [outer, 'plaster'], { thickness: t, openings: sides.n });
  m.wall(x0, z1, x1, z1, 0, h, ['plaster', outer], { thickness: t, openings: sides.s });
  m.wall(x0, z0, x0, z1, 0, h, [outer, 'plaster'], { thickness: t, openings: sides.w });
  m.wall(x1, z0, x1, z1, 0, h, ['plaster', outer], { thickness: t, openings: sides.e });
  m.slab(rect(x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2), h + 0.3, 'roof', { ceiling: 'ceiling' });
}

function buildGate(m: MapBuilder): void {
  // The gate office (security): a guard room with lockers to the west, the office to the east
  // with the monitors and the booking terminal.
  shed(m, -30, 48, -14, 58, 3.4, {
    e: [doorway(53, 1.4), glazing(49, 51.6, 1, 2.6), glazing(54.6, 57, 1, 2.6)],
    n: [glazing(-28, -24, 1, 2.6), glazing(-20, -16, 1, 2.6)],
    s: [doorway(-26, 1.2)],
  });
  m.wall(-22, 48, -22, 58, 0, 3.4, 'plaster', { thickness: 0.15, openings: [doorway(52, 1.2)] });
  m.overlay(-29.8, 48.2, -14.2, 57.8, 0, 'tile', 0x9aa0a4);
  m.props.push({ kind: 'door', id: 'door-gate-office', x: -14, y: 0, z: 53, axis: 'z', width: 1.4, height: 2.4 });
  // Office.
  f('desk', -17.6, 0, 50.0, 'south', { w: 1.8 });
  f('officeChair', -17.6, 0, 51.0, 'north');
  f('securityDesk', -15.0, 0, 55.6, 'west', { w: 2.2 });
  m.props.push({ kind: 'monitorBank', x: -14.2, y: 1.6, z: 55.6, yaw: -Math.PI / 2, cols: 3, rows: 2 });
  f('counter', -18.5, 0, 57.4, 'north', { w: 3 });
  f('sideboard', -21.4, 0, 49, 'east');
  // Guard room: lockers, a bench, the gun locker.
  f('crewLocker', -26, 0, 48.4, 'south', { w: 3.2 });
  f('bench', -26, 0, 51.2, 'south', { w: 2.4 });
  f('gunLocker', -29.5, 0, 55, 'east');
  // The evidence rack: what security took off people at the bag checks.
  f('storageRack', -29.55, 0, 50.2, 'east', { w: 2.4 });
  f('fridge', -22.6, 0, 57.2, 'north');
  m.light(-26, 3.4 - 0.88, 53, 0xf2f6ff, 6, 10);
  m.light(-18, 3.4 - 0.88, 53, 0xf2f6ff, 7, 10);
  // The truck gate: two lanes either side of the booth island, barrier arms, the kiosk.
  m.box(-1, 0, 50, 1, 0.18, 59.6, 'concrete');
  m.wall(-0.9, 54, 0.9, 54, 0.18, 2.8, ['plaster', 'plaster'], { thickness: 0.12, openings: [glazing(-0.6, 0.6, 0.9, 2.2)] });
  m.wall(-0.9, 57.4, 0.9, 57.4, 0.18, 2.8, ['plaster', 'plaster'], { thickness: 0.12, openings: [glazing(-0.6, 0.6, 0.9, 2.2)] });
  m.wall(-0.9, 54, -0.9, 57.4, 0.18, 2.8, ['plaster', 'plaster'], { thickness: 0.12, openings: [glazing(54.4, 57, 0.9, 2.2)] });
  m.wall(0.9, 54, 0.9, 57.4, 0.18, 2.8, ['plaster', 'plaster'], { thickness: 0.12, openings: [glazing(54.4, 55.2, 0.9, 2.2), doorway(56.4, 1.2)] });
  m.slab(rect(-1.2, 53.8, 1.2, 57.6), 3.1, 'roof');
  for (const sx of [-1, 1]) {
    m.box(sx * 1.6 - 0.15, 0, 59.2, sx * 1.6 + 0.15, 1.1, 59.5, 'metal', 0xc9c6bf);
    m.box(sx < 0 ? -7.8 : 1.6, 1.0, 59.3, sx < 0 ? -1.6 : 7.8, 1.12, 59.42, 'metal', 0xc0392b);
  }
  m.light(0, 2.4, 55.7, 0xf2f6ff, 3, 6);
  // The staff turnstile's booth, inside the fence by the gap.
  shed(m, 44, 55.4, 47.2, 59.4, 2.8, { w: [doorway(57.4, 1.2), glazing(55.8, 56.8, 1, 2.2)], s: [glazing(44.6, 46.6, 1, 2.2)] });
  f('securityDesk', 46.4, 0, 57.4, 'west', { w: 1.4 });
  m.light(45.6, 2.8 - 0.88, 57.4, 0xf2f6ff, 3, 6);
  for (const [x, z] of [[40.4, 59.4], [43, 59.4]]) m.box(x - 0.1, 0, z - 0.6, x + 0.1, 1.1, z + 0.6, 'metal', 0xc9c6bf);
}

function buildStaffBuilding(m: MapBuilder): void {
  // The staff building: the locker room (west) and the night shift's canteen (east). The front door
  // faces the turnstile path; a back door opens on the yard.
  shed(m, 28, 38, 52, 54, 3.6, {
    s: [doorway(41.7, 1.4), glazing(44, 50.5, 1, 2.6), glazing(29.5, 34, 1.4, 2.6)],
    n: [doorway(46, 1.4), glazing(38, 44, 1, 2.6)],
    e: [glazing(41, 51, 1, 2.6)],
  });
  m.wall(36, 38, 36, 54, 0, 3.6, 'plaster', { thickness: 0.15, openings: [doorway(46, 1.2)] });
  m.overlay(28.2, 38.2, 35.9, 53.8, 0, 'tile', 0xb7bcc0);
  m.overlay(36.1, 38.2, 51.8, 53.8, 0, 'tile', 0xd8d2c4);
  // Locker room: banks of lockers, benches between them, a sink.
  for (const z of [38.4, 53.6]) f('crewLocker', 32, 0, z, z < 40 ? 'south' : 'north', { w: 7 });
  for (const z of [42.4, 49.6]) f('bench', 32, 0, z, 'south', { w: 3.2 });
  f('vanity', 28.5, 0, 46, 'east');
  f('towelRack', 28.4, 1.1, 43.6, 'east');
  m.light(32, 3.6 - 0.88, 42, 0xf2f6ff, 5, 9);
  m.light(32, 3.6 - 0.88, 50, 0xf2f6ff, 5, 9);
  // Canteen: tables, the serving counter, drinks machines, a TV for the football nobody watches.
  for (const [x, z] of [[40, 42], [44, 45.2], [48, 42], [40, 49], [48, 49]]) {
    f('diningTable', x, 0, z, 'south', { w: 1.6, d: 0.9 });
    for (const sx of [-0.45, 0.45]) for (const sz of [-1, 1]) f('diningChair', x + sx, 0, z + sz * 0.72, sz < 0 ? 'south' : 'north');
  }
  f('counter', 44, 0, 53.4, 'north', { w: 6 });
  f('fridge', 51.4, 0, 52.6, 'west');
  for (const z of [39.2, 40.4]) f('vendingMachine', 51.4, 0, z, 'west');
  f('tvWall', 36.2, 1.4, 45, 'east', { w: 1.6 });
  f('plantSmall', 51.2, 0, 47.4);
  for (const [x, z] of [[40, 42], [48, 42], [40, 49], [48, 49]]) m.light(x, 3.6 - 0.88, z, 0xfff0d8, 4, 8);
}

function buildCustoms(m: MapBuilder): void {
  // The customs shed: a tall hall a truck drives through, the X-ray portal in the middle, the customs
  // office in the south-west corner.
  const H = 9;
  shed(m, -66, 30, -42, 50, H, {
    n: [doorway(-54, 6.4, 5.6)],
    s: [doorway(-54, 6.4, 5.6)],
    e: [doorway(45, 1.4)],
  }, 'metal');
  m.overlay(-65.8, 30.2, -42.2, 49.8, 0, 'concrete', 0x9a9890);
  f('xrayScanner', -54, 0, 40, 'south', { w: 7.2 });
  f('trailer', -54, 0, 38.2, W);
  f('shippingContainer', -54, 1.45, 38.2, W, { variant: 77 });
  m.wall(-66, 44, -58, 44, 0, 3.2, 'plaster', { thickness: 0.15, openings: [glazing(-64.5, -60.5, 1, 2.4)] });
  m.wall(-58, 44, -58, 50, 0, 3.2, 'plaster', { thickness: 0.15, openings: [doorway(46, 1.2)] });
  m.slab(rect(-66, 44, -58, 50), 3.5, 'roof', { ceiling: 'ceiling' });
  m.overlay(-65.8, 44.1, -58.1, 49.8, 0, 'tile', 0xb7bcc0);
  f('desk', -62.2, 0, 47.4, 'north', { w: 1.8 });
  f('officeChair', -62.2, 0, 48.4, 'south');
  f('sideboard', -65.4, 0, 46.2, 'east');
  f('serverRack', -59, 0, 49.3, 'north');
  m.light(-62, 3.2 - 0.88, 47, 0xf2f6ff, 4, 8);
  for (const z of [34, 44]) m.light(-54, H - 0.88, z, 0xe8f0ff, 10, 18);
  for (const z of [33, 45]) f('storageRack', -42.6, 0, z, 'west', { w: 3 });
  f('jerseyBarrier', -48, 0, 35, 'south');
}

function buildOps(m: MapBuilder): void {
  // Terminal Ops: the lobby and stairs below, the control room above, its long window on the yard.
  const x0 = -104, x1 = -86, z0 = 34, z1 = 50, U = OPS_UPPER;
  const storeys: { y0: number; y1: number; n: Opening[]; e: Opening[]; w: Opening[] }[] = [
    { y0: 0, y1: U, n: [glazing(-102, -90, 1, 2.8)], e: [doorway(42, 1.6), glazing(36, 40, 1, 2.8), glazing(44, 48.5, 1, 2.8)], w: [] },
    { y0: U, y1: U * 2, n: [glazing(-103, -87, 0.9, 3.4)], e: [glazing(35, 49, 0.9, 3.4)], w: [glazing(36, 48, 0.9, 3.4)] },
  ];
  for (const st of storeys) {
    m.wall(x0, z0, x1, z0, st.y0, st.y1, ['stucco', 'plaster'], { thickness: 0.25, openings: st.n });
    m.wall(x0, z1, x1, z1, st.y0, st.y1, ['plaster', 'stucco'], { thickness: 0.25 });
    m.wall(x0, z0, x0, z1, st.y0, st.y1, ['stucco', 'plaster'], { thickness: 0.25, openings: st.w });
    m.wall(x1, z0, x1, z1, st.y0, st.y1, ['plaster', 'stucco'], { thickness: 0.25, openings: st.e });
  }
  m.props.push({ kind: 'door', id: 'door-ops', x: -86, y: 0, z: 42, axis: 'z', width: 1.6, height: 2.4 });
  // The stairs along the south wall, up to the control room; its floor has the opening over them (to the wall).
  m.stairs('x', [48.3, 49.85], -101, -96, 0, U, 'concrete');
  m.slab(rect(x0, z0, x1, z1), U, 'carpet', { ceiling: 'ceiling', holes: [rect(-101, 48.2, -96, 50)] });
  m.railing(-101, 48.2, -96, 48.2, U);
  m.railing(-101, 48.2, -101, 49.85, U);
  m.slab(rect(x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2), U * 2 + 0.3, 'roof', { ceiling: 'ceiling' });
  m.overlay(-103.8, 34.2, -86.2, 49.8, 0, 'tile', 0xc4c0b6);
  // Lobby: a reception desk, chairs, a noticeboard.
  f('counter', -92, 0, 40, 'east', { w: 3 });
  for (const z of [44.5, 46]) f('armchair', -88, 0, z, 'west', { color: 0x3a4a5a });
  f('plantLarge', -86.8, 0, 35);
  m.light(-92, U - 0.88, 40, 0xf2f6ff, 6, 10);
  m.light(-98, U - 0.88, 42, 0xf2f6ff, 5, 9);
  // Control room: consoles under the window, the planner's desk, the wall of screens.
  for (const x of [-100, -95, -90]) f('controlPanel', x, U, 35.2, 'south', { w: 4.2, color: 0x2b3138 });
  for (const x of [-100, -95, -90]) f('officeChair', x, U, 36.8, 'north');
  f('desk', -98.5, U, 43, 'east', { w: 1.8 });
  f('officeChair', -97.5, U, 43, 'west');
  m.props.push({ kind: 'monitorBank', x: -103.75, y: U + 1.8, z: 42, yaw: Math.PI / 2, cols: 4, rows: 2 });
  f('sideboard', -103.4, U, 47.4, 'east');
  f('vendingMachine', -87, U, 48.9, 'north');
  for (const z of [38, 45]) m.light(-95, U * 2 - 0.88, z, 0xe6f0ff, 5, 10);
}

function buildWorkshop(m: MapBuilder): void {
  // The maintenance workshop: a tall hall with a straddle carrier in for repairs, benches and racks.
  const H = 15;
  shed(m, 74, 18, 110, 46, H, { n: [doorway(92, 9, 8)], w: [doorway(40, 1.4)], s: [doorway(100, 1.4)] }, 'metal');
  m.overlay(74.2, 18.2, 109.8, 45.8, 0, 'concrete', 0x8e8c86);
  f('straddleCarrier', 92, 0, 31, 'south');
  for (const x of [78, 82]) f('storageRack', x, 0, 45.4, 'north', { w: 3.4 });
  f('counter', 109.4, 0, 32, 'west', { w: 6 });
  for (const z of [26, 38]) f('toolChest', 109.5, 0, z, 'west');
  f('pipeRun', 92, H - 1.2, 45.2, 'south', { w: 30 });
  f('controlPanel', 75, 0, 26, 'east', { w: 2.4, color: 0x3a434c });
  for (const [x, z] of [[85, 22], [100, 40]]) { f('trailer', x, 0, z, W); }
  for (const x of [82, 92, 102]) for (const z of [26, 38]) m.light(x, H - 0.88, z, 0xe8f0ff, 9, 16);
}

// ---------------------------------------------------------------------------
// The yard, the quay, the ship

/** A block of container stacks: `cols` stacks along x, `rows` rows along z at 4 m centres (alleys between). */
function yardBlock(x0: number, z0: number, cols: number, rows: number, seed: number, maxTiers = 3): void {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let c = 0; c < cols; c++) for (let row = 0; row < rows; row++) {
    if (r() < 0.08) continue; // a gap where a box has gone to the ship
    const tiers = 1 + Math.floor(r() * maxTiers);
    f('shippingContainer', x0 + 6.1 + c * 13.4, 0, z0 + 1.22 + row * 4, 'south', { h: tiers * TIER, variant: seed * 100 + c * 10 + row });
  }
}

function buildYard(m: MapBuilder): void {
  yardBlock(-86, -6.5, 4, 4, 11);
  yardBlock(-20, -6.5, 4, 4, 23);
  yardBlock(-86, 18, 4, 3, 37);
  yardBlock(-20, 18, 4, 3, 41, 4);
  // The reefer stack: refrigerated boxes, white, plugged in to a power gantry.
  for (const z of [1.5, 5.5, 9.5]) for (let t = 0; t < 2; t++) f('shippingContainer', 59, t * TIER, z + 1.22, 'south', { color: 0xe7e5df, variant: 900 + t });
  for (const x of [52.4, 65.6]) for (const z of [1.2, 12.8]) m.box(x - 0.2, 0, z - 0.2, x + 0.2, 6.6, z + 0.2, 'metal', 0x7d858c);
  for (const x of [52.4, 65.6]) m.box(x - 0.2, 6.2, 1, x + 0.2, 6.6, 13, 'metal', 0x7d858c);
  m.box(52.2, 6.6, 1, 65.8, 6.9, 13, 'metal', 0x7d858c);
  for (const z of [3, 7, 11]) m.box(52, 4.4, z - 0.15, 52.4, 4.8, z + 0.15, 'metal', 0x2b2f33);
  // Straddle carriers parked in the lanes, a reach stacker's spot, odd boxes on trailers.
  f('straddleCarrier', -26, 0, 26, 'south');
  f('straddleCarrier', 42, 0, -6, 'south');
  for (const [x, z, yaw, v] of [[-70, 12, 0, 51], [20, 36, 0, 52], [66, 24, Math.PI / 2, 53]] as const) {
    f('trailer', x, 0, z, yaw === 0 ? 'south' : W);
    f('shippingContainer', x, 1.45, z, yaw === 0 ? 'south' : W, { variant: v });
  }
  for (const x of [-34, 36]) for (const z of [-11, 12]) f('jerseyBarrier', x, 0, z, 'east');
}

function buildQuay(m: MapBuilder): void {
  // Two ship-to-shore cranes on their rails, boom out over the Sirocco.
  for (const x of [-46, 6]) f('gantryCrane', x, 0, -27, 'north');
  for (const z of [-40.6 + 0.8, -13.4 - 0.8]) m.overlay(-120, z - 0.12, 120, z + 0.12, 0, 'metal', 0x4a4e52);
  // Bollards along the edge, mooring lines out to the ship.
  for (let x = -100; x <= 100; x += 16) f('bollard', x, 0, QUAY + 0.7, 'south');
  // The Meridian's compound: a fenced pen on the apron, floodlit, four boxes inside, one gate.
  const [cx0, cz0, cx1, cz1] = [20, -35, 52, -17];
  // The quay side has a cut in it behind the first box (the way in for someone who isn't invited).
  m.box(cx0, 0, cz0 - 0.04, 23.2, 2.6, cz0 + 0.04, 'fence');
  m.box(24.6, 0, cz0 - 0.04, cx1, 2.6, cz0 + 0.04, 'fence');
  m.box(24.6, 0, cz0 - 0.5, 24.66, 1.4, cz0 - 0.04, 'fence');
  m.box(cx0 - 0.04, 0, cz0, cx0 + 0.04, 2.6, cz1, 'fence');
  m.box(cx1 - 0.04, 0, cz0, cx1 + 0.04, 2.6, cz1, 'fence');
  m.box(cx0, 0, cz1 - 0.04, 35.2, 2.6, cz1 + 0.04, 'fence');
  m.box(39.8, 0, cz1 - 0.04, cx1, 2.6, cz1 + 0.04, 'fence');
  for (const x of [cx0, 35.2, 39.8, cx1]) m.box(x - 0.08, 0, cz1 - 0.08, x + 0.08, 3, cz1 + 0.08, 'metal', 0x6b7177);
  m.overlay(cx0 + 0.1, cz0 + 0.1, cx1 - 0.1, cz1 - 0.1, 0, 'concrete', 0x7b7a74);
  const at: [number, number, number][] = [[27.5, -30, 0], [44.5, -30, 0], [27.5, -23, 0], [44.5, -23, Math.PI]];
  MERIDIAN_BOXES.forEach((code, i) => {
    const [x, z, yaw] = at[i];
    f('shippingContainer', x, 0, z, yaw === 0 ? 'south' : 'north', { color: MERIDIAN_GREEN, variant: code });
    m.props.push({ kind: 'marker', id: `mrdu-${code}`, x, y: 0, z });
  });
  // Where the charge goes on the one that matters: low on its doors, in the gap between the boxes.
  m.props.push({ kind: 'marker', id: 'charge', x: 38.25, y: 0.9, z: -23, yaw: E });
  for (const [x, z] of [[21, -18], [51, -34]]) f('lightMast', x, 0, z, 'south', { h: 14 });
}

function buildShip(m: MapBuilder): void {
  // MV Sirocco, a feeder, moored starboard side to: black hull, containers four high on deck, the
  // accommodation block and funnel aft. Not somewhere you can go (the quay's barrier keeps you off).
  const zA = QUAY - 4, zB = QUAY - 24, deck = 5.5;
  const hull = 0x1d2024;
  m.box(-86, HARBOUR_LEVEL - 5, zB, 24, deck, zA, 'hull', hull);
  for (let x = 24; x < 36; x += 1) {
    const k = (x - 24) / 12;
    const half = 10 * Math.sqrt(Math.max(0, 1 - k * k));
    m.box(x, HARBOUR_LEVEL - 5 + k * 3, (zA + zB) / 2 - half, x + 1, deck + k * 1.2, (zA + zB) / 2 + half, 'hull', hull);
  }
  m.box(-86, HARBOUR_LEVEL - 0.3, zB - 0.02, 24, HARBOUR_LEVEL + 0.6, zA + 0.02, 'hull', 0x7a1c1c);
  m.box(-86, deck - 0.4, zA - 0.02, 26, deck - 0.1, zA + 0.04, 'hull', 0xe7e5df);
  // Hatch covers and the stacks on them.
  for (let bay = 0; bay < 7; bay++) {
    const x = -62 + bay * 13.4;
    m.box(x - 6.4, deck, zB + 1.4, x + 6.4, deck + 0.8, zA - 1.4, 'deckPaint', 0x2e3a33);
    for (let row = 0; row < 6; row++) {
      const tiers = 1 + ((bay * 7 + row * 3) % 4);
      f('shippingContainer', x, deck + 0.8, zB + 2.8 + row * 2.85, 'south', { h: tiers * TIER, variant: 700 + bay * 10 + row });
    }
  }
  // Accommodation aft: five decks of cabins and the bridge, the funnel behind.
  const ax0 = -84, ax1 = -71;
  for (let d = 0; d < 5; d++) {
    const y = deck + d * 3;
    m.box(ax0, y, zB + 3, ax1, y + 3, zA - 3, 'stucco', 0xe7e5df);
    m.box(ax1 - 0.02, y + 1.1, zB + 4, ax1 + 0.04, y + 2.2, zA - 4, 'screen');
    if (d % 2 === 0) m.box(ax1 + 0.04, y + 1.2, zB + 6, ax1 + 0.08, y + 2.1, zB + 10, 'glass');
  }
  m.box(ax0 - 1, deck + 15, zB + 1, ax1 + 1.5, deck + 18, zA - 1, 'stucco', 0xe7e5df);
  m.box(ax1 + 1.48, deck + 15.8, zB + 1.5, ax1 + 1.54, deck + 17.4, zA - 1.5, 'screen');
  m.box(ax0 - 1.2, deck + 18, zB + 0.8, ax1 + 1.7, deck + 18.3, zA - 0.8, 'metal', 0x2b2f33);
  m.box(-84.5, deck + 18.3, (zA + zB) / 2 - 2, -79, deck + 25, (zA + zB) / 2 + 2, 'hull', 0x9c2b23);
  m.box(-84.6, deck + 24, (zA + zB) / 2 - 2.1, -78.9, deck + 25.2, (zA + zB) / 2 + 2.1, 'hull', 0x111214);
  // Lights on deck.
  for (const x of [-70, -40, -10, 20]) m.props.push({ kind: 'light', x, y: deck + 4, z: (zA + zB) / 2, color: 0xffe2b8, intensity: 90, distance: 26, fixture: false, nightOnly: true });
  m.props.push({ kind: 'light', x: ax1 + 3, y: deck + 10, z: (zA + zB) / 2, color: 0xffe6c4, intensity: 120, distance: 24, fixture: false, nightOnly: true });
}

function buildLights(m: MapBuilder): void {
  // Floodlight masts over the lanes and the apron: pools of light, and shadow between the stacks.
  const masts: [number, number][] = [
    [-88, 12], [-54, 12], [-26, 12], [8, 12], [40, 12],
    [-80, 34], [-30, 34], [10, 34], [62, 34],
    [-90, -12], [-50, -12], [-12, -12], [60, -12], [90, -12],
    [70, 0], [-110, 30], [100, 52],
  ];
  for (const [x, z] of masts) {
    f('lightMast', x, 0, z, 'south');
    m.props.push({ kind: 'light', x, y: 24, z, color: 0xffe6c0, intensity: 520, distance: 52, fixture: false, nightOnly: true });
  }
  for (const [x, z] of [[21, -18], [51, -34]]) m.props.push({ kind: 'light', x, y: 13, z, color: 0xf2f6ff, intensity: 260, distance: 30, fixture: false, nightOnly: true });
  // Under the cranes, and the car park's street lamps.
  for (const x of [-46, 6]) m.props.push({ kind: 'light', x, y: 17, z: -27, color: 0xfff1d6, intensity: 300, distance: 30, fixture: false, nightOnly: true });
  for (const [x, z] of [[30, 67.5], [64, 61.6], [-30, 64], [-70, 64], [90, 64], [-107.5, 62.2]]) m.props.push({ kind: 'light', x, y: 5.6, z, color: 0xffc078, intensity: 60, distance: 18, fixture: false, nightOnly: true });
}

// ---------------------------------------------------------------------------
// People

function buildPeople(m: MapBuilder): void {
  type Route = { x: number; y: number; z: number; wait?: number }[];
  const guard = (g: Omit<Extract<PropDef, { kind: 'guard' }>, 'kind'>) => m.props.push({ kind: 'guard', ...g });
  const at = (x: number, z: number, wait?: number, y = 0) => ({ x, y, z, wait });
  // Terminal security: navy and hi-vis, pistols.
  guard({ id: 'sec-gate', look: 'port', weapon: 'pistol', x: 1.8, y: 0, z: 55.8, yaw: S, scan: 0.9, relaxed: true });
  guard({ id: 'sec-turnstile', look: 'port', weapon: 'pistol', x: 42.9, y: 0, z: 57.6, yaw: S, scan: 0.7 });
  guard({ id: 'sec-office', look: 'port', weapon: 'pistol', x: -16.0, y: 0, z: 55.6, yaw: E, seated: true });
  guard({ id: 'sec-office-2', look: 'port', weapon: 'pistol', x: -28.6, y: 0, z: 53.6, yaw: S, scan: 0.5 });
  guard({ id: 'sec-gate-2', look: 'port', weapon: 'pistol', x: -12, y: 0, z: 50, yaw: S,
    route: [at(-12, 50, 3), at(-12, 58.6, 2), at(-32, 58.6, 3), at(-32, 46.5, 2), at(-12, 46.5, 2)] as Route });
  guard({ id: 'sec-yard-north', look: 'port', weapon: 'pistol', x: -84, y: 0, z: 21.2, yaw: E,
    route: [at(-84, 21.2, 3), at(33, 21.2, 3)] as Route });
  guard({ id: 'sec-yard-south', look: 'port', weapon: 'pistol', x: 33, y: 0, z: -3.3, yaw: W,
    route: [at(33, -3.3, 3), at(-84, -3.3, 3)] as Route });
  guard({ id: 'sec-quay-west', look: 'port', weapon: 'pistol', x: -110, y: 0, z: -30, yaw: E,
    route: [at(-110, -30, 3), at(-20, -30, 3)] as Route });
  guard({ id: 'sec-customs-door', look: 'port', weapon: 'pistol', x: -43.6, y: 0, z: 44, yaw: W, scan: 0.9 });
  guard({ id: 'sec-ops-2', look: 'port', weapon: 'pistol', x: -88, y: OPS_UPPER, z: 46, yaw: W, scan: 0.8 });
  guard({ id: 'sec-yard-west', look: 'port', weapon: 'pistol', x: -30, y: 0, z: 12, yaw: W,
    route: [at(-30, 12, 3), at(-85, 12, 2), at(-85, 31.5, 2), at(-34, 31.5, 3)] as Route });
  guard({ id: 'sec-yard-east', look: 'port', weapon: 'pistol', x: 38, y: 0, z: 12, yaw: N,
    route: [at(38, 12, 2), at(38, -10, 3), at(-24, -10, 2), at(-24, 12, 2)] as Route });
  guard({ id: 'sec-customs', look: 'port', weapon: 'pistol', x: -60, y: 0, z: 34, yaw: E,
    route: [at(-60, 34, 4), at(-47, 34, 2), at(-47, 42, 4), at(-60, 42, 2)] as Route });
  guard({ id: 'sec-ops', look: 'port', weapon: 'pistol', x: -89.5, y: 0, z: 40, yaw: E, scan: 0.8 });
  guard({ id: 'ops-planner', name: 'the night planner', look: 'port', weapon: 'pistol', x: -95, y: OPS_UPPER, z: 36.8, yaw: N, seated: true });
  // The Meridian's own: suits, SMGs at the compound.
  guard({ id: 'mer-pen-gate', look: 'suit', weapon: 'smg', x: 37.5, y: 0, z: -15.6, yaw: S, scan: 0.8 });
  guard({ id: 'mer-pen-inside', look: 'suit', weapon: 'smg', x: 36, y: 0, z: -26.5, yaw: E,
    route: [at(36, -26.5, 4), at(36, -32.6, 3), at(22, -32.6, 2), at(22, -26.5, 3), at(36, -26.5, 1), at(50.5, -26.5, 3), at(50.5, -19, 2)] as Route });
  guard({ id: 'mer-pen-inside-2', look: 'suit', weapon: 'smg', x: 50.5, y: 0, z: -19, yaw: W,
    route: [at(50.5, -19, 3), at(50.5, -32.6, 2), at(36, -32.6, 3), at(36, -19, 2), at(22, -19, 3), at(36, -19, 1)] as Route });
  guard({ id: 'mer-pen-north', look: 'suit', weapon: 'smg', x: 54, y: 0, z: -36.8, yaw: E,
    route: [at(54, -36.8, 4), at(16, -36.8, 4)] as Route });
  // Two in reserve at the compound's corners (when the charge is on, Marchetti sends them to the staff gate).
  guard({ id: 'mer-reserve-1', look: 'suit', weapon: 'smg', x: 18.6, y: 0, z: -15.6, yaw: S, scan: 0.7 });
  guard({ id: 'mer-reserve-2', look: 'suit', weapon: 'smg', x: 53.4, y: 0, z: -15.6, yaw: S, scan: 0.7 });
  guard({ id: 'mer-fixer', name: 'Lucien Marchetti', look: 'chief', weapon: 'pistol', x: 30, y: 0, z: -19.2, yaw: S, scan: 0.6, relaxed: true });
  guard({ id: 'mer-quay', look: 'suit', weapon: 'pistol', x: -60, y: 0, z: -36.5, yaw: E,
    route: [at(-60, -36.5, 3), at(60, -36.5, 4)] as Route });
  guard({ id: 'mer-shipside', look: 'suit', weapon: 'pistol', x: -19.4, y: 0, z: -37.6, yaw: S, scan: 0.9, relaxed: true });
  // The two by the reefers, talking shop (overhear them: it's one of the leads).
  guard({ id: 'mer-reefer-1', look: 'suit', weapon: 'pistol', x: 67.4, y: 0, z: 6.2, yaw: W, relaxed: true, scan: 0.3 });
  guard({ id: 'mer-reefer-2', look: 'suit', weapon: 'pistol', x: 66.2, y: 0, z: 7.4, yaw: S - 0.6, relaxed: true, scan: 0.3 });
  // Cameras.
  m.securityCamera('cam-gate', 'Truck gate', -14.3, 3.2, 58.2, 0, 1, 58, 0.5);
  m.securityCamera('cam-turnstile', 'Staff gate', 47.3, 2.6, 59.2, 42, 1, 58, 0.4);
  // The compound's cameras watch its gate and its outer strips; the gap between the boxes is theirs to blind.
  m.securityCamera('cam-pen-west', 'Compound gate', 20.3, 4.5, -17.4, 38, 0, -17.5, 0.3);
  m.securityCamera('cam-pen-east', 'Compound south', 51.6, 4.5, -34.6, 40, 0, -33.6, 0.3);
  m.securityCamera('cam-pen-lane', 'Compound lane', 51.6, 4, -26.5, 36, 0, -26.5, 0.55);
  m.securityCamera('cam-office-door', 'Gate office door', -13.9, 3, 48.3, -12, 0, 53, 0.4);
  m.securityCamera('cam-yard-a', 'Yard west', -54, 8, 12.3, -80, 0, 12, 0.7);
  m.securityCamera('cam-yard-b', 'Yard east', 8, 8, 12.3, 30, 0, 12, 0.7);
  m.securityCamera('cam-customs', 'Customs hall', -65.6, 6, 30.4, -54, 0, 40, 0.5);
  m.securityCamera('cam-ops', 'Ops lobby', -86.4, 3.2, 49.6, -96, 0, 40, 0.5);
  m.securityCamera('cam-yard', 'Yard', -14.3, 3.2, 48.2, -8, 0, 36, 0.4);

  // The night shift (scenery): in the canteen, the locker room, the workshop, lashing on the quay.
  let seed = 3100;
  const worker = (x: number, y: number, z: number, yaw: number, activity: GuestActivity, extra: { seat?: number; lookAt?: { x: number; y: number; z: number } } = {}) =>
    m.props.push({ kind: 'guest', x, y, z, yaw, activity, seed: seed++, dress: 'worker', ...extra });
  const pair = (x: number, z: number, a: number) => {
    const dx = Math.cos(a) * 0.55, dz = Math.sin(a) * 0.55;
    worker(x - dx, 0, z - dz, Math.atan2(dx, dz) + Math.PI, 'chat', { lookAt: { x: x + dx, y: 1.6, z: z + dz } });
    worker(x + dx, 0, z + dz, Math.atan2(-dx, -dz) + Math.PI, 'chat', { lookAt: { x: x - dx, y: 1.6, z: z - dz } });
  };
  for (const [x, z, yaw] of [[39.55, 49.72, N], [40.45, 48.28, S], [48.45, 41.28, S]] as const) worker(x, 0, z, yaw, 'sit', { seat: 0.46, lookAt: { x: 40, y: 1, z: 49 } });
  pair(31.5, 46, 0.3);
  pair(98, 28, 1.2);
  pair(14, -37.2, 0);
  pair(-36, -37, 0.2);
  pair(-9, 66, 1.4);
}

function buildStory(m: MapBuilder): void {
  // Nadia Benali, terminal planner and Overwatch's asset, on her break in the canteen.
  m.props.push({ kind: 'character', id: 'nadia', x: 44.45, y: 0, z: 45.92, yaw: N, seat: 0.46 });
  // Clothes: the kit she left you behind her car; another set in the locker room. (Security's uniform comes off a guard.)
  m.props.push({ kind: 'clue', id: 'uniform-docker-car', model: 'uniform', x: 39, y: 0.02, z: 66.3, yaw: 0.3 });
  m.props.push({ kind: 'clue', id: 'uniform-docker-locker', model: 'uniform', x: 32.6, y: 0.47, z: 49.6, yaw: -0.2 });
  // Nadia's bag, with the charge in it, confiscated at the bag check: on the evidence rack.
  m.props.push({ kind: 'clue', id: 'p-charge', model: 'bag', x: -29.55, y: 0.74, z: 50.2, yaw: E });
  // What there is to find out about the four boxes.
  m.props.push({ kind: 'clue', id: 'p-booking', model: 'laptop', x: -17.6, y: 0.76, z: 49.9, yaw: N });
  m.props.push({ kind: 'clue', id: 'p-loadplan', model: 'laptop', x: -98.5, y: OPS_UPPER + 0.76, z: 43, yaw: W });
  m.props.push({ kind: 'clue', id: 'p-xray', model: 'laptop', x: -62.2, y: 0.76, z: 47.4, yaw: S });
  m.props.push({ kind: 'clue', id: 'p-overheard', model: 'listen', x: 69, y: 0, z: 6.8, yaw: 0 });
  // Overwatch's van, and the way out.
  m.props.push({ kind: 'marker', id: 'van', x: 61.4, y: 0, z: 66.6, yaw: W });
  m.props.push({ kind: 'marker', id: 'extract', x: 59.2, y: 0, z: 65.8 });
  // The way out once the gates are watched: the hole in the west fence, the van brought round to the road beyond.
  m.props.push({ kind: 'marker', id: 'extract-west', x: -111.3, y: 0, z: 64.2 });
  m.props.push({ kind: 'marker', id: 'van-west', x: -104, y: 0, z: 69.2, yaw: W });
  // Where you start again after the charge is on (outside the cut in the compound's fence).
  m.props.push({ kind: 'marker', id: 'after-plant', x: 23.9, y: 0, z: -37.9, yaw: Math.PI });
  // Where Marchetti posts his men on the gates.
  m.props.push({ kind: 'marker', id: 'gatecheck-1', x: 41.7, y: 0, z: 56.9, yaw: S });
  m.props.push({ kind: 'marker', id: 'gatecheck-2', x: 3.4, y: 0, z: 56.2, yaw: S });
}

// ---------------------------------------------------------------------------
// Where you're not supposed to be: signs, and red and white hatching across each threshold

/** Red and white stripes painted across a threshold (stripes run across the longer side). */
function hatch(m: MapBuilder, x0: number, z0: number, x1: number, z1: number): void {
  const alongX = x1 - x0 >= z1 - z0;
  const len = alongX ? x1 - x0 : z1 - z0;
  const n = Math.max(2, Math.round(len / 0.4));
  for (let i = 0; i < n; i++) {
    const a = (alongX ? x0 : z0) + (len * i) / n, b = (alongX ? x0 : z0) + (len * (i + 1)) / n;
    const tint = i % 2 ? 0xf2f2f2 : 0xc0281f;
    if (alongX) m.overlay(a, z0, b, z1, 0, 'courtLine', tint);
    else m.overlay(x0, a, x1, b, 0, 'courtLine', tint);
  }
}

function buildSigns(m: MapBuilder): void {
  const AUTH = 0, STAFF = 1, PRIVATE = 2, CUSTOMS = 3;
  // The gate office's two doors.
  hatch(m, -13.85, 52.1, -12.6, 53.9);
  f('warningSign', -12.2, 0, 55.4, 'east', { variant: AUTH });
  hatch(m, -26.7, 58.15, -25.3, 59.6);
  f('warningSign', -28.2, 0, 59.2, 'south', { variant: AUTH });
  // Terminal Ops.
  hatch(m, -85.85, 41.05, -84.5, 42.95);
  f('warningSign', -84.7, 0, 44.8, 'east', { variant: AUTH });
  // Customs: both truck doors and the side door.
  hatch(m, -57.2, 28.6, -50.8, 29.85);
  hatch(m, -57.2, 50.15, -50.8, 51.4);
  hatch(m, -41.85, 44.2, -40.6, 45.8);
  f('warningSign', -59.4, 0, 28.9, 'north', { variant: CUSTOMS });
  f('warningSign', -48.6, 0, 51.3, 'south', { variant: CUSTOMS });
  f('warningSign', -40.7, 0, 47.4, 'east', { variant: CUSTOMS });
  // The Meridian's compound: its gate, and the fence all round.
  hatch(m, 35.3, -16.9, 39.7, -15.95);
  for (const x of [26, 33.4, 41.6, 47]) f('warningSign', x, 1.1, -16.9, 'south', { variant: PRIVATE, h: 0.8 });
  for (const x of [30, 44]) f('warningSign', x, 1.1, -35.1, 'north', { variant: PRIVATE, h: 0.8 });
  for (const z of [-30, -22]) f('warningSign', 19.9, 1.1, z, 'west', { variant: PRIVATE, h: 0.8 });
  for (const z of [-30, -22]) f('warningSign', 52.1, 1.1, z, 'east', { variant: PRIVATE, h: 0.8 });
  // The ways in from outside: staff only.
  hatch(m, 41, 60.15, 42.4, 61.4);
  f('warningSign', 39.8, 1.1, 60.1, 'south', { variant: STAFF, h: 0.8 });
  f('warningSign', -9.4, 0, 61.4, 'south', { variant: STAFF });
}

function buildZones(m: MapBuilder): void {
  const z = (name: string, floor: string, x0: number, z0: number, x1: number, z1: number, y0 = 0, h = 4) => m.zone(name, floor, x0, z0, x1, z1, y0 - 0.5, y0 + h);
  z('Control Room', OPS2, -104, 34, -86, 50, OPS_UPPER, 4);
  z('Terminal Ops', TERMINAL, -104, 34, -86, 50, 0, 4.1);
  z('Gate Office', TERMINAL, -30, 48, -14, 58);
  z('Gate Booth', TERMINAL, -1, 53.8, 1, 57.6);
  z('Staff Gate', TERMINAL, 40, 54, 48, 60);
  z('Locker Room', TERMINAL, 28, 38, 36, 54);
  z('Canteen', TERMINAL, 36, 38, 52, 54);
  z('Customs Shed', TERMINAL, -66, 30, -42, 50, 0, 9);
  z('Workshop', TERMINAL, 74, 18, 110, 46, 0, 15);
  z('Reefer Stack', TERMINAL, 52, 0, 70, 13);
  z('Meridian Compound', TERMINAL, 20, -35, 52, -17);
  z('Quay', TERMINAL, -120, -40, 120, -14);
  z('Truck Gate', TERMINAL, -8.2, 50, 8.2, 60);
  z('Yard A', TERMINAL, -86, -8, -32, 9);
  z('Yard B', TERMINAL, -20, -8, 34, 9);
  z('Yard C', TERMINAL, -86, 16, -32, 30);
  z('Yard D', TERMINAL, -20, 16, 34, 30);
  z('Terminal', TERMINAL, -120, -14, 120, 60);
  z('Car Park', OUTSIDE, 18, 60, 82, 76);
  z('Road', OUTSIDE, -122, 60, 122, 76);
}
