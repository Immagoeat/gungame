import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Van } from '../world/vehicles/van';
import type { Cutscene, CutsceneFrame } from './Cutscene';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const G = 4.2;
const span = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const ease = (k: number) => k * k * (3 - 2 * k);

/**
 * Backing out: straight down the drive (nose still towards the house), out through the gate, then the
 * tail swings east so it ends up on the street facing west.
 */
const REVERSE = new THREE.CatmullRomCurve3([
  V(-1.6, G, 37.6), V(-1.6, G, 41.5), V(-1.6, G, 45.5), V(-1.2, G, 48.8), V(0.8, G, 51.4), V(4.2, G, 52.5),
], false, 'centripetal');
/** Then forwards, west along the street and away. */
const FORWARD = new THREE.CatmullRomCurve3([V(4.2, G, 52.5), V(-10, G, 52.5), V(-40, G, 52.5), V(-140, G, 52.5)], false, 'centripetal');

const DOOR_SHUT = 1.6;
/** Reversing starts. */
const REV_START = 2.4;
const REV_SPEED = 3.2;
const REV_ACCEL = 1.3;
const REV_BRAKE = 1.5;
/** Stopped on the street, before pulling away. */
const PAUSE = 0.35;
const FWD_ACCEL = 4.2;
const FWD_TOP = 15;

/** Distance covered over a move that eases up to `top`, cruises, and eases to a stop over `length`. */
function easedMove(length: number, top: number, accel: number, brake: number) {
  const cruise = Math.max(0, length - top * (accel + brake) / 2);
  const duration = accel + brake + cruise / top;
  const at = (t: number) => {
    if (t <= 0) return 0;
    if (t < accel) return (top * t * t) / (2 * accel);
    const a = (top * accel) / 2;
    if (t < accel + cruise / top) return a + top * (t - accel);
    const into = Math.min(brake, t - accel - cruise / top);
    return Math.min(length, a + cruise + top * into - (top * into * into) / (2 * brake));
  };
  return { duration, at };
}

/** Distance pulling away from a standstill, up to top speed. */
const pullAway = (t: number) => {
  if (t <= 0) return 0;
  const tTop = FWD_TOP / FWD_ACCEL;
  return t < tTop ? 0.5 * FWD_ACCEL * t * t : 0.5 * FWD_ACCEL * tTop * tTop + FWD_TOP * (t - tTop);
};

/**
 * The getaway: the van's door slides shut on Viper and Reyes, it reverses down the drive and out of
 * the gate, swings round onto the street, and drives off west into the night.
 */
export function mansionEscape(game: Game, van: Van): Cutscene {
  const revLength = REVERSE.getLength();
  const fwdLength = FORWARD.getLength();
  const rev = easedMove(revLength, REV_SPEED, REV_ACCEL, REV_BRAKE);
  const FWD_START = REV_START + rev.duration + PAUSE;
  /** When the van passes the street camera (cut to the shot from behind). */
  const passTime = FWD_START + Math.sqrt((2 * 16) / FWD_ACCEL);
  const DURATION = passTime + 6.5;
  const heading = (curve: THREE.CatmullRomCurve3, k: number) => {
    const tan = curve.getTangentAt(THREE.MathUtils.clamp(k, 0, 1));
    return Math.atan2(-tan.x, -tan.z);
  };
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  let engine = game.audio.engine();
  let doorSound = false;

  /** Puts the van where it is at time t; returns where, how fast, and whether it's braking. */
  const place = (t: number) => {
    let pos: THREE.Vector3;
    let yaw: number;
    let speed: number;
    let rolled: number;
    let steer: number;
    let braking = false;
    if (t < FWD_START) {
      // Reversing: the nose points the opposite way to the way it's moving.
      const tr = t - REV_START;
      const d = rev.at(tr);
      const k = d / revLength;
      pos = REVERSE.getPointAt(THREE.MathUtils.clamp(k, 0, 1));
      yaw = wrap(heading(REVERSE, k) + Math.PI);
      speed = tr <= 0 ? 0 : (rev.at(tr + 0.05) - rev.at(tr)) / 0.05;
      braking = tr > rev.duration - REV_BRAKE;
      rolled = -d;
      // Reversing, the wheels turn against the way the tail swings.
      steer = -wrap(heading(REVERSE, k + 2 / revLength) - heading(REVERSE, k)) * 2.2;
    } else {
      const tf = t - FWD_START;
      const d = pullAway(tf);
      const k = d / fwdLength;
      pos = FORWARD.getPointAt(THREE.MathUtils.clamp(k, 0, 1));
      yaw = heading(FORWARD, k);
      speed = Math.min(FWD_TOP, FWD_ACCEL * tf);
      braking = tf < 0.25;
      rolled = -revLength + d;
      steer = wrap(heading(FORWARD, k + 2 / fwdLength) - yaw) * 2.2;
    }
    van.group.position.copy(pos);
    van.group.rotation.set(0, yaw, 0);
    van.drive(rolled, THREE.MathUtils.clamp(steer, -0.55, 0.55));
    van.group.updateMatrixWorld(true);
    return { pos, speed, braking };
  };

  return {
    duration: DURATION,
    end: { pos: V(-1.6, G, 37.6), yaw: 0, pitch: 0 },
    update(_dt: number, t: number): CutsceneFrame {
      van.setDoor(1 - ease(span(t, 0.3, DOOR_SHUT)));
      if (!doorSound && t > 0.3) { doorSound = true; game.audio.slidingDoor(); }
      const { pos, speed, braking } = place(t);
      van.setLights(span(t, REV_START - 0.8, REV_START - 0.4), braking && t > REV_START ? 1 : 0);
      van.setInterior(0);
      const vp = pos.clone().add(V(0, 1.2, 0));
      const load = t < REV_START ? 0.05 : t < FWD_START ? 0.2 + Math.min(1, speed / 6) * 0.3 : 0.3 + Math.min(1, speed / 12) * 0.7;
      engine?.set(load, THREE.MathUtils.clamp(10 / Math.max(game.gfx.camera.position.distanceTo(vp), 1), 0.05, 1));

      let camera: CutsceneFrame['camera'];
      if (t < REV_START + 2.6) {
        // From the fountain's rim, low: the door closes and the van starts backing away down the drive.
        camera = { position: V(4.5, G + 1.1, 29.5), target: vp, fov: 44 };
      } else if (t < passTime) {
        // Across the street: it backs out of the gate towards us, swings round, stops, and comes past.
        camera = { position: V(-12, G + 1.5, 57.2), target: vp, fov: 46 };
      } else {
        // Behind it on the street: tail lights pulling away into the night.
        camera = { position: V(6.5, G + 1.3, 53.4), target: vp, fov: 38 };
      }
      return {
        camera,
        actor: null,
        bars: 1,
        fade: Math.max(1 - span(t, 0, 0.5), span(t, DURATION - 1.4, DURATION - 0.2)),
        title: { heading: 'CHAPTER 1 COMPLETE', sub: 'The Mansion', opacity: span(t, passTime + 1.2, passTime + 2.4) * (1 - span(t, DURATION - 1.2, DURATION - 0.4)) },
      };
    },
    finish() {
      engine?.stop();
      engine = null;
    },
    dispose() {
      engine?.stop();
      engine = null;
    },
  };
}
