// Electron entry. In dev (npm run dev:desktop) it loads the Vite server; otherwise the built client.
const { app, BrowserWindow, net, protocol } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

app.setName('Gun Game');

// The built game is served from app://game/ rather than file:// so it can fetch its model files
// (fetch doesn't work on file:// pages).
const DIST = path.join(__dirname, '..', 'client', 'dist');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function serveDist() {
  protocol.handle('app', request => {
    const file = path.normalize(path.join(DIST, decodeURIComponent(new URL(request.url).pathname)));
    if (!file.startsWith(DIST + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    title: 'Gun Game',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setMenu(null);
  mainWindow = win;
  // Show once the first frame is ready, so there's no white flash on launch.
  win.once('ready-to-show', () => win.show());

  const devUrl = process.env.GUNGAME_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadURL('app://game/index.html');

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
    if (input.key === 'F12') win.webContents.toggleDevTools();
  });
}

// One copy of the game at a time: launching it again focuses the open window.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(() => {
  serveDist();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
