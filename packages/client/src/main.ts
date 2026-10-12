import './ui/styles.css';
import * as shared from '@gungame/shared';
import { preloadModels } from './assets/AssetLibrary';
import { Game } from './core/Game';

async function start(): Promise<void> {
  // Character and weapon models load before anything that uses them is built.
  const loading = document.createElement('div');
  loading.id = 'loading';
  loading.innerHTML = '<div class="loading-title">GUN GAME</div><div class="loading-bar"><span></span></div>';
  document.body.appendChild(loading);
  const bar = loading.querySelector('span')!;
  await preloadModels((done, total) => { bar.style.width = `${(done / total) * 100}%`; });
  loading.remove();

  const game = new Game(document.body);
  game.boot();
  // Dev builds expose the game (and shared data) for poking at from the devtools console (F12).
  if (import.meta.env.DEV) Object.assign(window, { game, shared });
}

void start();
