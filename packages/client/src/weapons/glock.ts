import * as THREE from 'three';
import type { Loadout } from '@gungame/shared';
import { Kit } from '../world/furniture/kit';
import { P } from '../world/furniture/palette';
import { canvasTexture } from '../world/textures';
import { normalMapFrom } from '../world/normalMaps';

/**
 * A Glock 17 (Gen5) built from its real side profiles: extruded slide and frame outlines with the
 * squared trigger guard, 20 degree grip, accessory rail, serrations, ejection port, sights and
 * markings. Real size, in gun space (-z forward, +y up, origin at the top of the grip).
 */

/** Profile in the side plane as [z, y] points, extruded `width` across the gun (centred on x = 0). */
function profile(k: Kit, pts: [number, number][], width: number, mat: THREE.Material, bevel = 0.0015, holes: [number, number][][] = []): void {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 4,
  });
  geo.translate(0, 0, -(width - 2 * bevel) / 2);
  // Shape x is the gun's z, shape y is up; the extrusion runs across the gun.
  geo.rotateY(-Math.PI / 2);
  k.mesh(geo, 0, 0, 0, mat);
}

/** The textured grip area of the frame, [z, y]. */
const GRIP_PANEL: [number, number][] = [
  [-0.019, 0.004], [-0.017, -0.01], [-0.008, -0.04], [0.006, -0.07], [0.015, -0.085], [0.058, -0.085], [0.048, -0.04], [0.039, -0.006], [0.035, 0.004],
];

let factory: { polymer: THREE.Material; slide: THREE.Material; barrel: THREE.Material; dark: THREE.Material; dot: THREE.Material; text: THREE.Material } | null = null;

/** Factory finish: stippled black polymer frame, matte nitrided slide. */
function factoryMaterials() {
  if (factory) return factory;
  // Stippling on the grip only, mapped once across the frame's side (its UVs are side-plane meters).
  const Z0 = -0.16, Z1 = 0.07, Y0 = -0.1, Y1 = 0.04, S = 1024;
  const stipple = canvasTexture(S, (g, size) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, size, size);
    const px = ([z, y]: [number, number]) => [((z - Z0) / (Z1 - Z0)) * size, (1 - (y - Y0) / (Y1 - Y0)) * size] as const;
    g.beginPath();
    GRIP_PANEL.forEach((p, i) => (i ? g.lineTo(...px(p)) : g.moveTo(...px(p))));
    g.closePath();
    g.clip();
    for (let i = 0; i < 26000; i++) {
      const v = 100 + Math.random() * 90;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  });
  const gripMap = (t: THREE.Texture) => {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(1 / (Z1 - Z0), 1 / (Y1 - Y0));
    t.offset.set(-Z0 / (Z1 - Z0), -Y0 / (Y1 - Y0));
    return t;
  };
  gripMap(stipple);
  const grain = canvasTexture(128, (g, s) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 3000; i++) {
      const v = 110 + Math.random() * 40;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1);
    }
  }, 25);
  const text = canvasTexture(512, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.fillStyle = 'rgba(200,202,206,0.85)';
    g.font = 'bold 56px Arial, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('GLOCK 17', 8, 36);
    g.font = '28px Arial, sans-serif';
    g.fillText('Gen5  AUSTRIA  9x19', 270, 38);
  });
  text.repeat.set(1, 1);
  text.offset.set(0, 0.86);
  text.repeat.set(1, 0.14);
  factory = {
    polymer: new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.72, metalness: 0, normalMap: gripMap(normalMapFrom(stipple, 2.5)) }),
    slide: new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.42, metalness: 0.7, normalMap: normalMapFrom(grain, 0.4) }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.32, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.6, metalness: 0.3 }),
    dot: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.4 }),
    text: new THREE.MeshStandardMaterial({ map: text, transparent: true, depthWrite: false, roughness: 0.6, metalness: 0.3 }),
  };
  return factory;
}

export interface GlockMounts {
  muzzle: THREE.Vector3;
  ironSight: THREE.Vector3;
  railY: number;
  railZ: number;
  under: THREE.Vector3;
  supportHand: THREE.Vector3;
}

/**
 * Builds the pistol into the kit. `finish` replaces the frame (and, for gold or patterned finishes,
 * the slide) when the player picks one other than Factory.
 */
export function buildGlock(k: Kit, loadout: Loadout, finish: { body: THREE.Material; metal: THREE.Material } | null, barrelExtra: number): GlockMounts {
  const f = factoryMaterials();
  const allOver = finish && ['gold', 'digital', 'tiger', 'carbon', 'damascus'].includes(loadout.skin ?? '');
  const frame = finish ? finish.body : f.polymer;
  const slide = allOver ? finish!.body : f.slide;
  const boreY = 0.045;
  const front = -0.156;

  // Slide: flat top, chamfered rear edge, Gen5 bevelled nose.
  profile(k, [[0.03, 0.031], [0.03, 0.058], [0.027, 0.0612], [-0.14, 0.0612], [front, 0.053], [front, 0.031]], 0.0255, slide);
  // Rear and front cocking serrations, both sides.
  for (let z = 0.004; z <= 0.026; z += 0.0036) k.box(0.0262, 0.023, 0.0014, 0, 0.0455, z, f.dark);
  for (let z = -0.137; z <= -0.12; z += 0.0036) k.box(0.0262, 0.021, 0.0014, 0, 0.0445, z, f.dark);
  // Ejection port with the barrel hood showing, extractor on the right.
  k.box(0.019, 0.0012, 0.04, 0.0025, 0.0612, -0.03, f.dark);
  k.box(0.0155, 0.0016, 0.037, 0.0025, 0.0614, -0.031, f.barrel);
  k.box(0.0012, 0.011, 0.04, 0.0124, 0.0545, -0.03, f.dark);
  k.box(0.0016, 0.004, 0.014, 0.0128, 0.052, -0.004, f.slide);
  // Muzzle: bore and barrel crown inside the slide nose.
  k.cyl(0.0058, 0.0058, 0.003, 0, boreY, front - 0.0002, f.barrel, { rot: [Math.PI / 2, 0, 0], seg: 18 });
  k.cyl(0.0045, 0.0045, 0.0035, 0, boreY, front - 0.0004, f.dark, { rot: [Math.PI / 2, 0, 0], seg: 14 });
  // Slide cover plate on the back.
  k.box(0.012, 0.02, 0.0012, 0, 0.0455, 0.0306, f.polymer);
  // Markings on the left of the slide.
  const plate = new THREE.PlaneGeometry(0.062, 0.0075);
  plate.rotateY(-Math.PI / 2);
  k.mesh(plate, -0.01295, 0.051, -0.092, f.text, { castShadow: false });

  // Sights: U-notch rear with a white outline, dot front.
  k.box(0.016, 0.004, 0.01, 0, 0.0632, 0.021, f.dark);
  for (const sx of [-1, 1]) {
    k.box(0.0055, 0.0042, 0.01, sx * 0.0052, 0.0672, 0.021, f.dark);
    k.box(0.0035, 0.0028, 0.0006, sx * 0.0047, 0.0668, 0.0262, f.dot, { castShadow: false });
  }
  k.box(0.004, 0.006, 0.0045, 0, 0.0642, -0.149, f.dark);
  k.sphere(0.0011, 0, 0.0652, -0.1466, f.dot, { seg: 8, castShadow: false });

  // Frame: dust cover, grip at 20 degrees with a flared magazine well and a beavertail.
  profile(k, [
    [-0.15, 0.031], [-0.15, 0.016], [-0.066, 0.014], [-0.06, 0.013], [-0.024, 0.012], [-0.02, 0.008],
    [-0.017, -0.01], [-0.008, -0.04], [0.006, -0.07], [0.016, -0.088], [0.019, -0.093], [0.061, -0.093],
    [0.062, -0.086], [0.05, -0.04], [0.04, -0.005], [0.035, 0.01], [0.043, 0.019], [0.042, 0.026], [0.03, 0.031],
  ], 0.029, frame, 0.0025);
  // Squared trigger guard.
  profile(k, [[-0.064, 0.014], [-0.069, 0.003], [-0.069, -0.008], [-0.064, -0.0145], [-0.026, -0.013], [-0.018, -0.004], [-0.02, 0.008]],
    0.0135, frame, 0.0015, [[[-0.061, 0.0105], [-0.024, 0.0105], [-0.023, -0.002], [-0.027, -0.008], [-0.058, -0.009], [-0.062, -0.006]]]);
  // Accessory rail under the dust cover.
  k.box(0.02, 0.004, 0.05, 0, 0.0128, -0.122, frame);
  for (let i = 0; i < 3; i++) k.box(0.0205, 0.0025, 0.004, 0, 0.0118, -0.108 - i * 0.012, f.dark);
  // Trigger with its safety blade.
  profile(k, [[-0.04, 0.012], [-0.0445, 0.002], [-0.0435, -0.006], [-0.039, -0.0075], [-0.0365, -0.002], [-0.036, 0.012]], 0.0072, f.dark, 0.001);
  k.box(0.0026, 0.012, 0.003, 0, 0.002, -0.0418, f.polymer);
  // Controls: slide stop and magazine release (left), takedown lever (both sides).
  k.box(0.002, 0.004, 0.02, -0.0152, 0.033, -0.027, f.dark);
  k.box(0.003, 0.008, 0.009, -0.0153, 0.003, -0.015, f.dark);
  for (const sx of [-1, 1]) k.box(0.0022, 0.004, 0.008, sx * 0.0147, 0.0255, -0.058, f.dark);

  // Magazine floorplate, or an extension.
  const mag = loadout.magazine ?? 'standard-mag';
  const floorZ = 0.04;
  let floorY = -0.096;
  if (mag === 'extended-mag') {
    k.box(0.026, 0.034, 0.045, 0, -0.11, floorZ, f.dark, { rot: [-0.35, 0, 0] });
    floorY = -0.129;
  }
  k.rbox(0.032, 0.007, 0.05, 0.002, 0, floorY, floorZ + (mag === 'extended-mag' ? 0.006 : 0), f.polymer);
  if (mag === 'fast-mag') k.box(0.012, 0.01, 0.012, 0, floorY - 0.008, floorZ + 0.02, P.paint(0xd62828));

  // Threaded barrel sticking out of the slide.
  let muzzleZ = front;
  if (barrelExtra > 0) {
    const len = barrelExtra * 0.4;
    k.cyl(0.0062, 0.0062, len, 0, boreY, front - len / 2, f.barrel, { rot: [Math.PI / 2, 0, 0], seg: 16 });
    for (let i = 0; i < 6; i++) k.torus(0.0062, 0.0006, 0, boreY, front - len + 0.003 + i * 0.003, f.barrel, { seg: 16 });
    muzzleZ -= len;
  }

  return {
    muzzle: new THREE.Vector3(0, boreY, muzzleZ),
    ironSight: new THREE.Vector3(0, 0.0665, 0.021),
    railY: 0.0612,
    railZ: -0.012,
    under: new THREE.Vector3(0, 0.0128, -0.122),
    supportHand: new THREE.Vector3(-0.022, -0.045, 0.015),
  };
}
