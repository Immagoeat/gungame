import { describe, expect, it } from 'vitest';
import { CHALLENGES, PAR_TIME, type RunRecord } from './mansionChallenges';

const clean: RunRecord = { alarms: 0, kills: 0, bodiesFound: 0, leads: 6, ledger: true, time: PAR_TIME - 1 };
const done = (r: RunRecord) => CHALLENGES.filter(c => c.done(r)).map(c => c.id);

describe('chapter 1 challenges', () => {
  it('a perfect run earns them all', () => {
    expect(done(clean)).toEqual(CHALLENGES.map(c => c.id));
  });

  it('each one can be missed on its own', () => {
    expect(done({ ...clean, alarms: 1 })).not.toContain('ghost');
    expect(done({ ...clean, kills: 1 })).not.toContain('mercy');
    expect(done({ ...clean, bodiesFound: 1 })).not.toContain('clean');
    expect(done({ ...clean, leads: 5 })).not.toContain('detective');
    expect(done({ ...clean, ledger: false })).not.toContain('ledger');
    expect(done({ ...clean, time: PAR_TIME + 1 })).not.toContain('swift');
  });

  it('the pause screen strikes out ones already lost', () => {
    const lost = CHALLENGES.filter(c => !c.alive({ ...clean, alarms: 2, kills: 1 })).map(c => c.id);
    expect(lost).toEqual(['ghost', 'mercy']);
  });
});
