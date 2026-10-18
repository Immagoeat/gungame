import * as THREE from 'three';
import { HARBOUR_LEVEL } from '@gungame/shared';
import type { Game } from '../core/Game';
import type { Van } from '../world/vehicles/van';
import type { Cutscene, CutsceneFrame } from './Cutscene';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const span = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const ease = (k: number) => k * k * (3 - 2 * k);

/** Away west along the road from wherever the van is (the west end of the fence, by now). */
const routeFrom = (p: THREE.Vector3) => new THREE.CatmullRomCurve3([p.clone(), V(p.x - 6, 0, 69.2), V(p.x - 30, 0, 69.2), V(p.x - 110, 0, 69.2)], false, 'centripetal');
const PULL = 1.8;
/** The second half: the Sirocco clearing the breakwater, and the charge. */
const SEA = 7.2;
const BOOM = 12.6;
const DURATION = 21;
/** The ship's course past the harbour light, heading north into open water. */
const COURSE_X = 258;
const COURSE_Z0 = -300, SHIP_SPEED = 6.5;

/** A feeder ship for the far shot: black hull, a deck of coloured boxes, the white house aft, her lights. */
function buildShip(): { group: THREE.Group; deckFire: THREE.Vector3; dispose(): void } {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const mat = (color: number, emissive = 0) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, emissive, emissiveIntensity: emissive ? 1.4 : 0 }); mats.push(m); return m; };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geos.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  // Bow towards -z.
  box(20, 9, 110, 0, -1, 0, mat(0x1d2024));
  box(20.1, 1.2, 110.1, 0, -1.6, 0, mat(0x7a1c1c));
  box(14, 7, 10, 0, 3, -58, mat(0x1d2024));
  const colors = [0x9c2b23, 0x1f4e79, 0x2e6b3a, 0xc7c2b8, 0xc9741a, 0x5a7d9a, 0x284a34];
  let n = 0;
  for (let bay = 0; bay < 7; bay++) for (let row = 0; row < 6; row++) {
    const tiers = 1 + ((bay * 5 + row * 3) % 3);
    for (let t = 0; t < tiers; t++) box(2.4, 2.5, 12, -7 + row * 2.8, 3.5 + 1.3 + t * 2.6, -42 + bay * 13.4, mat(colors[n++ % colors.length]));
  }
  box(16, 15, 11, 0, 11, 48, mat(0xe7e5df));
  box(16.2, 1.1, 0.2, 0, 13, 42.4, mat(0xffe6c4, 0xffe6c4));
  box(16.2, 1.1, 0.2, 0, 16.5, 42.4, mat(0xffe6c4, 0xffe6c4));
  box(4, 8, 4, 0, 22, 51, mat(0x9c2b23));
  // Masthead, sidelights, stern light.
  for (const [c, x, y, z] of [[0xffffff, 0, 24, 40], [0xff2a1a, -10.2, 8, 38], [0x22ff66, 10.2, 8, 38], [0xffffff, 0, 6, 55]] as const) {
    const m = new THREE.MeshBasicMaterial({ color: c });
    mats.push(m);
    const g = new THREE.SphereGeometry(0.5, 8, 6);
    geos.push(g);
    const s = new THREE.Mesh(g, m);
    s.position.set(x, y, z);
    group.add(s);
  }
  // The reserve rides on deck, bay 2 (the second from the bow), where the charge is.
  return { group, deckFire: V(-1, 10.5, -28.6), dispose: () => { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); } };
}

/**
 * The way out: into the van, the door slides shut and Overwatch pulls out of the car park. Later, from
 * the end of the breakwater, the Sirocco slides past the harbour light into open water, and the charge
 * on her deck goes up.
 */
export function portEscape(game: Game, van: Van): Cutscene {
  const start = van.group.position.clone();
  const ROUTE = routeFrom(start);
  const length = ROUTE.getLength();
  const ship = buildShip();
  ship.group.visible = false;
  game.gfx.scene.add(ship.group);
  const flash = new THREE.PointLight(0xffc27a, 0, 420, 1.6);
  const fire = new THREE.PointLight(0xff7a2a, 0, 120, 1.8);
  ship.group.add(flash, fire);
  flash.position.copy(ship.deckFire);
  fire.position.copy(ship.deckFire);
  // The fireball, the flames after it and the smoke: soft round sprites (a radial falloff, no hard
  // edges), additive for the fire, dark and slow for the smoke.
  const puff = softPuff();
  const sprite = (color: number, additive: boolean) => new THREE.MeshBasicMaterial({
    map: puff, color, transparent: true, opacity: 0, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  });
  // Billboards: flat squares turned to face the camera every frame.
  const quad = new THREE.PlaneGeometry(1, 1);
  const billboards: THREE.Mesh[] = [];
  const Billboard = (m: THREE.MeshBasicMaterial) => { const b = new THREE.Mesh(quad, m); b.renderOrder = 2; billboards.push(b); return b; };
  const ballMat = sprite(0xffb050, true);
  const coreMat = sprite(0xfff2c0, true);
  const balls = [0, 1, 2, 3, 4].map(i => {
    const s = Billboard(i === 0 ? coreMat : ballMat);
    s.position.copy(ship.deckFire).add(V(Math.sin(i * 2.4) * 2.2, i * 1.1, Math.cos(i * 1.9) * 1.6));
    ship.group.add(s);
    return s;
  });
  const smokeMat = sprite(0x2a2826, false);
  const smoke = [0, 1, 2, 3, 4, 5, 6, 7].map(() => { const s = Billboard(smokeMat); ship.group.add(s); return s; });
  const flames = sprite(0xff7a28, true);
  const flameMeshes = [0, 1, 2, 3, 4].map(i => {
    const s = Billboard(flames);
    s.position.copy(ship.deckFire).add(V((i - 2) * 1.5, 0.8, (i % 2) * 2 - 1));
    ship.group.add(s);
    return s;
  });
  let engine = game.audio.engine();
  let doorSound = false;
  let boomed = false;
  let said = false;

  const placeVan = (t: number) => {
    const tt = Math.max(0, t - PULL);
    const d = Math.min(length, 0.5 * 3.5 * tt * tt);
    const k = d / length;
    const pos = ROUTE.getPointAt(k);
    const tan = ROUTE.getTangentAt(k);
    van.group.position.copy(pos);
    van.group.rotation.set(0, Math.atan2(-tan.x, -tan.z), 0);
    van.drive(d, 0);
    van.group.updateMatrixWorld(true);
    return { pos, speed: Math.min(15, 3.5 * tt) };
  };

  return {
    duration: DURATION,
    end: { pos: V(59.2, 0, 64.5), yaw: 0, pitch: 0 },
    update(_dt: number, t: number): CutsceneFrame {
      let camera: CutsceneFrame['camera'];
      if (t < SEA) {
        van.setDoor(1 - ease(span(t, 0.2, 1.4)));
        if (!doorSound && t > 0.2) { doorSound = true; game.audio.slidingDoor(); }
        const { pos, speed } = placeVan(t);
        van.setLights(span(t, 1.0, 1.4), 0);
        van.setInterior(0);
        engine?.set(t < PULL ? 0.08 : 0.25 + Math.min(1, speed / 12) * 0.6, THREE.MathUtils.clamp(10 / Math.max(game.gfx.camera.position.distanceTo(pos), 1), 0.05, 1));
        camera = { position: start.clone().add(V(-17, 1.4, 5.2)), target: pos.clone().add(V(0, 1.1, 0)), fov: 44 };
      } else {
        if (engine) { engine.stop(); engine = null; }
        ship.group.visible = true;
        const ts = t - SEA;
        const z = COURSE_Z0 - ts * SHIP_SPEED;
        ship.group.position.set(COURSE_X, HARBOUR_LEVEL + Math.sin(t * 0.7) * 0.15, z);
        ship.group.rotation.set(Math.sin(t * 0.5) * 0.006, 0, Math.sin(t * 0.43) * 0.01);
        ship.group.updateMatrixWorld(true);
        // From the breakwater's end by the harbour light, the ship sliding past into the dark.
        const shake = t > BOOM && t < BOOM + 1.2 ? (1 - span(t, BOOM, BOOM + 1.2)) * 0.35 : 0;
        camera = {
          position: V(212 + Math.sin(t * 37) * shake, HARBOUR_LEVEL + 5.2 + Math.cos(t * 41) * shake, -334),
          target: ship.group.position.clone().add(V(0, 6, -10)).lerp(ship.group.position.clone().add(V(0, 10, -28)), span(t, BOOM - 1, BOOM + 2)),
          fov: 36,
        };
        // The charge: a white flash, the fireball swelling and fading, then fire on deck and smoke.
        const tb = t - BOOM;
        if (tb >= 0 && !boomed) {
          boomed = true;
          // The bang arrives after the flash (the breakwater is a long way off).
          setTimeout(() => {
            game.audio.shot({ cutoff: 260, decay: 3.2 }, 1.6);
            game.audio.shot({ cutoff: 120, decay: 4.5 }, 1.2);
          }, 250);
        }
        flash.intensity = tb < 0 ? 0 : 60000 * Math.exp(-tb * 5) + 6000 * Math.exp(-tb * 1.2);
        balls.forEach((b, i) => {
          const k = span(tb, i * 0.08, 1.4 + i * 0.25);
          b.scale.setScalar(2 + ease(k) * (i === 0 ? 14 : 20 + i * 4));
        });
        ballMat.opacity = tb < 0 ? 0 : 0.9 * (1 - span(tb, 0.4, 2.6));
        coreMat.opacity = tb < 0 ? 0 : 1 - span(tb, 0.05, 0.9);
        const burning = span(tb, 0.8, 2.5);
        const flicker = 0.7 + 0.3 * Math.sin(t * 23) * Math.sin(t * 7.1);
        fire.intensity = burning * 2600 * flicker;
        flames.opacity = burning * 0.8 * flicker;
        flameMeshes.forEach((f, i) => f.scale.set(3.2 + Math.sin(t * 9 + i) * 0.8, 4.6 + Math.sin(t * 7 + i * 2) * 1.4, 1));
        smokeMat.opacity = span(tb, 0.6, 3) * 0.6;
        smoke.forEach((s, i) => {
          // A column leaning downwind, each puff rising, swelling and drifting as it goes.
          const rise = Math.max(0, tb - 0.5 - i * 0.4);
          s.position.copy(ship.deckFire).add(V(Math.sin(i * 2.1) * 1.5 + rise * 1.1, 5 + rise * 3, Math.cos(i * 1.7) * 1.5 + rise * 2.4));
          s.scale.setScalar(rise > 0 ? 5 + rise * 3.2 : 0.01);
        });
        if (!said && t > BOOM + 1.6) { said = true; game.voice.say('c3-win'); }
        // Turn the fire and smoke to face the camera (undoing the ship's own turn).
        const q = new THREE.Quaternion();
        game.gfx.camera.getWorldQuaternion(q);
        const inv = ship.group.getWorldQuaternion(new THREE.Quaternion()).invert();
        for (const b of billboards) b.quaternion.copy(inv).multiply(q);
      }
      const info = said && t > BOOM + 1.6 ? game.voice.info('c3-win') : null;
      return {
        camera,
        actor: null,
        bars: 1,
        fade: Math.max(1 - span(t, 0, 0.5), 1 - Math.min(1, Math.abs(t - SEA) / 0.35), span(t, DURATION - 1.4, DURATION - 0.2)),
        subtitle: info && t < BOOM + 1.6 + info.duration ? { speaker: info.speaker, text: info.text } : null,
        title: t > SEA
          ? { heading: 'CHAPTER 3 COMPLETE', sub: 'The Port', opacity: span(t, BOOM + 5.4, BOOM + 6.4) * (1 - span(t, DURATION - 1.2, DURATION - 0.4)) }
          : { heading: '04:20', sub: 'Outside the breakwater', opacity: 0 },
      };
    },
    finish() {
      engine?.stop();
      engine = null;
    },
    dispose() {
      engine?.stop();
      engine = null;
      ship.group.removeFromParent();
      ship.dispose();
      puff.dispose();
      quad.dispose();
      for (const m of [ballMat, coreMat, smokeMat, flames]) m.dispose();
    },
  };
}

/** A soft round blob (white, fading out to the edge): the texture for fire and smoke sprites. */
function softPuff(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
