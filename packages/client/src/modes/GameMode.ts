import type { DifficultyId, MapId } from '@gungame/shared';
import type { Bot } from '../entities/Bot';

export type ModeId = 'gungame' | 'campaign' | 'multiplayer';

/** Everything needed to (re)start a match. */
export interface MatchOptions {
  mode: ModeId;
  difficulty: DifficultyId;
  /** Campaign only. */
  missionId?: string;
}

export interface MatchResult {
  won: boolean;
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
}

/**
 * A game mode owns the rules of a match: which map, what the player starts with, how enemies spawn,
 * what counts as winning or losing. The engine (Game) owns everything else.
 * A mode ends the match by calling game.endMatch(result).
 */
export interface GameMode {
  readonly id: ModeId;
  readonly mapId: MapId;
  /** Lets the player toggle noclip flight with V (for reviewing layouts). */
  readonly allowFly: boolean;
  /** Set up loadout, spawn enemies, fill the HUD. Called after the map is loaded and the player placed. */
  start(): void;
  update(dt: number): void;
  onBotKilled(bot: Bot, headshot: boolean): void;
  onPlayerDied(): void;
  /** One-line status for the pause screen. */
  pauseInfo(): string;
  /** Release anything the mode created outside the shared systems. */
  dispose(): void;
}
