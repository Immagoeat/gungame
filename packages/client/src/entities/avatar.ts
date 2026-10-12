import * as THREE from 'three';
import type { Loadout, Stance, WeaponId } from '@gungame/shared';
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
}

/** The player's body: seen by security cameras, as legs from first person, and in shadows. */
export interface Avatar {
  readonly group: THREE.Group;
  update(dt: number, state: AvatarState): void;
  /** Puts the equipped weapon (with its attachments) in the character's hands. */
  setWeapon(id: WeaponId, loadout: Loadout): void;
}

/** The character model if it loaded, otherwise the built-in jointed figure. */
export function createAvatar(): Avatar {
  const gltf = getModel(MODEL_FILES.player);
  if (gltf) {
    try {
      return new CharacterAvatar(gltf);
    } catch (err) {
      console.warn('Character model could not be rigged; using the built-in body.', err);
    }
  }
  return new ProceduralAvatar();
}
