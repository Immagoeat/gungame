import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loads the 3D model files (glTF / GLB) in public/models once at startup and keeps them for the
 * whole session. Everything that builds a model asks here first and falls back to its procedural
 * version when a file is missing or failed to load, so the game always runs.
 */

/** Paths relative to the site root (public/). */
export const MODEL_FILES = {
  player: 'models/characters/soldier/Soldier.glb',
  pistol: 'models/guns/service_pistol/service_pistol.gltf',
  boltRifle: 'models/guns/bolt_action_rifle/bolt_action_rifle_7_62.gltf',
} as const;

const loaded = new Map<string, GLTF>();
const failed = new Set<string>();

export function getModel(path: string): GLTF | undefined {
  return loaded.get(path);
}

/** Loads every model file; resolves when all have loaded or failed. */
export async function preloadModels(onProgress?: (done: number, total: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  const paths = Object.values(MODEL_FILES);
  let done = 0;
  await Promise.all(paths.map(async path => {
    try {
      const gltf = await loader.loadAsync(import.meta.env.BASE_URL + path);
      prepare(gltf);
      loaded.set(path, gltf);
    } catch (err) {
      failed.add(path);
      console.warn(`Model ${path} failed to load; using the built-in version.`, err);
    }
    onProgress?.(++done, paths.length);
  }));
}

/** Shadows and texture filtering for every mesh in a freshly loaded file. */
function prepare(gltf: GLTF): void {
  gltf.scene.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = true;
    o.receiveShadow = true;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
        const tex = (m as THREE.MeshStandardMaterial)[key];
        if (tex) tex.anisotropy = 8;
      }
    }
  });
}
