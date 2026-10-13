import * as THREE from 'three';
import type { AABB, BlockMaterial, PropDef } from '@gungame/shared';
import { createBlockMaterial } from './materials';

type DoorProp = Extract<PropDef, { kind: 'door' }>;

export interface Door {
  prop: DoorProp;
  /** Pivots at the hinge. */
  pivot: THREE.Group;
  leaf: THREE.Mesh;
  /** 0 shut .. 1 open; and where it's heading. */
  open: number;
  target: number;
  locked: boolean;
  collider: AABB;
  colliderIn: boolean;
  /** Seconds until an NPC-opened door swings shut again. */
  autoClose: number;
  led: THREE.MeshStandardMaterial | null;
}

const SWING = Math.PI * 0.55;
const THICK = 0.06;

/**
 * Doors in doorways: they swing open and shut, block movement, bullets (a little) and sight while
 * shut, and can be locked until you have the right key item (a keycard reader glows red, then green).
 * Guards open doors on their way through and let them swing shut behind them.
 */
export class DoorSystem {
  readonly doors: Door[] = [];
  private readonly mats: THREE.Material[] = [];

  constructor(
    root: THREE.Group, props: readonly PropDef[], private readonly colliders: AABB[],
    private readonly info: Map<AABB, { material: BlockMaterial; resistance: number; invisible: boolean }>,
    private readonly occluders: THREE.Mesh[],
  ) {
    const wood = createBlockMaterial('darkWood');
    const steel = createBlockMaterial('steel');
    const handle = new THREE.MeshStandardMaterial({ color: 0xc9a65a, metalness: 1, roughness: 0.25 });
    this.mats.push(wood, steel, handle);
    for (const p of props) {
      if (p.kind !== 'door') continue;
      const locked = !!p.lock;
      const pivot = new THREE.Group();
      // Hinge at one end of the opening; the leaf extends along the door's axis.
      const along = p.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      pivot.position.set(p.x, p.y, p.z).addScaledVector(along, -p.width / 2);
      const geo = p.axis === 'x' ? new THREE.BoxGeometry(p.width - 0.02, p.height, THICK) : new THREE.BoxGeometry(THICK, p.height, p.width - 0.02);
      geo.translate(p.axis === 'x' ? p.width / 2 : 0, p.height / 2, p.axis === 'x' ? 0 : p.width / 2);
      const leaf = new THREE.Mesh(geo, locked ? steel : wood);
      leaf.castShadow = leaf.receiveShadow = true;
      pivot.add(leaf);
      // Handle near the free edge, both sides.
      for (const side of [-1, 1]) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(p.axis === 'x' ? 0.12 : 0.04, 0.03, p.axis === 'x' ? 0.04 : 0.12), handle);
        const off = side * (THICK / 2 + 0.03);
        h.position.set(p.axis === 'x' ? p.width - 0.12 : off, 1.02, p.axis === 'x' ? off : p.width - 0.12);
        pivot.add(h);
      }
      let led: THREE.MeshStandardMaterial | null = null;
      if (locked) {
        // Keycard reader on the wall beside the free edge, both sides.
        led = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 2 });
        this.mats.push(led);
        for (const side of [-1, 1]) {
          const reader = new THREE.Group();
          const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.03), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.4 }));
          const light = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.01), led);
          light.position.set(0, 0.045, 0.02);
          reader.add(body, light);
          const out = side * 0.26;
          const pos = new THREE.Vector3(p.x, p.y + 1.15, p.z).addScaledVector(along, p.width / 2 + 0.14);
          if (p.axis === 'x') { pos.z += out; reader.rotation.y = side > 0 ? 0 : Math.PI; } else { pos.x += out; reader.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; }
          reader.position.copy(pos);
          root.add(reader);
        }
      }
      root.add(pivot);
      const half = { x: p.axis === 'x' ? p.width / 2 : THICK, z: p.axis === 'x' ? THICK : p.width / 2 };
      const collider: AABB = { min: { x: p.x - half.x, y: p.y, z: p.z - half.z }, max: { x: p.x + half.x, y: p.y + p.height, z: p.z + half.z } };
      const door: Door = { prop: p, pivot, leaf, open: p.open ? 1 : 0, target: p.open ? 1 : 0, locked, collider, colliderIn: false, autoClose: 0, led };
      this.doors.push(door);
      this.setCollider(door, !p.open);
      occluders.push(leaf);
      this.pose(door);
    }
  }

  update(dt: number): void {
    for (const d of this.doors) {
      if (d.autoClose > 0) {
        d.autoClose -= dt;
        if (d.autoClose <= 0) d.target = 0;
      }
      if (d.open === d.target) continue;
      const speed = 1.6;
      d.open = d.target > d.open ? Math.min(d.target, d.open + dt * speed) : Math.max(d.target, d.open - dt * speed);
      this.pose(d);
      this.setCollider(d, d.open < 0.35);
    }
  }

  /** The door you're looking at within reach. */
  target(eye: THREE.Vector3, look: THREE.Vector3): Door | null {
    let best: Door | null = null;
    let bestScore = 0;
    for (const d of this.doors) {
      const centre = new THREE.Vector3(d.prop.x, d.prop.y + 1.1, d.prop.z);
      const to = centre.sub(eye);
      const dist = to.length();
      if (dist > 2.2) continue;
      const facing = to.normalize().dot(look);
      if (facing < 0.55) continue;
      if (facing - dist * 0.1 > bestScore) { bestScore = facing - dist * 0.1; best = d; }
    }
    return best;
  }

  /** Player uses a door. Returns what happened. */
  use(d: Door, items: ReadonlySet<string>): 'opened' | 'closed' | 'locked' | 'unlocked' {
    if (d.locked) {
      if (!d.prop.lock || !items.has(d.prop.lock)) return 'locked';
      d.locked = false;
      d.led?.emissive.setHex(0x20ff40);
      d.target = 1;
      return 'unlocked';
    }
    d.target = d.target > 0.5 ? 0 : 1;
    d.autoClose = 0;
    return d.target ? 'opened' : 'closed';
  }

  /** Guards (who carry keys) open doors in their way and let them close behind them. */
  npcPass(pos: THREE.Vector3): void {
    for (const d of this.doors) {
      if (Math.abs(pos.y - d.prop.y) > 1.5) continue;
      const dx = pos.x - d.prop.x;
      const dz = pos.z - d.prop.z;
      if (dx * dx + dz * dz < 1.6 * 1.6) {
        if (d.target < 1) d.target = 1;
        d.autoClose = d.open > 0.9 && !d.prop.open ? 2.5 : Math.max(d.autoClose, 2.5);
      }
    }
  }

  isOpen(id: string): boolean {
    return (this.doors.find(d => d.prop.id === id)?.open ?? 0) > 0.5;
  }

  private pose(d: Door): void {
    d.pivot.rotation.y = -d.open * SWING;
    d.pivot.updateMatrixWorld(true);
  }

  private setCollider(d: Door, solid: boolean): void {
    if (solid === d.colliderIn) return;
    d.colliderIn = solid;
    if (solid) {
      this.colliders.push(d.collider);
      this.info.set(d.collider, { material: d.locked ? 'steel' : 'darkWood', resistance: d.locked ? 120 : 12, invisible: true });
    } else {
      const i = this.colliders.indexOf(d.collider);
      if (i >= 0) this.colliders.splice(i, 1);
    }
  }

  dispose(): void {
    for (const d of this.doors) {
      d.leaf.geometry.dispose();
      const i = this.occluders.indexOf(d.leaf);
      if (i >= 0) this.occluders.splice(i, 1);
    }
    for (const m of this.mats) m.dispose();
  }
}
