import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from './difficulty';

describe('difficulty', () => {
  it('campaign security gets steadily tougher from easy to hard', () => {
    const [e, n, h] = [DIFFICULTIES.easy.stealth, DIFFICULTIES.normal.stealth, DIFFICULTIES.hard.stealth];
    for (const k of ['perception', 'accuracy', 'damage', 'hunters', 'waveSize'] as const) {
      expect(e[k], k).toBeLessThan(n[k]);
      expect(n[k], k).toBeLessThan(h[k]);
    }
    // Slower to shoot, slower reinforcements and more coins on easy.
    expect(e.reaction).toBeGreaterThan(h.reaction);
    expect(e.waveInterval).toBeGreaterThan(h.waveInterval);
    expect(e.coins).toBeGreaterThan(h.coins);
  });
});
