import * as THREE from 'three';
import { LAYER_EFFECTS } from '../core/layers';

/**
 * Shared state for light effects: how dark it is (0 day .. 1 night). World.update keeps it current,
 * so searchlights and party lighting fade out in daylight, where their beams wouldn't show.
 */
export const ambience = { night: 1 };

const VERT = /* glsl */ `
  varying float vAlong;
  varying float vEdge;
  varying float vDepth;
  void main() {
    // The cone runs along +y from 0 (source) to 1 (far end).
    vAlong = position.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    // Facing the camera = the middle of the beam; grazing = its soft edge.
    vEdge = abs(dot(n, normalize(-mv.xyz)));
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  uniform float falloff;
  varying float vAlong;
  varying float vEdge;
  varying float vDepth;
  void main() {
    float core = pow(clamp(vEdge, 0.0, 1.0), 2.2);
    // Clamped: pow() of a negative number is NaN, which post-processing smears into black squares.
    float fade = pow(clamp(1.0 - vAlong, 0.0, 1.0), falloff) * smoothstep(0.0, 0.03, vAlong + 0.01);
    // Fade out right in front of the camera so walking through a beam doesn't flash the screen.
    float near = smoothstep(0.3, 2.0, vDepth);
    gl_FragColor = vec4(color * core * fade * near * strength, 1.0);
  }
`;

const coneCache = new Map<string, THREE.BufferGeometry>();

/** Unit cone along +y (radius r0 at the source, 1 at the end), length 1; scale it per beam. */
function cone(r0: number): THREE.BufferGeometry {
  const key = r0.toFixed(3);
  let g = coneCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(1, r0, 1, 28, 1, true);
    g.translate(0, 0.5, 0);
    coneCache.set(key, g);
  }
  return g;
}

export interface Beam {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  /** Points the beam (it shines along its local +y). */
  aim(dir: THREE.Vector3): void;
  setStrength(s: number): void;
}

/**
 * A visible shaft of light, additive and soft-edged, fading with distance.
 * @param length meters; @param spread end radius in meters; @param source radius at the lamp
 */
export function createBeam(color: number, length: number, spread: number, source: number, strength = 1, falloff = 1.6): Beam {
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, falloff: { value: falloff } },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(cone(source / spread), material);
  mesh.scale.set(spread, length, spread);
  mesh.layers.set(LAYER_EFFECTS);
  mesh.castShadow = false;
  mesh.renderOrder = 3;
  const up = new THREE.Vector3(0, 1, 0);
  return {
    mesh, material,
    aim(dir) { mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize()); },
    setStrength(s) { material.uniforms.strength.value = s; },
  };
}

/** A soft round glow (lens flare-ish halo) for lamps, seen from any side. */
export function createGlow(color: number, size: number, strength = 1): THREE.Sprite {
  const tex = glowTexture();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color: new THREE.Color(color).multiplyScalar(strength), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
  }));
  s.scale.setScalar(size);
  s.layers.set(LAYER_EFFECTS);
  return s;
}

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Party colour cycle: smooth hue sweep, offset per fixture. */
export function partyColor(t: number, offset: number, target: THREE.Color): THREE.Color {
  return target.setHSL(((t * 0.05 + offset) % 1 + 1) % 1, 0.9, 0.55);
}
