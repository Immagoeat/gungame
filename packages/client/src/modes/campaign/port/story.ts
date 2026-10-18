import type { StoryLook } from '../../../npc/StoryNPC';
import type { Conversation } from '../conversation';

/** Chapter 3's people, what Nadia tells you, and the four ways to find the box that matters. */

export const CAST: Record<string, StoryLook> = {
  nadia: {
    name: 'Nadia Benali', height: 1.66,
    look: { skin: 'tan', hair: 'black', face: 'clean' },
    outfit: { top: 'shirt', topColor: 0x3a4a5e, bottomColor: 0x1d2330, accent: 0xf27a1a, shoes: 0x1a1612, hairStyle: 'bun', hiVis: true },
  },
};

/** Nadia, on her break in the canteen: what's coming in tonight, where to look, and where the charge ended up. */
export const NADIA: Conversation = {
  start: 'n0',
  nodes: {
    n0: { line: 'nadia-0', choices: [{ line: 'nav-n0a', next: 'n0a' }, { line: 'nav-n0b', next: 'n0b' }] },
    n0a: { line: 'nadia-0a', next: 'n1' },
    n0b: { line: 'nadia-0b', next: 'n1' },
    n1: { line: 'nadia-1', choices: [{ line: 'nav-n1a', next: 'n1a' }, { line: 'nav-n1b', next: 'n1b' }] },
    n1b: { line: 'nadia-1b', next: 'n1a' },
    n1a: { line: 'nadia-1a', next: 'n2' },
    n2: { line: 'nadia-2', does: 'nadia' },
  },
};

export type LeadId = 'p-booking' | 'p-loadplan' | 'p-xray' | 'p-overheard';

export interface Lead {
  name: string;
  verb: string;
  hold: number;
  card?: { kind: 'paper' | 'screen' | 'phone'; from: string; title: string; body: string };
  radio: 'lead3-booking' | 'lead3-loadplan' | 'lead3-xray' | 'lead3-overheard';
}

/** Any three of the four pin it down (one shot at this: three things that agree).*/
export const LEADS_NEEDED = 3;
export const LEAD_ORDER: LeadId[] = ['p-loadplan', 'p-xray', 'p-booking', 'p-overheard'];

export const LEADS: Record<LeadId, Lead> = {
  'p-loadplan': {
    name: "The planner's load plan (Terminal Ops, upstairs)", verb: 'Read the stowage plan', hold: 1.6, radio: 'lead3-loadplan',
    card: {
      kind: 'screen', from: 'Terminal Ops · stowage', title: 'SIROCCO voy. 0317 · bay 02, on deck',
      body: `<p class="mono">MRDU 600711 ... 02 06 82 ... GEN<br>MRDU 600712 ... 02 08 82 ... GEN<br>MRDU 600713 ... 02 10 82 ... GEN<br>
        <mark>MRDU 600714 ... 02 04 84 ... LOAD LAST · SPECIAL HANDLING<br>NO INSPECTION · ARMED ESCORT</mark></p>`,
    },
  },
  'p-xray': {
    name: "Customs' X-ray scans (the customs shed)", verb: 'Look at the scans', hold: 1.6, radio: 'lead3-xray',
    card: {
      kind: 'screen', from: 'Douane · non-intrusive inspection', title: 'MRDU 600711 – 600714',
      body: `<p class="mono">711 ... machine parts ... consistent<br>712 ... machine parts ... consistent<br>713 ... machine parts ... consistent<br>
        <mark>714 ... dense mass, 19.3 g/cm³ zone, approx. 1.2 t<br>CLEARED BY ORDER · DO NOT OPEN</mark></p>`,
    },
  },
  'p-booking': {
    name: 'Tonight\'s bookings (the gate office)', verb: 'Read the bookings', hold: 1.4, radio: 'lead3-booking',
    card: {
      kind: 'screen', from: 'Gate office · vehicle booking', title: 'Meridian Trading S.A. · 4 × 40′',
      body: `<p class="mono">SHIPPER: <mark>CASTELL LOGISTICA, GENOVA</mark><br>MRDU 600711 · 600712 · 600713 · 600714<br>VESSEL: SIROCCO · LOAD 03:00–04:30<br>DEST: TANGER MED</p>
        <p>One of the four has an extra line: <mark>714 · seal: green · GPS tracker fitted</mark>.</p>`,
    },
  },
  'p-overheard': { name: 'The two Meridian men by the reefers', verb: 'Listen in', hold: 0, radio: 'lead3-overheard' },
};

/** What the two by the reefers say. */
export const REEFER_TALK = ['mer3-talk-0', 'mer3-talk-1', 'mer3-talk-2', 'mer3-talk-3'] as const;
