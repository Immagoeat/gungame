import * as THREE from 'three';
import { SEA_LEVEL } from '@gungame/shared';
import type { Game } from '../core/Game';
import type { AvatarState } from '../entities/avatar';
import type { Cutscene, CutsceneFrame } from './Cutscene';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const span = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const ease = (k: number) => k * k * (3 - 2 * k);
const DURATION = 14;
/** Where the boat waits under the stern, and how it runs off astern (the ship keeps going). */
const START = V(-73.5, SEA_LEVEL + 0.15, 4);

/** A black rigid inflatable: two tubes, a deck, a console, twin outboards. */
function buildRib(): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  const tube = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.7 });
  const deck = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.8, roughness: 0.3 });
  const geos: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    geos.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    group.add(mesh);
  };
  for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.32, 6.2, 6, 12), tube, 0, 0.3, s * 1.05, 0, 0, Math.PI / 2);
  add(new THREE.ConeGeometry(0.75, 1.6, 12, 1, false, 0, Math.PI), tube, 3.9, 0.3, 0, 0, 0, -Math.PI / 2);
  add(new THREE.BoxGeometry(6.4, 0.18, 1.9), deck, -0.2, 0.15, 0);
  add(new THREE.BoxGeometry(0.8, 1.0, 0.9), deck, 0.6, 0.75, 0);
  add(new THREE.BoxGeometry(0.06, 0.4, 0.8), metal, 1.0, 1.4, 0, 0, 0, 0.3);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.4, 1.0, 0.35), deck, -3.5, 0.3, s * 0.45);
  // Navigation lights: white on a short mast, red to port, green to starboard; a little light on the deck.
  const lamps: THREE.Material[] = [];
  for (const [color, x, y, z] of [[0xffffff, 0.9, 1.85, 0], [0xff2a1a, 2.6, 0.7, -1.1], [0x22ff66, 2.6, 0.7, 1.1]] as const) {
    const m = new THREE.MeshBasicMaterial({ color });
    lamps.push(m);
    add(new THREE.SphereGeometry(0.06, 8, 6), m, x, y, z);
  }
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), metal, 0.9, 1.4, 0);
  const glow = new THREE.PointLight(0xdfe8ff, 6, 9, 1.5);
  glow.position.set(0.3, 1.6, 0);
  group.add(glow);
  return { group, dispose: () => { for (const g of geos) g.dispose(); tube.dispose(); deck.dispose(); metal.dispose(); for (const m of lamps) m.dispose(); } };
}

/**
 * Chapter 2's way out: Overwatch's boat under the stern, you in it, away into the dark as the
 * Aurelia sails on, lit up, none the wiser.
 */
export function aureliaEscape(game: Game): Cutscene {
  const rib = buildRib();
  game.gfx.scene.add(rib.group);
  // A floodlight over the stern, on the water where the boat waits.
  const flood = new THREE.PointLight(0xffe2b8, 40, 26, 1.6);
  flood.position.set(-70.5, 8.6, 4);
  game.gfx.scene.add(flood);
  let engine = game.audio.engine();
  const place = (t: number) => {
    // Idles, then opens up and runs away astern (and off to port).
    const k = ease(span(t, 3.2, DURATION));
    const run = k * k * 220;
    const pos = START.clone().add(V(-run, 0, -run * 0.18));
    const bounce = t > 3.2 ? Math.sin(t * 7) * 0.05 * Math.min(1, run / 20) : Math.sin(t * 1.4) * 0.04;
    rib.group.position.copy(pos).add(V(0, bounce, 0));
    rib.group.rotation.set(Math.sin(t * 1.1) * 0.03, Math.PI + Math.atan2(0.18, 1), t > 3.2 ? -0.06 * Math.min(1, run / 15) : 0);
    rib.group.updateMatrixWorld(true);
    return { pos, speed: t > 3.2 ? 4 + k * 30 : 0 };
  };
  return {
    duration: DURATION,
    end: { pos: V(-64, 7, 0), yaw: 0, pitch: 0 },
    update(_dt: number, t: number): CutsceneFrame {
      const { pos, speed } = place(t);
      engine?.set(0.15 + Math.min(1, speed / 25) * 0.85, THREE.MathUtils.clamp(14 / Math.max(game.gfx.camera.position.distanceTo(pos), 1), 0.05, 1));
      let camera: CutsceneFrame['camera'];
      if (t < 6.5) {
        // Low on the water off the starboard quarter: the boat under the lit stern, the ship towering over it,
        // easing round to follow it as it pulls away.
        const k = ease(span(t, 2.5, 6.5));
        camera = {
          position: V(-90 - k * 4, SEA_LEVEL + 2.6 + k * 0.8, 21 - k * 3),
          target: pos.clone().lerp(V(-62, 4, 0), 0.35 * (1 - k)).add(V(0, 1.2, 0)),
          fov: 42,
        };
      } else {
        // Low on the water behind it: the boat racing past, the ship's lights beyond.
        camera = { position: V(-150, SEA_LEVEL + 1.4, -24), target: pos.clone().lerp(V(-20, 6, 0), span(t, 8, 13)), fov: 42 };
      }
      // You, sitting in the boat behind the console.
      const seat = new THREE.Vector3(-1.2, 0.85, 0).applyMatrix4(rib.group.matrixWorld);
      const actor: AvatarState = {
        pos: seat.clone().setY(seat.y - 0.5), yaw: rib.group.rotation.y + Math.PI, pitch: 0, stance: 'stand', eyeHeight: 1.6, speed: 0, forward: 0,
        swimming: false, onGround: true, aiming: false, gunOffset: new THREE.Vector3(), gunRotation: new THREE.Quaternion(),
        seat: { seat: seat.y, floor: seat.y - 0.5, lean: 0.2, blend: 1 },
      };
      return {
        camera,
        actor,
        bars: 1,
        fade: Math.max(1 - span(t, 0, 0.6), span(t, DURATION - 1.4, DURATION - 0.2)),
        title: { heading: 'CHAPTER 2 COMPLETE', sub: 'The Aurelia', opacity: span(t, 9, 10.2) * (1 - span(t, DURATION - 1.2, DURATION - 0.4)) },
      };
    },
    finish() {
      engine?.stop();
      engine = null;
    },
    dispose() {
      engine?.stop();
      engine = null;
      rib.group.removeFromParent();
      flood.removeFromParent();
      rib.dispose();
    },
  };
}
