import * as THREE from 'three';

interface Particle { obj: THREE.Mesh; vel: THREE.Vector3; life: number }
interface Tracer { obj: THREE.Line; life: number; max: number }
export type ImpactKind = 'masonry' | 'plaster' | 'metal' | 'wood' | 'soft' | 'foliage' | 'glass' | 'flesh';

interface Emitter { at: THREE.Vector3; life: number; timer: number; color: number }

const MAX_DECALS = 80;

/** Short-lived visual effects: sparks, bullet tracers and bullet holes. */
export class Effects {
  private readonly particles: Particle[] = [];
  private readonly tracers: Tracer[] = [];
  private readonly decals: THREE.Mesh[] = [];
  private readonly emitters: Emitter[] = [];
  private readonly sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  private readonly decalGeo = new THREE.CircleGeometry(0.06, 8);
  private readonly decalMat = new THREE.MeshBasicMaterial({ color: 0x111111, polygonOffset: true, polygonOffsetFactor: -4 });
  private readonly sparkMats = new Map<number, THREE.MeshBasicMaterial>();

  constructor(private readonly scene: THREE.Scene) {}

  sparks(at: THREE.Vector3, count: number, color: number, normal?: THREE.Vector3): void {
    let mat = this.sparkMats.get(color);
    if (!mat) this.sparkMats.set(color, (mat = new THREE.MeshBasicMaterial({ color })));
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.sparkGeo, mat);
      m.position.copy(at);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).multiplyScalar(4);
      if (normal) vel.addScaledVector(normal, 2.5);
      this.scene.add(m);
      this.particles.push({ obj: m, vel, life: 0.35 + Math.random() * 0.3 });
    }
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe7a0): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ obj: line, life: 0.07, max: 0.07 });
  }

  bulletHole(at: THREE.Vector3, normal: THREE.Vector3, scale = 1): void {
    const d = new THREE.Mesh(this.decalGeo, this.decalMat);
    d.scale.setScalar(scale);
    d.position.copy(at).addScaledVector(normal, 0.01);
    d.lookAt(at.clone().add(normal));
    this.scene.add(d);
    this.decals.push(d);
    if (this.decals.length > MAX_DECALS) this.scene.remove(this.decals.shift()!);
  }

  /** Keeps spitting sparks from a point for a while (e.g. a shot-out camera's severed wiring). */
  sparkEmitter(at: THREE.Vector3, seconds: number, color = 0xffd27a): void {
    this.emitters.push({ at: at.clone(), life: seconds, timer: 0, color });
  }

  /** Debris kicked up where a bullet strikes a surface. */
  impact(at: THREE.Vector3, normal: THREE.Vector3, kind: ImpactKind, count = 5): void {
    const colors: Record<ImpactKind, number> = {
      masonry: 0xd2c8b6, plaster: 0xf2efe8, metal: 0xffd27a, wood: 0x8a5a33, soft: 0x6a6460, foliage: 0x4a7a3a, glass: 0xeaf6ff, flesh: 0xb71c1c,
    };
    this.sparks(at, kind === 'metal' ? count + 4 : count, colors[kind], normal);
  }

  update(dt: number): void {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.life -= dt;
      e.timer -= dt;
      if (e.timer <= 0) {
        e.timer = 0.05 + Math.random() * 0.25;
        this.sparks(e.at, 2 + Math.floor(Math.random() * 4), e.color, new THREE.Vector3(0, -0.5, 0));
      }
      if (e.life <= 0) this.emitters.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 14 * dt;
      p.obj.position.addScaledVector(p.vel, dt);
      p.obj.scale.setScalar(Math.max(0.01, p.life * 2.5));
      if (p.life <= 0) {
        this.scene.remove(p.obj);
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      (t.obj.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / t.max);
      if (t.life <= 0) {
        this.scene.remove(t.obj);
        t.obj.geometry.dispose();
        (t.obj.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.particles) this.scene.remove(p.obj);
    for (const t of this.tracers) { this.scene.remove(t.obj); t.obj.geometry.dispose(); }
    for (const d of this.decals) this.scene.remove(d);
    this.particles.length = this.tracers.length = this.decals.length = this.emitters.length = 0;
  }
}
