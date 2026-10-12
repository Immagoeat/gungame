import type { Quality } from './Graphics';
import { storage } from './storage';

export interface Settings {
  /** Multiplier on base mouse sensitivity. */
  sens: number;
  fov: number;
  volume: number;
  invert: boolean;
  /** Graphics preset: low = no post-processing, high = ambient occlusion, bloom, sharp shadows. */
  quality: Quality;
}

const DEFAULTS: Settings = { sens: 1, fov: 75, volume: 0.8, invert: false, quality: 'high' };

export const loadSettings = (): Settings => ({ ...DEFAULTS, ...storage.get<Partial<Settings>>('settings', {}) });
export const saveSettings = (s: Settings): void => storage.set('settings', s);
