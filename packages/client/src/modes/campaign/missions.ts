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
  {
    id: 'aurelia',
    chapter: 2,
    title: 'The Aurelia',
    briefing: "Kessler wasn't just Castell's head of security: he answered to the Meridian, the syndicate behind Castell's money, and his phone holds an invitation to their annual cruise. Go aboard as Marco Navarro, find out who they are, and get to their boss, Augustin Vale. Castell is aboard, hiding under Vale's protection.",
    location: 'Pacific Ocean, off Los Angeles  ·  22:30',
    loadingImage: 'images/loading/aurelia.jpg',
    mapId: 'aurelia',
    // Security screened you at the gangway: you're aboard with nothing.
    loadout: [],
    intro: 'aureliaArrival',
    objectives: [],
    story: [],
  },
  {
    id: 'port',
    chapter: 3,
    title: 'The Port',
    briefing: "Vale is dead, and the Meridian are moving their reserve before anyone can come for it: bullion and bearer bonds, packed into one of four containers on the quay at Marseille-Fos, loading tonight on the Sirocco. Get into the terminal with the night shift, find out which box it is, and put a charge on it. Overwatch will set it off when she's out at sea.",
    location: 'Marseille-Fos, France  ·  02:10',
    loadingImage: 'images/loading/port.jpg',
    mapId: 'port',
    // You come in with nothing: the charge is waiting inside.
    loadout: [],
    intro: 'portArrival',
    objectives: [],
    story: [],
  },
];

export const getMission = (id: string): MissionDef | undefined => MISSIONS.find(m => m.id === id);
