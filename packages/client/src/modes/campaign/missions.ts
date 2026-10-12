import type { MissionDef } from './types';

/**
 * Campaign missions in play order. Each mission is pure data; CampaignMode loads the map,
 * gives the loadout, and (once implemented) runs the objectives and story beats.
 */
export const MISSIONS: MissionDef[] = [
  {
    id: 'mansion',
    chapter: 1,
    title: 'The Mansion',
    briefing: 'Layout preview: explore the estate freely. No enemies yet. Press V to fly, 1-5 to switch weapons.',
    mapId: 'mansion',
    // Everything while the layout is being reviewed, to test cover and glass with each gun.
    loadout: ['pistol', 'smg', 'shotgun', 'rifle', 'sniper'],
    objectives: [],
    story: [],
  },
];

export const getMission = (id: string): MissionDef | undefined => MISSIONS.find(m => m.id === id);
