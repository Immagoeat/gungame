import * as THREE from 'three';
import type { AABB } from '@gungame/shared';
import type { VoiceLineId } from '../audio/Voice';
import type { Game } from '../core/Game';
import type { AvatarState } from '../entities/avatar';
import { createVan, type Van } from '../world/vehicles/van';
import type { Cutscene, CutsceneFrame } from './Cutscene';

/**
 * The Port's opening, about 19 seconds:
 *  A  from over the water: the Sirocco under the cranes, the yard lit up behind her
 *  B  low on the road outside the fence as Overwatch's van comes along it
 *  C  it pulls into the staff car park; the side door slides open; you step down
 *  D  over your shoulder through the fence at the cranes, then into your eyes
 * The van stays parked in the car park: it's the way out.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (t: number) => t * t * (3 - 2 * t);
const span = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const drift = (t: number, seed: number) => Math.sin(t * 0.9 + seed) * 0.6 + Math.sin(t * 1.7 + seed * 2.3) * 0.3;

export const PORT_ARRIVAL_DIALOGUE: [number, VoiceLineId][] = [
  [2.4, 'c3-arrival-0'],
  [8.4, 'c3-arrival-1'],
  [10.4, 'c3-arrival-2'],
];

/** Along the road outside the fence from the east, then left into the end bay of the car park, facing west. */
const ROUTE = new THREE.CatmullRomCurve3([
  V(150, 0, 69.2), V(100, 0, 69.2), V(76, 0, 69.2), V(68, 0, 68.4), V(64, 0, 67.1), V(61.4, 0, 66.6),
], false, 'centripetal');
const SPEED: [number, number][] = [[0, 11], [8.5, 11], [10.5, 5], [12.4, 1.4], [13.2, 0]];
const STOP_TIME = 13.2;
const SHOT = { A: 0, B: 5.6, C: 11.2, D: 16 };
const DOOR_OPEN = [13.4, 14.4];
const STEP_OUT = [14.6, 15.4];
const WALK = [15.4, 16.6];
const END = V(60.2, 0, 63.9);
const DURATION = 19.2;
const CUT_TO_EYES = 18;
const HIP_HOLD = { offset: V(0.16, -0.17, -0.38), rotation: new THREE.Quaternion() };

export function portArrival(game: Game): Cutscene & { readonly van: Van; park(x: number, z: number, yaw: number): void } {
  const van: Van = createVan();
  game.gfx.scene.add(van.group);
  van.group.rotation.order = 'YXZ';

  const length = ROUTE.getLength();
  const speedAt = (t: number) => {
    if (t <= 0) return SPEED[0][1];
    for (let i = 1; i < SPEED.length; i++) {
      if (t <= SPEED[i][0]) return THREE.MathUtils.lerp(SPEED[i - 1][1], SPEED[i][1], ease(span(t, SPEED[i - 1][0], SPEED[i][0])));
    }
    return 0;
  };
  const STEP = 1 / 120;
  const table: number[] = [0];
  for (let t = STEP; t <= STOP_TIME + STEP; t += STEP) table.push(table[table.length - 1] + speedAt(t) * STEP);
  const total = table[table.length - 1];
  const distAt = (t: number) => {
    const i = Math.min(table.length - 1, Math.max(0, t / STEP));
    const k = Math.floor(i);
    return ((table[k] + (table[Math.min(table.length - 1, k + 1)] - table[k]) * (i - k)) / total) * length;
  };
  const yawAt = (d: number) => {
    const tan = ROUTE.getTangentAt(THREE.MathUtils.clamp(d / length, 0, 1));
    return Math.atan2(-tan.x, -tan.z);
  };

  let engine = game.audio.engine();
  let doorSounded = false;
  let radioLine = -1;
  let lastStep = 0;
  let collider: AABB | null = null;

  const placeVan = (t: number) => {
    const tt = Math.min(t, STOP_TIME);
    const d = distAt(tt);
    const pos = ROUTE.getPointAt(THREE.MathUtils.clamp(d / length, 0, 1));
    const yaw = yawAt(d);
    let turn = yawAt(d + 2.5) - yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const speed = t < STOP_TIME ? speedAt(tt) * (length / total) : 0;
    van.group.position.copy(pos).add(V(0, Math.min(1, speed / 4) * Math.sin(t * 6.3) * 0.002, 0));
    van.group.rotation.set(0, yaw, -turn * 0.05 * Math.min(1, speed / 6));
    van.drive(d, THREE.MathUtils.clamp(turn * 1.8, -0.55, 0.55));
    return speed;
  };
  const vanPoint = (p: THREE.Vector3) => p.clone().applyMatrix4(van.group.matrixWorld);

  const actorAt = (t: number): AvatarState | null => {
    if (t < DOOR_OPEN[1]) return null; // inside, out of sight
    const doorYaw = van.group.rotation.y - Math.PI / 2;
    const inside = vanPoint(V(van.doorway.x - 0.65, van.floorY, van.doorway.z));
    const outside = vanPoint(V(van.doorway.x + 0.4, 0, van.doorway.z));
    let pos: THREE.Vector3, yaw = doorYaw, speed = 0, pitch = 0;
    if (t < STEP_OUT[1]) {
      const k = ease(span(t, STEP_OUT[0], STEP_OUT[1]));
      pos = inside.clone().lerp(outside, k);
      pos.y = THREE.MathUtils.lerp(inside.y, outside.y, ease(span(k, 0.35, 1)));
      speed = t > STEP_OUT[0] ? 1.3 : 0;
    } else {
      const k = span(t, WALK[0], WALK[1]);
      pos = outside.clone().lerp(END, ease(k));
      yaw = THREE.MathUtils.lerp(doorYaw, -0.35, ease(k));
      speed = k < 1 ? 1.2 * Math.sin(Math.PI * Math.min(1, k * 1.1)) + 0.2 : 0;
      if (k > 0 && k < 1 && t - lastStep > 0.5) { lastStep = t; game.audio.step('stone', 0.6); }
      pitch = 0.12 * ease(span(t, 16.4, 17.6));
    }
    return {
      pos, yaw, pitch, stance: 'stand', eyeHeight: 1.6, speed, forward: speed, swimming: false, onGround: true, aiming: false,
      gunOffset: HIP_HOLD.offset, gunRotation: HIP_HOLD.rotation, hold: { kind: 'lowReady', blend: 1 },
    };
  };

  const end = { pos: END.clone(), yaw: -0.35, pitch: 0.12 };
  const eye = END.clone().add(V(0, 1.6, 0));
  const lookDir = V(-Math.sin(end.yaw) * Math.cos(end.pitch), Math.sin(end.pitch), -Math.cos(end.yaw) * Math.cos(end.pitch));
  const frame: CutsceneFrame = { camera: { position: V(0, 0, 0), target: V(0, 0, 0), fov: 45 }, actor: null, bars: 1, fade: 1 };

  return {
    van,
    duration: DURATION,
    end,
    update(_dt, t) {
      const speed = placeVan(t);
      van.setDoor(ease(span(t, DOOR_OPEN[0], DOOR_OPEN[1])));
      van.setLights(1 - span(t, 15.6, 16), t > SPEED[1][0] && t < STOP_TIME + 0.4 ? 1 : 0);
      van.setInterior(t < DOOR_OPEN[0] ? 1 : 0.7, t < DOOR_OPEN[0] ? 0xff3a24 : 0xfff0d0);
      if (!doorSounded && t >= DOOR_OPEN[0]) { doorSounded = true; game.audio.slidingDoor(); }
      van.group.updateMatrixWorld(true);
      const vp = van.group.position;
      const cam = frame.camera;
      if (t < SHOT.B) {
        // A: from out over the basin, drifting along the ship's side towards the cranes.
        const k = ease(span(t, SHOT.A, SHOT.B));
        cam.position.copy(V(-95, 14, -92)).lerp(V(-40, 18, -98), k);
        cam.target.copy(V(-20, 8, -30)).lerp(V(10, 10, -20), k);
        cam.fov = 44;
      } else if (t < SHOT.C) {
        // B: low by the kerb outside the fence as the van comes along the road.
        cam.position.set(70 + drift(t, 2) * 0.04, 0.8, 74.2);
        cam.target.copy(vp).add(V(0, 1.2, 0));
        cam.fov = 40;
      } else if (t < SHOT.D) {
        // C: beside the bay as it stops and the door slides open.
        const k = ease(span(t, SHOT.C, SHOT.D));
        cam.position.copy(V(56.6, 1.6, 61.4)).lerp(V(57.4, 1.55, 62.1), k).add(V(0, drift(t, 6) * 0.02, 0));
        cam.target.copy(vanPoint(V(0.9, 1.2, 0.2)));
        cam.fov = 42;
      } else if (t < CUT_TO_EYES) {
        // D: over your shoulder, through the fence at the cranes.
        const k = ease(span(t, SHOT.D, CUT_TO_EYES));
        const a = frame.actor?.pos ?? END;
        // (From his right and a little behind: the van is parked right behind him.)
        cam.position.copy(a).add(V(2.0 - k * 0.5, 2.0 - k * 0.15, 0.9 - k * 0.3));
        cam.target.copy(V(40, 10, 10)).lerp(V(30, 9, 20), k);
        cam.fov = 46 - k * 3;
      } else {
        cam.position.copy(eye);
        cam.target.copy(eye.clone().add(lookDir));
        cam.fov = game.settings.fov;
      }
      frame.actor = actorAt(t);
      frame.firstPerson = t >= CUT_TO_EYES;
      if (frame.firstPerson) frame.actor = null;

      const dist = cam.position.distanceTo(vp);
      engine?.set(t < STOP_TIME ? 0.2 + THREE.MathUtils.clamp(speed / 10, 0, 1) * 0.8 : 0.05, THREE.MathUtils.clamp(9 / Math.max(dist, 1), 0.05, 1) * (t > 15.6 ? 0.3 : 1));

      let free = 0;
      const plan = PORT_ARRIVAL_DIALOGUE.map(([at, id]) => {
        const start = Math.max(at, free);
        free = start + game.voice.info(id).duration + 0.3;
        return [start, free] as const;
      });
      const line = plan.findIndex(([a, b]) => t >= a && t < b);
      if (line !== radioLine) {
        if (line >= 0 && t - plan[line][0] < 0.25) game.voice.say(PORT_ARRIVAL_DIALOGUE[line][1]);
        radioLine = line;
      }
      const said = line >= 0 ? game.voice.info(PORT_ARRIVAL_DIALOGUE[line][1]) : null;
      frame.subtitle = said ? { speaker: said.speaker, text: said.text } : null;
      const dip = 1 - Math.min(1, Math.abs(t - SHOT.B) / 0.3);
      frame.fade = Math.max(1 - span(t, 0.2, 2.0), dip);
      frame.bars = 1 - span(t, CUT_TO_EYES + 0.15, DURATION);
      frame.title = { heading: 'THE PORT', sub: 'Marseille-Fos, France  ·  02:10', opacity: Math.min(span(t, 1.4, 2.6), 1 - span(t, 4.6, 5.4)) };
      return frame;
    },
    finish() {
      placeVan(STOP_TIME);
      van.setDoor(1);
      van.setLights(0, 0);
      van.setInterior(0.35);
      van.group.rotation.set(0, van.group.rotation.y, 0);
      van.group.updateMatrixWorld(true);
      engine?.stop();
      engine = null;
      game.voice.stopRadio();
      radioLine = -1;
      // Parked side-on (along x): solid to walk into and to shoot.
      const p = van.group.position;
      collider = { min: { x: p.x - 3.0, y: p.y, z: p.z - 1.05 }, max: { x: p.x + 3.0, y: p.y + 2.5, z: p.z + 1.05 } };
      game.world.colliders.push(collider);
      game.world.colliderInfo.set(collider, { material: 'carPaint', resistance: 12, invisible: false });
    },
    /** Overwatch moves the van (round to the west end, when the gates are watched). */
    park(x: number, z: number, yaw: number) {
      van.group.position.set(x, 0, z);
      van.group.rotation.set(0, yaw, 0);
      van.setDoor(1);
      van.group.updateMatrixWorld(true);
      if (collider) {
        const along = Math.abs(Math.sin(yaw)) > 0.7;
        const [hx, hz] = along ? [3.0, 1.05] : [1.05, 3.0];
        Object.assign(collider.min, { x: x - hx, z: z - hz });
        Object.assign(collider.max, { x: x + hx, z: z + hz });
        game.world.colliders.splice(game.world.colliders.indexOf(collider), 1);
        game.world.colliders.push(collider);
      }
    },
    dispose() {
      engine?.stop();
      if (collider) {
        const i = game.world.colliders.indexOf(collider);
        if (i >= 0) game.world.colliders.splice(i, 1);
        game.world.colliderInfo.delete(collider);
      }
      van.dispose();
    },
  };
}
