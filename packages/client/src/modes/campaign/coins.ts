import * as THREE from 'three';
import type { World } from '../../world/World';

interface Coin {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  landed: number;
}

/** How far a coin's landing carries to a guard (m). */
export const COIN_HEARD = 11;
const SPEED = 13;
const GRAVITY = 14;

/**
 * Coins to throw (G) as a distraction: one arcs from your hand, lands on whatever it hits first
 * with a clink, and the nearest guard at ease who hears it goes to look.
 */
export class CoinThrower {
  private readonly coins: Coin[] = [];
  private readonly geo = new THREE.CylinderGeometry(0.012, 0.012, 0.002, 16);
  private readonly mat = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.3 });

  constructor(private readonly root: THREE.Object3D, public count: number) {}

  /** Throws one along `dir` (a little upward lob is added). False if none are left. */
  throw(from: THREE.Vector3, dir: THREE.Vector3): boolean {
    if (this.count <= 0) return false;
    this.count--;
    const mesh = new THREE.Mesh(this.geo, this.mat);
    mesh.position.copy(from);
    this.root.add(mesh);
    const vel = dir.clone().normalize().multiplyScalar(SPEED);
    vel.y += 2.5;
    this.coins.push({ mesh, pos: from.clone(), vel, landed: 0 });
    return true;
  }

  /** Moves coins in flight; calls `onLand` where each lands. */
  update(dt: number, world: World, onLand: (at: THREE.Vector3) => void): void {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      if (c.landed > 0) {
        // Lies where it fell for a while, then is gone.
        c.landed += dt;
        if (c.landed > 40) {
          c.mesh.removeFromParent();
          this.coins.splice(i, 1);
        }
        continue;
      }
      c.vel.y -= GRAVITY * dt;
      const next = c.pos.clone().addScaledVector(c.vel, dt);
      if (!world.clearLine(c.pos, next) || next.y < -20) {
        // Find where along the step it hit (bisection on the sight test), and stop just short of it.
        let a = 0, b = 1;
        for (let k = 0; k < 8; k++) {
          const m = (a + b) / 2;
          if (world.clearLine(c.pos, c.pos.clone().lerp(next, m))) a = m; else b = m;
        }
        c.pos.lerp(next, a * 0.98);
        c.mesh.position.copy(c.pos);
        c.mesh.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, 0);
        c.landed = 1e-3;
        onLand(c.pos.clone());
        continue;
      }
      c.pos.copy(next);
      c.mesh.position.copy(c.pos);
      c.mesh.rotation.x += dt * 25;
    }
  }

  dispose(): void {
    for (const c of this.coins) c.mesh.removeFromParent();
    this.coins.length = 0;
    this.geo.dispose();
    this.mat.dispose();
  }
}
