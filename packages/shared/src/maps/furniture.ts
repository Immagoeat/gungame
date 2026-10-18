/**
 * Furniture and detailed props. The client renders each type as a detailed model; the shared
 * code only needs its size and whether (and how) it blocks movement.
 *
 * Local space: the piece stands on y = 0, centred on x/z, with its front facing +z.
 */
export interface FurnitureSpec {
  /** Default [width (x), height (y), depth (z)] in meters; maps may override per placement. */
  size: [number, number, number];
  /** Blocks movement and bullets' footing. Defaults to true. */
  solid?: boolean;
  /** Custom collision boxes [x0, y0, z0, x1, y1, z1] in local space; defaults to the full bounds. */
  colliders?: (w: number, h: number, d: number) => number[][];
  /** Bullet resistance in m/s per cm (see ballistics.ts). Most furniture is soft or hollow; defaults to 3. */
  resistance?: number;
}

const ring = (w: number, h: number, d: number, t: number): number[][] => [
  [-w / 2, 0, -d / 2, w / 2, h, -d / 2 + t],
  [-w / 2, 0, d / 2 - t, w / 2, h, d / 2],
  [-w / 2, 0, -d / 2 + t, -w / 2 + t, h, d / 2 - t],
  [w / 2 - t, 0, -d / 2 + t, w / 2, h, d / 2 - t],
];
const pole = (r: number, h: number): number[][] => [[-r, 0, -r, r, h, r]];

export const FURNITURE = {
  // Living
  sofa: { size: [2.3, 0.85, 0.95] },
  sectional: {
    size: [3.2, 0.85, 2.4],
    colliders: (w, h, d) => [[-w / 2, 0, -d / 2, w / 2, h, -d / 2 + 1], [-w / 2, 0, -d / 2 + 1, -w / 2 + 1, h, d / 2]],
  },
  chesterfield: { size: [2.2, 0.8, 0.9] },
  armchair: { size: [0.9, 0.95, 0.9] },
  coffeeTable: { size: [1.3, 0.42, 0.7] },
  sideTable: { size: [0.5, 0.55, 0.5] },
  consoleTable: { size: [1.6, 0.8, 0.4] },
  floorLamp: { size: [0.45, 1.7, 0.45], colliders: () => pole(0.15, 1.7) },
  tableLamp: { size: [0.35, 0.6, 0.35], solid: false },
  tvWall: { size: [1.9, 1.1, 0.08], solid: false },
  mediaConsole: { size: [2.2, 0.5, 0.45] },
  bookshelf: { size: [1.2, 2.4, 0.4], resistance: 12 },
  plantLarge: { size: [0.7, 1.8, 0.7], colliders: () => pole(0.25, 0.5) },
  plantSmall: { size: [0.35, 0.6, 0.35], solid: false },
  rug: { size: [3, 0.01, 2], solid: false },
  roundRug: { size: [2.5, 0.01, 2.5], solid: false },
  medallion: { size: [4, 0.01, 4], solid: false },
  grandPiano: { size: [1.55, 1.0, 2.1], resistance: 8 },
  pianoBench: { size: [0.8, 0.5, 0.38] },
  wallArt: { size: [1.4, 1.0, 0.05], solid: false },
  curtain: { size: [1.2, 3.4, 0.18], solid: false },
  pendantLight: { size: [0.5, 0.9, 0.5], solid: false },
  fireplace: { size: [2.2, 3.9, 0.7], resistance: 40 },
  globe: { size: [0.6, 1.1, 0.6] },
  sculpture: { size: [0.6, 2.0, 0.6], resistance: 40 },
  column: { size: [0.7, 3.9, 0.7], resistance: 40 },
  vase: { size: [0.4, 0.9, 0.4] },
  roundTable: { size: [1.4, 0.78, 1.4] },
  // Dining & kitchen
  diningTable: { size: [3.2, 0.76, 1.2] },
  diningChair: { size: [0.5, 1.05, 0.55] },
  sideboard: { size: [2.0, 0.9, 0.5] },
  counter: { size: [2.4, 0.93, 0.65], resistance: 10 },
  wallCabinet: { size: [2.4, 0.8, 0.35], solid: false },
  island: { size: [3.4, 0.93, 1.3], resistance: 12 },
  barStool: { size: [0.45, 0.8, 0.45] },
  fridge: { size: [0.95, 2.1, 0.75], resistance: 20 },
  rangeHood: { size: [1.0, 1.1, 0.55], solid: false },
  wineFridge: { size: [0.6, 0.9, 0.6] },
  // Bedroom & bath
  bed: { size: [1.9, 1.25, 2.25] },
  nightstand: { size: [0.55, 0.6, 0.45] },
  dresser: { size: [1.6, 0.85, 0.55] },
  wardrobe: { size: [1.2, 2.3, 0.62] },
  desk: { size: [1.6, 0.76, 0.75] },
  executiveDesk: { size: [2.1, 0.78, 0.95] },
  officeChair: { size: [0.65, 1.15, 0.65] },
  bench: { size: [1.4, 0.48, 0.45] },
  bathtub: { size: [1.8, 0.62, 0.85], resistance: 15 },
  toilet: { size: [0.42, 0.8, 0.7] },
  vanity: { size: [1.8, 2.0, 0.55], colliders: (w, _h, d) => [[-w / 2, 0, -d / 2, w / 2, 0.9, d / 2]] },
  towelRack: { size: [0.7, 1.0, 0.1], solid: false },
  // Special rooms
  poolTable: { size: [2.6, 0.82, 1.45] },
  barCounter: { size: [3.0, 1.1, 0.7] },
  backBar: { size: [3.0, 2.4, 0.42] },
  arcadeMachine: { size: [0.75, 1.8, 0.8] },
  dartboard: { size: [0.5, 0.5, 0.05], solid: false },
  recliner: { size: [0.9, 1.05, 1.0] },
  popcornMachine: { size: [0.6, 1.6, 0.5] },
  wineRack: { size: [1.6, 2.3, 0.42], resistance: 10 },
  wineBarrel: { size: [0.7, 0.95, 0.7], resistance: 15 },
  treadmill: { size: [0.85, 1.4, 2.0], resistance: 10 },
  exerciseBike: { size: [0.6, 1.25, 1.25] },
  weightBench: { size: [1.3, 1.6, 1.4] },
  dumbbellRack: { size: [1.7, 0.95, 0.5] },
  punchingBag: { size: [0.5, 3.8, 0.5], colliders: () => [[-0.25, 0.7, -0.25, 0.25, 2.2, 0.25]] },
  serverRack: { size: [0.7, 2.15, 1.1], resistance: 30 },
  securityDesk: { size: [3.6, 0.78, 1.0], resistance: 8 },
  gunLocker: { size: [1.1, 2.0, 0.5], resistance: 60 },
  safe: { size: [0.8, 1.15, 0.7], resistance: 150 },
  goldStack: { size: [0.95, 0.35, 1.1], resistance: 200 },
  cashPallet: { size: [1.2, 1.0, 1.0], resistance: 8 },
  depositBoxes: { size: [3.0, 2.4, 0.45], resistance: 100 },
  vaultDoor: { size: [0.45, 2.6, 2.0], resistance: 200 },
  displayCase: { size: [1.2, 1.1, 0.6] },
  toolChest: { size: [1.2, 1.1, 0.55], resistance: 40 },
  car: { size: [1.95, 1.3, 4.7], resistance: 25 },
  toyChest: { size: [0.9, 0.55, 0.5] },
  beanBag: { size: [0.9, 0.7, 0.9] },
  teepee: { size: [1.4, 2.1, 1.4], colliders: () => pole(0.5, 1.2) },
  rockingHorse: { size: [0.4, 0.9, 1.0] },
  kidsTable: { size: [1.0, 0.5, 0.7] },
  telescope: { size: [0.8, 1.6, 0.8], colliders: () => pole(0.3, 1.2) },
  barCart: { size: [0.9, 0.85, 0.45] },
  clothesRail: { size: [1.8, 2.0, 0.55] },
  shoeWall: { size: [1.8, 2.3, 0.35] },
  closetIsland: { size: [1.6, 0.95, 0.9] },
  // Outdoors
  grandFountain: {
    size: [9, 4.6, 9], resistance: 40,
    colliders: (w, _h, d) => [...ring(w, 0.65, d, 0.5), [-0.6, 0, -0.6, 0.6, 4.6, 0.6]],
  },
  wallFountain: { size: [7, 3.2, 1.0], resistance: 40 },
  gardenFountain: {
    size: [3.4, 2.4, 3.4], resistance: 40,
    colliders: (w, _h, d) => [...ring(w, 0.55, d, 0.35), [-0.3, 0, -0.3, 0.3, 2.4, 0.3]],
  },
  palm: { size: [0.5, 9, 0.5], resistance: 10, colliders: () => pole(0.22, 6) },
  cypress: { size: [1.1, 6, 1.1], colliders: () => pole(0.45, 5) },
  oliveTree: { size: [3, 4, 3], colliders: () => pole(0.2, 2) },
  topiary: { size: [0.9, 2.2, 0.9] },
  lampPost: { size: [0.45, 3.8, 0.45], resistance: 30, colliders: () => pole(0.15, 3.8) },
  gardenBench: { size: [1.7, 0.9, 0.65] },
  urnPlanter: { size: [0.8, 1.3, 0.8], resistance: 30 },
  flowerBed: { size: [4, 0.4, 1.2] },
  lounger: { size: [0.75, 0.9, 2.0] },
  umbrella: { size: [2.8, 2.7, 2.8], colliders: () => pole(0.06, 2.7) },
  outdoorTable: { size: [1.2, 0.75, 1.2] },
  outdoorChair: { size: [0.6, 0.85, 0.6] },
  outdoorSofa: { size: [2.2, 0.8, 0.95] },
  firePit: { size: [1.5, 0.45, 1.5], resistance: 40 },
  stringLights: { size: [8, 3, 0.1], solid: false },
  tennisNet: { size: [12.8, 1.07, 0.1] },
  umpireChair: { size: [0.9, 2.2, 1.1] },
  helicopter: { size: [3.0, 3.3, 11.5], resistance: 15, colliders: () => [[-0.95, 0, -1.6, 0.95, 2.4, 3.0], [-0.3, 0.9, -5.6, 0.3, 1.9, -1.6]] },
  windsock: { size: [0.3, 3.2, 1.5], colliders: () => pole(0.05, 3.2) },
  poolFloat: { size: [1.3, 0.9, 1.3], solid: false },
  gateLeaf: { size: [4.0, 3.4, 0.12], resistance: 30 },
  statue: { size: [0.9, 2.8, 0.9], resistance: 40 },
  poolLight: { size: [0.3, 0.3, 0.05], solid: false },
  sconce: { size: [0.25, 0.45, 0.25], solid: false },
  hedgeWall: { size: [4, 2.6, 0.9] },

  // Party
  searchlight: { size: [1.3, 1.9, 1.3], resistance: 30 },
  uplight: { size: [0.3, 0.3, 0.3], solid: false },
  djBooth: { size: [3.2, 3.6, 1.4], resistance: 10, colliders: (w, _h, d) => [[-w / 2, 0, -d / 2, w / 2, 1.15, d / 2]] },
  speakerStack: { size: [0.75, 2.1, 0.65], resistance: 8 },
  cocktailTable: { size: [0.8, 1.1, 0.8], colliders: () => pole(0.3, 1.1) },
  partyBar: { size: [3.2, 2.4, 1.6], resistance: 15, colliders: (w, _h, d) => [[-w / 2, 0, d / 2 - 0.7, w / 2, 1.1, d / 2], [-w / 2, 0, -d / 2, w / 2, 2.2, -d / 2 + 0.3]] },
  champagneTower: { size: [1.0, 1.55, 1.0] },
  balloonArch: { size: [4.4, 3.4, 0.6], solid: false },
  redCarpet: { size: [1.8, 1.0, 8], solid: false },
  valetStand: { size: [0.7, 1.3, 0.6] },
  ledOrb: { size: [0.6, 0.6, 0.6], solid: false },
  discoBall: { size: [0.6, 1.5, 0.6], solid: false },

  // Ship
  slotMachine: { size: [0.7, 1.75, 0.7] },
  cardTable: { size: [2.4, 0.78, 1.3] },
  rouletteTable: { size: [2.8, 0.92, 1.3] },
  /** Hangs from davits over the deck edge: the hull blocks you, the boat itself is out of reach. */
  lifeboat: { size: [8.5, 3.0, 2.8], solid: false },
  bollard: { size: [0.6, 0.6, 0.6], resistance: 100 },
  bunkBed: { size: [2.0, 1.8, 0.95] },
  shipEngine: { size: [6, 3, 2.8], resistance: 120 },
  lifeRing: { size: [0.75, 0.75, 0.12], solid: false },
  washer: { size: [0.9, 1.45, 0.9], resistance: 40 },
  laundryCart: { size: [1.0, 0.9, 0.65] },
  storageRack: { size: [2.0, 2.2, 0.6], resistance: 20 },
  crewLocker: { size: [2.0, 1.95, 0.5], resistance: 30 },
  galleyRange: { size: [1.8, 0.95, 0.9], resistance: 60 },
  controlPanel: { size: [2.4, 1.25, 0.8], resistance: 40 },
  helm: { size: [0.9, 1.3, 0.7], resistance: 40 },
  radarConsole: { size: [1.0, 1.3, 0.85], resistance: 40 },
  /** Overhead pipework (hang it near the ceiling: y is its underside). */
  pipeRun: { size: [6, 0.5, 0.6], solid: false },
  // Port
  /** A stack of 40-foot containers: h is the stack's height, in whole boxes of 2.59 m. variant seeds the colours. */
  shippingContainer: { size: [12.2, 2.59, 2.44], resistance: 120 },
  /** A ship-to-shore gantry crane: legs at the corners of w × d, the boom out over the water in front (+z). */
  gantryCrane: {
    size: [18, 48, 26], resistance: 200,
    colliders: (w, _h, d) => [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => [sx * w / 2 - 0.8, 0, sz * d / 2 - 0.8, sx * w / 2 + 0.8, 3.5, sz * d / 2 + 0.8]),
  },
  straddleCarrier: {
    size: [5.5, 14, 9], resistance: 120,
    colliders: (w, _h, d) => [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => [sx * w / 2 - 0.45, 0, sz * d / 2 - 0.5, sx * w / 2 + 0.45, 2.2, sz * d / 2 + 0.5]),
  },
  lightMast: { size: [0.8, 26, 0.8], resistance: 200, colliders: () => [[-0.3, 0, -0.3, 0.3, 26, 0.3]] },
  xrayScanner: {
    size: [6.5, 7.5, 3], resistance: 150,
    colliders: (w, h, d) => [[-w / 2, 0, -d / 2, -w / 2 + 1, h, d / 2], [w / 2 - 1, 0, -d / 2, w / 2, h, d / 2]],
  },
  /** A container trailer (the chassis only: put a container on it). */
  trailer: { size: [12.4, 1.45, 2.5], resistance: 80 },
  jerseyBarrier: { size: [3, 0.85, 0.6], resistance: 200 },
  vendingMachine: { size: [1, 1.9, 0.8], resistance: 30 },
  /**
   * A warning sign: on two posts (h over 1), or just the panel on a wall or fence (h 1 or less: y is
   * its bottom edge). variant: 0 authorised personnel only, 1 staff only, 2 private (the Meridian), 3 customs.
   */
  warningSign: { size: [1.2, 2.3, 0.08], resistance: 20, colliders: (w, h) => (h > 1 ? [-1, 1].map(sx => [sx * w * 0.42 - 0.04, 0, -0.04, sx * w * 0.42 + 0.04, h, 0.04]) : []) },
} satisfies Record<string, FurnitureSpec>;

export type FurnitureType = keyof typeof FURNITURE;

/** Rotation that makes a piece's front face the given compass direction. */
export const FACE = { south: 0, east: Math.PI / 2, north: Math.PI, west: -Math.PI / 2 } as const;
export type Facing = keyof typeof FACE;
