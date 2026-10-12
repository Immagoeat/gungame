export interface Difficulty {
  label: string;
  blurb: string;
  /** Multiplier on bot hit chance. */
  aim: number;
  /** Multiplier on bot damage. */
  damage: number;
  /** Bots added to (or removed from) the normal count. */
  extraBots: number;
}

export const DIFFICULTIES = {
  easy: { label: 'Easy', blurb: 'Recruit — forgiving aim, fewer bots', aim: 0.6, damage: 0.6, extraBots: -1 },
  normal: { label: 'Normal', blurb: 'Soldier — the intended experience', aim: 1, damage: 1, extraBots: 0 },
  hard: { label: 'Hard', blurb: 'Veteran — sharp aim, more bots', aim: 1.3, damage: 1.4, extraBots: 2 },
} satisfies Record<string, Difficulty>;

export type DifficultyId = keyof typeof DIFFICULTIES;

export const isDifficultyId = (v: unknown): v is DifficultyId => typeof v === 'string' && v in DIFFICULTIES;
