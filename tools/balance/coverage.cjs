// Sight-coverage heat maps of the Mansion, for balancing guard posts, routes and cameras.
//
//   npm run dev            (in another terminal: the dev server on port 5199)
//   env -u ELECTRON_RUN_AS_NODE npx electron tools/balance/coverage.cjs [normal|easy|hard] [outdir]
//
// Writes <floor>.png per floor (red: spotted in 3 s or less, orange 8 s, yellow 20 s, green slow or a
// glimpse, blue never seen) with guard routes, cameras, clues and doors drawn on, and prints how much
// of each floor is red and how much is never watched.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const difficulty = process.argv.find(a => ['easy', 'normal', 'hard'].includes(a)) ?? 'normal';
const out = path.resolve(process.argv.slice(2).find(a => !['easy', 'normal', 'hard'].includes(a) && !a.endsWith('.cjs')) ?? 'coverage');
const url = process.env.GAME_URL ?? 'http://localhost:5199/';

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 720, show: false });
  await win.loadURL(url);
  await new Promise(r => setTimeout(r, 4500));
  const page = fs.readFileSync(path.join(__dirname, 'coverage-page.js'), 'utf8');
  const result = JSON.parse(await win.webContents.executeJavaScript(`window.DIFFICULTY = ${JSON.stringify(difficulty)};\n${page}`, true));
  fs.mkdirSync(out, { recursive: true });
  for (const [floor, data] of Object.entries(result.images)) fs.writeFileSync(path.join(out, `${floor}.png`), Buffer.from(data.split(',')[1], 'base64'));
  console.log(`${difficulty}: ${result.pts} spots, simulated in ${result.tSim} ms, analysed in ${result.tAn} ms`);
  for (const [floor, s] of Object.entries(result.stats)) console.log(`  ${floor.padEnd(9)} red ${(s.red * 100).toFixed(0)}%  never seen ${(s.unseen * 100).toFixed(0)}%`);
  console.log(`maps in ${out}`);
  app.quit();
});
