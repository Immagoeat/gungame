import * as THREE from 'three';
import { LAYER_EFFECTS } from '../core/layers';
import { canvasTexture } from './textures';

/**
 * Real-time fire: tongues of flame drawn by a noise shader (they lick, sway and break up into wisps
 * at the tips, white-hot at the core through yellow and orange to dull red at the edges), a glowing
 * ember bed and sparks for wood fires, blue roots for gas, and a light that flickers, shifts colour
 * and moves a little so shadows dance. Everything animates on the GPU from one time uniform.
 */

export interface FireOptions {
  kind: 'wood' | 'gas';
  /** Footprint the flames rise from (meters). With `ring`, flames sit on a ring of this radius instead. */
  width: number;
  depth: number;
  ring?: number;
  /** Typical flame height (meters). */
  height: number;
  tongues: number;
  /** Light strength at its brightest. */
  light: number;
  lightRange: number;
}

export interface Fire {
  object: THREE.Group;
  update(time: number): void;
}

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }
`;

const FLAME_VERT = /* glsl */ `
  attribute vec2 corner;
  attribute vec3 center;
  attribute vec2 size;
  attribute float seed;
  uniform float time;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vec3 base = (modelMatrix * vec4(center, 1.0)).xyz;
    // Turn to face the camera around the vertical, so the flame always shows its full shape.
    vec3 toCam = cameraPosition - base;
    vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x) + vec3(1e-5, 0.0, 0.0));
    // Each tongue swells and shrinks on its own rhythm and leans with the draught.
    float pulse = 0.82 + 0.2 * sin(time * (4.0 + seed * 3.0) + seed * 40.0) + 0.1 * sin(time * 11.0 + seed * 7.0);
    float h = size.y * pulse;
    float sway = (0.6 * sin(time * 2.1 + seed * 11.0) + 0.4 * sin(time * 4.7 + seed * 3.0)) * 0.14 * h;
    vec3 p = base + right * (corner.x * size.x + sway * corner.y * corner.y) + vec3(0.0, corner.y * h, 0.0);
    vUv = vec2(corner.x + 0.5, corner.y);
    vSeed = seed;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const FLAME_FRAG = /* glsl */ `
  uniform float time;
  uniform float gas;
  uniform float intensity;
  varying vec2 vUv;
  varying float vSeed;
  ${NOISE}
  void main() {
    float y = vUv.y;
    // Turbulence scrolls upwards; finer, faster detail rides on top.
    float n = fbm(vec2(vUv.x * 2.5 + vSeed * 17.0, y * 2.0 - time * (2.4 + gas * 1.2)));
    float n2 = fbm(vec2(vUv.x * 5.0 - vSeed * 5.0, y * 4.0 - time * (4.0 + gas * 2.0)));
    // Teardrop that narrows to a tip and licks sideways more the higher it goes.
    float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 1.1 * y;
    float width = mix(0.9, 0.08, pow(y, 1.3));
    float body = 1.0 - smoothstep(width * 0.25, width, abs(x));
    // Ragged top: the tongue tears off into wisps.
    float top = smoothstep(0.0, 0.3, (1.0 - y) - (n2 - 0.5) * 0.7 - (n - 0.5) * 0.5);
    float root = smoothstep(0.0, 0.1, y);
    // Hottest low in the middle, cooling outwards and upwards.
    float heat = body * top * root * (1.0 - y * 0.55) * (0.65 + n2 * 0.6) * (1.0 - abs(x) * 0.5);
    if (heat < 0.03) discard;
    vec3 col = mix(vec3(0.45, 0.04, 0.0), vec3(0.95, 0.25, 0.02), smoothstep(0.03, 0.3, heat));
    col = mix(col, vec3(1.0, 0.55, 0.1), smoothstep(0.3, 0.6, heat));
    col = mix(col, vec3(1.0, 0.8, 0.4), smoothstep(0.6, 0.9, heat));
    col = mix(col, vec3(1.0, 0.95, 0.85), smoothstep(0.95, 1.2, heat));
    // Gas burns blue at the root.
    // Gas burns blue right at the root, faint and see-through.
    float blue = gas * (1.0 - smoothstep(0.02, 0.12, y));
    col = mix(col, vec3(0.1, 0.25, 1.0), blue);
    float a = smoothstep(0.03, 0.65, heat) * (1.0 - blue * 0.65);
    gl_FragColor = vec4(col * a * intensity, 1.0);
  }
`;

const SPARK_VERT = /* glsl */ `
  attribute float seed;
  attribute vec3 start;
  uniform float time;
  uniform float rise;
  varying float vLife;
  varying float vSeed;
  void main() {
    float speed = 0.25 + fract(seed * 7.13) * 0.45;
    float life = fract(time * speed + seed);
    vec3 p = start;
    p.y += life * rise * (0.6 + fract(seed * 3.7) * 0.8);
    p.x += sin(time * 3.0 + seed * 20.0) * 0.04 * life + (fract(seed * 5.3) - 0.5) * 0.25 * life;
    p.z += cos(time * 2.3 + seed * 13.0) * 0.04 * life + (fract(seed * 9.1) - 0.5) * 0.15 * life;
    vLife = life;
    vSeed = seed;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = 9.0 * (1.0 - life * 0.6) / max(0.2, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPARK_FRAG = /* glsl */ `
  uniform float time;
  varying float vLife;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    // Sparks twinkle as they cool from yellow to red.
    float twinkle = 0.6 + 0.4 * sin(time * 30.0 + vSeed * 100.0);
    vec3 col = mix(vec3(1.0, 0.8, 0.35), vec3(1.0, 0.22, 0.02), vLife);
    float a = (1.0 - d * 2.0) * (1.0 - vLife) * twinkle;
    gl_FragColor = vec4(col * a * 4.0, 1.0);
  }
`;

const EMBER_FRAG = /* glsl */ `
  uniform float time;
  uniform float intensity;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 c = vUv - 0.5;
    float edge = 1.0 - smoothstep(0.3, 0.5, length(c * vec2(1.0, 1.6)));
    // Coals: dark char with cracks of glowing heat that slowly breathe.
    float cells = fbm(vUv * vec2(14.0, 7.0));
    float breathe = fbm(vUv * vec2(6.0, 3.0) + vec2(time * 0.2, -time * 0.13));
    float glow = smoothstep(0.42, 0.72, cells) * (0.45 + 0.8 * breathe) * edge;
    vec3 col = mix(vec3(0.03, 0.025, 0.02), vec3(1.0, 0.26, 0.03) * 2.2 * intensity, glow);
    gl_FragColor = vec4(col, edge);
  }
`;

const GLASS_GLOW_FRAG = /* glsl */ `
  uniform float time;
  uniform float intensity;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float flick = fbm(vUv * 5.0 + vec2(time * 0.7, -time * 0.5));
    float g = (1.0 - smoothstep(0.1, 1.0, d)) * (0.5 + 0.7 * flick);
    // Glints off individual pieces of glass.
    float glint = step(0.82, noise(vUv * 60.0)) * (0.5 + 0.5 * sin(time * 9.0 + vUv.x * 80.0));
    gl_FragColor = vec4(vec3(1.0, 0.42, 0.08) * (g * 0.55 + glint * g * 0.8) * intensity, 1.0);
  }
`;

const PLAIN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/** Smooth 1D random wiggle in 0..1 (for the light). */
function wiggle(seed: number): (t: number) => number {
  const r = Array.from({ length: 256 }, () => Math.random());
  return t => {
    const x = t + seed * 37;
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return r[i & 255] * (1 - s) + r[(i + 1) & 255] * s;
  };
}

/** A fire whose flames rise from y = 0 in its local space. */
export function createFire(o: FireOptions): Fire {
  const group = new THREE.Group();
  const gas = o.kind === 'gas';
  const uniforms = { time: { value: 0 }, gas: { value: gas ? 1 : 0 }, intensity: { value: gas ? 1.1 : 1.3 } };

  // Flame tongues: one quad each, all in one draw call.
  const n = o.tongues;
  const corner = new Float32Array(n * 4 * 2);
  const center = new Float32Array(n * 4 * 3);
  const size = new Float32Array(n * 4 * 2);
  const seed = new Float32Array(n * 4);
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    let cx: number;
    let cz: number;
    if (o.ring) {
      // Spread over the burner, denser towards its ring.
      const a = (i / n) * Math.PI * 2 * 2.618 + Math.random() * 0.3;
      const r = o.ring * Math.sqrt(0.15 + 0.85 * Math.random());
      cx = Math.cos(a) * r;
      cz = Math.sin(a) * r;
    } else {
      // Tallest in the middle, smaller towards the ends.
      cx = (Math.random() - 0.5) * o.width;
      cz = (Math.random() - 0.5) * o.depth;
    }
    const middle = o.ring ? 1 : 1 - Math.abs(cx) / (o.width / 2) * 0.55;
    const h = o.height * (0.55 + Math.random() * 0.6) * middle;
    const w = h * (gas ? 0.75 : 0.75) * (0.8 + Math.random() * 0.4);
    const s = Math.random();
    const corners = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]];
    corners.forEach(([x, y], k) => {
      const v = i * 4 + k;
      corner.set([x, y], v * 2);
      center.set([cx, 0, cz], v * 3);
      size.set([w, h], v * 2);
      seed[v] = s;
    });
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('center', new THREE.BufferAttribute(center, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 2));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  // Three needs a position attribute for bounds; the flames are placed in the shader.
  geo.setAttribute('position', new THREE.BufferAttribute(center.slice(), 3));
  geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, o.height / 2, 0), Math.max(o.width, o.ring ?? 0, o.height) * 1.5);
  const flames = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  flames.renderOrder = 2;
  group.add(flames);

  if (gas) {
    // The fire glass glows where the flames lick it.
    const r = (o.ring ?? 0.3) * 1.5;
    const glow = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.ShaderMaterial({
      uniforms, vertexShader: PLAIN_VERT, fragmentShader: GLASS_GLOW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.012;
    group.add(glow);
  } else {
    // Glowing coals under the logs.
    const embers = new THREE.Mesh(new THREE.PlaneGeometry(o.width * 1.25, o.depth * 1.6), new THREE.ShaderMaterial({
      uniforms, vertexShader: PLAIN_VERT, fragmentShader: EMBER_FRAG, transparent: true, depthWrite: false,
    }));
    embers.rotation.x = -Math.PI / 2;
    embers.position.y = -0.1;
    group.add(embers);

    // Sparks drifting up out of the fire.
    const count = 28;
    const sGeo = new THREE.BufferGeometry();
    const start = new Float32Array(count * 3);
    const sSeed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      start.set([(Math.random() - 0.5) * o.width * 0.8, 0.05, (Math.random() - 0.5) * o.depth * 0.8], i * 3);
      sSeed[i] = Math.random();
    }
    sGeo.setAttribute('position', new THREE.BufferAttribute(start.slice(), 3));
    sGeo.setAttribute('start', new THREE.BufferAttribute(start, 3));
    sGeo.setAttribute('seed', new THREE.BufferAttribute(sSeed, 1));
    sGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, o.height, 0), o.height * 2);
    const sparks = new THREE.Points(sGeo, new THREE.ShaderMaterial({
      uniforms: { time: uniforms.time, rise: { value: o.height * 1.4 } }, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    group.add(sparks);
  }
  group.traverse(c => { c.layers.set(LAYER_EFFECTS); c.castShadow = false; });

  // The light: an irregular flicker made of several wiggles, warmer when it dips, and a little
  // movement so the shadows it casts sway.
  const light = new THREE.PointLight(0xff8a3a, o.light, o.lightRange, 2);
  light.position.set(0, o.height * 0.45, 0);
  group.add(light);
  const slow = wiggle(1);
  const mid = wiggle(2);
  const fast = wiggle(3);
  const jx = wiggle(4);
  const jy = wiggle(5);
  const warm = new THREE.Color(0xff6a1f);
  const bright = new THREE.Color(0xffa64a);

  return {
    object: group,
    update(time: number) {
      uniforms.time.value = time;
      const f = 0.25 * slow(time * 1.3) + 0.4 * mid(time * 6.5) + 0.35 * fast(time * 17);
      const k = gas ? 0.82 + 0.25 * f : 0.62 + 0.55 * f;
      light.intensity = o.light * k;
      light.color.copy(warm).lerp(bright, THREE.MathUtils.clamp(f * 1.4 - 0.2, 0, 1));
      light.position.set((jx(time * 4) - 0.5) * 0.06, o.height * (0.4 + 0.15 * jy(time * 5)), (jy(time * 3 + 9) - 0.5) * 0.04);
      uniforms.intensity.value = (gas ? 1.1 : 1.3) * (0.85 + 0.25 * f);
    },
  };
}

let charred: THREE.MeshStandardMaterial | null = null;

/** Burning log: black char with cracks of glowing orange. Its glow is driven by `glowLogs`. */
export function charredLog(): THREE.MeshStandardMaterial {
  if (charred) return charred;
  const char = canvasTexture(256, (g, s) => {
    g.fillStyle = '#1b130d';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const v = 15 + Math.random() * 35;
      g.fillStyle = `rgb(${v},${v * 0.75},${v * 0.55})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 6, 1 + Math.random() * 3);
    }
  });
  // Alligator cracks in the char, which glow.
  const cracks = canvasTexture(256, (g, s) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#fff';
    for (let i = 0; i < 70; i++) {
      g.lineWidth = 0.8 + Math.random() * 2.2;
      g.globalAlpha = 0.4 + Math.random() * 0.6;
      g.beginPath();
      let x = Math.random() * s;
      let y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (Math.random() - 0.5) * 40;
        y += (Math.random() - 0.5) * 20;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  charred = new THREE.MeshStandardMaterial({
    map: char, roughness: 0.95, emissive: 0xff4a10, emissiveMap: cracks, emissiveIntensity: 1.5,
  });
  return charred;
}

/** Breathes the glow in the logs' cracks along with the flames. */
export function glowLogs(time: number): void {
  if (charred) charred.emissiveIntensity = 1.1 + 0.6 * (0.5 + 0.5 * Math.sin(time * 1.7) * Math.sin(time * 0.9 + 1));
}
