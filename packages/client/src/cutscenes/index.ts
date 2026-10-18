import type { Game } from '../core/Game';
import type { Cutscene } from './Cutscene';
import { aureliaArrival } from './aureliaArrival';
import { mansionArrival } from './mansionArrival';
import { portArrival } from './portArrival';

/** Cutscenes by id, for missions to name (MissionDef.intro). */
export const CUTSCENES: Record<string, (game: Game) => Cutscene> = {
  mansionArrival,
  aureliaArrival,
  portArrival,
};
