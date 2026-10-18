export interface Difficulty {
  label: string;
  blurb: string;
  /** Multiplier on bot hit chance. */
  aim: number;
  /** Multiplier on bot damage. */
  damage: number;
  /** Bots added to (or removed from) the normal count. */
  extraBots: number;
  /** Campaign security. */
  stealth: {
    /** How fast guards and cameras notice you. */
    perception: number;
    /** Guard hit chance. */
    accuracy: number;
    /** Guard damage. */
    damage: number;
    /** Time before a guard's first shot. */
    reaction: number;
    /** Guards sent to hunt you when the house locks down (the rest hold their posts, on alert). */
    hunters: number;
    /** Reinforcements per wave during a lockdown, and seconds between waves. */
    waveSize: number;
    waveInterval: number;
    /** Coins to throw as distractions. */
    coins: number;
  };
}

export const DIFFICULTIES = {
  easy: {
    label: 'Easy', blurb: 'Recruit — forgiving aim, fewer bots', aim: 0.6, damage: 0.6, extraBots: -1,
    stealth: { perception: 0.72, accuracy: 0.65, damage: 0.6, reaction: 1.4, hunters: 4, waveSize: 2, waveInterval: 60, coins: 6 },
  },
  normal: {
    label: 'Normal', blurb: 'Soldier — the intended experience', aim: 1, damage: 1, extraBots: 0,
    stealth: { perception: 1, accuracy: 1, damage: 1, reaction: 1, hunters: 6, waveSize: 3, waveInterval: 50, coins: 4 },
  },
  hard: {
    label: 'Hard', blurb: 'Veteran — sharp aim, more bots', aim: 1.3, damage: 1.4, extraBots: 2,
    stealth: { perception: 1.25, accuracy: 1.25, damage: 1.3, reaction: 0.8, hunters: 9, waveSize: 4, waveInterval: 40, coins: 3 },
  },
} satisfies Record<string, Difficulty>;

export type DifficultyId = keyof typeof DIFFICULTIES;

export const isDifficultyId = (v: unknown): v is DifficultyId => typeof v === 'string' && v in DIFFICULTIES;
