import * as THREE from 'three';
import type { PropDef } from '@gungame/shared';
import type { OutfitDef } from './undercover';

export interface ClothesPile<O extends string = string> {
  outfit: O;
  group: THREE.Group;
}

/** How close (m) and how squarely you must look at a pile of clothes to change into it. */
const REACH = 1.9;

/**
 * Clothes lying about: uniforms put out for the shift (a uniform clue prop named "uniform-<outfit>-..."),
 * and whatever you took off when you changed (left folded where you stood).
 */
export class Wardrobe<O extends string> {
  readonly piles: ClothesPile<O>[] = [];
  private readonly mats = new Map<number, THREE.MeshStandardMaterial>();
  private readonly geo = new THREE.BoxGeometry(0.44, 0.07, 0.34);

  constructor(private readonly root: THREE.Object3D, props: readonly PropDef[], private readonly outfits: Record<O, OutfitDef>) {
    for (const p of props) {
      if (p.kind !== 'clue' || p.model !== 'uniform') continue;
      const kind = p.id.split('-')[1];
      const outfit = kind in outfits ? (kind as O) : null;
      if (outfit) this.add(outfit, new THREE.Vector3(p.x, p.y, p.z), p.yaw);
    }
  }

  /** Folded clothes: the jacket or shirt on top of the trousers. */
  add(outfit: O, at: THREE.Vector3, yaw = Math.random() * Math.PI): ClothesPile<O> {
    const style = this.outfits[outfit].style;
    const group = new THREE.Group();
    const bottom = new THREE.Mesh(this.geo, this.mat(style.bottomColor));
    bottom.position.y = 0.035;
    const top = new THREE.Mesh(this.geo, this.mat(style.topColor));
    top.position.set(0.02, 0.105, -0.01);
    top.rotation.y = 0.08;
    top.scale.set(0.95, 1, 0.92);
    group.add(bottom, top);
    if (style.accent !== undefined) {
      const collar = new THREE.Mesh(this.geo, this.mat(style.accent));
      collar.scale.set(0.3, 0.4, 0.3);
      collar.position.set(0, 0.15, -0.08);
      group.add(collar);
    }
    group.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    group.position.copy(at);
    group.rotation.y = yaw;
    this.root.add(group);
    const pile = { outfit, group };
    this.piles.push(pile);
    return pile;
  }

  private mat(color: number): THREE.MeshStandardMaterial {
    let m = this.mats.get(color);
    if (!m) this.mats.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.9 })));
    return m;
  }

  /** The pile you're looking at within reach, if any. */
  target(eye: THREE.Vector3, look: THREE.Vector3): ClothesPile<O> | null {
    let best: ClothesPile<O> | null = null;
    let bestScore = 0;
    for (const p of this.piles) {
      const to = p.group.position.clone().sub(eye);
      const d = to.length();
      if (d > REACH) continue;
      const facing = to.normalize().dot(look);
      if (facing < 0.78) continue;
      const score = facing - d * 0.1;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  take(pile: ClothesPile<O>): void {
    pile.group.removeFromParent();
    this.piles.splice(this.piles.indexOf(pile), 1);
  }

  /** For checkpoints. */
  snapshot(): { outfit: O; x: number; y: number; z: number; yaw: number }[] {
    return this.piles.map(p => ({ outfit: p.outfit, x: p.group.position.x, y: p.group.position.y, z: p.group.position.z, yaw: p.group.rotation.y }));
  }

  restore(list: { outfit: O; x: number; y: number; z: number; yaw: number }[]): void {
    for (const p of [...this.piles]) this.take(p);
    for (const p of list) this.add(p.outfit, new THREE.Vector3(p.x, p.y, p.z), p.yaw);
  }

  dispose(): void {
    for (const p of [...this.piles]) this.take(p);
    this.geo.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}
