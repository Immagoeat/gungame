import * as THREE from 'three';
import type { AABB } from '@gungame/shared';
import { fracturePane, splitPolygon, type Poly } from './fracture';

/** A small object that tumbles, bounces off world boxes and eventually comes to rest. */
interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Quaternion;
  /** Angular velocity, radians/second around each axis. */
  spin: THREE.Vector3;
  radius: number;
  /** Colliders near where the body started; checking only these keeps debris cheap. */
  nearby: AABB[];
  restTime: number;
  asleep: boolean;
  hasHit: boolean;
  /** Currently inside a water volume. */
  wet?: boolean;
}

interface Shard extends Body {
  scale: THREE.Vector3;
  life: number;
}

interface Rigid extends Body {
  obj: THREE.Object3D;
}

/** One piece of broken glass. Held in the frame until `delay` runs out (or until knocked if stuck). */
interface Fragment extends Body {
  /** Outline in the piece's own plane, around its centroid. */
  points: Poly;
  area: number;
  thickness: number;
  delay: number;
  stuck: boolean;
  released: boolean;
  life: number;
  /** How many times this glass has already been broken down further. */
  generation: number;
  /** Replaced by smaller pieces. */
  dead: boolean;
}

interface Fracture {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  frags: Fragment[];
  pos: THREE.Vector4[];
  rot: THREE.Vector4[];
}

/** A pane to break: centre, in-plane horizontal axis, normal, size. */
export interface PaneShape {
  center: THREE.Vector3;
  u: THREE.Vector3;
  normal: THREE.Vector3;
  width: number;
  height: number;
  thickness: number;
}

/** Everything needed to spawn one piece of glass. */
interface PieceSpec {
  points: Poly;
  area: number;
  pos: THREE.Vector3;
  rot: THREE.Quaternion;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  delay: number;
  stuck: boolean;
  generation: number;
}

/** Shards per draw call (two vec4 uniforms each). */
const MAX_FRAGMENTS = 160;
const FRAGMENT_LIFETIME = 40;
/** Glass reflects the sky only faintly; strong reflections were blowing out into the bloom. */
const GLASS_ENV = 0.3;

/** Glass whose vertices are placed per shard from uniform arrays (one draw call per batch of shards). */
function fragmentMaterial(pos: THREE.Vector4[], rot: THREE.Vector4[]): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color: 0xb9d4df, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false,
    envMapIntensity: GLASS_ENV,
  });
  m.userData.envIntensity = GLASS_ENV;
  m.onBeforeCompile = shader => {
    shader.uniforms.shardPos = { value: pos };
    shader.uniforms.shardRot = { value: rot };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float shardIndex;
        uniform vec4 shardPos[${MAX_FRAGMENTS}];
        uniform vec4 shardRot[${MAX_FRAGMENTS}];
        vec3 qrot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }`)
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = qrot(shardRot[int(shardIndex)], normal);
        #ifdef USE_TANGENT
        vec3 objectTangent = vec3(tangent.xyz);
        #endif`)
      .replace('#include <begin_vertex>', `int si = int(shardIndex);
        vec3 transformed = qrot(shardRot[si], position * shardPos[si].w) + shardPos[si].xyz;`);
  };
  m.customProgramCacheKey = () => 'glassFragments';
  return m;
}

/** Extruded glass outlines (each in its own local space) with a shard index per vertex. */
function fragmentGeometry(pieces: { points: Poly }[], thickness: number): THREE.BufferGeometry {
  const t = thickness / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const ids: number[] = [];
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number, id: number) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(x + 0.5, y + 0.5);
    ids.push(id);
  };
  pieces.forEach(({ points: p }, id) => {
    for (const z of [t, -t]) {
      for (let i = 0; i < p.length; i++) {
        const a = p[i];
        const b = p[(i + 1) % p.length];
        const [i0, i1] = z > 0 ? [a, b] : [b, a];
        vert(0, 0, z, 0, 0, Math.sign(z), id);
        vert(i0[0], i0[1], z, 0, 0, Math.sign(z), id);
        vert(i1[0], i1[1], z, 0, 0, Math.sign(z), id);
      }
    }
    for (let i = 0; i < p.length; i++) {
      const a = p[i];
      const b = p[(i + 1) % p.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = (b[1] - a[1]) / len;
      const ny = -(b[0] - a[0]) / len;
      for (const [x, y, z] of [[a[0], a[1], t], [b[0], b[1], t], [b[0], b[1], -t], [a[0], a[1], t], [b[0], b[1], -t], [a[0], a[1], -t]]) {
        vert(x, y, z, nx, ny, 0, id);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('shardIndex', new THREE.Float32BufferAttribute(ids, 1));
  return geo;
}

const GRAVITY = 20;
const RESTITUTION = 0.3;
const FRICTION = 0.75;
const MAX_SHARDS = 900;
const SHARD_LIFETIME = 25;
const FADE_TIME = 1.5;
const SLEEP_SPEED_SQ = 0.08;
const SLEEP_AFTER = 0.35;
const NEARBY_XZ = 6;
const NEARBY_BELOW = 14;
/** A falling piece hitting something this hard breaks into smaller ones. */
const BREAK_SPEED = 3.2;
const MAX_GENERATION = 3;
/** Past this many live pieces, glass stops breaking down further (it still scatters). */
const MAX_LIVE_FRAGMENTS = 3000;
/** How far from the player stuck pieces get knocked out of a frame. */
const KNOCK_RADIUS = 1.0;
/** Pieces waiting to break are gathered for this long, so many small breaks share one mesh. */
const SPLIT_BATCH_SECONDS = 0.15;

const AXES = ['x', 'x', 'y', 'y', 'z', 'z'] as const;
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const rand = (s: number) => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(s);

/** Physics-driven debris: glass (fractured panes and loose shards) and loose objects like shot-off camera heads. */
export class Debris {
  private readonly shards: Shard[] = [];
  private readonly rigids: Rigid[] = [];
  private readonly fractures: Fracture[] = [];
  private readonly shardMesh: THREE.InstancedMesh;
  private crunchCooldown = 0;
  private readonly pendingSplits = new Map<Fragment, [Fracture, number]>();
  private splitTimer = 0;
  /** Called when a piece hits something hard enough to make a sound. */
  onImpact: (speed: number, kind: 'shard' | 'rigid', at: THREE.Vector3) => void = () => {};
  /** Called when a piece drops into water. */
  onSplash: (at: THREE.Vector3, surface: number, speed: number) => void = () => {};
  /** Called when glass breaks up underfoot. */
  onCrunch: () => void = () => {};

  constructor(private readonly scene: THREE.Scene, private readonly colliders: () => readonly AABB[], private readonly water: () => readonly AABB[] = () => []) {
    // An irregular triangle; per-instance scale and rotation make every shard look different.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.55, 0, -0.45, -0.3, 0, 0.5, -0.2, 0], 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc6dde6, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
      envMapIntensity: GLASS_ENV,
    });
    this.shardMesh = new THREE.InstancedMesh(geo, mat, MAX_SHARDS);
    this.shardMesh.count = 0;
    this.shardMesh.frustumCulled = false; // instances are spread over the whole map
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.shardMesh);
  }

  /** Small loose shards in a box (light fixtures, small glass). */
  shatter(box: AABB, impact: THREE.Vector3, dir: THREE.Vector3): void {
    const sx = box.max.x - box.min.x;
    const sy = box.max.y - box.min.y;
    const sz = box.max.z - box.min.z;
    const area = sy * Math.max(sx, sz);
    const n = THREE.MathUtils.clamp(Math.round(area * 30), 8, 70);
    const size = THREE.MathUtils.clamp(Math.sqrt(area / n) * 1.2, 0.03, 0.2);
    const nearby = this.collidersNear(box);
    for (let i = 0; i < n; i++) {
      const pos = new THREE.Vector3(box.min.x + Math.random() * sx, box.min.y + Math.random() * sy, box.min.z + Math.random() * sz);
      const away = tmpV.subVectors(pos, impact);
      const vel = dir.clone().multiplyScalar(1.5 + 4 * Math.exp(-away.length()))
        .addScaledVector(away.normalize(), 0.8)
        .add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5));
      if (this.shards.length >= MAX_SHARDS) this.shards.shift();
      this.shards.push({
        pos, vel, nearby,
        rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3)),
        spin: rand(24),
        scale: new THREE.Vector3(size * (0.4 + Math.random()), size * (0.4 + Math.random()), 1),
        radius: 0.02, life: SHARD_LIFETIME, restTime: 0, asleep: false, hasHit: false,
      });
    }
  }

  /**
   * Realistic pane break: the glass cracks into many small, irregular shards around the impact.
   * Shards near the hole blow out along the bullet's path, the rest drop out of the frame over the
   * next second, and some jagged pieces stay stuck in the frame until knocked loose.
   */
  fracture(pane: PaneShape, impact: THREE.Vector3, dir: THREE.Vector3): void {
    const up = new THREE.Vector3(0, 1, 0);
    const rel = impact.clone().sub(pane.center);
    const u0 = rel.dot(pane.u);
    const shards = fracturePane(pane.width, pane.height, u0, rel.y);
    const paneRot = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(pane.u, up, pane.normal));
    const specs: PieceSpec[] = shards.map(s => {
      const near = Math.exp(-s.dist * 2.5);
      const radial = pane.u.clone().multiplyScalar(s.cx - u0).addScaledVector(up, s.cy - rel.y).normalize();
      return {
        points: s.points,
        area: s.area,
        pos: pane.center.clone().addScaledVector(pane.u, s.cx).addScaledVector(up, s.cy),
        rot: paneRot.clone(),
        vel: dir.clone().multiplyScalar(0.3 + 6 * near)
          .addScaledVector(radial, 0.9 * near)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4)),
        spin: rand(4 + 20 * near),
        delay: s.dist < 0.12 ? 0 : s.dist * 0.35 + Math.random() * 0.6,
        stuck: s.edge && s.area < 0.03 && Math.random() < 0.45,
        generation: 0,
      };
    });
    this.spawn(specs, pane.thickness, Math.max(pane.width, pane.height));
  }

  /**
   * Something moving through glass on the ground or in a frame (the player's feet, a body):
   * resting pieces break into smaller ones and scatter, stuck pieces fall out of the frame.
   */
  disturb(at: THREE.Vector3, radius: number, speed: number): void {
    const splits: [Fracture, Fragment][] = [];
    for (const f of this.fractures) {
      for (const s of f.frags) {
        if (s.dead) continue;
        const dx = s.pos.x - at.x;
        const dz = s.pos.z - at.z;
        const dy = s.pos.y - at.y;
        const d2 = dx * dx + dz * dz;
        if (s.stuck || !s.released) {
          // Pushing through a broken window knocks the remaining glass out.
          if (d2 > KNOCK_RADIUS * KNOCK_RADIUS || dy < -0.2 || dy > 2.2) continue;
          s.stuck = false;
          s.released = true;
          s.delay = 0;
          s.vel.copy(rand(1)).setY(0.2);
          continue;
        }
        if (d2 > radius * radius) continue;
        if (Math.abs(dy) > 0.3) continue;
        if (s.asleep && s.area > 0.0015 && s.generation < MAX_GENERATION) splits.push([f, s]);
        else if (s.asleep) {
          s.asleep = false;
          s.vel.set((Math.random() - 0.5) * speed * 0.3, 0.3, (Math.random() - 0.5) * speed * 0.3);
        }
      }
    }
    if (splits.length) {
      for (const [f, s] of splits) this.queueSplit(f, s, 0.6 + speed * 0.15);
      if (this.crunchCooldown <= 0) {
        this.onCrunch();
        this.crunchCooldown = 0.12;
      }
    }
  }

  /** Lets an existing scene object fall and tumble. It is reparented to the scene. */
  addRigid(obj: THREE.Object3D, vel: THREE.Vector3, spin: THREE.Vector3, radius: number): void {
    this.scene.attach(obj);
    const pos = obj.position;
    const bounds = { min: pos.clone().subScalar(radius), max: pos.clone().addScalar(radius) };
    this.rigids.push({
      obj, pos, vel: vel.clone(), rot: obj.quaternion, spin: spin.clone(), radius,
      nearby: this.collidersNear(bounds), restTime: 0, asleep: false, hasHit: false,
    });
  }

  update(dt: number): void {
    this.crunchCooldown -= dt;
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      const impact = this.integrate(s, dt);
      if (impact > 2.5 && !s.hasHit) this.onImpact(impact, 'shard', s.pos);
      if (impact > 0) s.hasHit = true;
      s.life -= dt;
      if (s.life <= 0) {
        this.shards[i] = this.shards[this.shards.length - 1];
        this.shards.pop();
      }
    }
    for (const r of this.rigids) {
      const impact = this.integrate(r, dt);
      if (impact > 2) this.onImpact(impact, 'rigid', r.pos);
    }
    const breaking: [Fracture, Fragment, number][] = [];
    for (let i = this.fractures.length - 1; i >= 0; i--) {
      const f = this.fractures[i];
      let alive = false;
      for (const s of f.frags) {
        if (s.dead) continue;
        s.life -= dt;
        if (s.life > 0 || s.stuck) alive = true;
        if (s.stuck) continue;
        if (!s.released) {
          s.delay -= dt;
          if (s.delay > 0) continue;
          s.released = true;
        }
        const impact = this.integrate(s, dt);
        if (impact > 2.5 && !s.hasHit) this.onImpact(impact, 'shard', s.pos);
        if (impact > 0) s.hasHit = true;
        // Hitting the floor hard breaks a piece up again.
        if (impact > BREAK_SPEED && s.area > 0.003 && s.generation < MAX_GENERATION) breaking.push([f, s, impact]);
      }
      this.writeFracture(f);
      if (!alive) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.material.dispose();
        this.fractures.splice(i, 1);
      }
    }
    for (const [f, s, impact] of breaking) this.queueSplit(f, s, impact * 0.25);
    this.splitTimer -= dt;
    if (this.pendingSplits.size && this.splitTimer <= 0) {
      this.splitTimer = SPLIT_BATCH_SECONDS;
      this.spawnSplits([...this.pendingSplits].map(([s, [f, e]]) => [f, s, e]));
      this.pendingSplits.clear();
    }

    const fadeScale = new THREE.Vector3();
    this.shards.forEach((s, i) => {
      fadeScale.copy(s.scale).multiplyScalar(Math.min(1, s.life / FADE_TIME));
      tmpM.compose(s.pos, s.rot, fadeScale);
      this.shardMesh.setMatrixAt(i, tmpM);
    });
    this.shardMesh.count = this.shards.length;
    this.shardMesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (const f of this.fractures) {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.material.dispose();
    }
    this.fractures.length = 0;
    this.pendingSplits.clear();
    this.shards.length = 0;
    this.shardMesh.count = 0;
    for (const r of this.rigids) r.obj.removeFromParent();
    this.rigids.length = 0;
  }

  private queueSplit(f: Fracture, s: Fragment, energy: number): void {
    const prev = this.pendingSplits.get(s);
    if (!prev || prev[1] < energy) this.pendingSplits.set(s, [f, energy]);
  }

  private liveFragments(): number {
    let n = 0;
    for (const f of this.fractures) for (const s of f.frags) if (!s.dead) n++;
    return n;
  }

  /** Breaks several pieces at once, putting all the new pieces into as few meshes as possible. */
  private spawnSplits(list: [Fracture, Fragment, number][]): void {
    if (!list.length) return;
    const room = MAX_LIVE_FRAGMENTS - this.liveFragments();
    const specs: PieceSpec[] = [];
    let thickness = 0.06;
    for (const [f, s, energy] of list) {
      if (s.dead) continue;
      if (specs.length > room) {
        // Too much glass already: just scatter instead of breaking further.
        s.asleep = false;
        s.vel.add(rand(energy)).setY(0.3);
        continue;
      }
      thickness = s.thickness;
      specs.push(...this.split(s, energy));
      this.writeFracture(f);
    }
    this.spawn(specs, thickness, 1.5);
  }

  /** Breaks one piece into 2-4 smaller, irregular ones that inherit its motion; returns them to spawn. */
  private split(s: Fragment, energy: number): PieceSpec[] {
    s.dead = true;
    const pieces = splitPolygon(s.points, s.area > 0.02 ? 3 : s.area > 0.006 ? 2 : 1);
    const specs: PieceSpec[] = pieces.map(p => ({
      points: p.points,
      area: p.area,
      pos: s.pos.clone().add(new THREE.Vector3(p.cx, p.cy, 0).applyQuaternion(s.rot)),
      rot: s.rot.clone(),
      vel: s.vel.clone().multiplyScalar(0.5).add(rand(energy)).setY(Math.abs(s.vel.y) * 0.3 + Math.random() * energy * 0.5),
      spin: rand(10 + energy * 6),
      delay: 0,
      stuck: false,
      generation: s.generation + 1,
    }));
    return specs;
  }

  /** Creates the meshes and bodies for a set of glass pieces (in batches of MAX_FRAGMENTS). */
  private spawn(specs: PieceSpec[], thickness: number, reach: number): void {
    if (!specs.length) return;
    const center = specs[0].pos;
    const nearby = this.collidersNear({ min: center.clone().subScalar(reach), max: center.clone().addScalar(reach) });
    for (let start = 0; start < specs.length; start += MAX_FRAGMENTS) {
      const batch = specs.slice(start, start + MAX_FRAGMENTS);
      const pos = Array.from({ length: MAX_FRAGMENTS }, () => new THREE.Vector4(0, -1000, 0, 0));
      const rot = Array.from({ length: MAX_FRAGMENTS }, () => new THREE.Vector4(0, 0, 0, 1));
      const material = fragmentMaterial(pos, rot);
      const mesh = new THREE.Mesh(fragmentGeometry(batch, thickness), material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      const frags: Fragment[] = batch.map(b => ({
        pos: b.pos, vel: b.vel, rot: b.rot, spin: b.spin, radius: 0.01, nearby,
        restTime: 0, asleep: false, hasHit: false,
        points: b.points, area: b.area, thickness,
        delay: b.delay, stuck: b.stuck, released: b.delay <= 0 && !b.stuck,
        life: FRAGMENT_LIFETIME + Math.random() * 5, generation: b.generation, dead: false,
      }));
      const f: Fracture = { mesh, material, frags, pos, rot };
      this.fractures.push(f);
      this.writeFracture(f);
    }
  }

  private writeFracture(f: Fracture): void {
    f.frags.forEach((s, i) => {
      const scale = s.dead ? 0 : s.stuck ? 1 : Math.min(1, s.life / FADE_TIME);
      f.pos[i].set(s.pos.x, s.pos.y, s.pos.z, Math.max(0, scale));
      f.rot[i].set(s.rot.x, s.rot.y, s.rot.z, s.rot.w);
    });
  }

  private collidersNear(box: AABB): AABB[] {
    return this.colliders().filter(c =>
      c.max.x > box.min.x - NEARBY_XZ && c.min.x < box.max.x + NEARBY_XZ &&
      c.max.z > box.min.z - NEARBY_XZ && c.min.z < box.max.z + NEARBY_XZ &&
      c.max.y > box.min.y - NEARBY_BELOW && c.min.y < box.max.y + 1);
  }

  private waterAt(p: THREE.Vector3): AABB | null {
    for (const w of this.water()) {
      if (p.x > w.min.x && p.x < w.max.x && p.z > w.min.z && p.z < w.max.z && p.y > w.min.y && p.y < w.max.y) return w;
    }
    return null;
  }

  /** One physics step. Returns the speed of the hardest impact this step (0 if none). */
  private integrate(b: Body, dt: number): number {
    if (b.asleep) return 0;
    const water = this.waterAt(b.pos);
    if (water) {
      // Sink slowly, with heavy drag and lazy tumbling.
      if (!b.wet) this.onSplash(b.pos, water.max.y, b.vel.length());
      b.wet = true;
      b.vel.multiplyScalar(Math.exp(-4 * dt));
      b.vel.y -= GRAVITY * 0.06 * dt;
      b.spin.multiplyScalar(Math.exp(-2 * dt));
    } else {
      b.wet = false;
      b.vel.y -= GRAVITY * dt;
    }
    b.pos.addScaledVector(b.vel, dt);
    const r = b.radius;
    const p = b.pos;
    let impact = 0;
    let landed = false;

    for (const c of b.nearby) {
      if (p.x < c.min.x - r || p.x > c.max.x + r || p.y < c.min.y - r || p.y > c.max.y + r ||
        p.z < c.min.z - r || p.z > c.max.z + r) continue;
      // Push out along whichever face is closest.
      const pen = [c.max.x + r - p.x, p.x - (c.min.x - r), c.max.y + r - p.y, p.y - (c.min.y - r), c.max.z + r - p.z, p.z - (c.min.z - r)];
      let k = 0;
      for (let i = 1; i < 6; i++) if (pen[i] < pen[k]) k = i;
      const axis = AXES[k];
      const sign = k % 2 === 0 ? 1 : -1;
      p[axis] += sign * pen[k];
      const vn = b.vel[axis];
      if (vn * sign < 0) {
        impact = Math.max(impact, Math.abs(vn));
        b.vel[axis] = -vn * RESTITUTION;
        for (const o of ['x', 'y', 'z'] as const) if (o !== axis) b.vel[o] *= FRICTION;
        b.spin.multiplyScalar(0.5);
      }
      if (k === 2) landed = true;
    }
    if (p.y < r) {
      if (b.vel.y < 0) impact = Math.max(impact, -b.vel.y);
      p.y = r;
      b.vel.y = Math.abs(b.vel.y) * RESTITUTION;
      b.vel.x *= FRICTION;
      b.vel.z *= FRICTION;
      landed = true;
    }

    const w = b.spin.length();
    if (w > 1e-3) b.rot.premultiply(tmpQ.setFromAxisAngle(tmpV.copy(b.spin).divideScalar(w), w * dt));

    if (landed && b.vel.lengthSq() < SLEEP_SPEED_SQ) {
      b.restTime += dt;
      if (b.restTime > SLEEP_AFTER) {
        b.asleep = true;
        b.vel.set(0, 0, 0);
        // Glass comes to rest lying flat.
        if ('scale' in b || 'points' in b) b.rot.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.random() * 6.3));
      }
    } else {
      b.restTime = 0;
    }
    return impact;
  }
}
