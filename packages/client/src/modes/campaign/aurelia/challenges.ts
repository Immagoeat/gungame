import type { ValeDeath } from './vale';

/** Chapter 2's optional challenges, scored at the end and kept for good once earned. */
export interface AureliaRun {
  alarms: number;
  /** Kills other than Vale. */
  otherKills: number;
  bodiesFound: number;
  intel: number;
  threatened: boolean;
  method: ValeDeath | '';
}

export const AURELIA_CHALLENGES: { id: string; name: string; done: (r: AureliaRun) => boolean }[] = [
  { id: 'silent', name: 'Silent: no alerts', done: r => r.alarms === 0 },
  { id: 'accident', name: 'Accident: Vale is poisoned, or goes over the side', done: r => r.method === 'poison' || r.method === 'overboard' },
  { id: 'only-vale', name: 'Only Vale: no other kills', done: r => r.otherKills === 0 },
  { id: 'clean', name: 'Clean: no bodies found', done: r => r.bodiesFound === 0 },
  { id: 'investigator', name: 'Investigator: learn everything about the Meridian', done: r => r.intel >= 5 },
  { id: 'diplomat', name: 'Diplomat: Castell hands over the keycard without a threat', done: r => !r.threatened && r.method !== '' },
];

export const AURELIA_CHALLENGES_KEY = 'campaign.aurelia.challenges';
