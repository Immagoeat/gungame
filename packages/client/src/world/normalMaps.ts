import * as THREE from 'three';

/**
 * Builds a tangent-space normal map from a texture's brightness: dark lines (grout, gaps, grain)
 * become grooves and bright areas stand proud. Cheap "3D" for every procedural surface.
 */
export function normalMapFrom(source: THREE.Texture, strength: number, blur = 1): THREE.Texture {
  const img = source.image as HTMLCanvasElement;
  const w = img.width;
  const h = img.height;
  const src = img.getContext('2d')!.getImageData(0, 0, w, h).data;
  // Height from luminance, with optional box blur so normals are smooth rather than noisy.
  let height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) height[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  for (let pass = 0; pass < blur; pass++) {
    const next = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += height[((y + dy + h) % h) * w + ((x + dx + w) % w)];
      next[y * w + x] = sum / 9;
    }
    height = next;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const out = g.createImageData(w, h);
  const at = (x: number, y: number) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Sobel gradients (wrapping, so the map tiles seamlessly).
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength;
    let ny = dy * strength;
    let nz = 1;
    const len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4;
    out.data[i] = (nx * 0.5 + 0.5) * 255;
    out.data[i + 1] = (ny * 0.5 + 0.5) * 255;
    out.data[i + 2] = (nz * 0.5 + 0.5) * 255;
    out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = source.wrapS;
  t.wrapT = source.wrapT;
  t.repeat.copy(source.repeat);
  t.anisotropy = 8;
  return t;
}
