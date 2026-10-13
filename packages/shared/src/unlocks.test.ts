import { describe, expect, it } from 'vitest';
import { normalizeUnlocks, STARTING_WEAPONS } from './unlocks';

describe('weapon unlocks', () => {
  it('always includes the starting weapons', () => {
    expect(normalizeUnlocks(null)).toEqual(expect.arrayContaining(STARTING_WEAPONS));
    expect(normalizeUnlocks(['smg'])).toEqual(expect.arrayContaining([...STARTING_WEAPONS, 'smg']));
  });
  it('drops unknown entries', () => {
    expect(normalizeUnlocks(['laserCannon', 'shotgun'])).not.toContain('laserCannon');
  });
});
