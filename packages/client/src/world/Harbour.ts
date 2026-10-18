import * as THREE from 'three';
import { HARBOUR_LEVEL, QUAY } from '@gungame/shared';
import { mulberry, waveNormals } from './Seascape';

/**
 * Round the port: the basin's water out to the breakwater and the open sea beyond, flat dark land
 * running on past the map's edges, and the lights of everything else that works at night: the far
 * shore, the other terminals' cranes (red lamps on their tops), the breakwater's lighthouse.
 */
export class Harbour {
  private readonly group = new THREE.Group();
  private readonly disposables: { dispose(): void }[] = [];
  private readonly waves: THREE.Texture;
  private readonly waterMat: THREE.MeshStandardMaterial;
  private readonly nightMats: { mat: THREE.Material & { opacity: number }; max: number }[] = [];
  private readonly beacon: THREE.PointsMaterial;
  private readonly cranes: THREE.PointsMaterial;
  private time = 0;

  constructor(root: THREE.Object3D) {
    // ---- The water: everything north of the quay.
    this.waves = waveNormals();
    this.waves.repeat.set(140, 140);
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x0a1c2a, roughness: 0.28, metalness: 0.35, normalMap: this.waves, normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 0.6,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800 + QUAY).rotateX(-Math.PI / 2), this.waterMat);
    water.position.set(0, HARBOUR_LEVEL, (QUAY - 1800) / 2);
    water.receiveShadow = true;
    this.group.add(water);
    this.disposables.push(water.geometry, this.waterMat, this.waves);

    // ---- The land the port sits on, going on past the map: dark, flat.
    const landMat = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 1 });
    const land = new THREE.Mesh(new THREE.PlaneGeometry(1800, 900).rotateX(-Math.PI / 2), landMat);
    land.position.set(0, -0.05, QUAY + 450);
    this.group.add(land);
    this.disposables.push(land.geometry, landMat);

    // ---- The breakwater: a long low wall across the basin, the harbour mouth at its east end.
    const stone = new THREE.MeshStandardMaterial({ color: 0x2a2b2c, roughness: 1 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(700, 5, 12), stone);
    wall.position.set(-150, HARBOUR_LEVEL + 1.5, -330);
    this.group.add(wall);
    this.disposables.push(wall.geometry, stone);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3, 18, 12), new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.8 }));
    tower.position.set(200, HARBOUR_LEVEL + 9, -330);
    this.group.add(tower);
    this.disposables.push(tower.geometry, tower.material as THREE.Material);

    // ---- Lights: the far shore and the city behind the port; the other terminals; ships at anchor.
    const rand = mulberry(301);
    const pts: number[] = [], cols: number[] = [];
    const warm = () => { const w = rand() < 0.72; cols.push(1, w ? 0.72 : 0.92, w ? 0.42 : 0.86); };
    for (let i = 0; i < 1600; i++) {
      // Across the water to the north, a long low band.
      pts.push((rand() - 0.5) * 1600, HARBOUR_LEVEL + 1 + rand() * rand() * 30, -620 - rand() * 160);
      warm();
    }
    for (let i = 0; i < 900; i++) {
      // Inland: the city climbing the hills to the south and east.
      const a = rand() * Math.PI - Math.PI * 0.05;
      const r = 300 + rand() * 450;
      pts.push(Math.cos(a) * r, 2 + rand() * rand() * 60 + (r - 300) * 0.06, QUAY + 120 + Math.sin(a) * r);
      warm();
    }
    for (const [sx, sz] of [[-360, -150], [120, -230]]) {
      // Ships at anchor out in the basin.
      for (let i = 0; i < 22; i++) { pts.push(sx + (rand() - 0.5) * 70, HARBOUR_LEVEL + 3 + rand() * 12, sz + (rand() - 0.5) * 10); cols.push(1, 0.9, 0.7); }
    }
    this.addPoints(pts, cols, 2.2, 0.9);
    // The other terminals: crane silhouettes far east and west, red warning lamps on their tops.
    const craneMat = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.9 });
    this.disposables.push(craneMat);
    const redPts: number[] = [];
    for (const x of [-420, -380, -340, 360, 400, 440, 480]) {
      const g = new THREE.Group();
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 18, 1.4), craneMat);
        leg.position.set(sx * 8, 9, sz * 12);
        g.add(leg);
        this.disposables.push(leg.geometry);
      }
      const boom = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 80), craneMat);
      boom.position.set(0, 31, -14);
      const apex = new THREE.Mesh(new THREE.BoxGeometry(2, 28, 2), craneMat);
      apex.position.set(0, 32, 2);
      g.add(boom, apex);
      this.disposables.push(boom.geometry, apex.geometry);
      g.position.set(x, 0, QUAY + 10);
      this.group.add(g);
      redPts.push(x, 46.5, QUAY + 12, x, 32.5, QUAY - 52);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(redPts, 3));
    this.cranes = new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, color: 0xff2a1a, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.disposables.push(rg, this.cranes);
    this.group.add(new THREE.Points(rg, this.cranes));
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute([200, HARBOUR_LEVEL + 19, -330], 3));
    this.beacon = new THREE.PointsMaterial({ size: 8, sizeAttenuation: false, color: 0x3cff6a, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.disposables.push(bg, this.beacon);
    this.group.add(new THREE.Points(bg, this.beacon));
    root.add(this.group);
  }

  private addPoints(pts: number[], cols: number[], size: number, max: number): void {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.disposables.push(g, m);
    this.nightMats.push({ mat: m, max });
    this.group.add(new THREE.Points(g, m));
  }

  /** @param night 0 day .. 1 night */
  update(dt: number, night: number): void {
    this.time += dt;
    const t = this.time;
    this.waves.offset.x += dt * 0.004;
    this.waves.offset.y += dt * 0.007;
    this.waterMat.color.setHex(0x0a1c2a).lerp(new THREE.Color(0x2a5e7a), 1 - night);
    const dark = THREE.MathUtils.smoothstep(night, 0.3, 0.9);
    for (const n of this.nightMats) n.mat.opacity = dark * n.max;
    // The cranes' lamps pulse slowly together; the harbour light flashes green every four seconds.
    this.cranes.opacity = dark * (0.55 + 0.45 * Math.max(0, Math.sin(t * 1.6)));
    this.beacon.opacity = dark * (t % 4 < 0.6 ? 1 : 0.06);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
