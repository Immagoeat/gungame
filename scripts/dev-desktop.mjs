// Runs the Vite dev server and opens it in Electron, with hot reload.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root: path.join(root, 'packages/client') });
await server.listen();
server.printUrls();

const env = { ...process.env, GUNGAME_DEV_URL: server.resolvedUrls.local[0] };
delete env.ELECTRON_RUN_AS_NODE; // set by VS Code terminals; makes Electron act as plain Node
const child = spawn(electronPath, [path.join(root, 'packages/desktop')], { stdio: 'inherit', env });
child.on('exit', async code => {
  await server.close();
  process.exit(code ?? 0);
});
