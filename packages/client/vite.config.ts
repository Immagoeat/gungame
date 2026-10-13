import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative asset paths so the build loads from file:// inside Electron
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5173 },
  // Pre-bundle three and its addons together so dev doesn't load two copies of three.
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/objects/Sky.js',
      'three/examples/jsm/environments/RoomEnvironment.js',
      'three/examples/jsm/postprocessing/EffectComposer.js',
      'three/examples/jsm/postprocessing/GTAOPass.js',
      'three/examples/jsm/postprocessing/OutputPass.js',
      'three/examples/jsm/postprocessing/Pass.js',
      'three/examples/jsm/postprocessing/ShaderPass.js',
      'three/examples/jsm/postprocessing/RenderPass.js',
      'three/examples/jsm/postprocessing/SMAAPass.js',
      'three/examples/jsm/postprocessing/UnrealBloomPass.js',
    ],
  },
  resolve: { dedupe: ['three'] },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // three.js alone is ~650 kB; keep it in its own long-cached chunk
    chunkSizeWarningLimit: 800,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});
