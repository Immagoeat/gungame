import { CREW_UNIFORM } from '../../../npc/Guard';
import type { OutfitDef } from '../undercover';

/**
 * Undercover on the Aurelia: what you're wearing decides where you can go without anyone caring.
 * Zones are tagged with who's allowed in (by name, from the map's zones); an outfit lists which of
 * those it's welcome in.
 */

export type Outfit = 'suit' | 'steward' | 'security';
export type Access = 'public' | 'crew' | 'security' | 'vip' | 'private' | 'command';

export const OUTFITS: Record<Outfit, OutfitDef<Access>> = {
  suit: {
    name: 'Guest (Navarro)', access: ['public'],
    style: { top: 'blazer', topColor: 0x23262c, bottomColor: 0x23262c, accent: 0xf4f2ee, shoes: 0x0d0d0e, hairStyle: 'short' },
  },
  steward: {
    name: 'Steward', access: ['public', 'crew', 'vip'],
    style: { top: 'blazer', topColor: 0xf3f2ee, bottomColor: 0x1b2233, accent: 0x1d3557, shoes: 0x0d0d0e, hairStyle: 'short' },
  },
  security: { name: 'Ship security', access: ['public', 'crew', 'security', 'vip'], style: CREW_UNIFORM },
};

export const ACCESS_NAMES: Record<Access, string> = {
  public: 'Public', crew: 'Crew only', security: 'Security only', vip: 'Meridian guests', private: 'Private', command: 'Officers only',
};

const ZONE_ACCESS: Record<string, Access> = {
  'Engine Room': 'crew', Laundry: 'crew', Galley: 'crew', Provisions: 'crew', 'Cargo Hold': 'crew', 'Crew Mess': 'crew',
  'Crew Quarters': 'crew', 'Crew Corridor': 'crew', Housekeeping: 'crew', 'Forward Stores': 'crew', Foredeck: 'crew',
  'Aft Deck': 'crew', "Purser's Office": 'crew',
  Brig: 'security', 'Security Office': 'security',
  'Meridian Stair': 'vip', 'Meridian Lounge': 'vip', 'Meridian Terrace': 'vip', 'Deck 6 Walkway': 'vip', 'Suite Corridor': 'vip',
  "Castell's Suite": 'private', "Vale's Suite": 'private',
  Bridge: 'command', 'Radio Room': 'command',
};

export const accessOf = (zone: string | undefined): Access => (zone && ZONE_ACCESS[zone]) || 'public';
