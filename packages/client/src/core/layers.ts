/**
 * Render layers.
 * 0: everything normal.
 * 1: seen only by security cameras (the player's head and arms, so they don't block the first-person view).
 * 2: seen only by the player (monitor screens, so cameras never film themselves).
 * 3: invisible shadow casters (the player's head and arms), excluded from ambient occlusion.
 * 4: glowing see-through effects (flames, sparks): seen by every camera but left out of ambient occlusion,
 *    which would otherwise treat them as solid and shade around them.
 */
export const LAYER_CCTV_ONLY = 1;
export const LAYER_SCREENS = 2;
export const LAYER_SHADOW_PROXY = 3;
export const LAYER_EFFECTS = 4;
