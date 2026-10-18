import type { CivilianStyle } from '../../entities/character/soldierOutfit';

/**
 * Undercover missions (the Aurelia, the port): what you're wearing decides where you can go without
 * anyone caring. Each mission tags its zones (by name) with who's allowed in; each outfit lists the
 * kinds of place it's welcome in.
 */
export interface OutfitDef<A extends string = string> {
  name: string;
  style: CivilianStyle;
  access: A[];
}
