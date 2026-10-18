import { PORT_UNIFORM } from '../../../npc/Guard';
import type { OutfitDef } from '../undercover';

/**
 * Undercover at the port: outside the fence anyone can stand about; inside it you need to look like
 * the night shift, and the offices are for terminal security. Nobody but the Meridian's own goes into
 * their compound on the quay.
 */

export type Outfit = 'civilian' | 'docker' | 'security';
export type Access = 'public' | 'docks' | 'security' | 'private';

export const OUTFITS: Record<Outfit, OutfitDef<Access>> = {
  civilian: {
    name: 'Civilian', access: ['public'],
    style: { top: 'shirt', topColor: 0x2b2f36, bottomColor: 0x22252b, accent: 0x1b1d21, shoes: 0x0d0d0e, hairStyle: 'short' },
  },
  docker: {
    name: 'Docker', access: ['public', 'docks'],
    style: { top: 'tee', topColor: 0x2b3440, bottomColor: 0x1d2a44, accent: 0xf27a1a, shoes: 0x1a1612, hairStyle: 'short', hiVis: true, hardHat: true },
  },
  security: { name: 'Terminal security', access: ['public', 'docks', 'security'], style: PORT_UNIFORM },
};

export const ACCESS_NAMES: Record<Access, string> = {
  public: 'Public', docks: 'Terminal staff only', security: 'Terminal security only', private: 'The Meridian only',
};

const ZONE_ACCESS: Record<string, Access> = {
  'Car Park': 'public', Road: 'public',
  'Gate Office': 'security', 'Gate Booth': 'security', 'Terminal Ops': 'security', 'Control Room': 'security', 'Customs Shed': 'security',
  'Meridian Compound': 'private',
};

/** Once the charge is on, Marchetti's men watch the gates: nobody gets past them. */
const LOCKDOWN_ACCESS: Record<string, Access> = { 'Staff Gate': 'private', 'Truck Gate': 'private', 'Gate Booth': 'private' };

/** Anywhere inside the fence that isn't named otherwise is the terminal: staff only. */
export const accessOf = (zone: string | undefined, lockdown = false): Access =>
  (zone && lockdown && LOCKDOWN_ACCESS[zone]) || (zone && ZONE_ACCESS[zone]) || (zone ? 'docks' : 'public');

/** What being there gets you, for the restricted-area warning. */
export const ACCESS_WARNINGS: Record<Access, string> = {
  public: '', docks: 'you\'ll be warned off', security: 'you\'ll be warned off', private: 'they won\'t warn you',
};

/** The night shift at Terminal Est is on edge since Vale: guards and cameras notice you faster here. */
export const PORT_PERCEPTION = 1.35;

/** Which guards' uniforms you can take, and what that makes you. */
export const UNIFORM_OF_LOOK: Partial<Record<string, Outfit>> = { port: 'security' };
