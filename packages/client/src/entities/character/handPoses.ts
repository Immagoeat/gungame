import * as THREE from 'three';
import type { WeaponId } from '@gungame/shared';
import type { GunModel } from '../../weapons/gunModels';
import { bone, curlFingers, orientHand, solveTwoBone, type BoneMap, type Grip } from './rig';

/** How a hand holds the gun, in the gun's own space (-z forward, grip at the origin). */
interface HandHold {
  /** Where the palm centre goes. */
  palm: THREE.Vector3;
  /** Wrist-to-knuckles direction. */
  fingers: THREE.Vector3;
  /** Index-to-little-finger direction. */
  across: THREE.Vector3;
  grip: Grip;
  /** Which way the elbow points (gun space). */
  elbow: THREE.Vector3;
}

const GRIP_TILT = 0.28;
/** Wrist to palm centre, meters (for an adult hand). */
const PALM_REACH = 0.05;

export function handHolds(gun: GunModel, weapon: WeaponId): { right: HandHold; left: HandHold } {
  const pistol = weapon === 'pistol' || weapon === 'golden';
  // Shooting hand: palm on the right of the grip, knuckles forward, index finger along the trigger.
  const right: HandHold = {
    palm: new THREE.Vector3(0.026, -0.045, 0.02),
    fingers: new THREE.Vector3(0, -Math.sin(GRIP_TILT) - 0.1, -1),
    across: new THREE.Vector3(0, -1, Math.sin(GRIP_TILT)),
    grip: { Index: 0.35, Middle: 0.95, Ring: 1.0, Pinky: 1.05, Thumb: 0.6 },
    elbow: new THREE.Vector3(0.5, -1, 0.3),
  };
  const left: HandHold = pistol
    ? {
      // Support hand wrapped round the shooting hand, from the left.
      palm: new THREE.Vector3(-0.03, -0.065, 0.02),
      fingers: new THREE.Vector3(0.2, -0.35, -1),
      across: new THREE.Vector3(0, -1, 0.3),
      grip: { Index: 0.9, Middle: 1.0, Ring: 1.05, Pinky: 1.1, Thumb: 0.2 },
      elbow: new THREE.Vector3(-0.5, -1, 0.3),
    }
    : {
      // Palm up under the handguard, fingers curled up its right side.
      palm: gun.supportHand.clone().add(new THREE.Vector3(-0.01, -0.024, 0)),
      fingers: new THREE.Vector3(1, 0.1, -0.35),
      across: new THREE.Vector3(0, 0, 1),
      grip: { Index: 0.55, Middle: 0.6, Ring: 0.65, Pinky: 0.7, Thumb: 0.4 },
      elbow: new THREE.Vector3(-0.3, -1, 0.1),
    };
  return { right, left };
}

/**
 * Reaches an arm to a hold on the gun and closes the hand round it. `toWorld` maps gun-space points;
 * `turn` maps gun-space directions. Returns how far the hand fell short.
 */
export function reach(
  bones: BoneMap, side: 'Left' | 'Right', hold: HandHold,
  toWorld: (v: THREE.Vector3) => THREE.Vector3, turn: (v: THREE.Vector3) => THREE.Vector3,
): number {
  const fingers = turn(hold.fingers.clone().normalize());
  const wrist = toWorld(hold.palm.clone()).addScaledVector(fingers, -PALM_REACH);
  const short = solveTwoBone(bone(bones, `${side}Arm`), bone(bones, `${side}ForeArm`), bone(bones, `${side}Hand`), wrist, turn(hold.elbow.clone()));
  orientHand(bones, side, fingers, turn(hold.across.clone()));
  curlFingers(bones, side, hold.grip);
  return short;
}
