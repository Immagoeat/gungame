import * as THREE from 'three';
import type { AABB, Block } from '@gungame/shared';
import type { PaneShape } from '../fx/Debris';
import { drawCracks } from '../fx/fracture';
import { canvasTexture } from './textures';
import { createBlockMaterial } from './materials';

export interface GlassPane {
  block: Block;
  /** The pane's collider (same object as in World.colliders, so it can be removed when broken). */
  box: AABB;
  broken: boolean;
  mesh: THREE.InstancedMesh;
  instance: number;
  /** Spider-web crack decals from earlier hits. */
  cracks: THREE.Mesh[];
}

/** Panes bigger than this (m²) crack on the first hit and break on the next; smaller ones break at once. */
const CRACK_AREA = 1.1;
const crackTextures: THREE.Texture[] = [];
const crackMaterial = (i: number) => {
  while (crackTextures.length < 3) crackTextures.push(canvasTexture(256, drawCracks));
  // Kept below the bloom threshold so cracks don't glow.
  return new THREE.MeshBasicMaterial({ color: 0x9aa6ad, map: crackTextures[i % 3], transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.9 });
};

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

/** Every glass block as an individually breakable instance (one InstancedMesh per tint). */
export class GlassSystem {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly lookup = new Map<THREE.InstancedMesh, GlassPane[]>();
  private readonly materials: THREE.Material[] = [];
  /** Pane by its collider, for bullets that find glass through the collision boxes. */
  readonly byBox = new Map<AABB, GlassPane>();

  constructor(private readonly root: THREE.Group, panes: { block: Block; box: AABB }[]) {
    const byTint = new Map<string, { block: Block; box: AABB }[]>();
    for (const p of panes) {
      const key = String(p.block.tint ?? '');
      byTint.set(key, [...(byTint.get(key) ?? []), p]);
    }
    const m = new THREE.Matrix4();
    for (const group of byTint.values()) {
      const mat = createBlockMaterial('glass', group[0].block.tint);
      const mesh = new THREE.InstancedMesh(unitBox, mat, group.length);
      const list: GlassPane[] = group.map(({ block, box }, i) => {
        m.compose(
          new THREE.Vector3(block.x, block.y + block.sy / 2, block.z),
          new THREE.Quaternion(),
          new THREE.Vector3(block.sx, block.sy, block.sz),
        );
        mesh.setMatrixAt(i, m);
        const pane: GlassPane = { block, box, broken: false, mesh, instance: i, cracks: [] };
        this.byBox.set(box, pane);
        return pane;
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      root.add(mesh);
      this.meshes.push(mesh);
      this.lookup.set(mesh, list);
      this.materials.push(mat);
    }
  }

  /** The pane a raycast hit, if it hit glass. */
  paneFromHit(hit: THREE.Intersection): GlassPane | null {
    if (!(hit.object instanceof THREE.InstancedMesh) || hit.instanceId === undefined) return null;
    return this.lookup.get(hit.object)?.[hit.instanceId] ?? null;
  }

  /** Geometry of a pane for fracturing: centre, axes and size. */
  shape(pane: GlassPane): PaneShape {
    const b = pane.block;
    const alongZ = b.sx < b.sz;
    const normal = alongZ ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    return {
      center: new THREE.Vector3(b.x, b.y + b.sy / 2, b.z),
      u: new THREE.Vector3(0, 1, 0).cross(normal),
      normal,
      width: alongZ ? b.sz : b.sx,
      height: b.sy,
      thickness: Math.min(b.sx, b.sz),
    };
  }

  /** Whether the next hit on this pane only cracks it. */
  willCrack(pane: GlassPane): boolean {
    const s = this.shape(pane);
    return pane.cracks.length === 0 && s.width * s.height > CRACK_AREA;
  }

  /** Adds a spider-web crack where the pane was hit. */
  crack(pane: GlassPane, at: THREE.Vector3): void {
    const s = this.shape(pane);
    const size = Math.min(1.1, Math.min(s.width, s.height) * 0.9);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), crackMaterial(pane.cracks.length + pane.instance));
    // Keep the decal inside the pane.
    const rel = at.clone().sub(s.center);
    const u = THREE.MathUtils.clamp(rel.dot(s.u), -(s.width - size) / 2, (s.width - size) / 2);
    const v = THREE.MathUtils.clamp(rel.y, -(s.height - size) / 2, (s.height - size) / 2);
    m.position.copy(s.center).addScaledVector(s.u, u).add(new THREE.Vector3(0, v, 0));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.normal);
    m.rotateZ(Math.random() * Math.PI * 2);
    m.renderOrder = 3;
    this.root.add(m);
    pane.cracks.push(m);
  }

  /** Hides the pane. Returns false if it was already broken. */
  shatter(pane: GlassPane): boolean {
    if (pane.broken) return false;
    pane.broken = true;
    for (const c of pane.cracks) {
      this.root.remove(c);
      c.geometry.dispose();
      (c.material as THREE.Material).dispose();
    }
    pane.cracks.length = 0;
    pane.mesh.setMatrixAt(pane.instance, hidden);
    pane.mesh.instanceMatrix.needsUpdate = true;
    return true;
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
  }
}
