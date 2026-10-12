import * as THREE from 'three';

const MAX_DROPS = 1200;
const GRAVITY = 9.8;

interface Ripple {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  size: number;
}

const ringGeo = new THREE.RingGeometry(0.85, 1, 40);
ringGeo.rotateX(-Math.PI / 2);

/** Splashes (droplet bursts) and expanding ripple rings on water surfaces. */
export class WaterFx {
  private readonly pos = new Float32Array(MAX_DROPS * 3);
  private readonly vel = new Float32Array(MAX_DROPS * 3);
  /** Height of the water surface each drop falls back into. */
  private readonly floor = new Float32Array(MAX_DROPS).fill(-1e9);
  private readonly alive = new Uint8Array(MAX_DROPS);
  private next = 0;
  private readonly points: THREE.Points;
  private readonly ripples: Ripple[] = [];
  private readonly rippleMat = new THREE.MeshBasicMaterial({ color: 0xc9dde6, transparent: true, depthWrite: false, opacity: 0.6 });

  constructor(private readonly scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd4ecf7, size: 0.06, transparent: true, opacity: 0.85, depthWrite: false }));
    this.points.frustumCulled = false;
    this.pos.fill(-1e9);
    scene.add(this.points);
  }

  /** A burst of droplets thrown up from the surface; strength ~0..1. */
  splash(at: THREE.Vector3, surface: number, strength: number, dir?: THREE.Vector3): void {
    const n = Math.round(20 + strength * 160);
    for (let i = 0; i < n; i++) {
      const k = this.next;
      this.next = (this.next + 1) % MAX_DROPS;
      const a = Math.random() * Math.PI * 2;
      const out = (0.4 + Math.random()) * (1 + strength * 2);
      this.pos.set([at.x + Math.cos(a) * 0.1, surface + 0.02, at.z + Math.sin(a) * 0.1], k * 3);
      this.vel.set([
        Math.cos(a) * out + (dir?.x ?? 0) * 0.3,
        (1.5 + Math.random() * 2.5) * (0.6 + strength * 1.4),
        Math.sin(a) * out + (dir?.z ?? 0) * 0.3,
      ], k * 3);
      this.floor[k] = surface;
      this.alive[k] = 1;
    }
    this.ripple(at, surface, 0.6 + strength * 1.6);
    if (strength > 0.4) setTimeout(() => this.ripple(at, surface, 1 + strength * 2), 180);
  }

  /** An expanding ring on the surface. */
  ripple(at: THREE.Vector3, surface: number, size = 1): void {
    const mesh = new THREE.Mesh(ringGeo, this.rippleMat.clone());
    mesh.position.set(at.x, surface + 0.012, at.z);
    mesh.scale.setScalar(0.05);
    this.scene.add(mesh);
    this.ripples.push({ mesh, life: 1.4, max: 1.4, size });
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_DROPS; i++) {
      if (!this.alive[i]) continue;
      this.vel[i * 3 + 1] -= GRAVITY * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < this.floor[i] && this.vel[i * 3 + 1] < 0) {
        this.alive[i] = 0;
        this.pos[i * 3 + 1] = -1e9;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar(0.05 + t * r.size);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
      if (r.life <= 0) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.ripples.splice(i, 1);
      }
    }
  }

  clear(): void {
    this.alive.fill(0);
    this.pos.fill(-1e9);
    for (const r of this.ripples) {
      this.scene.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    }
    this.ripples.length = 0;
  }
}
