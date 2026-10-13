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
    briefing: "Daniel Reyes was set to testify against Victor Castell. Castell's men took him three days ago, and tonight Castell is throwing a party. Get inside, find Reyes and get him out, and don't let two hundred guests find out you were ever there.",
    location: 'Beverly Hills, California  ·  21:04',
    loadingImage: 'images/loading/mansion.jpg',
    mapId: 'mansion',
    // Everything while the layout is being reviewed, to test cover and glass with each gun.
    // You go in with a rifle and a pistol; everything else is found inside.
    loadout: ['rifle', 'pistol'],
    intro: 'mansionArrival',
    objectives: [],
    story: [],
  },
];

export const getMission = (id: string): MissionDef | undefined => MISSIONS.find(m => m.id === id);
