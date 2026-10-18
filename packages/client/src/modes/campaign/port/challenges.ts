/** Chapter 3's optional challenges, scored at the end and kept for good once earned. */
export interface PortRun {
  alarms: number;
  kills: number;
  takedowns: number;
  bodiesFound: number;
  intel: number;
  /** Got in without ever being warned off somewhere you didn't belong. */
  neverWarned: boolean;
}

export const PORT_CHALLENGES: { id: string; name: string; done: (r: PortRun) => boolean }[] = [
  { id: 'silent', name: 'Night Shift: no alerts', done: r => r.alarms === 0 },
  { id: 'nokills', name: 'Clean Hands: no kills', done: r => r.kills === 0 },
  { id: 'untouched', name: 'Union Rules: nobody taken down', done: r => r.takedowns === 0 },
  { id: 'clean', name: 'Clean Sheet: no bodies found', done: r => r.bodiesFound === 0 },
  { id: 'paperwork', name: 'Paperwork: follow up all four leads', done: r => r.intel >= 4 },
  { id: 'belong', name: 'Belonging: never warned off', done: r => r.neverWarned },
];

export const PORT_CHALLENGES_KEY = 'campaign.port.challenges';
