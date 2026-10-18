import { DIFFICULTIES, GUN_GAME_LADDER, WEAPONS, isDifficultyId } from '@gungame/shared';
import type { Game } from '../core/Game';
import { saveSettings, type Settings } from '../core/Settings';
import { storage } from '../core/storage';
import { MISSIONS } from '../modes/campaign/missions';
import type { MatchResult, ModeId } from '../modes/GameMode';
import { GunGameMode } from '../modes/GunGameMode';
import { Armory } from './Armory';
import { CharacterScreen } from './CharacterScreen';
import { $, escapeHtml } from './dom';

type ScreenId = 'main' | 'modes' | 'campaign' | 'difficulty' | 'settings' | 'howto' | 'armory' | 'character' | 'pause' | 'over';

/** All menu screens. Sub-screens (settings, how to play) return to whichever screen opened them. */
export class Menu {
  private readonly overlay = $('overlay');
  private readonly navStack: ScreenId[] = [];
  private current: ScreenId = 'main';
  private pendingMode: ModeId = 'gungame';
  private readonly armory: Armory;
  private readonly character: CharacterScreen;

  constructor(private readonly game: Game) {
    this.armory = new Armory(game);
    this.character = new CharacterScreen(game);
    this.buildDifficultyList();
    this.buildMissionList();
    $('ladder').innerHTML = GUN_GAME_LADDER.map(r => `<li>${escapeHtml(WEAPONS[r.weapon].name)}</li>`).join('');
    this.bindSettings();
    $('version').textContent = `v${__APP_VERSION__}`;

    document.querySelectorAll<HTMLElement>('[data-go]').forEach(b =>
      b.addEventListener('click', () => this.show(b.dataset.go as ScreenId)));
    document.querySelectorAll<HTMLElement>('[data-back]').forEach(b => b.addEventListener('click', () => this.back()));
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.addEventListener('click', () => {
      this.pendingMode = b.dataset.mode as ModeId;
      this.show('difficulty');
    }));
    document.querySelectorAll<HTMLButtonElement>('.mbtn').forEach(b => {
      b.addEventListener('mouseenter', () => { if (!b.disabled) game.audio.beep(880, 0.03, 'sine', 0.03); });
      b.addEventListener('click', () => { game.audio.init(); game.audio.beep(1320, 0.05, 'triangle', 0.05); });
    });

    $('resumeBtn').addEventListener('click', () => game.resume());
    $('toMenuBtn').addEventListener('click', () => game.goToMainMenu());
    $('againBtn').addEventListener('click', () => game.restartMatch());
    $('overMenuBtn').addEventListener('click', () => game.goToMainMenu());
    const quit = $('quitBtn');
    quit.style.display = /Electron/.test(navigator.userAgent) ? '' : 'none';
    quit.addEventListener('click', () => window.close());

    addEventListener('keydown', e => {
      if (e.code !== 'Escape' || this.overlay.style.display === 'none') return;
      if (!['main', 'pause', 'over'].includes(this.current)) this.back();
    });
  }

  show(id: ScreenId, push = true): void {
    if (push) this.navStack.push(this.current);
    this.current = id;
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === `scr-${id}`));
    const inMatch = this.game.state !== 'menu';
    this.overlay.classList.toggle('center', id === 'over' || id === 'pause' || id === 'armory' || id === 'character' || (inMatch && !['main', 'modes', 'campaign', 'difficulty'].includes(id)));
    if (id === 'armory') this.armory.open(inMatch ? this.game.weapons.id : 'rifle');
    else this.armory.close();
    if (id === 'character') this.character.open();
    else this.character.close();
    this.overlay.style.display = 'flex';
    this.setHint('');
    if (id === 'main') $('record').innerHTML = GunGameMode.recordSummaryHtml();
    if (id === 'campaign') this.buildMissionList();
  }

  showMain(): void {
    this.navStack.length = 0;
    this.show('main', false);
  }

  /** @param details trusted markup from the mode (objectives, intel). */
  showPause(info: string, details = ''): void {
    this.navStack.length = 0;
    $('pauseInfo').textContent = info;
    $('pauseDetails').innerHTML = details;
    $('scr-pause').classList.toggle('details', !!details);
    this.show('pause', false);
  }

  showResults(r: MatchResult): void {
    this.navStack.length = 0;
    const title = $('overTitle');
    title.textContent = r.title;
    title.className = `big ${r.won ? 'win' : 'lose'}`;
    $('overSub').textContent = r.subtitle;
    $('againBtn').textContent = r.againLabel ?? 'Play Again';
    $('overStats').innerHTML = r.stats
      .map(s => `<div><b>${escapeHtml(s.value)}</b><span>${escapeHtml(s.label)}</span></div>`).join('');
    $('overExtra').innerHTML = r.extraHtml ?? '';
    this.show('over', false);
  }

  hide(): void {
    this.armory.close();
    this.character.close();
    this.overlay.style.display = 'none';
  }

  setHint(text: string): void {
    document.querySelectorAll('[data-hint]').forEach(el => (el.textContent = text));
  }

  private back(): void {
    this.show(this.navStack.pop() ?? 'main', false);
  }

  private buildDifficultyList(): void {
    const list = $('diffList');
    for (const [id, d] of Object.entries(DIFFICULTIES)) {
      const b = document.createElement('button');
      b.className = 'mbtn';
      b.innerHTML = `${escapeHtml(d.label)}<small>${escapeHtml(d.blurb)}</small>`;
      b.addEventListener('click', () => {
        if (!isDifficultyId(id)) return;
        storage.set('difficulty', id);
        this.game.startMatch({ mode: this.pendingMode, difficulty: id });
      });
      list.appendChild(b);
    }
  }

  /** Missions, with "Continue" when there's a checkpoint to go back to (rebuilt each time it's shown). */
  private buildMissionList(): void {
    const list = $('missionList');
    list.innerHTML = '';
    for (const mission of MISSIONS) {
      const checkpoint = storage.get<{ stage: number } | null>(`campaign.${mission.id}.checkpoint`, null);
      const done = storage.get<boolean>(`campaign.${mission.id}.complete`, false);
      const add = (label: string, sub: string, cp: unknown) => {
        const b = document.createElement('button');
        b.className = 'mbtn';
        b.innerHTML = `${escapeHtml(label)}<small>${escapeHtml(sub)}</small>`;
        b.addEventListener('click', () => {
          this.game.audio.init();
          void this.game.startMatch({ mode: 'campaign', difficulty: 'normal', missionId: mission.id, checkpoint: cp });
        });
        list.appendChild(b);
      };
      if (checkpoint && checkpoint.stage > 0) add(`Continue: ${mission.title}`, `Chapter ${mission.chapter} · from your last checkpoint`, checkpoint);
      add(checkpoint && checkpoint.stage > 0 ? `Restart: ${mission.title}` : mission.title,
        `Chapter ${mission.chapter}${done ? ' · Complete' : ''} · ${mission.briefing}`, undefined);
    }
  }

  private bindSettings(): void {
    const s = this.game.settings;
    const bind = <K extends keyof Settings>(key: K, inputId: string, format?: (v: Settings[K]) => string) => {
      const input = $<HTMLInputElement | HTMLSelectElement>(inputId);
      const out = format ? $(inputId.replace('set', 'out')) : null;
      const show = () => { if (out && format) out.textContent = format(s[key]); };
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = s[key] as boolean;
      else input.value = String(s[key]);
      show();
      input.addEventListener('input', () => {
        s[key] = (input instanceof HTMLSelectElement ? input.value
          : input.type === 'checkbox' ? input.checked : parseFloat(input.value)) as Settings[K];
        show();
        saveSettings(s);
        if (key === 'volume') this.game.audio.setVolume(s.volume);
        if (key === 'music') this.game.audio.setMusicVolume(s.music);
        if (key === 'quality') this.game.gfx.setQuality(s.quality);
      });
    };
    bind('sens', 'setSens', v => `${v.toFixed(2)}×`);
    bind('fov', 'setFov', v => `${v}°`);
    bind('volume', 'setVolume', v => `${Math.round(v * 100)}%`);
    bind('music', 'setMusic', v => `${Math.round(v * 100)}%`);
    bind('invert', 'setInvert');
    bind('quality', 'setQuality');
  }
}
