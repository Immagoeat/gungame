import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GodRaysPass } from './GodRaysPass';
import { LAYER_SCREENS } from './layers';

export type Quality = 'low' | 'medium' | 'high';

/** How strongly materials reflect the sky environment map (materials can override via userData.envIntensity). */
const ENV_INTENSITY = 0.28;
const DAY_FOG = new THREE.Color(0xc6d6e4);
const DUSK_FOG = new THREE.Color(0xd8a98a);
const NIGHT_FOG = new THREE.Color(0x0c1424);
const SUN_DAY = new THREE.Color(0xfff1dd);
const SUN_LOW = new THREE.Color(0xffa860);
const MOON = new THREE.Color(0x9bb4ff);

const SANITIZE = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // NaN fails every comparison, so this catches NaN and infinity alike.
      bool ok = all(lessThan(abs(c.rgb), vec3(6.0e4))) && all(greaterThanEqual(c.rgb, vec3(-1.0)));
      gl_FragColor = ok ? c : vec4(0.0, 0.0, 0.0, 1.0);
    }
  `,
};

const NIGHT_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position + cameraPosition, 1.0);
    gl_Position = p.xyww;
  }
`;

const NIGHT_FRAG = /* glsl */ `
  uniform float night;
  uniform vec3 moonDir;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    // Navy at the horizon (city glow), near black overhead.
    vec3 col = mix(vec3(0.035, 0.05, 0.1), vec3(0.004, 0.007, 0.018), pow(h, 0.45));
    col += vec3(0.06, 0.035, 0.05) * pow(1.0 - h, 8.0);
    // Stars: a sparse grid of points of varying brightness, fading near the horizon haze.
    vec3 cell = floor(d * 260.0);
    float star = step(0.9965, hash(cell)) * smoothstep(0.05, 0.3, h);
    vec3 f = fract(d * 260.0) - 0.5;
    star *= smoothstep(0.45, 0.0, length(f)) * (0.4 + 0.6 * hash(cell + 3.1));
    col += vec3(0.85, 0.9, 1.0) * star;
    // Moon and its halo.
    float m = max(dot(d, normalize(moonDir)), 0.0);
    col += vec3(0.9, 0.93, 1.0) * smoothstep(0.9993, 0.9996, m) * 1.5 + vec3(0.12, 0.14, 0.2) * pow(m, 60.0);
    gl_FragColor = vec4(col, night);
  }
`;

/**
 * Owns the renderer, the world scene, a separate first-person weapon scene, post-processing
 * (ambient occlusion, bloom, anti-aliasing) and the sun/sky for the current time of day.
 */
export class Graphics {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  /** Drawn after the world with a cleared depth buffer, so the gun never clips into walls. */
  readonly weaponScene = new THREE.Scene();
  readonly weaponCamera: THREE.PerspectiveCamera;
  /** Brief light at the player's position for muzzle flashes. */
  readonly flashLight = new THREE.PointLight(0xffb060, 0, 14, 2);

  /** 0..1: how dark it is (0 = full day, 1 = night). Lights and lamps react to this. */
  night = 0;
  hours = 15;

  private readonly sky = new Sky();
  /** Dark starry dome blended over the sky after sunset. */
  private readonly nightSky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly envSky = new Sky();
  private readonly envScene = new THREE.Scene();
  private readonly pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private readonly sun = new THREE.DirectionalLight(0xfff1dd, 2.4);
  private readonly hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a5040, 0.35);
  private composer: EffectComposer | null = null;
  private godRays: GodRaysPass | null = null;
  /** Follows the main camera but leaves out shadow-proxy layers, so the player's invisible body doesn't darken the view. */
  private readonly aoCamera = new THREE.PerspectiveCamera();
  private readonly airFog = new THREE.Fog(DAY_FOG.clone(), 70, 260);
  private readonly waterFog = new THREE.Fog(0x15505f, 0.3, 13);
  private underwater = false;
  private quality: Quality = 'high';

  constructor(container: HTMLElement, quality: Quality) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.82;
    r.autoClear = false;
    container.appendChild(r.domElement);
    this.renderer = r;

    const aspect = innerWidth / innerHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.05, 1200);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.weaponCamera = new THREE.PerspectiveCamera(65, aspect, 0.01, 10);

    // Physically based sky; a copy renders into the environment map so metal, glass and water reflect it.
    for (const s of [this.sky, this.envSky]) {
      s.scale.setScalar(900);
      const u = s.material.uniforms;
      u.turbidity.value = 3.5;
      u.rayleigh.value = 1.1;
      u.mieCoefficient.value = 0.004;
      u.mieDirectionalG.value = 0.85;
    }
    this.scene.add(this.sky);
    this.nightSky = new THREE.Mesh(new THREE.SphereGeometry(880, 48, 24), new THREE.ShaderMaterial({
      uniforms: { night: { value: 0 }, moonDir: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: NIGHT_VERT, fragmentShader: NIGHT_FRAG,
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    }));
    this.nightSky.renderOrder = -1;
    this.nightSky.frustumCulled = false;
    this.scene.add(this.nightSky);
    this.envScene.add(this.envSky);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.scene.fog = this.airFog;

    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    Object.assign(this.sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 200 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(this.flashLight);

    this.weaponScene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const wLight = new THREE.DirectionalLight(0xffffff, 2.2);
    wLight.position.set(1, 2, 1);
    this.weaponScene.add(wLight);

    this.setQuality(quality);
    this.setTimeOfDay(15);
    addEventListener('resize', () => this.resize());
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const r = this.renderer;
    r.setPixelRatio(q === 'low' ? 1 : Math.min(devicePixelRatio, 2));
    const shadowSize = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.composer?.dispose();
    this.composer = null;
    this.godRays?.dispose();
    this.godRays = null;
    if (q === 'low') return;

    const w = innerWidth;
    const h = innerHeight;
    const composer = new EffectComposer(r);
    // Both ping-pong targets share one depth texture, so passes after the render pass can read the
    // scene depth (god rays need it).
    const depth = new THREE.DepthTexture(composer.renderTarget1.width, composer.renderTarget1.height);
    composer.renderTarget1.depthTexture = depth;
    composer.renderTarget2.depthTexture = depth;
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (q === 'high') {
      this.aoCamera.layers.set(0);
      this.aoCamera.layers.enable(LAYER_SCREENS);
      const ao = new GTAOPass(this.scene, this.aoCamera, w, h);
      ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1.2 });
      ao.blendIntensity = 0.85;
      composer.addPass(ao);
    }
    // Sunlight in the air, after ambient occlusion so the beams themselves aren't shaded.
    this.godRays = new GodRaysPass(this.camera, this.sun, q === 'high' ? 48 : 28);
    this.godRays.depthTexture = depth;
    this.godRays.strength = this.underwater ? 0 : 1;
    composer.addPass(this.godRays);
    // Safety net: any invalid pixel (NaN/infinity from a shader edge case) becomes black here, instead
    // of being spread by bloom into flashing black squares.
    composer.addPass(new ShaderPass(SANITIZE));
    // High threshold: only genuinely bright things (lamps, fire, screens) glow; the sky doesn't wash the scene out.
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.3, 1.25));
    composer.addPass(new SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio()));
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  /**
   * Moves the sun across the sky: 6 = sunrise in the east, 12 = high in the south, 18 = sunset in
   * the west. At night a dim moon takes over and `night` rises towards 1.
   */
  setTimeOfDay(hours: number): void {
    this.hours = ((hours % 24) + 24) % 24;
    const theta = ((this.hours - 6) / 12) * Math.PI; // 0 at sunrise, PI at sunset
    const elevation = Math.sin(theta) * THREE.MathUtils.degToRad(62);
    const horizontal = new THREE.Vector3(Math.cos(theta), 0, 0.5).normalize();
    const sunDir = horizontal.multiplyScalar(Math.cos(elevation)).add(new THREE.Vector3(0, Math.sin(elevation), 0)).normalize();
    for (const s of [this.sky, this.envSky]) s.material.uniforms.sunPosition.value.copy(sunDir);

    const day = THREE.MathUtils.smoothstep(sunDir.y, -0.08, 0.25);
    this.night = 1 - day;
    if (sunDir.y > -0.02) {
      this.sun.position.copy(sunDir).multiplyScalar(80);
      this.sun.color.copy(SUN_LOW).lerp(SUN_DAY, THREE.MathUtils.smoothstep(sunDir.y, 0, 0.45));
      this.sun.intensity = 2.4 * day;
    } else {
      // Moonlight from the opposite side of the sky.
      this.sun.position.set(-sunDir.x, 0.6, -sunDir.z).normalize().multiplyScalar(80);
      this.sun.color.copy(MOON);
      this.sun.intensity = 0.28;
      this.nightSky.material.uniforms.moonDir.value.copy(this.sun.position).normalize();
    }
    this.hemi.intensity = 0.06 + 0.2 * day;
    this.nightSky.material.uniforms.night.value = THREE.MathUtils.smoothstep(this.night, 0.3, 1);
    this.hemi.color.setHex(0xcfe3ff).lerp(new THREE.Color(0x30406a), this.night);
    const dusk = Math.max(0, 1 - Math.abs(sunDir.y - 0.05) / 0.2) * day;
    this.airFog.color.copy(NIGHT_FOG).lerp(DAY_FOG, day).lerp(DUSK_FOG, dusk * 0.6);
    this.waterFog.color.setHex(0x15505f).multiplyScalar(0.25 + 0.75 * day);
    this.renderer.toneMappingExposure = 0.76 + this.night * 0.4;

    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
    this.scene.environment = this.envTarget.texture;
  }

  /**
   * Prepares a freshly loaded map: sets how much each material reflects the sky and compiles
   * every shader now, so walking into a new room doesn't stall the game.
   */
  prepare(root: THREE.Object3D, compile = true): void {
    root.traverse(obj => {
      const mats = (obj as THREE.Mesh).material;
      for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
        if (m instanceof THREE.MeshStandardMaterial) m.envMapIntensity = (m.userData.envIntensity as number | undefined) ?? ENV_INTENSITY;
      }
    });
    if (compile) this.renderer.compile(this.scene, this.camera);
  }

  /**
   * Compiles every shader the scene needs, in the background where the GPU driver supports it (the
   * page stays responsive meanwhile), so the first frames don't stall.
   */
  async compileScene(): Promise<void> {
    const r = this.renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
    // Compile with every layer the cutscenes and cameras might draw.
    const cam = this.camera.clone();
    cam.layers.enableAll();
    if (r.compileAsync) await r.compileAsync(this.scene, cam);
    else r.compile(this.scene, cam);
  }

  /** Swaps in short, murky blue-green fog while the camera is under water. */
  setUnderwater(under: boolean): void {
    if (under === this.underwater) return;
    this.underwater = under;
    this.scene.fog = under ? this.waterFog : this.airFog;
    if (this.godRays) this.godRays.strength = under ? 0 : 1;
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    const r = this.renderer;
    r.setRenderTarget(null);
    if (this.composer) {
      const c = this.camera;
      c.updateMatrixWorld();
      this.aoCamera.position.copy(c.position);
      this.aoCamera.quaternion.copy(c.quaternion);
      Object.assign(this.aoCamera, { fov: c.fov, aspect: c.aspect, near: c.near, far: c.far });
      this.aoCamera.updateProjectionMatrix();
      this.aoCamera.updateMatrixWorld();
      this.composer.render();
    } else {
      r.clear();
      r.render(this.scene, this.camera);
    }
    r.clearDepth();
    r.render(this.weaponScene, this.weaponCamera);
  }

  private resize(): void {
    this.renderer.setSize(innerWidth, innerHeight);
    for (const cam of [this.camera, this.weaponCamera]) {
      cam.aspect = innerWidth / innerHeight;
      cam.updateProjectionMatrix();
    }
    this.setQuality(this.quality);
  }
}
