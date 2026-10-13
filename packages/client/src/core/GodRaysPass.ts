import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Volumetric sunlight ("god rays"): for every pixel, marches along the view ray through the air in
 * front of the first surface and asks the sun's shadow map whether each point is in sunlight. Lit air
 * scatters light towards the eye (most strongly when looking towards the sun), so beams appear
 * through windows, between columns and under trees, even when the sun itself is off screen.
 *
 * The march runs at half resolution with a dither pattern, then is blurred and added to the scene.
 * Needs the scene depth: the composer's targets must carry a depth texture (see Graphics).
 */
export class GodRaysPass extends Pass {
  /** Overall brightness of the rays; 0 turns the pass off. */
  strength = 1;
  /** Scene depth from the render pass. */
  depthTexture: THREE.DepthTexture | null = null;

  private readonly scatterTarget: THREE.WebGLRenderTarget;
  private readonly scatter: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly sun: THREE.DirectionalLight, steps: number) {
    super();
    this.scatterTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.scatter = new THREE.ShaderMaterial({
      defines: { STEPS: steps },
      uniforms: {
        tDepth: { value: null },
        tShadow: { value: null },
        projInv: { value: new THREE.Matrix4() },
        camWorld: { value: new THREE.Matrix4() },
        shadowMatrix: { value: new THREE.Matrix4() },
        camPos: { value: new THREE.Vector3() },
        sunDir: { value: new THREE.Vector3() },
        maxDist: { value: 30 },
        density: { value: 0.12 },
      },
      vertexShader: VERT,
      fragmentShader: SCATTER_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tScatter: { value: null },
        texel: { value: new THREE.Vector2() },
        sunColor: { value: new THREE.Color() },
      },
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width / 2));
    const h = Math.max(1, Math.floor(height / 2));
    this.scatterTarget.setSize(w, h);
    this.composite.uniforms.texel.value.set(1 / w, 1 / h);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const shadow = this.sun.shadow.map;
    const power = this.strength * this.sun.intensity;
    // Nothing to add: leave the image as it is.
    this.needsSwap = !!(shadow && this.depthTexture && power > 0.001);
    if (!this.needsSwap) return;

    const cam = this.camera;
    const u = this.scatter.uniforms;
    u.tDepth.value = this.depthTexture;
    u.tShadow.value = shadow!.texture;
    u.projInv.value.copy(cam.projectionMatrixInverse);
    u.camWorld.value.copy(cam.matrixWorld);
    u.shadowMatrix.value.copy(this.sun.shadow.matrix);
    u.camPos.value.setFromMatrixPosition(cam.matrixWorld);
    u.sunDir.value.copy(this.sun.position).sub(this.sun.target.position).normalize();
    this.quad.material = this.scatter;
    renderer.setRenderTarget(this.scatterTarget);
    this.quad.render(renderer);

    const c = this.composite.uniforms;
    c.tScene.value = readBuffer.texture;
    c.tScatter.value = this.scatterTarget.texture;
    c.sunColor.value.copy(this.sun.color).multiplyScalar(power);
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.scatterTarget.dispose();
    this.scatter.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const SCATTER_FRAG = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform sampler2D tShadow;
  uniform mat4 projInv;
  uniform mat4 camWorld;
  uniform mat4 shadowMatrix;
  uniform vec3 camPos;
  uniform vec3 sunDir;
  uniform float maxDist;
  uniform float density;
  varying vec2 vUv;

  vec3 worldAt(vec2 uv, float depth) {
    vec4 v = projInv * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    v /= v.w;
    return (camWorld * v).xyz;
  }

  // 1 where the sun reaches this point of air, 0 in shadow. Outside the shadow map counts as lit.
  float sunlit(vec3 p) {
    vec4 s = shadowMatrix * vec4(p, 1.0);
    s.xyz /= s.w;
    if (s.x <= 0.0 || s.x >= 1.0 || s.y <= 0.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
    return step(s.z - 0.0015, unpackRGBAToDepth(texture2D(tShadow, s.xy)));
  }

  // Interleaved gradient noise: offsets each pixel's samples so banding turns into fine grain.
  float dither(vec2 px) { return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))); }

  void main() {
    vec3 end = worldAt(vUv, texture2D(tDepth, vUv).x);
    vec3 ray = end - camPos;
    float len = min(length(ray), maxDist);
    if (len < 1e-4) { gl_FragColor = vec4(0.0); return; }
    vec3 dir = ray / max(length(ray), 1e-4);
    float stepLen = len / float(STEPS);
    float jitter = dither(gl_FragCoord.xy);
    float lit = 0.0;
    float litCount = 0.0;
    for (int i = 0; i < STEPS; i++) {
      float t = (float(i) + jitter) * stepLen;
      float s = sunlit(camPos + dir * t);
      // Nearby air counts most: beams across a room read clearly.
      lit += s * exp(-t * 0.09);
      litCount += s;
    }
    // Shafts are sunlight next to shadow. Where the whole view ray is in sun (open air) the glow is
    // just haze, so tone that down and keep the full effect for rays that cross beams.
    float frac = litCount / float(STEPS);
    lit *= mix(1.0, 0.07, smoothstep(0.4, 0.95, frac));
    // Henyey-Greenstein forward scattering: the air glows most around the sun.
    float g = 0.5;
    float cosT = dot(dir, sunDir);
    float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
    gl_FragColor = vec4(vec3(lit * stepLen * density * (0.15 + phase * 0.3)), 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tScatter;
  uniform vec2 texel;
  uniform vec3 sunColor;
  varying vec2 vUv;
  void main() {
    // Soft 9-tap blur hides the dither grain of the half-resolution march.
    vec3 s = texture2D(tScatter, vUv).rgb * 0.2;
    s += (texture2D(tScatter, vUv + vec2(texel.x, 0.0)).rgb + texture2D(tScatter, vUv - vec2(texel.x, 0.0)).rgb
        + texture2D(tScatter, vUv + vec2(0.0, texel.y)).rgb + texture2D(tScatter, vUv - vec2(0.0, texel.y)).rgb) * 0.125;
    s += (texture2D(tScatter, vUv + texel * 1.5).rgb + texture2D(tScatter, vUv - texel * 1.5).rgb
        + texture2D(tScatter, vUv + vec2(texel.x, -texel.y) * 1.5).rgb + texture2D(tScatter, vUv + vec2(-texel.x, texel.y) * 1.5).rgb) * 0.075;
    // Soft ceiling, so standing in a shadow and looking into bright sunlit air never whites out the view.
    s = max(s, vec3(0.0));
    s = 0.25 * s / (0.25 + s);
    vec4 scene = texture2D(tScene, vUv);
    gl_FragColor = vec4(scene.rgb + s * sunColor, scene.a);
  }
`;
