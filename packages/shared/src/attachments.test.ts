import { describe, expect, it } from 'vitest';
import { applyAttachments, attachmentsFor, normalizeLoadout, WEAPON_SLOTS } from './attachments';
import { WEAPONS } from './weapons';

describe('attachments', () => {
  it('stock weapons keep their stats', () => {
    const r = applyAttachments('rifle');
    expect(r.damage).toBeCloseTo(WEAPONS.rifle.damage);
    expect(r.magazine).toBe(WEAPONS.rifle.magazine);
    expect(r.zoomFov).toBeUndefined();
    expect(applyAttachments('sniper').zoomFov).toBe(14);
  });

  it('applies trade-offs', () => {
    const r = applyAttachments('rifle', { muzzle: 'suppressor', magazine: 'drum-mag', barrel: 'long-barrel', optic: 'acog' });
    expect(r.flash).toBe(false);
    expect(r.loudness).toBeLessThan(0.5);
    expect(r.magazine).toBe(75);
    expect(r.reloadTime).toBeGreaterThan(WEAPONS.rifle.reloadTime);
    expect(r.muzzleVelocity).toBeGreaterThan(WEAPONS.rifle.muzzleVelocity);
    expect(r.zoomFov).toBe(26);
  });

  it('rejects attachments that do not fit and fills defaults', () => {
    const l = normalizeLoadout('pistol', { stock: 'heavy-stock', optic: 'scope8x', muzzle: 'suppressor' });
    expect(l.stock).toBeUndefined();
    expect(l.optic).toBe('iron');
    expect(l.muzzle).toBe('suppressor');
  });

  it('every slot of every weapon has at least one option', () => {
    for (const [w, slots] of Object.entries(WEAPON_SLOTS)) {
      for (const s of slots) expect(attachmentsFor(w as keyof typeof WEAPONS, s).length).toBeGreaterThan(0);
    }
  });
});
