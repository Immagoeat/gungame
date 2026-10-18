import * as THREE from 'three';
import type { VoiceLineId } from '../audio/Voice';
import type { Game } from '../core/Game';
import type { Cutscene, CutsceneFrame } from './Cutscene';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const span = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const ease = (k: number) => k * k * (3 - 2 * k);
const D3 = 3.5;

const DURATION = 19;
/** Radio over the opening shots (each starts here, or after the one before it). */
const DIALOGUE: [number, VoiceLineId][] = [[3.2, 'c2-arrival-0'], [9.2, 'c2-arrival-1'], [10.6, 'c2-arrival-2']];

/**
 * Chapter 2's opening: the Aurelia lit up at sea at night, the party on the pool deck, then down the
 * stateroom corridor to 3110, where you come to.
 */
export function aureliaArrival(game: Game): Cutscene {
  let line = -1;
  return {
    duration: DURATION,
    // In the stateroom, facing the door.
    end: { pos: V(-18, D3, 7.0), yaw: 0, pitch: -0.05 },
    update(_dt: number, t: number): CutsceneFrame {
      let camera: CutsceneFrame['camera'];
      if (t < 8) {
        // Off the starboard bow, low over the water, drifting aft along her length.
        const k = ease(span(t, 0, 8));
        camera = { position: V(70 - k * 75, 1.5 + k * 3, 44 - k * 6), target: V(10 - k * 30, 8, 0), fov: 40 };
      } else if (t < 13.5) {
        // High over the pool deck: the party, the funnel, the wake running out behind.
        const k = ease(span(t, 8, 13.5));
        camera = { position: V(-86 + k * 16, 30 - k * 6, -18 + k * 30), target: V(-40, 10.5, 0), fov: 46 };
      } else {
        // Down the deck 3 corridor towards your door.
        const k = ease(span(t, 13.5, DURATION));
        camera = { position: V(-4 - k * 12, D3 + 1.65, -0.3 + k * 0.2), target: V(-30, D3 + 1.5, 0.6 + k * 0.6), fov: 60 };
      }
      // Radio: each line in turn.
      let free = 0;
      const plan = DIALOGUE.map(([at, id]) => {
        const start = Math.max(at, free);
        free = start + game.voice.info(id).duration + 0.3;
        return [start, free] as const;
      });
      const now = plan.findIndex(([a, b]) => t >= a && t < b);
      if (now !== line) {
        if (now >= 0 && t - plan[now][0] < 0.25) game.voice.say(DIALOGUE[now][1]);
        line = now;
      }
      const said = now >= 0 ? game.voice.info(DIALOGUE[now][1]) : null;
      return {
        camera,
        actor: null,
        bars: 1 - span(t, DURATION - 0.8, DURATION),
        fade: Math.max(1 - span(t, 0.2, 2.2), 1 - Math.min(1, Math.abs(t - 13.5) / 0.35), span(t, DURATION - 0.6, DURATION) * 0.6),
        title: { heading: 'THE AURELIA', sub: 'Pacific Ocean, off Los Angeles  ·  22:30', opacity: span(t, 1.6, 2.8) * (1 - span(t, 6, 7)) },
        subtitle: said ? { speaker: said.speaker, text: said.text } : null,
      };
    },
    finish() {
      game.voice.stopRadio();
    },
    dispose() {},
  };
}
