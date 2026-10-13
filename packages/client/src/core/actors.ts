import type * as THREE from 'three';

/**
 * Characters a mode puts in the world (guards, a hostage): what bullets can hit, what hears noise,
 * and what happens when a civilian is hit. Set on the Game by the active mission.
 */
export interface WorldActors {
  hitTargets(): THREE.Object3D[];
  /** A bullet hit one of the hit targets. Returns true if it killed. */
  hit(object: THREE.Object3D, damage: number, head: boolean, from: THREE.Vector3): boolean;
  noise(at: THREE.Vector3, radius: number, kind: 'gunshot' | 'glass' | 'impact' | 'footsteps' | 'thud' | 'voice'): void;
  civilianHit(at: THREE.Vector3): void;
}
