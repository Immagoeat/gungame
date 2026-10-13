import type { Game } from '../core/Game';
import { CampaignMode } from './campaign/CampaignMode';
import { getMission } from './campaign/missions';
import type { GameMode, MatchOptions } from './GameMode';
import { GunGameMode } from './GunGameMode';

/** Mode registry. Multiplayer plugs in here once implemented. */
export function createMode(game: Game, options: MatchOptions): GameMode {
  switch (options.mode) {
    case 'gungame':
      return new GunGameMode(game, options.difficulty);
    case 'campaign': {
      const mission = getMission(options.missionId ?? '');
      if (!mission) throw new Error(`Unknown mission "${options.missionId}"`);
      return new CampaignMode(game, mission, options);
    }
    case 'multiplayer':
      throw new Error('Multiplayer is not implemented yet');
  }
}

export type { GameMode, MatchOptions, MatchResult, ModeId } from './GameMode';
