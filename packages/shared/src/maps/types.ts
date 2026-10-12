import type { Vec3 } from '../math/vec';
import type { FurnitureType } from './furniture';
import type { BlockMaterial } from './materials';

export type { BlockMaterial } from './materials';

/** An axis-aligned solid box. x/z are the center, y is the bottom face. */
export interface Block {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  material: BlockMaterial;
  /** Optional color multiplier, e.g. to make one sofa red and another grey. */
  tint?: number;
  /** Collision only: not drawn (used for furniture, whose looks come from a furniture prop). */
  invisible?: boolean;
  /** Bullet resistance override (m/s per cm); otherwise taken from the material. */
  resistance?: number;
}

/**
 * Non-box decorations and gameplay objects. Rotations use the player's convention:
 * yaw 0 faces -z (north), positive yaw turns left; pitch < 0 looks down.
 */
export type PropDef =
  | { kind: 'securityCamera'; id: string; label: string; x: number; y: number; z: number; yaw: number; pitch: number; sweep: number }
  | { kind: 'monitorBank'; x: number; y: number; z: number; yaw: number; cols: number; rows: number }
  | {
    kind: 'light'; x: number; y: number; z: number; color: number; intensity: number; distance: number;
    /** Draw a shootable ceiling fixture above the light. */
    fixture: boolean;
    castShadow?: boolean;
    /** Only lit after dark (street and garden lamps). */
    nightOnly?: boolean;
  }
  | { kind: 'chandelier'; x: number; y: number; z: number; castShadow?: boolean }
  | { kind: 'palmCrown'; x: number; y: number; z: number }
  | {
    kind: 'furniture'; type: FurnitureType; x: number; y: number; z: number; yaw: number;
    /** Size overrides (see FURNITURE for defaults). */
    w?: number; h?: number; d?: number;
    color?: number;
    /** Type-specific style switch (e.g. car body style, counter with sink). */
    variant?: number;
  };

/** A named area, used for the HUD location readout and later for mission triggers. */
export interface ZoneDef {
  name: string;
  floor: string;
  min: Vec3;
  max: Vec3;
}

export interface MapDef {
  id: string;
  name: string;
  /** The ground plane spans -halfSize..halfSize on x and z at y = 0. */
  halfSize: number;
  groundMaterial: BlockMaterial;
  blocks: Block[];
  props: PropDef[];
  zones: ZoneDef[];
  playerSpawn: Vec3;
  /** Initial facing, same convention as the player's yaw. */
  spawnYaw: number;
  /** Hour of the day (0-24) the map starts at. */
  timeOfDay?: number;
}
