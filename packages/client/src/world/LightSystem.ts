import * as THREE from 'three';
import type { PropDef } from '@gungame/shared';

type LightProp = Extract<PropDef, { kind: 'light' }>;

/** A light you can see and shoot: the light itself plus the glowing parts of its fixture. */
export interface LightFixture {
  /**
   * The light as authored. Unless it casts shadows it isn't in the scene itself: the nearest
   * fixtures borrow the real lights of a fixed pool each frame (see LightSystem.update).
   */
  light: THREE.PointLight;
  /** In the scene for good (shadow casters), rather than drawn through the pool. */
  standalone: boolean;
  baseIntensity: number;
  nightOnly: boolean;
  /** Emissive materials that glow while the light is on. */
  glow: THREE.MeshStandardMaterial[];
  hitboxes: THREE.Mesh[];
  state: 'on' | 'dying' | 'off';
  /** Time left in the dying flicker. */
  dyingTime: number;
  flickerTimer: number;
  lit: boolean;
}

const DYING_SECONDS = 0.9;
/** Indoor lights are authored bright; this tones the whole house down. Night-only lamps are left as they are. */
const INDOOR_SCALE = 0.5;
/** Glow of lamp shades and bulbs (kept modest so they don't bloom into white blobs). */
const GLOW = 1.3;
const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
/**
 * How many real point lights the map's fixtures share. Every point light in the scene costs every
 * lit pixel, so a ship or a house with seventy lamps only lights the ones nearest the camera.
 * A fixed count also means shaders never recompile as lights come and go.
 */
const POOL_SIZE = 24;
/** Lights near the edge of the pool fade over this many metres rather than popping. */
const POOL_FADE = 4;
const brass = new THREE.MeshStandardMaterial({ color: 0xd4a94d, metalness: 1, roughness: 0.25 });

/**
 * All map lights. Ceiling lights and chandeliers are shootable: a hit makes them flicker and die,
 * leaving the room darker. Night-only lights fade in as the sun goes down.
 */
export class LightSystem {
  readonly fixtures: LightFixture[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  private readonly pool: THREE.PointLight[] = [];
  private readonly ranked: { f: LightFixture; score: number }[] = [];

  constructor(private readonly root: THREE.Group, props: readonly PropDef[]) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 2);
      this.pool.push(l);
      root.add(l);
    }
    for (const p of props) {
      if (p.kind === 'light') this.addLight(p);
      else if (p.kind === 'chandelier') this.addChandelier(p.x, p.y, p.z, p.castShadow ?? false);
    }
  }

  hitTargets(): THREE.Object3D[] {
    return this.fixtures.filter(f => f.state === 'on').flatMap(f => f.hitboxes);
  }

  fixtureFromObject(obj: THREE.Object3D): LightFixture | null {
    return (obj.userData.lightFixture as LightFixture | undefined) ?? null;
  }

  /** Breaks a fixture. Returns false if it was already out. */
  shoot(f: LightFixture): boolean {
    if (f.state !== 'on') return false;
    f.state = 'dying';
    f.dyingTime = DYING_SECONDS;
    return true;
  }

  /**
   * @param night 0 = day, 1 = full night
   * @param eye where the camera is: the fixtures nearest it get the pool's lights
   */
  update(dt: number, night: number, eye?: THREE.Vector3): void {
    for (const f of this.fixtures) {
      if (f.state === 'dying') {
        f.dyingTime -= dt;
        f.flickerTimer -= dt;
        if (f.flickerTimer <= 0) {
          f.lit = !f.lit;
          f.flickerTimer = 0.03 + Math.random() * 0.12;
        }
        if (f.dyingTime <= 0) {
          f.state = 'off';
          f.lit = false;
        }
      }
      const level = f.state === 'off' ? 0 : f.state === 'dying' ? (f.lit ? 0.7 : 0.05) : 1;
      const timeOfDay = f.nightOnly ? THREE.MathUtils.smoothstep(night, 0.3, 0.8) : 1;
      f.light.intensity = f.baseIntensity * level * timeOfDay;
      for (const m of f.glow) m.emissiveIntensity = GLOW * level * (f.nightOnly ? timeOfDay : 1);
    }
    this.assignPool(eye);
  }

  /** Hands the pool's lights to the lit fixtures that matter most from here: the nearest, allowing for reach. */
  private assignPool(eye?: THREE.Vector3): void {
    const ranked = this.ranked;
    ranked.length = 0;
    for (const f of this.fixtures) {
      if (f.standalone || f.light.intensity <= 0) continue;
      const score = eye ? f.light.position.distanceTo(eye) - f.light.distance * 0.5 : 0;
      ranked.push({ f, score });
    }
    ranked.sort((a, b) => a.score - b.score);
    // Everything ranked past the pool is dark; those just inside it fade by how close they are to that cut.
    const cut = ranked.length > POOL_SIZE ? ranked[POOL_SIZE].score : Infinity;
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i];
      const r = ranked[i];
      if (!r) { l.intensity = 0; continue; }
      const src = r.f.light;
      l.position.copy(src.position);
      l.color.copy(src.color);
      l.distance = src.distance;
      l.intensity = src.intensity * Math.min(1, (cut - r.score) / POOL_FADE);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }

  private register(light: THREE.PointLight, nightOnly: boolean, glow: THREE.MeshStandardMaterial[], hitboxes: THREE.Mesh[]): LightFixture {
    const f: LightFixture = {
      light, standalone: light.castShadow,
      baseIntensity: light.intensity * (nightOnly ? 1 : INDOOR_SCALE), nightOnly, glow, hitboxes,
      state: 'on', dyingTime: 0, flickerTimer: 0, lit: true,
    };
    for (const h of hitboxes) h.userData.lightFixture = f;
    this.fixtures.push(f);
    return f;
  }

  private addLight(p: LightProp): void {
    const light = new THREE.PointLight(p.color, p.intensity, p.distance, 2);
    light.position.set(p.x, p.y, p.z);
    if (p.castShadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.002;
    }
    if (p.castShadow) this.root.add(light);
    if (!p.fixture) {
      this.register(light, p.nightOnly ?? false, [], []);
      return;
    }
    // Semi-flush ceiling fixture: brass canopy and stem, frosted glass dome around the bulb.
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    const glow = new THREE.MeshStandardMaterial({ color: 0xfff6e8, emissive: p.color, emissiveIntensity: 2.2, roughness: 0.4, transparent: true, opacity: 0.95 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glow);
    dome.rotation.x = Math.PI;
    dome.position.y = 0.32;
    dome.scale.y = 0.6;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 24), brass);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.32;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), brass);
    stem.position.y = 0.6;
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 16), brass);
    canopy.position.y = 0.85;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), hitMaterial);
    hit.position.y = 0.3;
    g.add(dome, rim, stem, canopy, hit);
    this.root.add(g);
    this.disposables.push(glow, dome.geometry, rim.geometry, stem.geometry, canopy.geometry, hit.geometry);
    this.register(light, p.nightOnly ?? false, [glow], [hit]);
  }

  private addChandelier(x: number, y: number, z: number, castShadow: boolean): void {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const crystal = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2.2, roughness: 0.05, metalness: 0.1 });
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), brass);
    chain.position.y = 0.6;
    g.add(chain);
    for (const [r, h, n] of [[1.1, 0, 14], [0.75, -0.45, 10], [0.4, -0.85, 6]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 6, 32), brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = h;
      g.add(ring);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), crystal);
        c.position.set(Math.cos(a) * r, h - 0.15, Math.sin(a) * r);
        g.add(c);
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), crystal);
        candle.position.set(Math.cos(a) * r, h + 0.09, Math.sin(a) * r);
        g.add(candle);
      }
    }
    const light = new THREE.PointLight(0xffe8c0, 40, 22, 2);
    light.position.set(x, y - 0.5, z);
    if (castShadow) {
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.002;
    }
    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.15, 10, 8), hitMaterial);
    hit.position.y = -0.4;
    hit.scale.y = 0.7;
    g.add(hit);
    this.root.add(g);
    if (castShadow) this.root.add(light);
    this.disposables.push(crystal);
    this.register(light, false, [crystal], [hit]);
  }
}
