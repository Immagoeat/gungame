/**
 * Chapter 1's leads: what each clue says when you examine it (Overwatch's comments are voice lines).
 * Any three of them are enough to know where Reyes is held and who holds the key.
 */

export type LeadId = 'feeds' | 'cellar' | 'office' | 'kitchen' | 'phone' | 'smokers';

export interface Lead {
  /** Shown in the objective's checklist. */
  name: string;
  /** How long to hold E to examine it (s); listening has its own pace. */
  hold: number;
  /** What the prompt says. */
  verb: string;
  card?: { kind: 'paper' | 'screen' | 'phone'; from: string; title: string; body: string };
}

/** Overwatch's read on a lead (in voicelines.json). */
export const leadLine = (id: LeadId) => `lead-${id}` as const;

export const LEADS_NEEDED = 3;

export const LEADS: Record<LeadId, Lead> = {
  feeds: {
    name: 'Camera log (security room, basement)',
    hold: 1.6,
    verb: 'Check the camera log',
    card: {
      kind: 'screen', from: 'Security terminal', title: 'Camera event log',
      body: `<p class="mono">20:31 WINE CELLAR — feed restored<br>20:38 SVC STAIRS F3 — motion (2)<br>
        20:44 <mark>PENTHOUSE STUDY — feed disabled — user: M.KESSLER</mark><br>21:02 FRONT GATE — vehicle, catering</p>`,
    },
  },
  cellar: {
    name: 'Wine cellar (basement)',
    hold: 1.4,
    verb: 'Look at the table',
    card: {
      kind: 'paper', from: 'Wine cellar', title: 'Cut cable ties',
      body: `<p>Three plastic ties, cut through, beside a chair pulled out on its own. A plate nobody touched. A strip of tape with stubble stuck to it.</p>
        <p>Somebody was tied up down here, and <mark>not long ago</mark>.</p>`,
    },
  },
  office: {
    name: "Castell's office (ground floor)",
    hold: 1.8,
    verb: "Read Castell's laptop",
    card: {
      kind: 'screen', from: "Castell's laptop · mail", title: 'Re: our guest',
      body: `<p class="mono">From: V. Castell<br>To: M. Kessler<br>20:52</p>
        <p>Keep the accountant <mark>in the study</mark> until the boat at two. Nobody goes up without you.
        <mark>Your card, your responsibility.</mark></p><p>— V.</p>`,
    },
  },
  kitchen: {
    name: 'Kitchen (ground floor)',
    hold: 1.2,
    verb: 'Read the order slip',
    card: {
      kind: 'paper', from: 'Kitchen · room service tray', title: 'Order #58',
      body: `<p class="mono">1 × club sandwich<br>1 × still water<br><b>PLASTIC CUTLERY ONLY</b></p>
        <p class="mono">DELIVER: <mark>PENTHOUSE STUDY (3F)</mark><br>Hand to security. Do not knock.<br><mark>Mr Kessler opens.</mark></p>`,
    },
  },
  phone: {
    name: "Castell's phone (master suite, second floor)",
    hold: 1.6,
    verb: "Read Castell's phone",
    card: {
      kind: 'phone', from: "Castell's phone · Kessler", title: 'Kessler',
      body: `<div class="bubble">Guest is moved <mark>upstairs</mark>. Both doors locked.</div>
        <div class="bubble me">Who has a key?</div>
        <div class="bubble">Only me. <mark>The card stays on me</mark> all night.</div>
        <div class="bubble me">Good. Boat at 2.</div>`,
    },
  },
  smokers: {
    name: 'Guards on a break (behind the garage)',
    hold: 0,
    verb: 'Listen in',
  },
};

/** The order the checklist shows them in. */
export const LEAD_ORDER: LeadId[] = ['feeds', 'cellar', 'office', 'kitchen', 'phone', 'smokers'];

/** What the two guards behind the garage say, in order (voicelines.json; Mills is smoke-1, Dario smoke-2). */
export const SMOKERS_TALK = ['smokers-0', 'smokers-1', 'smokers-2', 'smokers-3', 'smokers-4', 'smokers-5'] as const;

/** How close you have to be to hear them (m). */
export const LISTEN_RANGE = 10;
