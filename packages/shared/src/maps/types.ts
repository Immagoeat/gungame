import type { WeaponId } from '../weapons';
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
/** groove: chatting by the dance floor, moving to the music while they talk. */
export type ClueModel = 'laptop' | 'ticket' | 'phone' | 'zipties' | 'ledger' | 'listen' | 'uniform' | 'decanter' | 'vial' | 'charge' | 'bag';

export type GuestActivity = 'dance' | 'groove' | 'chat' | 'drink' | 'dj' | 'bartender' | 'sit';

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
  /**
   * A security guard. With a route they patrol it in a loop (pausing at each point); without one they
   * hold their post, looking around within `scan` radians of their facing.
   */
  | {
    kind: 'guard'; id: string; x: number; y: number; z: number; yaw: number;
    weapon: WeaponId;
    route?: { x: number; y: number; z: number; wait?: number }[];
    scan?: number;
    /** Sitting at a desk (watching monitors): slower to react. */
    seated?: boolean;
    /** Carries something the mission needs (searched from their body with E). */
    carries?: string;
    /** Display name for a named guard. */
    name?: string;
    /** suit: private security in black; chief: their boss; tactical: armour; crew: a ship's security officer in uniform; port: terminal security (navy, hi-vis). */
    look?: 'suit' | 'tactical' | 'chief' | 'crew' | 'port';
    /** At ease while on post (weapon down, chatting) until something alarms them. */
    relaxed?: boolean;
  }
  /** A door in a doorway. `axis` is the direction the door's width runs. Locked doors need a key item, or `lock: 'pick'` can be picked. */
  | { kind: 'door'; id: string; x: number; y: number; z: number; axis: 'x' | 'z'; width: number; height: number; lock?: string; open?: boolean }
  /** A mission character waiting somewhere (the hostage), seated, facing yaw. */
  | { kind: 'hostage'; id: string; x: number; y: number; z: number; yaw: number; seat: number }
  /** A named character the mission drives (someone to talk to), standing or seated (`seat` height above y). */
  | { kind: 'character'; id: string; x: number; y: number; z: number; yaw: number; seat?: number }
  /** A named place the mission uses (extraction point, reinforcement spawn, ...). */
  | { kind: 'marker'; id: string; x: number; y: number; z: number; yaw?: number }
  /**
   * Something the mission lets you examine for information (hold E): a laptop, a note, a phone.
   * `listen` has no model: it's a spot to overhear a conversation from.
   */
  | { kind: 'clue'; id: string; x: number; y: number; z: number; yaw: number; model: ClueModel }
  /** A weapon lying in the world; picking it up (E) unlocks it for good. */
  | { kind: 'weaponPickup'; x: number; y: number; z: number; yaw: number; weapon: WeaponId }
  | {
    /** A party guest (client-side scenery: they dance, chat, drink, DJ, tend bar or sit). */
    kind: 'guest'; x: number; y: number; z: number;
    /** Facing, same convention as the player's yaw. */
    yaw: number;
    activity: GuestActivity;
    /** Picks their look and gives each their own timing. */
    seed: number;
    /** Who or what they look at while chatting (world point). */
    lookAt?: { x: number; y: number; z: number };
    /** Dancers in the same crew dance the same moves together. */
    crew?: number;
    /** Seat height above y, for 'sit'. */
    seat?: number;
    /** Work clothes (hi-vis and a hard hat) instead of party clothes. */
    dress?: 'worker';
  }
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
  /** Scenery beyond the playable area, drawn by the client (neighbours and hills; the open sea round a ship). */
  backdrop?: 'beverlyHills' | 'openSea' | 'harbour';
  /** No ground plane (a ship at sea: everything you stand on is blocks). */
  noGround?: boolean;
}
