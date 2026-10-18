import * as THREE from 'three';
import type { ClueModel, PropDef } from '@gungame/shared';
import { LAYER_EFFECTS } from '../core/layers';
import { createGlow } from './beams';
import { canvasTexture } from './textures';

type ClueProp = Extract<PropDef, { kind: 'clue' }>;

interface Clue {
  prop: ClueProp;
  group: THREE.Group;
  glow: THREE.Sprite | null;
  read: boolean;
}

/** How close (m) and how squarely you must look at a clue to examine it. */
const REACH = 1.9;

/**
 * Things worth a closer look (`clue` props): Castell's laptop, a kitchen order, a phone, cut zip
 * ties. They catch the light faintly until you've examined them; what they say is the mission's.
 */
export class ClueSystem {
  private readonly clues: Clue[] = [];
  private readonly disposables: { dispose(): void }[] = [];

  constructor(root: THREE.Group, props: readonly PropDef[]) {
    const mats = this.materials();
    for (const p of props) {
      if (p.kind !== 'clue') continue;
      const group = new THREE.Group();
      group.position.set(p.x, p.y, p.z);
      group.rotation.y = p.yaw;
      let glow: THREE.Sprite | null = null;
      // Listening spots have no model; uniforms are put out by the mission (see aurelia/wardrobe.ts).
      if (p.model === 'uniform') continue;
      if (p.model !== 'listen') {
        this.build(p.model, group, mats);
        glow = createGlow(0xdfe8ff, 0.3, 0.22);
        glow.position.y = 0.05;
        glow.layers.set(LAYER_EFFECTS);
        group.add(glow);
        group.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      }
      root.add(group);
      this.clues.push({ prop: p, group, glow, read: false });
    }
  }

  update(time: number): void {
    for (const c of this.clues) {
      if (!c.glow) continue;
      if (c.read) { c.glow.visible = false; continue; }
      const k = Math.pow(Math.max(0, Math.sin(time * 1.1 + c.prop.z)), 10);
      c.glow.material.opacity = 0.15 + 0.6 * k;
      c.glow.scale.setScalar(0.22 + 0.2 * k);
    }
  }

  /** The clue you're looking at within reach (listening spots don't count), if any. */
  target(eye: THREE.Vector3, look: THREE.Vector3): ClueProp | null {
    let best: Clue | null = null;
    let bestScore = 0;
    for (const c of this.clues) {
      if (c.read || c.prop.model === 'listen') continue;
      const to = c.group.position.clone().sub(eye);
      const d = to.length();
      if (d > REACH) continue;
      const facing = to.normalize().dot(look);
      if (facing < 0.8) continue;
      const score = facing - d * 0.1;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best?.prop ?? null;
  }

  position(id: string): THREE.Vector3 | null {
    return this.clues.find(c => c.prop.id === id)?.group.position ?? null;
  }

  markRead(id: string): void {
    const c = this.clues.find(x => x.prop.id === id);
    if (c) c.read = true;
  }

  dispose(): void {
    for (const c of this.clues) {
      c.group.removeFromParent();
      c.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    }
    for (const d of this.disposables) d.dispose();
  }

  // ---------- Models ----------

  private materials() {
    const screen = (bg: string, lines: string, rows: number) => canvasTexture(128, (g, s) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, s, s);
      g.fillStyle = lines;
      for (let i = 0; i < rows; i++) g.fillRect(10, 14 + i * (s - 24) / rows, (s - 20) * (0.45 + 0.5 * ((i * 37) % 10) / 10), 4);
    });
    const paper = canvasTexture(128, (g, s) => {
      g.fillStyle = '#f4f1e8';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#2a2a2a';
      g.fillRect(14, 10, s - 28, 9);
      for (let i = 0; i < 9; i++) g.fillRect(14, 30 + i * 10, (s - 28) * (0.4 + 0.55 * ((i * 53) % 10) / 10), 3);
    });
    const laptopScreen = screen('#e9eef5', '#39475a', 9);
    const phoneScreen = screen('#0f1a2a', '#8fb4e8', 7);
    const m = {
      shell: new THREE.MeshStandardMaterial({ color: 0x9ea3aa, metalness: 0.8, roughness: 0.35 }),
      keys: new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.7 }),
      laptop: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: laptopScreen, emissiveIntensity: 0.9, roughness: 0.2 }),
      phone: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: phoneScreen, emissiveIntensity: 1.1, roughness: 0.15 }),
      black: new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.3, metalness: 0.4 }),
      paper: new THREE.MeshStandardMaterial({ color: 0xffffff, map: paper, roughness: 0.9 }),
      tray: new THREE.MeshStandardMaterial({ color: 0x8a8f96, metalness: 0.85, roughness: 0.3 }),
      plate: new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.35 }),
      bread: new THREE.MeshStandardMaterial({ color: 0xc89a5c, roughness: 0.85 }),
      plastic: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
      tie: new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.55 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xcfe3f0, transparent: true, opacity: 0.35, roughness: 0.05 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x4a1a14, roughness: 0.55 }),
      pages: new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.9 }),
      gilt: new THREE.MeshStandardMaterial({ color: 0xc9a65a, metalness: 1, roughness: 0.3 }),
      brandy: new THREE.MeshStandardMaterial({ color: 0x8a3c10, transparent: true, opacity: 0.8, roughness: 0.1 }),
      amber: new THREE.MeshStandardMaterial({ color: 0x5a2a08, transparent: true, opacity: 0.85, roughness: 0.15 }),
    };
    this.disposables.push(laptopScreen, phoneScreen, paper, ...Object.values(m));
    return m;
  }

  private build(model: Exclude<ClueModel, 'listen' | 'uniform'>, g: THREE.Group, m: ReturnType<ClueSystem['materials']>): void {
    const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, 0);
      g.add(mesh);
      return mesh;
    };
    switch (model) {
      case 'laptop': {
        // Open, the screen towards -z (the chair), lid hinged at the back edge.
        box(0.34, 0.016, 0.235, m.shell, 0, 0.008, 0);
        box(0.3, 0.002, 0.11, m.keys, 0, 0.017, -0.03);
        const lid = new THREE.Group();
        lid.position.set(0, 0.016, 0.115);
        lid.rotation.x = 0.32;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.225, 0.008), m.shell);
        back.position.set(0, 0.112, 0);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.195), m.laptop);
        face.position.set(0, 0.112, -0.0045);
        face.rotation.y = Math.PI;
        lid.add(back, face);
        g.add(lid);
        break;
      }
      case 'phone': {
        box(0.074, 0.008, 0.152, m.black, 0, 0.004, 0);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.142), m.phone);
        face.rotation.x = -Math.PI / 2;
        face.position.y = 0.0085;
        g.add(face);
        break;
      }
      case 'ticket': {
        // A room-service tray: plate with a sandwich, a glass of water, plastic cutlery and the order slip.
        box(0.46, 0.012, 0.32, m.tray, 0, 0.006, 0);
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.014, 28), m.plate);
        plate.position.set(-0.08, 0.019, 0);
        g.add(plate);
        for (const [x, z, r] of [[-0.11, -0.02, 0.4], [-0.05, 0.03, -0.3]]) {
          const half = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 3), m.bread);
          half.position.set(x, 0.042, z);
          half.rotation.y = r;
          g.add(half);
        }
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.1, 18, 1, true), m.glass);
        glass.position.set(0.12, 0.062, -0.08);
        g.add(glass);
        box(0.012, 0.004, 0.14, m.plastic, 0.07, 0.014, 0.04);
        box(0.012, 0.004, 0.13, m.plastic, 0.09, 0.014, 0.04);
        const slip = box(0.08, 0.001, 0.13, m.paper, 0.16, 0.0135, 0.06);
        slip.rotation.y = 0.25;
        break;
      }
      case 'decanter': {
        // A crystal decanter of brandy and four glasses on a silver tray.
        const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.012, 24), m.tray);
        tray.position.y = 0.006;
        g.add(tray);
        const dec = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.085, 0.06], [0.08, 0.13], [0.03, 0.18], [0.025, 0.24], [0.035, 0.25], [0, 0.25]].map(([x, y]) => new THREE.Vector2(x, y)), 18), m.glass);
        dec.position.y = 0.012;
        g.add(dec);
        const brandy = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.09, 16), m.brandy);
        brandy.position.y = 0.06;
        g.add(brandy);
        for (const [x, z] of [[0.13, 0.08], [0.13, -0.08], [-0.12, 0.1], [-0.12, -0.1]]) {
          const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.07, 12, 1, true), m.glass);
          glass.position.set(x, 0.047, z);
          g.add(glass);
        }
        break;
      }
      case 'vial': {
        // A small brown medicine vial and a syringe on a steel tray.
        box(0.22, 0.01, 0.14, m.tray, 0, 0.005, 0);
        const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 10), m.amber);
        vial.position.set(-0.05, 0.035, 0);
        g.add(vial);
        box(0.02, 0.012, 0.02, m.black, -0.05, 0.066, 0);
        const syringe = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 8), m.plastic);
        syringe.rotation.z = Math.PI / 2;
        syringe.position.set(0.05, 0.016, 0.02);
        g.add(syringe);
        break;
      }
      case 'bag': {
        // A dark holdall with an evidence tag on its handles.
        const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.32, 6, 14), m.black);
        bag.rotation.z = Math.PI / 2;
        bag.scale.set(1, 1, 0.85);
        bag.position.y = 0.13;
        g.add(bag);
        for (const x of [-0.08, 0.08]) {
          const h = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI), m.black);
          h.position.set(x, 0.25, 0);
          g.add(h);
        }
        box(0.06, 0.08, 0.004, m.tie, 0.12, 0.2, 0.11, 0, 0.3);
        box(0.02, 0.01, 0.2, m.gilt, 0, 0.26, 0);
        break;
      }
      case 'ledger': {
        // A thick leather-bound ledger with a gilt clasp.
        box(0.24, 0.012, 0.32, m.leather, 0, 0.006, 0);
        box(0.23, 0.04, 0.3, m.pages, 0.004, 0.032, 0);
        box(0.24, 0.012, 0.32, m.leather, 0, 0.058, 0);
        box(0.012, 0.064, 0.32, m.leather, -0.12, 0.032, 0);
        box(0.03, 0.02, 0.05, m.gilt, 0.122, 0.034, 0);
        break;
      }
      case 'zipties': {
        // Cut cable ties and a strip of tape left on the table, a plate nobody touched.
        for (const [x, z, r] of [[0, 0, 0.3], [0.07, 0.04, 1.9], [-0.05, 0.06, 2.6]]) {
          const tie = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.0028, 6, 24, Math.PI * 1.7), m.tie);
          tie.rotation.set(Math.PI / 2, 0, r);
          tie.position.set(x, 0.003, z);
          g.add(tie);
        }
        box(0.16, 0.001, 0.045, m.black, -0.1, 0.0006, -0.06, 0, 0.5);
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.014, 28), m.plate);
        plate.position.set(0.24, 0.007, -0.05);
        g.add(plate);
        const half = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 3), m.bread);
        half.position.set(0.24, 0.03, -0.05);
        g.add(half);
        break;
      }
    }
  }
}
