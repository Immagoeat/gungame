import * as THREE from 'three';
import { WEAPONS, type PropDef, type WeaponId } from '@gungame/shared';
import { LAYER_EFFECTS } from '../core/layers';
import { loadouts } from '../core/loadouts';
import { buildGun, type GunModel } from '../weapons/gunModels';
import { createGlow } from './beams';

type PickupProp = Extract<PropDef, { kind: 'weaponPickup' }>;

interface Pickup {
  prop: PickupProp;
  gun: GunModel;
  group: THREE.Group;
  glow: THREE.Sprite;
  taken: boolean;
}

/** How close (m) and how squarely you must look at a pickup to take it. */
const REACH = 1.8;

/**
 * Weapons lying in the world. They glint so you can spot them; walk up, look at one and press E.
 */
export class PickupSystem {
  private readonly pickups: Pickup[] = [];

  constructor(root: THREE.Group, props: readonly PropDef[]) {
    for (const p of props) {
      if (p.kind !== 'weaponPickup') continue;
      const gun = buildGun(p.weapon, loadouts.get(p.weapon));
      const group = new THREE.Group();
      // Lying on its side: the gun's -z (muzzle) along the yaw, its right side up.
      gun.group.rotation.set(0, 0, Math.PI / 2);
      gun.group.position.y = 0.03;
      group.add(gun.group);
      group.position.set(p.x, p.y, p.z);
      group.rotation.y = p.yaw;
      const glow = createGlow(0xfff2c8, 0.5, 0.35);
      glow.position.y = 0.06;
      group.add(glow);
      group.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });
      glow.layers.set(LAYER_EFFECTS);
      root.add(group);
      this.pickups.push({ prop: p, gun, group, glow, taken: false });
    }
  }

  update(time: number): void {
    for (const p of this.pickups) {
      if (p.taken) continue;
      // A slow glint so pickups catch the eye without looking like an arcade game.
      const k = Math.pow(Math.max(0, Math.sin(time * 1.6 + p.prop.x)), 8);
      p.glow.material.opacity = 0.25 + 0.75 * k;
      p.glow.scale.setScalar(0.35 + 0.3 * k);
    }
  }

  /** The pickup you're looking at within reach, if any. */
  target(eye: THREE.Vector3, look: THREE.Vector3): { weapon: WeaponId; name: string } | null {
    let best: Pickup | null = null;
    let bestScore = 0;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const to = p.group.position.clone().sub(eye);
      const d = to.length();
      if (d > REACH) continue;
      const facing = to.normalize().dot(look);
      if (facing < 0.75) continue;
      const score = facing - d * 0.1;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best ? { weapon: best.prop.weapon, name: WEAPONS[best.prop.weapon].name } : null;
  }

  take(weapon: WeaponId): void {
    const p = this.pickups.find(x => !x.taken && x.prop.weapon === weapon);
    if (!p) return;
    p.taken = true;
    p.group.removeFromParent();
    p.gun.dispose();
  }

  takenWeapons(): WeaponId[] {
    return this.pickups.filter(p => p.taken).map(p => p.prop.weapon);
  }

  dispose(): void {
    for (const p of this.pickups) if (!p.taken) p.gun.dispose();
  }
}
