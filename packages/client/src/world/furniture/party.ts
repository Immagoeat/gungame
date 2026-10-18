import * as THREE from 'three';
import { ambience, createBeam, createGlow, partyColor } from '../beams';
import { canvasTexture } from '../textures';
import { P } from './palette';
import type { Builder } from './types';

/**
 * Party dressing: rooftop sky searchlights, coloured uplights washing the facade, a DJ booth with
 * moving-head lights and lasers, bars, a champagne tower, balloon arches, a red carpet and more.
 * Everything that glows or moves is a dynamic part with its own material; lights fade out by day.
 */

/** An emissive material of our own (not the shared palette cache), so it can change colour. */
const ownEmissive = (color: number, intensity = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });

/** Adds a mesh to a dynamic group (not merged into the static batch). */
function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const tmpColor = new THREE.Color();

function signTexture(text: string, color: string): THREE.Texture {
  return canvasTexture(256, (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.font = 'bold 120px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 24;
    g.fillStyle = color;
    g.fillText(text, s / 2, s / 2);
  });
}

export const party: Record<string, Builder> = {
  /** Twin-arc sky tracker: a big lamp drum on a yoke, sweeping a beam across the night sky. */
  searchlight: (k, p) => {
    const dark = P.blackMetal();
    k.box(1.1, 0.25, 1.1, 0, 0.125, 0, dark);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.12, 0.08, 0.12, sx * 0.48, 0.04, sz * 0.48, P.rubber());
    k.cyl(0.32, 0.4, 0.3, 0, 0.4, 0, P.steel(), { seg: 20 });
    k.box(0.5, 0.18, 0.4, 0.3, 0.32, 0.38, dark);
    for (let i = 0; i < 4; i++) k.box(0.52, 0.02, 0.02, 0.3, 0.26 + i * 0.04, 0.585, P.chrome());

    const turret = new THREE.Group();
    turret.position.y = 0.55;
    const steel = P.steel();
    for (const sx of [-1, 1]) part(turret, new THREE.BoxGeometry(0.08, 0.9, 0.22), steel, sx * 0.56, 0.45, 0);
    part(turret, new THREE.BoxGeometry(1.2, 0.1, 0.3), steel, 0, 0.02, 0);
    const head = new THREE.Group();
    head.position.y = 0.85;
    turret.add(head);
    const drum = new THREE.CylinderGeometry(0.46, 0.5, 1.0, 32, 1, true);
    part(head, drum, P.paint(0x1a1c20), 0, 0, 0);
    part(head, new THREE.CylinderGeometry(0.5, 0.5, 0.04, 32), dark, 0, -0.5, 0);
    part(head, new THREE.TorusGeometry(0.47, 0.035, 8, 32).rotateX(Math.PI / 2), P.chrome(), 0, 0.5, 0);
    for (let i = 0; i < 6; i++) part(head, new THREE.TorusGeometry(0.505, 0.012, 6, 32).rotateX(Math.PI / 2), dark, 0, -0.4 + i * 0.12, 0);
    const lensMat = ownEmissive(0xf4f8ff, 5);
    part(head, new THREE.CircleGeometry(0.44, 32).rotateX(-Math.PI / 2), lensMat, 0, 0.49, 0, false);
    const glow = createGlow(0xe8f0ff, 3.2, 1.2);
    glow.position.y = 0.6;
    head.add(glow);
    const beam = createBeam(0xdfe9ff, 240, 7, 0.45, 0.22, 0.9);
    beam.mesh.position.y = 0.5;
    head.add(beam.mesh);

    const seed = p.variant * 1.37;
    k.dynamic(turret, (_dt, t) => {
      const on = ambience.night;
      turret.visible = true;
      beam.setStrength(0.22 * on);
      glow.visible = on > 0.05;
      lensMat.emissiveIntensity = 0.3 + 5 * on;
      // Slow, independent figure-eight sweeps, so the beams criss-cross over the house.
      turret.rotation.y = seed + t * 0.18 + Math.sin(t * 0.23 + seed) * 1.1;
      head.rotation.x = -(0.25 + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.31 + seed * 2)));
    });
  },

  /** Floor can light washing the wall behind it (the piece faces away from the wall) in colour. */
  uplight: (k, p) => {
    const can = new THREE.Group();
    part(can, new THREE.CylinderGeometry(0.11, 0.13, 0.24, 16), P.blackMetal(), 0, 0.14, 0);
    part(can, new THREE.BoxGeometry(0.34, 0.03, 0.12), P.blackMetal(), 0, 0.015, 0);
    const lens = ownEmissive(p.color ?? 0x8a3cff, 4);
    part(can, new THREE.CircleGeometry(0.1, 16).rotateX(-Math.PI / 2), lens, 0, 0.265, 0, false);
    can.rotation.x = -0.35; // tilted towards the wall (-z)
    const glow = createGlow(p.color ?? 0x8a3cff, 0.9, 1.3);
    glow.position.set(0, 0.3, -0.05);
    const light = new THREE.SpotLight(p.color ?? 0x8a3cff, 40, 16, 0.42, 0.75, 1.4);
    light.position.set(0, 0.3, 0);
    light.target.position.set(0, 7, -1.4);
    const beam = createBeam(p.color ?? 0x8a3cff, 8, 1.4, 0.1, 0.18, 1.3);
    beam.aim(new THREE.Vector3(0, 7, -1.2));
    beam.mesh.position.set(0, 0.28, 0);
    const g = new THREE.Group();
    g.add(can, glow, light, light.target, beam.mesh);
    const cycle = p.variant === 1;
    const base = new THREE.Color(p.color ?? 0x8a3cff);
    k.dynamic(g, (_dt, t) => {
      const on = ambience.night;
      const c = cycle ? partyColor(t, g.position.x * 0.02, tmpColor) : base;
      light.color.copy(c);
      lens.emissive.copy(c);
      beam.material.uniforms.color.value.copy(c);
      glow.material.color.copy(c).multiplyScalar(1.3);
      light.intensity = 40 * on;
      beam.setStrength(0.18 * on);
      glow.visible = on > 0.05;
    });
  },

  /** DJ booth under a truss with four moving-head lights and a laser, LED-faced, decks on top. */
  djBooth: (k, p) => {
    const w = p.w;
    const black = P.blackMetal();
    // Booth: black table with a glowing LED front.
    k.box(w, 0.06, 1.0, 0, 1.12, 0.1, black);
    k.box(w, 1.06, 0.06, 0, 0.53, 0.58, black);
    for (const sx of [-1, 1]) k.box(0.06, 1.06, 1.0, sx * (w / 2 - 0.03), 0.53, 0.1, black);
    k.box(w - 0.1, 1.0, 0.04, 0, 0.53, -0.38, black);
    // Decks: two players and a mixer, a laptop on a stand, headphones.
    for (const sx of [-1, 1]) {
      k.rbox(0.32, 0.1, 0.4, 0.02, sx * 0.48, 1.2, 0.1, P.paint(0x1d1f23));
      k.cyl(0.12, 0.12, 0.012, sx * 0.48, 1.255, 0.12, P.chrome(), { seg: 24 });
      k.box(0.2, 0.004, 0.06, sx * 0.48, 1.252, -0.04, P.led(0x2a7fff));
    }
    k.rbox(0.36, 0.08, 0.38, 0.02, 0, 1.19, 0.1, P.paint(0x26282c));
    for (let i = 0; i < 4; i++) k.box(0.02, 0.012, 0.18, -0.12 + i * 0.08, 1.235, 0.12, P.chrome());
    k.box(0.04, 0.22, 0.04, 0, 1.26, -0.22, black);
    k.box(0.34, 0.01, 0.24, 0, 1.38, -0.22, P.steel(), { rot: [-0.35, 0, 0] });
    k.box(0.34, 0.22, 0.01, 0, 1.5, -0.32, P.led(0x5ad1ff), { rot: [0.2, 0, 0] });
    // Truss: two towers and a crossbar.
    const truss = P.steel();
    const top = 3.4;
    for (const sx of [-1, 1]) {
      for (const [ox, oz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) k.cyl(0.02, 0.02, top, sx * (w / 2 + 0.25) + ox, top / 2, -0.25 + oz, truss, { seg: 6 });
      for (let y = 0.3; y < top; y += 0.3) k.box(0.26, 0.015, 0.26, sx * (w / 2 + 0.25), y, -0.25, truss);
      k.box(0.5, 0.04, 0.5, sx * (w / 2 + 0.25), 0.02, -0.25, black);
    }
    for (const oz of [-0.12, 0.12]) for (const oy of [0, 0.24]) k.cyl(0.02, 0.02, w + 0.74, 0, top - 0.12 + oy, -0.25 + oz, truss, { rot: [0, 0, Math.PI / 2], seg: 6 });

    const fx = new THREE.Group();
    // LED front panel: vertical bars chasing in colour.
    const bars: THREE.MeshStandardMaterial[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const m = ownEmissive(0xff00aa, 2.2);
      bars.push(m);
      part(fx, new THREE.BoxGeometry((w - 0.3) / n - 0.02, 0.86, 0.01), m, -w / 2 + 0.15 + (i + 0.5) * (w - 0.3) / n, 0.55, 0.615, false);
    }
    // Moving heads hanging from the crossbar.
    const heads: { yoke: THREE.Group; lamp: THREE.Group; beam: ReturnType<typeof createBeam>; lens: THREE.MeshStandardMaterial; seed: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const yoke = new THREE.Group();
      yoke.position.set(-w / 2 + 0.3 + i * (w - 0.6) / 3, top - 0.25, -0.25);
      part(yoke, new THREE.BoxGeometry(0.22, 0.1, 0.18), black, 0, 0, 0);
      for (const sx of [-1, 1]) part(yoke, new THREE.BoxGeometry(0.03, 0.22, 0.08), black, sx * 0.12, -0.14, 0);
      const lamp = new THREE.Group();
      lamp.position.y = -0.2;
      part(lamp, new THREE.CylinderGeometry(0.09, 0.1, 0.24, 14), black, 0, 0, 0);
      const lens = ownEmissive(0xffffff, 4);
      part(lamp, new THREE.CircleGeometry(0.08, 14).rotateX(Math.PI / 2), lens, 0, -0.121, 0, false);
      const beam = createBeam(0xffffff, 26, 1.6, 0.07, 0.35, 1.2);
      beam.mesh.rotation.x = Math.PI; // shines down out of the lens
      beam.mesh.position.y = -0.12;
      lamp.add(beam.mesh);
      yoke.add(lamp);
      fx.add(yoke);
      heads.push({ yoke, lamp, beam, lens, seed: i * 1.7 });
    }
    // Laser: a fan of thin green beams sweeping over the crowd area.
    const laser = new THREE.Group();
    laser.position.set(0, top - 0.3, -0.1);
    part(laser, new THREE.BoxGeometry(0.3, 0.14, 0.22), black, 0, 0, 0);
    const rays: ReturnType<typeof createBeam>[] = [];
    for (let i = 0; i < 9; i++) {
      const r = createBeam(0x22ff55, 40, 0.06, 0.004, 0.9, 0.4);
      r.mesh.position.z = 0.12;
      laser.add(r.mesh);
      rays.push(r);
    }
    fx.add(laser);
    const wash = new THREE.PointLight(0xff00aa, 25, 14, 1.6);
    wash.position.set(0, 2.2, 1.6);
    fx.add(wash);
    const dir = new THREE.Vector3();
    const beamDir = new THREE.Vector3();
    const beamQuat = new THREE.Quaternion();
    k.dynamic(fx, (_dt, t) => {
      const on = Math.max(0.35, ambience.night);
      const beat = Math.pow(1 - ((t * 124 / 60) % 1), 3); // 124 bpm pulse
      bars.forEach((m, i) => {
        partyColor(t * 2, i / n * 0.6, m.emissive);
        m.emissiveIntensity = 0.6 + 2.2 * (0.5 + 0.5 * Math.sin(t * 6 - i * 0.7)) * (0.6 + 0.4 * beat);
      });
      for (const h of heads) {
        h.yoke.rotation.y = Math.sin(t * 0.7 + h.seed) * 1.4;
        h.lamp.rotation.x = Math.sin(t * 0.9 + h.seed * 2) * 0.9 - 0.5;
        // Stop each beam at the floor under the booth (on a ship's deck there's a room below it).
        h.yoke.updateMatrixWorld(true);
        beamDir.set(0, 1, 0).applyQuaternion(h.beam.mesh.getWorldQuaternion(beamQuat));
        const reach = beamDir.y < -0.05 ? Math.min(26, (top - 0.55) / -beamDir.y) : 26;
        h.beam.mesh.scale.set(1.6 * reach / 26, reach, 1.6 * reach / 26);
        partyColor(t * 1.5, h.seed * 0.1, h.beam.material.uniforms.color.value);
        h.lens.emissive.copy(h.beam.material.uniforms.color.value);
        h.beam.setStrength(0.35 * ambience.night * (0.7 + 0.3 * beat));
      }
      // Laser fan: sweeps side to side and tilts, blinking with the beat in bursts.
      const burst = Math.sin(t * 0.5) > -0.2 ? 1 : 0;
      rays.forEach((r, i) => {
        const a = (i - 4) * 0.09 + Math.sin(t * 1.3) * 0.5;
        dir.set(Math.sin(a), -0.08 + Math.sin(t * 0.8) * 0.12, Math.cos(a));
        r.aim(dir);
        const ry = dir.y / dir.length();
        const reach = ry < -0.02 ? Math.min(40, (top - 0.3) / -ry) : 40;
        r.mesh.scale.y = reach;
        r.setStrength(0.9 * ambience.night * burst);
      });
      partyColor(t * 1.5, 0.3, wash.color);
      wash.intensity = 25 * on * (0.6 + 0.4 * beat);
    });
  },

  /** A pair of PA cabinets: a sub below and a top with horn and woofer. */
  speakerStack: (k, p) => {
    const box = P.paint(0x141517);
    const grille = P.netMesh();
    k.rbox(p.w, 0.75, p.d, 0.02, 0, 0.375, 0, box);
    k.cyl(0.27, 0.27, 0.02, 0, 0.38, p.d / 2 + 0.005, P.rubber(), { rot: [Math.PI / 2, 0, 0], seg: 24 });
    k.cyl(0.09, 0.09, 0.03, 0, 0.38, p.d / 2 + 0.01, P.blackMetal(), { rot: [Math.PI / 2, 0, 0], seg: 16 });
    k.rbox(p.w * 0.92, 1.0, p.d * 0.9, 0.02, 0, 1.25, 0, box);
    k.cyl(0.2, 0.2, 0.02, 0, 1.05, p.d * 0.45 + 0.005, P.rubber(), { rot: [Math.PI / 2, 0, 0], seg: 24 });
    k.box(0.4, 0.16, 0.06, 0, 1.55, p.d * 0.45, P.blackMetal());
    k.box(p.w * 0.88, 0.94, 0.01, 0, 1.25, p.d * 0.45 + 0.02, grille, { castShadow: false });
    k.box(p.w * 0.6, 0.02, 0.02, 0, 1.78, p.d * 0.45 + 0.02, P.led(0x2aa0ff));
    k.box(0.04, 0.35, 0.04, 0, 1.92, 0, P.steel());
  },

  /** High cocktail table in a white stretch cover, with glasses and a candle. */
  cocktailTable: (k, p) => {
    const cloth = P.fabric(p.color ?? 0xf4f1ea);
    k.lathe([[0.3, 0], [0.14, 0.4], [0.1, 0.6], [0.16, 0.9], [0.4, 1.06], [0.4, 1.08], [0, 1.09]], 0, 0, 0, cloth, { seg: 28 });
    const glass = P.glass(0xe9f4ff, 0.35);
    for (const [x, z] of [[0.12, 0.08], [-0.1, 0.14], [0.02, -0.15]]) {
      k.lathe([[0.03, 0], [0.004, 0.01], [0.004, 0.11], [0.03, 0.14], [0.033, 0.26]], x, 1.09, z, glass, { seg: 12, castShadow: false });
      k.cyl(0.027, 0.03, 0.08, x, 1.25, z, P.emissive(0xf3d27a, 0.25), { seg: 10, castShadow: false });
    }
    k.cyl(0.04, 0.04, 0.08, -0.12, 1.13, -0.08, P.glass(0xffffff, 0.5), { seg: 12 });
    k.sphere(0.012, -0.12, 1.18, -0.08, P.emissive(0xffb347, 4), { seg: 6, castShadow: false });
  },

  /** Outdoor bar: LED-lit front, bottles and glassware, ice tubs, a back shelf and a neon sign. */
  partyBar: (k, p) => {
    const w = p.w;
    const top = P.marble(0x1e1e22);
    k.box(w, 0.06, 0.7, 0, 1.08, p.d / 2 - 0.35, top);
    k.box(w, 1.05, 0.08, 0, 0.525, p.d / 2 - 0.04, P.blackMetal());
    k.box(w, 1.05, 0.6, 0, 0.525, p.d / 2 - 0.33, P.paint(0x101114));
    // Back shelf with bottles.
    k.box(w, 2.2, 0.3, 0, 1.1, -p.d / 2 + 0.15, P.paint(0x101114));
    for (const y of [1.25, 1.7]) {
      k.box(w - 0.1, 0.03, 0.28, 0, y, -p.d / 2 + 0.15, P.glass(0xffffff, 0.5));
      for (let i = 0; i < 16; i++) {
        const x = -w / 2 + 0.15 + i * (w - 0.3) / 15;
        const colors = [0x3b6e2a, 0x7a3b12, 0xd9d2c5, 0x23324a, 0x6e1420, 0x998c3a];
        const c = colors[(i * 7 + Math.round(y * 10)) % colors.length];
        k.cyl(0.035, 0.035, 0.24, x, y + 0.14, -p.d / 2 + 0.15, P.glass(c, 0.75), { seg: 10 });
        k.cyl(0.012, 0.03, 0.08, x, y + 0.3, -p.d / 2 + 0.15, P.glass(c, 0.75), { seg: 8 });
      }
    }
    // Ice tubs with bottles, glass rows.
    for (const sx of [-1, 1]) {
      k.cyl(0.22, 0.18, 0.2, sx * w * 0.3, 1.21, p.d / 2 - 0.35, P.steel(), { seg: 20, open: true });
      k.cyl(0.2, 0.2, 0.02, sx * w * 0.3, 1.27, p.d / 2 - 0.35, P.glass(0xeaf6ff, 0.6), { seg: 20 });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6;
        k.cyl(0.035, 0.035, 0.3, sx * w * 0.3 + Math.cos(a) * 0.1, 1.3, p.d / 2 - 0.35 + Math.sin(a) * 0.1, P.glass(0x1d4d22, 0.8), { seg: 10, rot: [0.15, 0, 0.1 * sx] });
      }
    }
    for (let i = 0; i < 10; i++) {
      k.lathe([[0.03, 0], [0.004, 0.01], [0.004, 0.08], [0.035, 0.1], [0.04, 0.16]], -0.6 + i * 0.13, 1.11, p.d / 2 - 0.2, P.glass(0xeef6ff, 0.35), { seg: 10, castShadow: false });
    }
    const fx = new THREE.Group();
    const strip = ownEmissive(0x00c8ff, 3);
    part(fx, new THREE.BoxGeometry(w - 0.1, 0.04, 0.02), strip, 0, 0.06, p.d / 2 + 0.005, false);
    part(fx, new THREE.BoxGeometry(w - 0.1, 0.03, 0.02), strip, 0, 1.03, p.d / 2 + 0.005, false);
    const sign = new THREE.MeshBasicMaterial({ map: signTexture('BAR', '#ff3fb4'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    part(fx, new THREE.PlaneGeometry(1.2, 1.2), sign, 0, 2.35, -p.d / 2 + 0.31, false);
    const glow = new THREE.PointLight(0x00c8ff, 6, 5, 1.8);
    glow.position.set(0, 0.6, p.d / 2 + 0.6);
    fx.add(glow);
    k.dynamic(fx, (_dt, t) => {
      partyColor(t, 0.55, strip.emissive);
      glow.color.copy(strip.emissive);
      glow.intensity = 6 * Math.max(0.3, ambience.night);
    });
  },

  /** A pyramid of coupes on a round, cloth-covered table, bottles of champagne alongside. */
  champagneTower: (k, _p) => {
    k.cyl(0.5, 0.5, 0.75, 0, 0.375, 0, P.fabric(0xf6f3ec), { seg: 32 });
    k.cyl(0.52, 0.52, 0.02, 0, 0.76, 0, P.fabric(0xf6f3ec), { seg: 32 });
    const glass = P.glass(0xf3f8ff, 0.3);
    const wine = P.glass(0xf2cf6b, 0.75);
    const coupe: [number, number][] = [[0.035, 0], [0.004, 0.008], [0.004, 0.08], [0.02, 0.085], [0.05, 0.1], [0.055, 0.115]];
    let y = 0.77;
    for (let level = 5; level >= 1; level--) {
      const off = (level - 1) * 0.055;
      for (let i = 0; i < level; i++) for (let j = 0; j < level; j++) {
        const x = -off + i * 0.11;
        const z = -off + j * 0.11;
        k.lathe(coupe, x, y, z, glass, { seg: 10, castShadow: false });
        k.cyl(0.045, 0.02, 0.02, x, y + 0.1, z, wine, { seg: 10, castShadow: false });
      }
      y += 0.115;
    }
    for (const [x, z] of [[0.36, 0.22], [-0.34, 0.26]]) {
      k.cyl(0.045, 0.045, 0.25, x, 0.9, z, P.glass(0x173a1b, 0.85), { seg: 12 });
      k.cyl(0.015, 0.042, 0.1, x, 1.07, z, P.glass(0x173a1b, 0.85), { seg: 10 });
      k.cyl(0.017, 0.017, 0.05, x, 1.14, z, P.gold(), { seg: 8 });
    }
  },

  /** An arch of balloon clusters in gold, white and black. */
  balloonArch: (k, p) => {
    const mats = [P.gold(), P.lacquer(0xf6f3ec), P.lacquer(0x111114), P.chrome()];
    const steps = 46;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI;
      const cx = -Math.cos(a) * p.w / 2;
      const cy = Math.sin(a) * (p.h - 0.3) + 0.15;
      for (let j = 0; j < 4; j++) {
        const r = 0.11 + rnd() * 0.09;
        k.sphere(r, cx + (rnd() - 0.5) * 0.3, cy + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.35, mats[Math.floor(rnd() * mats.length)], { seg: 14, scale: [1, 1.12, 1] });
      }
    }
    for (const sx of [-1, 1]) k.box(0.3, 0.06, 0.3, sx * p.w / 2, 0.03, 0, P.gold());
  },

  /** Red carpet runner with brass stanchions and velvet ropes along both sides. */
  redCarpet: (k, p) => {
    k.box(p.w, 0.015, p.d, 0, 0.008, 0, P.velvet(0x8e0f1c));
    for (const sx of [-1, 1]) k.box(0.05, 0.016, p.d, sx * (p.w / 2 - 0.06), 0.009, 0, P.gold());
    const posts = Math.max(2, Math.round(p.d / 1.6) + 1);
    for (const sx of [-1, 1]) {
      const x = sx * (p.w / 2 + 0.3);
      let prev: [number, number, number] | null = null;
      for (let i = 0; i < posts; i++) {
        const z = -p.d / 2 + (i / (posts - 1)) * p.d;
        k.cyl(0.16, 0.18, 0.04, x, 0.02, z, P.brass(), { seg: 18 });
        k.cyl(0.025, 0.025, 0.95, x, 0.5, z, P.brass(), { seg: 10 });
        k.sphere(0.045, x, 0.98, z, P.brass(), { seg: 10 });
        const pt: [number, number, number] = [x, 0.93, z];
        if (prev) {
          const mid: [number, number, number] = [x, 0.72, (prev[2] + z) / 2];
          k.rod(0.022, prev, mid, P.velvet(0x8e0f1c), 8);
          k.rod(0.022, mid, pt, P.velvet(0x8e0f1c), 8);
        }
        prev = pt;
      }
    }
  },

  /** Valet podium with a lamp, a key cabinet and a sign. */
  valetStand: (k, _p) => {
    k.lathe([[0.3, 0], [0.22, 0.05], [0.2, 1.0], [0.3, 1.05], [0.3, 1.08], [0, 1.08]], 0, 0, 0, P.walnut(), { seg: 4, rot: [0, Math.PI / 4, 0] });
    k.box(0.36, 0.02, 0.3, 0, 1.1, 0, P.leather(0x1a1a1a), { rot: [0.25, 0, 0] });
    k.box(0.3, 0.3, 0.05, 0, 0.7, -0.22, P.brass());
    for (let i = 0; i < 6; i++) k.box(0.02, 0.05, 0.01, -0.1 + (i % 3) * 0.1, 0.62 + Math.floor(i / 3) * 0.12, -0.25, P.blackMetal());
    k.cyl(0.01, 0.01, 0.25, 0.12, 1.22, 0.05, P.brass(), { seg: 6 });
    k.sphere(0.04, 0.12, 1.35, 0.05, P.emissive(0xffd9a0, 3), { seg: 10, castShadow: false });
    const sign = new THREE.MeshStandardMaterial({ map: signTexture('VALET', '#f5d27a'), roughness: 0.4 });
    k.mesh(new THREE.PlaneGeometry(0.4, 0.4), 0, 0.55, 0.24, sign, { castShadow: false });
  },

  /** Glowing LED orb that slowly shifts colour; variant 1 floats on water and bobs. */
  ledOrb: (k, p) => {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, emissive: 0xff00aa, emissiveIntensity: 1.6, roughness: 0.3, transmission: 0, clearcoat: 1 });
    const r = p.w / 2;
    part(g, new THREE.SphereGeometry(r, 24, 16), mat, 0, r, 0, false);
    const glow = createGlow(0xff00aa, p.w * 1.35, 0.7);
    glow.position.y = r;
    g.add(glow);
    const float = p.variant === 1;
    const offset = Math.random();
    k.dynamic(g, (_dt, t) => {
      partyColor(t * 0.8, offset, mat.emissive);
      glow.material.color.copy(mat.emissive).multiplyScalar(0.7 * Math.max(0.3, ambience.night));
      if (float) {
        g.position.y = Math.sin(t * 1.3 + offset * 10) * 0.03;
        g.rotation.z = Math.sin(t * 0.9 + offset * 5) * 0.08;
      }
    });
  },

  /** Mirror ball hanging 1 m below the ceiling (piece height = ceiling height), turning, picked out by a pin spot. */
  discoBall: (k, p) => {
    const y = p.h - 1.0 - p.w / 2;
    k.cyl(0.006, 0.006, 1.0, 0, p.h - 0.5, 0, P.chrome(), { seg: 4 });
    const g = new THREE.Group();
    g.position.y = y;
    const facets = new THREE.IcosahedronGeometry(p.w / 2, 3);
    const mirror = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, flatShading: true, envMapIntensity: 1.6 });
    part(g, facets, mirror, 0, 0, 0);
    const sparkle = createGlow(0xffffff, p.w * 1.1, 0.25);
    g.add(sparkle);
    const spot = createBeam(0xffffff, 3.5, p.w * 0.6, 0.05, 0.1, 0.6);
    spot.mesh.position.set(1.6, 1.6, 1.0);
    spot.aim(new THREE.Vector3(-1.6, -1.6, -1.0));
    g.add(spot.mesh);
    k.dynamic(g, (dt, t) => {
      g.children[0].rotation.y += dt * 0.6;
      sparkle.material.opacity = 0.6 + 0.4 * Math.sin(t * 9);
    });
  },
};
