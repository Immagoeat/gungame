import * as THREE from 'three';
import type { VoiceLineId } from '../../audio/Voice';
import type { Game } from '../../core/Game';
import type { StoryNPC } from '../../npc/StoryNPC';
import type { MissionHud } from '../../ui/MissionHud';

/** Something you can say: shown only `when` it applies; `next` is where it leads, `does` fires a story action. */
export interface Choice {
  line: VoiceLineId;
  next?: string;
  does?: string;
  when?: () => boolean;
}

/** One thing they say, then either your choices, straight on to `next`, or the end. */
export interface ConvNode {
  line: VoiceLineId;
  next?: string;
  choices?: Choice[];
  does?: string;
}

export interface Conversation {
  start: string;
  nodes: Record<string, ConvNode>;
}

/** How far you can walk off before they stop talking to you (m). */
const EARSHOT = 4.5;

/**
 * Talking to someone: their lines voiced from where they stand, then your choices (1-4), your reply
 * in your own voice, and on through the script. Walk away and it's over.
 */
export class ConversationPlayer {
  private conv: Conversation | null = null;
  private npc: StoryNPC | null = null;
  private node: ConvNode | null = null;
  private shown: Choice[] = [];
  private phase: 'them' | 'choose' | 'you' = 'them';
  private wait = 0;
  private chosen: Choice | null = null;
  /** A story action the script triggered ("gun", "keycard"...). */
  onAction: (id: string) => void = () => {};

  constructor(private readonly game: Game, private readonly hud: MissionHud) {}

  get active(): boolean {
    return !!this.conv;
  }

  get with(): StoryNPC | null {
    return this.npc;
  }

  start(conv: Conversation, npc: StoryNPC): void {
    this.conv = conv;
    this.npc = npc;
    this.enter(conv.start);
  }

  private enter(id: string | undefined): void {
    const node = id && this.conv ? this.conv.nodes[id] : undefined;
    if (!node) return this.end();
    this.node = node;
    this.phase = 'them';
    this.wait = this.speak(node.line, this.npc!.head);
  }

  private speak(line: VoiceLineId, at: THREE.Vector3): number {
    const s = this.game.voice.say(line, at);
    this.hud.radio(s.speaker, s.text, s.duration + 0.5);
    return s.duration + 0.3;
  }

  update(dt: number): void {
    if (!this.conv || !this.npc || !this.node) return;
    const g = this.game;
    const me = new THREE.Vector3(g.player.pos.x, g.player.pos.y + g.player.eyeHeight, g.player.pos.z);
    this.npc.lookAt = me;
    if (me.distanceTo(this.npc.head) > EARSHOT || !this.npc.alive) return this.end();
    if (this.phase === 'choose') return;
    this.wait -= dt;
    if (this.wait > 0) return;
    if (this.phase === 'them') {
      if (this.node.does) this.onAction(this.node.does);
      const choices = (this.node.choices ?? []).filter(c => !c.when || c.when());
      if (choices.length) {
        this.shown = choices;
        this.phase = 'choose';
        this.hud.dialogue(choices.map(c => g.voice.info(c.line).text));
      } else this.enter(this.node.next);
    } else {
      const c = this.chosen!;
      this.chosen = null;
      if (c.does) this.onAction(c.does);
      this.enter(c.next);
    }
  }

  /** Number keys pick a reply. */
  key(code: string): boolean {
    if (!this.conv || this.phase !== 'choose') return false;
    const m = /^Digit([1-9])$/.exec(code);
    const c = m ? this.shown[Number(m[1]) - 1] : undefined;
    if (!c) return !!m;
    this.chosen = c;
    this.phase = 'you';
    this.hud.dialogue(null);
    const g = this.game;
    this.wait = this.speak(c.line, new THREE.Vector3(g.player.pos.x, g.player.pos.y + 1.6, g.player.pos.z));
    return true;
  }

  end(): void {
    if (this.npc) this.npc.lookAt = null;
    this.conv = null;
    this.npc = null;
    this.node = null;
    this.hud.dialogue(null);
  }
}
