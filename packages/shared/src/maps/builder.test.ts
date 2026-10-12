import { describe, expect, it } from 'vitest';
import { rect, subtractRects } from './builder';

const area = (rs: { x0: number; z0: number; x1: number; z1: number }[]) =>
  rs.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0);

describe('subtractRects', () => {
  it('returns the outer rect when there are no holes', () => {
    expect(subtractRects(rect(0, 0, 10, 10), [])).toEqual([rect(0, 0, 10, 10)]);
  });

  it('cuts a hole and preserves the remaining area', () => {
    const pieces = subtractRects(rect(0, 0, 10, 10), [rect(2, 3, 5, 7)]);
    expect(area(pieces)).toBeCloseTo(100 - 12);
    for (const p of pieces) expect(p.x1 <= 2 || p.x0 >= 5 || p.z1 <= 3 || p.z0 >= 7).toBe(true);
  });

  it('clips holes that stick out of the outer rect', () => {
    expect(area(subtractRects(rect(0, 0, 4, 4), [rect(-1, -1, 2, 2)]))).toBeCloseTo(12);
  });
});
