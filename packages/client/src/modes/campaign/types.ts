import type { MapId, Vec3, WeaponId } from '@gungame/shared';

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
