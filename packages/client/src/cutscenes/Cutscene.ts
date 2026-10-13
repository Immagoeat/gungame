import type * as THREE from 'three';
import type { AvatarState } from '../entities/avatar';

/** What a cutscene shows on one frame. */
export interface CutsceneFrame {
  camera: { position: THREE.Vector3; target: THREE.Vector3; fov: number };
  /** The player's body, or null while it's out of sight (inside the van, or as the camera enters the head). */
  actor: AvatarState | null;
  /** Letterbox bars, 0..1. */
  bars: number;
  /** Title card, shown with this opacity. */
  title?: { heading: string; sub: string; opacity: number };
  /** Black over the whole picture, 0..1 (fades in and out). */
  fade?: number;
  /** Seen through the player's eyes: the body is hidden and the first-person gun shows. */
  firstPerson?: boolean;
  /** Subtitle line (radio chatter, dialogue). */
  subtitle?: { speaker: string; text: string } | null;
}

/**
 * A scripted scene played instead of gameplay (for now: mission intros). It owns any props it adds,
 * which may stay in the world afterwards until `dispose` (the parked van, say).
 */
export interface Cutscene {
  readonly duration: number;
  /** `time` runs from 0 to `duration`; jumping ahead (skipping) is allowed. */
  update(dt: number, time: number): CutsceneFrame;
  /** Where the player stands and looks when control is handed over. */
  readonly end: { pos: THREE.Vector3; yaw: number; pitch: number };
  /** Called once when the scene ends or is skipped: settle props into their final state. */
  finish(): void;
  /** Removes everything the scene added (when the mission ends). */
  dispose(): void;
}
