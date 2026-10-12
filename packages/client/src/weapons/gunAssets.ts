import type { WeaponId } from '@gungame/shared';
import { MODEL_FILES } from '../assets/AssetLibrary';

type V = [number, number, number];

/**
 * A weapon built from a model file instead of parts. To use a new model, drop the file under
 * public/models/guns/, add it to MODEL_FILES and describe it here; buildGun does the rest.
 *
 * Points are in the model's own space (as authored, in meters), with the muzzle pointing along +x
 * and +y up. buildGun turns the model so it points down -z with `grip` at the origin.
 */
export interface GunAsset {
  file: string;
  /** Nodes to show; anything else in the file (spare parts, loose rounds) is left out. */
  parts: string[];
  /** Where the shooting hand holds the grip. */
  grip: V;
  muzzle: V;
  /** A point on the iron-sight line, about where the cheek would put the eye. */
  ironSight: V;
  /** Top of the receiver or slide, where a sight mount goes. */
  rail: V;
  /** Underside of the barrel or forend, where a light, laser or grip mounts. */
  under: V;
  /** Where the support hand holds a long gun. */
  supportHand?: V;
  /** Bottom of the magazine, for extended and quick-release magazines. */
  magBottom: V;
  /** A detachable magazine part that slides further out for an extended magazine. */
  magazine?: { part: string; offset: V; extendedOffset: V };
  /** A scope that comes with the gun, used for these optic choices instead of a separate one. */
  builtinScope?: { part: string; optics: string[]; eyepiece: V };
  /** Pistol-sized barrel attachments. */
  compact?: boolean;
}

export const GUN_ASSETS: Partial<Record<WeaponId, GunAsset>> = {
  // Walther P38 service pistol (Poly Haven, CC0), in gold: the golden gun. (The pistol is a Glock; see glock.ts.)
  golden: {
    file: MODEL_FILES.pistol,
    parts: ['service_pistol_pistol_a', 'service_pistol_slide_a', 'service_pistol_hammer_a', 'service_pistol_trigger_a', 'service_pistol_magazine_loaded'],
    grip: [0.008, 0.013, 0],
    muzzle: [0.174, 0.061, 0],
    ironSight: [0.0, 0.076, 0],
    rail: [0.045, 0.0706, 0],
    under: [0.135, 0.046, 0],
    magBottom: [-0.0105, -0.05, 0],
    magazine: { part: 'service_pistol_magazine_loaded', offset: [-0.005, 0.002, 0], extendedOffset: [-0.011, -0.033, 0] },
    compact: true,
  },
  // Bolt-action 7.62 rifle with a side-rail scope and a cloth-wrapped stock (Poly Haven, CC0).
  sniper: {
    file: MODEL_FILES.boltRifle,
    parts: ['bolt_action_rifle_7_62', 'bolt_action_rifle_7_62_wrap', 'bolt_action_rifle_7_62_bolt_a', 'bolt_action_rifle_7_62_trigger', 'bolt_action_rifle_7_62_scope'],
    grip: [-0.332, 0.044, 0],
    muzzle: [0.597, 0.0515, 0],
    ironSight: [-0.332, 0.0705, 0],
    rail: [-0.215, 0.0655, 0],
    under: [0.2, 0.028, 0],
    supportHand: [0.03, 0.02, 0],
    magBottom: [-0.201, -0.0395, 0],
    builtinScope: { part: 'bolt_action_rifle_7_62_scope', optics: ['acog', 'scope8x'], eyepiece: [-0.2604, 0.0865, 0] },
  },
};

/** The golden pistol is the service pistol in gold. */
GUN_ASSETS.golden = GUN_ASSETS.pistol;
