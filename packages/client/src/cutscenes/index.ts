import type { Game } from '../core/Game';
import type { Cutscene } from './Cutscene';
import { mansionArrival } from './mansionArrival';

/** Cutscenes by id, for missions to name (MissionDef.intro). */
export const CUTSCENES: Record<string, (game: Game) => Cutscene> = {
  mansionArrival,
};
