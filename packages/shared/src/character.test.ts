import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, LOOK_OPTIONS, LOOK_SLOTS, lookKey, normalizeLook } from './character';

describe('character look', () => {
  it('every default is a real option', () => {
    for (const slot of LOOK_SLOTS) expect(LOOK_OPTIONS[slot].some(o => o.id === DEFAULT_LOOK[slot])).toBe(true);
  });

  it('fills gaps and rejects unknown options', () => {
    const l = normalizeLook({ camo: 'woodland', headgear: 'tophat', skin: 7 });
    expect(l.camo).toBe('woodland');
    expect(l.headgear).toBe(DEFAULT_LOOK.headgear);
    expect(l.skin).toBe(DEFAULT_LOOK.skin);
    expect(l.boots).toBe(DEFAULT_LOOK.boots);
    expect(normalizeLook(null)).toEqual(DEFAULT_LOOK);
  });

  it('keys differ per look', () => {
    expect(lookKey(DEFAULT_LOOK)).not.toBe(lookKey({ ...DEFAULT_LOOK, vest: 'none' }));
  });
});
