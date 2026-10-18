import type { MapId, Vec3, WeaponId } from '@gungame/shared';
import type { Cutscene } from '../../cutscenes/Cutscene';

/** What the player must do to complete a mission. Missions can chain several. */
export type ObjectiveDef =
  | { kind: 'eliminate'; count: number; label?: string }
  | { kind: 'reach'; position: Vec3; radius: number; label?: string }
  | { kind: 'survive'; seconds: number; label?: string };

/** A line of story text or radio chatter shown at a moment in the mission. */
export interface StoryBeat {
  trigger: 'start' | 'objectiveComplete' | 'end';
  speaker?: string;
  text: string;
}

export interface MissionDef {
  id: string;
  chapter: number;
  title: string;
  briefing: string;
  mapId: MapId;
  loadout: WeaponId[];
  /** Shown on the loading screen, e.g. "Beverly Hills, California · 21:04". */
  location?: string;
  /** Loading screen background (path under public/). */
  loadingImage?: string;
  /** Cutscene played before the player takes control (see client/src/cutscenes). */
  intro?: string;
  objectives: ObjectiveDef[];
  story: StoryBeat[];
}

/** A mission's gameplay (objectives, characters, rules), run by CampaignMode. */
export interface CampaignScript {
  /** Restarting from a checkpoint: no intro. */
  readonly skipIntro: boolean;
  /** The closing scene, if the mode can make one (set by CampaignMode before start). */
  outro: (() => Cutscene | null) | null;
  start(): void;
  introDone(): void;
  /** While a cutscene plays: animate characters (not their AI). */
  scenery(dt: number): void;
  update(dt: number): void;
  interact(): boolean;
  prompt(): string | null;
  key(code: string): boolean;
  pauseDetails(): string;
  fail(reason: string): void;
  dispose(): void;
}
