import * as THREE from 'three';
import type { AABB } from '@gungame/shared';
import type { Game } from '../core/Game';
import type { AvatarState } from '../entities/avatar';
import { createVan, type Van } from '../world/vehicles/van';
import type { Cutscene, CutsceneFrame } from './Cutscene';

/**
 * The Mansion's opening, about 32 seconds:
 *  A  aerial over Beverly Hills at night: the estate lit up for the party, searchlights sweeping
 *  B  inside the van: you ride in the back under a red light, streetlights sliding past; radio check
 *  C  tracking alongside the van on the street outside the estate wall
 *  D  low at the gates as it turns in
 *  E  it stops on the drive; the side door slides open and you're standing in the doorway
 *  F  you step down and walk up the drive
 *  G  over your shoulder at the house, then into your eyes as you take control
 * The van stays parked on the drive afterwards.
 */

/** Ground level of the mansion grounds. */
const G = 4.2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (t: number) => t * t * (3 - 2 * t);
const span = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
/** Smooth, gentle wobble for a handheld camera (never frame-to-frame jitter). */
const drift = (t: number, seed: number) => Math.sin(t * 0.9 + seed) * 0.6 + Math.sin(t * 1.7 + seed * 2.3) * 0.3 + Math.sin(t * 3.1 + seed * 4.1) * 0.1;

/** Radio chatter: [start, end, speaker, line]. Edit freely; times are seconds into the scene. */
export const ARRIVAL_DIALOGUE: [number, number, string, string][] = [
  [7.2, 9.4, 'Overwatch', 'Viper, Overwatch. Radio check.'],
  [9.7, 10.9, 'Viper', 'Loud and clear.'],
  [11.2, 14.4, 'Overwatch', "Party's in full swing. Two hundred guests, private security on every door."],
  [14.7, 17.6, 'Overwatch', 'Gate is open for the vendors. Nobody looks twice at a black van in Beverly Hills.'],
  [18.0, 19.6, 'Viper', 'Copy. Rolling in.'],
  [22.9, 25.6, 'Overwatch', 'Cameras are live on every floor. Stay out of sight.'],
  [26.0, 27.6, 'Overwatch', 'Good luck, Viper.'],
];

/** The van's route: along the street outside the estate wall, in through the gate and up the drive. */
const ROUTE = new THREE.CatmullRomCurve3([
  V(-150, G, 52.5), V(-60, G, 52.5), V(-22, G, 52.5), V(-9, G, 52.3), V(-3.4, G, 50.5), V(-1.7, G, 47.5), V(-1.6, G, 44), V(-1.6, G, 40), V(-1.6, G, 37.6),
], false, 'centripetal');
/** Speed over time (s, m/s): cruising the street, braking for the turn, creeping up the drive. */
const SPEED: [number, number][] = [[0, 12], [12.8, 12], [15.4, 8], [17, 3.8], [19.6, 4.4], [21.4, 1.6], [22.2, 0]];
const STOP_TIME = 22.2;

const SHOT = { A: 0, B: 6.4, B2: 9.3, C: 12.6, D: 16.4, E: 20.4, F: 24.6, G: 28.2 };
/** He keys his headset to answer. */
const TALK = [9.45, 11.3];
const STAND_UP = [21.0, 21.8];
const TO_DOOR = [21.6, 22.5];
const DOOR_OPEN = [22.6, 23.7];
const STEP_OUT = [24.0, 24.8];
const WALK = [24.8, 27.4];
const LOOK_UP = [27.0, 28.2];
const END = V(0.9, G, 35.2);
const DURATION = 31.8;
/** Hard cut from the over-the-shoulder shot to first person. */
const CUT_TO_EYES = 30.4;

/** Seated on the bench in the back of the van, facing forward (van space). */
const SEAT = V(-0.25, 0, 1.5);
/** Bench top above the van floor. */
const BENCH = 0.48;

/** The first-person hip hold (camera space), which the body hands over to at the end. */
const HIP_HOLD = { offset: V(0.16, -0.17, -0.38), rotation: new THREE.Quaternion() };

export function mansionArrival(game: Game): Cutscene {
  const van: Van = createVan();
  game.gfx.scene.add(van.group);
  van.group.rotation.order = 'YXZ';

  // Distance along the route by time, scaled so the van stops exactly at the route's end.
  const length = ROUTE.getLength();
  const speedAt = (t: number) => {
    if (t <= 0) return SPEED[0][1];
    for (let i = 1; i < SPEED.length; i++) {
      if (t <= SPEED[i][0]) return THREE.MathUtils.lerp(SPEED[i - 1][1], SPEED[i][1], ease(span(t, SPEED[i - 1][0], SPEED[i][0])));
    }
    return 0;
  };
  const table: number[] = [0];
  const STEP = 1 / 120;
  for (let t = STEP; t <= STOP_TIME + STEP; t += STEP) table.push(table[table.length - 1] + speedAt(t) * STEP);
  const total = table[table.length - 1];
  const distAt = (t: number) => {
    const i = Math.min(table.length - 1, Math.max(0, t / STEP));
    const k = Math.floor(i);
    const d = table[k] + (table[Math.min(table.length - 1, k + 1)] - table[k]) * (i - k);
    return (d / total) * length;
  };
  const yawAt = (d: number) => {
    const tan = ROUTE.getTangentAt(THREE.MathUtils.clamp(d / length, 0, 1));
    return Math.atan2(-tan.x, -tan.z);
  };

  // Streetlights sliding past the windows during the ride (a light that sweeps front to back).
  const passing = new THREE.PointLight(0xffc98a, 0, 7, 1.3);
  van.group.add(passing);

  let engine = game.audio.engine();
  let pitch = 0;
  let doorSounded = false;
  let lastStep = 0;
  let radioLine = -1;
  let collider: AABB | null = null;

  const placeVan = (t: number, dt: number) => {
    const tt = Math.min(t, STOP_TIME);
    const d = distAt(tt);
    const pos = ROUTE.getPointAt(THREE.MathUtils.clamp(d / length, 0, 1));
    const yaw = yawAt(d);
    let turn = yawAt(d + 2.5) - yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    // Speed and braking from the smooth speed curve, eased so the body never twitches.
    const speed = t < STOP_TIME ? speedAt(tt) * (length / total) : 0;
    const decel = THREE.MathUtils.clamp((speedAt(tt - 0.15) - speedAt(tt + 0.15)) / 0.3, -3, 6);
    pitch += (-decel * 0.0035 - pitch) * (dt > 0 ? 1 - Math.exp(-6 * dt) : 1);
    // A little body roll into the turn and a gentle float on the suspension while moving.
    const roll = -turn * 0.05 * Math.min(1, speed / 6);
    const float = Math.min(1, speed / 4) * Math.sin(t * 6.3) * 0.002;
    van.group.position.copy(pos).add(V(0, float, 0));
    van.group.rotation.set(pitch, yaw, roll);
    van.drive(d, THREE.MathUtils.clamp(turn * 1.8, -0.55, 0.55));
    return { speed };
  };

  /** Van space to world. */
  const vanPoint = (p: THREE.Vector3) => p.clone().applyMatrix4(van.group.matrixWorld);

  const actorAt = (t: number): AvatarState => {
    const vanYaw = van.group.rotation.y;
    const doorYaw = vanYaw - Math.PI / 2;
    const inside = V(van.doorway.x - 0.65, van.floorY, van.doorway.z);
    const floor = vanPoint(V(0, van.floorY, 0)).y;
    let pos: THREE.Vector3;
    let yaw: number;
    let speed = 0;
    let pitchLook = 0;
    let seat: AvatarState['seat'];
    let hold: AvatarState['hold'] = { kind: 'lowReady', blend: 1 };
    let touchEar = 0;
    if (t < STEP_OUT[0]) {
      // Riding seated, then rising and moving to the door as the van stops.
      const rise = ease(span(t, STAND_UP[0], STAND_UP[1]));
      const k = ease(span(t, TO_DOOR[0], TO_DOOR[1]));
      pos = vanPoint(SEAT.clone().setY(van.floorY).lerp(inside, k));
      yaw = THREE.MathUtils.lerp(vanYaw, doorYaw, ease(span(t, TO_DOOR[0], TO_DOOR[1] - 0.2)));
      speed = t > TO_DOOR[0] && t < TO_DOOR[1] ? 1.1 : 0;
      // Elbows on knees, pistol hanging between them; the van's motion rocks him gently.
      seat = { seat: floor + BENCH, floor, lean: 0.32 + 0.02 * Math.sin(t * 6.3), blend: 1 - rise };
      hold = { kind: 'seated', blend: 1, rise };
      // Head down, thinking; up to answer the radio and while he's briefed.
      const talking = span(t, TALK[0] - 0.2, TALK[0] + 0.3) * (1 - span(t, TALK[1], TALK[1] + 0.4));
      const listening = span(t, 11.2, 11.7) * (1 - span(t, 14.0, 15.0));
      pitchLook = t < STAND_UP[0] ? -0.3 + 0.28 * Math.max(talking, listening) + 0.02 * Math.sin(t * 0.8) : 0;
      touchEar = talking;
    } else if (t < STEP_OUT[1]) {
      // Step down out of the door.
      const outside = vanPoint(V(van.doorway.x + 0.4, 0, van.doorway.z));
      const from = vanPoint(inside);
      const k = ease(span(t, STEP_OUT[0], STEP_OUT[1]));
      pos = from.clone().lerp(outside, k);
      pos.y = THREE.MathUtils.lerp(from.y, outside.y, ease(span(k, 0.35, 1)));
      yaw = doorYaw;
      speed = 1.3;
    } else {
      // Walk up the drive towards the house, turning to face it; the pistol comes up into your hands
      // (the first-person hold) as the camera moves into your eyes.
      const outside = vanPoint(V(van.doorway.x + 0.4, 0, van.doorway.z));
      const k = span(t, WALK[0], WALK[1]);
      pos = outside.clone().lerp(END, ease(k));
      const dir = END.clone().sub(outside);
      const walkYaw = Math.atan2(-dir.x, -dir.z);
      yaw = k < 0.25 ? THREE.MathUtils.lerp(doorYaw, walkYaw, ease(k / 0.25)) : THREE.MathUtils.lerp(walkYaw, 0, ease(span(k, 0.6, 1)));
      speed = k < 1 ? 1.4 * Math.sin(Math.PI * Math.min(1, k * 1.15)) + 0.2 : 0;
      if (k > 0 && k < 1 && t - lastStep > 0.48) {
        lastStep = t;
        game.audio.footstep(0.8);
      }
      pitchLook = 0.18 * ease(span(t, LOOK_UP[0], LOOK_UP[1]));
      hold = { kind: 'lowReady', blend: 1 };
    }
    return {
      pos, yaw, pitch: pitchLook, stance: 'stand', eyeHeight: 1.6, speed, forward: speed, swimming: false, onGround: true, aiming: false,
      gunOffset: HIP_HOLD.offset, gunRotation: HIP_HOLD.rotation, seat, hold, touchEar,
    };
  };

  const end = { pos: END.clone(), yaw: 0, pitch: 0.18 };
  const eye = END.clone().add(V(0, 1.6, 0));
  const lookDir = V(0, Math.sin(end.pitch), -Math.cos(end.pitch));
  const frame: CutsceneFrame = { camera: { position: V(0, 0, 0), target: V(0, 0, 0), fov: 45 }, actor: null, bars: 1, fade: 1 };

  return {
    duration: DURATION,
    end,
    update(dt, t) {
      const { speed } = placeVan(t, dt);
      van.setDoor(ease(span(t, DOOR_OPEN[0], DOOR_OPEN[1])));
      const braking = t > SPEED[2][0] && t < STOP_TIME + 0.4 ? 1 : 0;
      van.setLights(1 - span(t, 24.4, 24.8), braking);
      // Red tactical light on the ride; white when the door opens.
      if (t < DOOR_OPEN[0]) van.setInterior(1, 0xff3a24);
      else van.setInterior(1 - 0.3 * span(t, DOOR_OPEN[0], DOOR_OPEN[0] + 0.3), 0xfff0d0);
      if (!doorSounded && t >= DOOR_OPEN[0]) {
        doorSounded = true;
        game.audio.slidingDoor();
      }
      // A streetlight passing every couple of seconds while on the street.
      const onStreet = t < SHOT.D;
      const sweep = (t * 0.65) % 1;
      passing.position.set(-1.6, 2.2, -5 + sweep * 10);
      passing.intensity = onStreet ? 16 * Math.pow(Math.sin(sweep * Math.PI), 2) : 0;
      van.group.updateMatrixWorld(true);
      const vp = van.group.position;
      const cam = frame.camera;

      if (t < SHOT.B) {
        // A: slow aerial push in over the street towards the lit-up estate.
        const k = ease(span(t, SHOT.A, SHOT.B));
        cam.position.copy(V(-46, G + 40, 104)).lerp(V(-24, G + 24, 78), k);
        cam.target.copy(V(0, G + 7, -2)).lerp(V(0, G + 5, 6), k);
        cam.fov = 42;
      } else if (t < SHOT.B2) {
        // B: in the back of the van, by the cab, looking back at you on the bench.
        const k = span(t, SHOT.B, SHOT.C);
        const sway = V(drift(t, 1) * 0.015, drift(t, 2) * 0.01 + Math.sin(t * 9) * 0.002, 0);
        cam.position.copy(vanPoint(V(0.62, van.floorY + 1.32 - k * 0.05, -0.72).add(sway)));
        cam.target.copy(vanPoint(V(-0.2 + drift(t, 3) * 0.02, van.floorY + 1.0, 1.45)));
        cam.fov = 52 - k * 4;
      } else if (t < SHOT.C) {
        // B2: close on your face in profile as you key the radio, the streetlights sliding over you.
        const k = ease(span(t, SHOT.B2, SHOT.C));
        const sway = V(drift(t, 7) * 0.01, drift(t, 8) * 0.008, 0);
        // Low and in front, so it looks up into your face as you lift your head to answer.
        cam.position.copy(vanPoint(V(0.4 - k * 0.04, van.floorY + 0.9 + k * 0.03, 0.62 + k * 0.06).add(sway)));
        cam.target.copy(vanPoint(V(-0.2, van.floorY + 1.06, 1.36)));
        cam.fov = 38 - k * 4;
      } else if (t < SHOT.D) {
        // C: tracking alongside, low, the estate wall and searchlights beyond.
        const k = ease(span(t, SHOT.C, SHOT.D));
        cam.position.copy(vanPoint(V(3.4 + k * 0.6, 0.9 + drift(t, 4) * 0.05, -5.8 + k * 3.2)));
        cam.target.copy(vanPoint(V(0, 1.4, 0.4 - k)));
        cam.fov = 40;
      } else if (t < SHOT.E) {
        // D: low inside the gates as it swings in towards us.
        cam.position.set(4.6 + drift(t, 5) * 0.03, G + 0.8, 38.2);
        cam.target.copy(vp).add(V(0, 1.1, 0));
        cam.fov = 42;
      } else if (t < SHOT.F) {
        // E: beside the van as it stops and the door slides open on you.
        const k = ease(span(t, SHOT.E, SHOT.F));
        cam.position.copy(V(6.2, G + 1.6, 34.2)).lerp(V(4.9, G + 1.5, 35.4), k).add(V(0, drift(t, 6) * 0.02, 0));
        cam.target.copy(vanPoint(V(0.9, 1.3, 0.1)));
        cam.fov = 40;
      } else if (t < SHOT.G) {
        // F: leading you up the drive, the camera backing away in front at chest height.
        const a = frame.actor?.pos ?? END;
        const k = ease(span(t, SHOT.F, SHOT.G));
        const lead = V(0.25 + drift(t, 9) * 0.03, 1.32 + drift(t, 10) * 0.02, -2.5 + k * 0.3);
        cam.position.copy(a).add(lead);
        cam.target.copy(a).add(V(0, 1.42, 0));
        cam.fov = 40;
      } else if (t < CUT_TO_EYES) {
        // G: over your shoulder at the house, slowly pushing in.
        const k = ease(span(t, SHOT.G, CUT_TO_EYES));
        cam.position.copy(END.clone().add(V(0.78 - k * 0.12, 1.95 - k * 0.12, 2.2 - k * 0.7)));
        cam.target.copy(V(0.4, G + 4.6, 8)).lerp(V(0.2, G + 4.0, 10), k);
        cam.fov = 45 - k * 3;
      } else {
        // Cut to your eyes: the bars pull away and you're in control.
        cam.position.copy(eye);
        cam.target.copy(eye.clone().add(lookDir));
        cam.fov = game.settings.fov;
      }

      frame.actor = actorAt(t);
      frame.firstPerson = t >= CUT_TO_EYES;
      if (frame.firstPerson) frame.actor = null;

      // Engine: loud in the back of the van, distant from outside, idling once stopped.
      const load = THREE.MathUtils.clamp(speed / 10, 0, 1);
      const inVan = t >= SHOT.B && t < SHOT.C;
      const dist = inVan ? 1.5 : cam.position.distanceTo(vp);
      engine?.set(t < STOP_TIME ? 0.2 + load * 0.8 : 0.05, THREE.MathUtils.clamp(9 / Math.max(dist, 1), 0.05, 1) * (t > 24.5 ? 0.4 : 1));

      // Radio chatter with a squelch at each end.
      const line = ARRIVAL_DIALOGUE.findIndex(([a, b]) => t >= a && t < b);
      if (line !== radioLine) {
        if (radioLine >= 0) game.audio.radio(false);
        if (line >= 0) game.audio.radio(true);
        radioLine = line;
      }
      frame.subtitle = line >= 0 ? { speaker: ARRIVAL_DIALOGUE[line][2], text: ARRIVAL_DIALOGUE[line][3] } : null;

      // Fade up from black, a quick dip to black into the van, bars retract at the end.
      const dip = 1 - Math.min(1, Math.abs(t - SHOT.B) / 0.3);
      frame.fade = Math.max(1 - span(t, 0.2, 2.0), dip);
      frame.bars = 1 - span(t, CUT_TO_EYES + 0.15, DURATION);
      const titleIn = span(t, 1.6, 2.8);
      const titleOut = 1 - span(t, 5.2, 6.0);
      frame.title = { heading: 'THE MANSION', sub: 'Beverly Hills, California  ·  21:04', opacity: Math.min(titleIn, titleOut) };
      return frame;
    },
    finish() {
      placeVan(STOP_TIME, 0);
      van.setDoor(1);
      van.setLights(0, 0);
      van.setInterior(0.35);
      passing.intensity = 0;
      van.group.rotation.set(0, van.group.rotation.y, 0);
      van.group.updateMatrixWorld(true);
      engine?.stop();
      engine = null;
      if (radioLine >= 0) game.audio.radio(false);
      radioLine = -1;
      // Parked: solid to walk into and to shoot.
      const p = van.group.position;
      collider = { min: { x: p.x - 1.05, y: p.y, z: p.z - 3.0 }, max: { x: p.x + 1.05, y: p.y + 2.5, z: p.z + 3.0 } };
      game.world.colliders.push(collider);
      game.world.colliderInfo.set(collider, { material: 'carPaint', resistance: 12, invisible: false });
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
