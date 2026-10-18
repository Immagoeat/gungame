import * as THREE from 'three';
import type { CharacterLook, Loadout, Stance, WeaponId } from '@gungame/shared';
import { characterLook } from '../core/characterLook';
import { getModel, MODEL_FILES } from '../assets/AssetLibrary';
import { CharacterAvatar } from './character/CharacterAvatar';
import { ProceduralAvatar } from './ProceduralAvatar';

/** What the player's body needs to know each frame to pose itself. */
export interface AvatarState {
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  stance: Stance;
  /** Camera height above the feet. */
  eyeHeight: number;
  /** Horizontal speed in m/s. */
  speed: number;
  /** Signed forward speed (negative when backpedalling). */
  forward: number;
  swimming: boolean;
  onGround: boolean;
  aiming: boolean;
  /** The first-person gun's placement in camera space (the body holds the gun in the same spot). */
  gunOffset: THREE.Vector3;
  gunRotation: THREE.Quaternion;
  /**
   * Cutscene posing (all optional):
   * - seat: sitting (world heights of the seat and floor); blend 0..1 rises or sits down.
   * - hold: carry the gun relative to the body instead of the camera ('lowReady' standing,
   *   'seated' resting between the knees, 'relaxed' at ease in one hand); blend 0..1 eases between
   *   that and the camera hold.
   * - touchEar: 0..1, left hand to the headset (talking on the radio).
   * - lookAt: turn the head towards a world point.
   */
  seat?: { seat: number; floor: number; lean?: number; blend?: number };
  /** `rise` (0..1) moves the gun from the seated carry to low ready while standing up. */
  hold?: { kind: 'lowReady' | 'seated' | 'relaxed'; blend: number; rise?: number };
  touchEar?: number;
  lookAt?: THREE.Vector3;
  /** 0..1: collapsing to the ground (dead or knocked out); 1 = lying on their back. */
  down?: number;
  /** Hands tied behind the back (a hostage). */
  restrained?: boolean;
}

/** The player's body: seen by security cameras, as legs from first person, and in shadows. */
export interface Avatar {
  readonly group: THREE.Group;
  update(dt: number, state: AvatarState): void;
  /** Puts the equipped weapon (with its attachments) in the character's hands. */
  setWeapon(id: WeaponId, loadout: Loadout): void;
  /** Empty-handed. */
  clearWeapon?(): void;
}

/** The character model if it loaded, otherwise the built-in jointed figure. */
export function createAvatar(look: CharacterLook = characterLook.get()): Avatar {
  const gltf = getModel(MODEL_FILES.player);
  if (gltf) {
    try {
      return new CharacterAvatar(gltf, look, characterLook.outfit ? { civ: characterLook.outfit } : {});
    } catch (err) {
      console.warn('Character model could not be rigged; using the built-in body.', err);
    }
  }
  return new ProceduralAvatar();
}
