/**
 * Chapter 1's optional challenges: shown on the pause screen and scored at the end. Completing one
 * keeps it ticked for good (stored), so they're something to come back for.
 */

/** What a run looked like, for judging challenges. */
export interface RunRecord {
  /** Alerts raised before the escape (the lockdown itself doesn't count). */
  alarms: number;
  kills: number;
  bodiesFound: number;
  leads: number;
  ledger: boolean;
  /** Seconds. */
  time: number;
}

export interface Challenge {
  id: string;
  name: string;
  /** Can it still be done this run? (Shown struck through on the pause screen when not.) */
  alive(r: RunRecord): boolean;
  /** Done, judged at the end. */
  done(r: RunRecord): boolean;
}

/** Par time for the speed challenge (s). */
export const PAR_TIME = 20 * 60;

export const CHALLENGES: Challenge[] = [
  { id: 'ghost', name: 'Ghost: no alerts before the escape', alive: r => r.alarms === 0, done: r => r.alarms === 0 },
  { id: 'mercy', name: 'Mercy: no kills (knockouts are fine)', alive: r => r.kills === 0, done: r => r.kills === 0 },
  { id: 'clean', name: 'Clean: no bodies found', alive: r => r.bodiesFound === 0, done: r => r.bodiesFound === 0 },
  { id: 'detective', name: 'Detective: follow up every lead', alive: () => true, done: r => r.leads >= 6 },
  { id: 'ledger', name: "Evidence: take Castell's ledger from the vault", alive: () => true, done: r => r.ledger },
  { id: 'swift', name: 'Swift: finish in under 20:00', alive: r => r.time < PAR_TIME, done: r => r.time < PAR_TIME },
];

export const CHALLENGES_KEY = 'campaign.mansion.challenges';
