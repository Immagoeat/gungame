import type { DifficultyId, MapId } from '@gungame/shared';
import type { Cutscene } from '../cutscenes/Cutscene';
import type { Bot } from '../entities/Bot';
import type { LoadingInfo } from '../ui/LoadingScreen';

export type ModeId = 'gungame' | 'campaign' | 'multiplayer';

/** Everything needed to (re)start a match. */
export interface MatchOptions {
  mode: ModeId;
  difficulty: DifficultyId;
  /** Campaign only. */
  missionId?: string;
  /** Campaign only: restart from a saved point in the mission (skips the intro). */
  checkpoint?: unknown;
}

export interface MatchResult {
  won: boolean;
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  /** Label for the retry button (default "Play Again"). */
  againLabel?: string;
  /** Extra trusted markup under the stats (challenge checklists...). */
  extraHtml?: string;
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
  /** What the loading screen shows while the match loads. */
  loadingInfo?(): LoadingInfo;
  /** Set up loadout, spawn enemies, fill the HUD. Called after the map is loaded and the player placed. */
  start(): void;
  /** A scene to play before the player takes control (called right after start). */
  intro?(): Cutscene | null;
  /** The intro finished or was skipped; the player now has control. */
  onIntroDone?(): void;
  update(dt: number): void;
  /** Called every frame while a cutscene plays, to animate the mode's characters (not their AI). */
  scenery?(dt: number): void;
  /** E pressed: the mode handles it (doors, takedowns...) and returns true, or leaves it to the game. */
  interact?(): boolean;
  /** What E would do right now (HTML prompt), or null. */
  prompt?(): string | null;
  /** A key pressed while playing: the mode handles it and returns true, or leaves it to the game. */
  key?(code: string): boolean;
  onBotKilled(bot: Bot, headshot: boolean): void;
  onPlayerDied(): void;
  /** One-line status for the pause screen. */
  pauseInfo(): string;
  /** Trusted markup for the pause screen: objectives, intel... */
  pauseDetails?(): string;
  /** Release anything the mode created outside the shared systems. */
  dispose(): void;
}
