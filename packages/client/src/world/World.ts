import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  blockToAABB, footprintBlocked, isSeeThrough, isSolid, mapWater, PENETRATION_RESISTANCE, zoneAt,
  type AABB, type Block, type BlockMaterial, type MapDef, type PropDef, type Vec3, type ZoneDef,
} from '@gungame/shared';
import { batchFurniture, type FurnitureBatch } from './furniture';
import { scrollingTextures } from './furniture/palette';
import { GlassSystem, type GlassPane } from './GlassSystem';
import { castsShadow, createBlockMaterial, uvMode, uvScale } from './materials';
import { LightSystem } from './LightSystem';
import { SecuritySystem } from './SecuritySystem';

export interface ColliderInfo {
  material: BlockMaterial;
  /** Bullet resistance, m/s lost per cm. */
  resistance: number;
  /** Collision-only furniture box (no visible surface for bullet holes). */
  invisible: boolean;
}

/** Builds a MapDef into meshes and answers spatial queries (collision, line of sight, spawns, zones). */
export class World {
  readonly root = new THREE.Group();
  readonly colliders: AABB[] = [];
  /** Water volumes (pool, hot tub) you can wade or swim in. */
  readonly water: AABB[];
  /** What each collider is made of, for bullets. */
  readonly colliderInfo = new Map<AABB, ColliderInfo>();
  /** Everything bullets can hit. */
  readonly meshes: THREE.Mesh[] = [];
  /** Solid, opaque geometry that blocks line of sight. */
  readonly occluders: THREE.Mesh[] = [];
  readonly security: SecuritySystem;
  readonly glass: GlassSystem;
  readonly lights: LightSystem;
  private readonly furniture: FurnitureBatch;
  private time = 0;
  private readonly ray = new THREE.Raycaster();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(readonly map: MapDef, private readonly scene: THREE.Scene) {
    this.water = mapWater(map);
    const panes: { block: Block; box: AABB }[] = [];
    for (const b of map.blocks) {
      if (!isSolid(b.material)) continue;
      const box = blockToAABB(b);
      this.colliders.push(box);
      this.colliderInfo.set(box, {
        material: b.material,
        resistance: b.resistance ?? PENETRATION_RESISTANCE[b.material],
        invisible: b.invisible ?? false,
      });
      if (b.material === 'glass') panes.push({ block: b, box });
    }
    this.buildGround();
    this.buildBlocks();
    this.glass = new GlassSystem(this.root, panes);
    this.furniture = batchFurniture(map.props, this.root);
    this.meshes.push(...this.furniture.meshes);
    this.buildProps(map.props);
    this.security = new SecuritySystem(this.root, map.props);
    this.lights = new LightSystem(this.root, map.props);
    scene.add(this.root);
  }

  /** @param night 0 = day, 1 = full night (see Graphics.night) */
  update(dt: number, night: number): void {
    this.time += dt;
    this.security.update(dt);
    this.lights.update(dt, night);
    for (const d of this.furniture.dynamics) d.update(dt, this.time);
    for (const s of scrollingTextures) {
      s.texture.offset.x = (s.texture.offset.x + s.speed[0] * dt) % 1;
      s.texture.offset.y = (s.texture.offset.y + s.speed[1] * dt) % 1;
    }
  }

  hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    this.ray.set(from, dir.normalize());
    this.ray.far = dist;
    return this.ray.intersectObjects(this.occluders, false).length === 0;
  }

  isBlocked(x: number, z: number, radius: number): boolean {
    return footprintBlocked(x, z, radius, this.colliders);
  }

  /** A random clear floor point at least minDist (horizontally) from `awayFrom`, or null. */
  randomOpenPoint(awayFrom: Vec3, minDist: number, radius = 0.7, tries = 60): THREE.Vector3 | null {
    const range = this.map.halfSize - 3;
    for (let i = 0; i < tries; i++) {
      const x = (Math.random() * 2 - 1) * range;
      const z = (Math.random() * 2 - 1) * range;
      if (this.isBlocked(x, z, radius)) continue;
      if (Math.hypot(x - awayFrom.x, z - awayFrom.z) < minDist) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  /** Breaks a pane and removes its collider. Returns false if it was already broken. */
  breakGlass(pane: GlassPane): boolean {
    if (!this.glass.shatter(pane)) return false;
    const i = this.colliders.indexOf(pane.box);
    if (i >= 0) this.colliders.splice(i, 1);
    return true;
  }

  zoneAt(p: Vec3): ZoneDef | null {
    return zoneAt(this.map, p);
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.security.dispose();
    this.glass.dispose();
    this.lights.dispose();
    this.furniture.dispose();
    for (const d of this.disposables) d.dispose();
  }

  private buildGround(): void {
    const size = this.map.halfSize * 2;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    applyWorldUVs(geo, uvScale(this.map.groundMaterial));
    const mat = createBlockMaterial(this.map.groundMaterial);
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = true;
    this.root.add(ground);
    this.meshes.push(ground);
    this.disposables.push(geo, mat);
  }

  /** One merged mesh per material+tint keeps draw calls low even with ~1000 blocks. */
  private buildBlocks(): void {
    const groups = new Map<string, { kind: BlockMaterial; tint?: number; blocks: Block[] }>();
    for (const b of this.map.blocks) {
      if (b.material === 'glass' || b.invisible) continue; // glass is breakable (GlassSystem); invisible blocks are collision only
      const key = `${b.material}:${b.tint ?? ''}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { kind: b.material, tint: b.tint, blocks: [] }));
      g.blocks.push(b);
    }
    for (const { kind, tint, blocks } of groups.values()) {
      const parts = blocks.map(b => {
        const geo = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
        geo.translate(b.x, b.y + b.sy / 2, b.z);
        if (uvMode(kind) === 'world') applyWorldUVs(geo, uvScale(kind));
        return geo;
      });
      const geo = mergeGeometries(parts);
      for (const p of parts) p.dispose();
      const mat = createBlockMaterial(kind, tint);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = castsShadow(kind);
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.disposables.push(geo, mat);
      if (isSolid(kind)) this.meshes.push(mesh);
      if (isSolid(kind) && !isSeeThrough(kind)) this.occluders.push(mesh);
    }
  }

  private buildProps(props: readonly PropDef[]): void {
    for (const p of props) {
      if (p.kind === 'palmCrown') {
        this.root.add(buildPalmCrown(p.x, p.y, p.z));
      }
    }
  }
}

/** Box-projected UVs in world space, so textures keep a constant size across differently sized blocks. */
function applyWorldUVs(geo: THREE.BufferGeometry, scale: number): void {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x / scale, z / scale);
    else if (nx >= nz) uv.setXY(i, z / scale, y / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
  uv.needsUpdate = true;
}

const frondMat = new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: 0.9, side: THREE.DoubleSide });

function buildPalmCrown(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const frond = new THREE.PlaneGeometry(0.7, 3.2);
  frond.translate(0, 1.6, 0);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(frond, frondMat);
    m.rotation.order = 'YXZ';
    m.rotation.y = (i / 9) * Math.PI * 2;
    m.rotation.x = 1.15 + (i % 3) * 0.15;
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
