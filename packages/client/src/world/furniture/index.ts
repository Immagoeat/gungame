import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FURNITURE, type FurnitureType, type PropDef } from '@gungame/shared';
import { indoor } from './indoor';
import { Kit, type Dynamic } from './kit';
import { outdoor } from './outdoor';
import { party } from './party';
import { port } from './port';
import { ship } from './ship';
import { special } from './special';
import type { Builder } from './types';

type FurnitureProp = Extract<PropDef, { kind: 'furniture' }>;

const BUILDERS = { ...indoor, ...special, ...outdoor, ...party, ...ship, ...port } as Record<FurnitureType, Builder | undefined>;

export function buildFurniture(prop: FurnitureProp): Kit {
  const [w, h, d] = FURNITURE[prop.type].size;
  const kit = new Kit();
  const build = BUILDERS[prop.type];
  if (!build) throw new Error(`No model for furniture type "${prop.type}"`);
  build(kit, { w: prop.w ?? w, h: prop.h ?? h, d: prop.d ?? d, color: prop.color, variant: prop.variant ?? 0 });
  kit.group.position.set(prop.x, prop.y, prop.z);
  kit.group.rotation.y = prop.yaw;
  return kit;
}

export interface FurnitureBatch {
  /** Merged static meshes, one per material (and shadow setting). */
  meshes: THREE.Mesh[];
  dynamics: Dynamic[];
  lights: THREE.Light[];
  dispose(): void;
}

/**
 * Builds every furniture prop and merges all static parts by material, so a fully furnished
 * mansion costs a few dozen draw calls. Animated parts and lights stay separate objects.
 */
export function batchFurniture(props: readonly PropDef[], root: THREE.Group): FurnitureBatch {
  const buckets = new Map<string, { material: THREE.Material; castShadow: boolean; geos: THREE.BufferGeometry[] }>();
  const dynamics: Dynamic[] = [];
  const lights: THREE.Light[] = [];

  for (const prop of props) {
    if (prop.kind !== 'furniture') continue;
    const kit = buildFurniture(prop);
    kit.group.updateMatrixWorld(true);
    const dynamicRoots = new Set(kit.dynamics.map(d => d.object));
    const lightSet = new Set<THREE.Object3D>(kit.lights);
    const visit = (obj: THREE.Object3D) => {
      if (dynamicRoots.has(obj) || lightSet.has(obj)) return;
      if (obj instanceof THREE.Mesh) {
        const material = obj.material as THREE.Material;
        const key = `${material.uuid}:${obj.castShadow}`;
        let bucket = buckets.get(key);
        if (!bucket) buckets.set(key, (bucket = { material, castShadow: obj.castShadow, geos: [] }));
        let geo = obj.geometry.clone().applyMatrix4(obj.matrixWorld);
        if (geo.index) geo = geo.toNonIndexed();
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count * 2), 2));
        bucket.geos.push(geo);
      }
      for (const child of obj.children) visit(child);
    };
    visit(kit.group);
    for (const d of kit.dynamics) {
      root.attach(d.object);
      dynamics.push(d);
    }
    for (const l of kit.lights) {
      root.attach(l);
      lights.push(l);
    }
  }

  const meshes: THREE.Mesh[] = [];
  for (const { material, castShadow, geos } of buckets.values()) {
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    root.add(mesh);
    meshes.push(mesh);
  }
  return {
    meshes,
    dynamics,
    lights,
    dispose: () => meshes.forEach(m => m.geometry.dispose()),
  };
}
