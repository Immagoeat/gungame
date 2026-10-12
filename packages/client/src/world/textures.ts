import * as THREE from 'three';

type Painter = (g: CanvasRenderingContext2D, size: number) => void;

/** Procedural canvas texture. Swap these for image files in public/textures as art arrives. */
export function canvasTexture(size: number, paint: Painter, repeat = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

const speckle = (g: CanvasRenderingContext2D, s: number, n: number, alpha: number, px: number) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, px, px);
  }
};

export const floorTexture = () => canvasTexture(256, (g, s) => {
  g.fillStyle = '#6d7366';
  g.fillRect(0, 0, s, s);
  speckle(g, s, 1500, 0.08, 3);
  g.strokeStyle = 'rgba(255,255,255,.18)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, s, s);
});

export const crateTexture = () => canvasTexture(128, (g, s) => {
  g.fillStyle = '#9a6b3c';
  g.fillRect(0, 0, s, s);
  g.strokeStyle = '#6b4523';
  g.lineWidth = 10;
  g.strokeRect(5, 5, s - 10, s - 10);
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(8, 8);
  g.lineTo(s - 8, s - 8);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(60,35,15,.25)';
    g.fillRect(10, 18 + i * 18, s - 20, 2);
  }
});

export const concreteTexture = () => canvasTexture(128, (g, s) => {
  g.fillStyle = '#a7a59e';
  g.fillRect(0, 0, s, s);
  speckle(g, s, 900, 0.1, 2);
  g.strokeStyle = 'rgba(0,0,0,.2)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, s, s);
});

export const muzzleFlashTexture = () => canvasTexture(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,220,1)');
  gr.addColorStop(0.3, 'rgba(255,190,80,.9)');
  gr.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
});
