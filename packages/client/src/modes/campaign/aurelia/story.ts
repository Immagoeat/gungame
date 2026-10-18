import type { StoryLook } from '../../../npc/StoryNPC';
import type { Conversation } from '../conversation';

/**
 * Chapter 2's people, what they say, and what there is to find out about the Meridian.
 */

export const CAST: Record<string, StoryLook> = {
  felix: {
    name: 'Felix', height: 1.74,
    look: { skin: 'brown', hair: 'black', face: 'moustache' },
    outfit: { top: 'blazer', topColor: 0x5a1220, bottomColor: 0x15151a, accent: 0xf2efe8, shoes: 0x0d0d0e, hairStyle: 'short' },
  },
  castell: {
    name: 'Victor Castell', height: 1.76,
    look: { skin: 'fair', hair: 'grey', face: 'short' },
    outfit: { top: 'shirt', topColor: 0xe9e4da, bottomColor: 0x3a3428, shoes: 0x3a2618, hairStyle: 'short' },
  },
  vale: {
    name: 'Augustin Vale', height: 1.86,
    look: { skin: 'light', hair: 'grey', face: 'clean' },
    outfit: { top: 'blazer', topColor: 0x0f1218, bottomColor: 0x0f1218, accent: 0x7a1424, shoes: 0x0a0a0b, hairStyle: 'short' },
  },
};

/** Felix, at the casino bar: who's who, where the meeting is, and a gun in the spa. */
export const FELIX: Conversation = {
  start: 'f0',
  nodes: {
    f0: { line: 'felix-0', choices: [{ line: 'nav-f0a', next: 'f0a' }, { line: 'nav-f0b', next: 'f0b' }] },
    f0a: { line: 'felix-0a', next: 'f1' },
    f0b: { line: 'felix-0b', next: 'f1' },
    f1: { line: 'felix-1', choices: [{ line: 'nav-f1a', next: 'f1a' }, { line: 'nav-f1b', next: 'f1b' }] },
    f1a: { line: 'felix-1a', next: 'f2' },
    f1b: { line: 'felix-1b', next: 'f2' },
    f2: { line: 'felix-2', choices: [{ line: 'nav-f2a', next: 'f2a' }, { line: 'nav-f2b', next: 'f2b' }] },
    f2a: { line: 'felix-2a', next: 'f3' },
    f2b: { line: 'felix-2b', next: 'f3' },
    f3: { line: 'felix-3', does: 'felixDone' },
  },
};

/** Castell, in his suite: how you come in, what you tell him, what you take away. */
export function castellTalk(ctx: { uniformed: () => boolean; armed: () => boolean; askedBooks: () => boolean }): Conversation {
  return {
    start: 'c0',
    nodes: {
      c0: { line: 'castell-0', choices: [{ line: 'nav-c0a', next: 'c0a', when: ctx.uniformed }, { line: 'nav-c0b', next: 'c0b' }] },
      c0a: { line: 'castell-0a', next: 'c1' },
      c0b: { line: 'castell-0b', next: 'c1' },
      c1: { line: 'castell-1', choices: [{ line: 'nav-c1a', next: 'c1a' }, { line: 'nav-threat', next: 'cthreat', when: ctx.armed }] },
      c1a: { line: 'castell-1a', choices: [{ line: 'nav-c2', next: 'c2' }] },
      c2: { line: 'castell-2', next: 'c3' },
      c3: { line: 'castell-3', choices: [{ line: 'nav-c3a', next: 'c3a' }, { line: 'nav-c3b', next: 'c3b', does: 'books', when: () => !ctx.askedBooks() }] },
      c3b: { line: 'castell-3b', next: 'c3' },
      c3a: { line: 'castell-3a', does: 'keycard' },
      cthreat: { line: 'castell-threat', does: 'keycardThreat' },
    },
  };
}

export type IntelId = 'm-manifest' | 'm-hold' | 'm-schedule' | 'm-telex' | 'm-overheard';

export interface Intel {
  name: string;
  verb: string;
  hold: number;
  card?: { kind: 'paper' | 'screen' | 'phone'; from: string; title: string; body: string };
  radio: 'lead2-manifest' | 'lead2-hold' | 'lead2-schedule' | 'lead2-telex' | 'lead2-overheard';
}

export const INTEL_NEEDED = 3;
export const INTEL_ORDER: IntelId[] = ['m-manifest', 'm-hold', 'm-schedule', 'm-telex', 'm-overheard'];

export const INTEL: Record<IntelId, Intel> = {
  'm-manifest': {
    name: "Passenger manifest (purser's office, deck 3)", verb: 'Read the manifest', hold: 1.4, radio: 'lead2-manifest',
    card: {
      kind: 'paper', from: "Purser's office", title: 'Manifest · Deck 6',
      body: `<p class="mono">OWNER'S SUITE ...... A. VALE ✱<br>6002 ............. R. OSTROWSKI ✱<br>6003 ............. M. DELACROIX-HAAS ✱<br>
        6004 ............. T. KANEMURA ✱<br>6005 ............. L. FIORE ✱<br>6006 ............. V. CASTELL (guest of A.V.)</p>
        <p>✱ <mark>Board — no bill, no questions.</mark></p>`,
    },
  },
  'm-hold': {
    name: 'Cargo crates (hold, deck 2)', verb: 'Read the bill of lading', hold: 1.4, radio: 'lead2-hold',
    card: {
      kind: 'paper', from: 'Cargo hold · crate 9 of 14', title: 'Bill of lading',
      body: `<p class="mono">SHIPPER: V. CASTELL HOLDINGS<br>CONSIGNEE: <mark>MERIDIAN TRADING S.A.</mark>, PANAMA<br>CONTENTS: MACHINE PARTS</p>
        <p>The lid's loose. It isn't machine parts: it's <mark>cash</mark>, bricked and shrink-wrapped.</p>`,
    },
  },
  'm-schedule': {
    name: "Vale's protection schedule (security office, deck 6)", verb: 'Read the security log', hold: 1.6, radio: 'lead2-schedule',
    card: {
      kind: 'screen', from: 'Security office · close protection', title: 'Principal: Mr. Vale',
      body: `<p class="mono">22:00 Lounge, receiving guests<br>00:00 <mark>BOARD — Meridian Lounge, doors closed</mark><br>
        01:00 Suite. <mark>Balcony alone.</mark> Bruno on the door.<br>06:00 Tender to shore</p>`,
    },
  },
  'm-telex': {
    name: 'Satellite messages (radio room, deck 7)', verb: 'Read the message', hold: 1.4, radio: 'lead2-telex',
    card: {
      kind: 'paper', from: 'Radio room · SATCOM', title: 'PRIORITY — FOR A.V. ONLY',
      body: `<p class="mono">BOARD 0000 CONFIRMED.<br><mark>ITEM ONE: CASTELL.</mark><br>FAMILIES CONCUR.<br>DISPOSAL AT SEA ACCEPTABLE.</p>`,
    },
  },
  'm-overheard': { name: 'Two of the Meridian at the pool bar (deck 5)', verb: 'Listen in', hold: 0, radio: 'lead2-overheard' },
};

/** What the two at the pool bar say ([speaker index, line]). */
export const POOL_TALK = ['mer-talk-0', 'mer-talk-1', 'mer-talk-2', 'mer-talk-3'] as const;
