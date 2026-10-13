import { $ } from './dom';

/** What the loading screen says about the match being loaded. */
export interface LoadingInfo {
  title: string;
  /** Small line above the title (chapter, mode). */
  kicker: string;
  /** Briefing or mode description. */
  description: string;
  /** Place and time, e.g. "Beverly Hills, California · 21:04". */
  location?: string;
  /** Background picture (path under public/). */
  image?: string;
}

const TIPS = [
  'Bullets punch through thin walls, doors and glass, losing speed with every layer.',
  'Crouch (C) and go prone (Z) to steady your aim; a bipod helps even more.',
  'Shoot out the lights to darken a room.',
  'Security cameras can be shot down. What they film shows on the monitors in the security room.',
  'Hold your breath under water as long as you can; the meter shows how long is left.',
  'Customize every gun in the Armory, and your soldier on the Character screen.',
  'Number keys or the mouse wheel switch weapons; Q swaps back to the last one.',
  'Broken glass crunches underfoot, and breaks up further as you walk over it.',
];

/**
 * Full-screen mission loading: background art, title and briefing, a real progress bar driven by the
 * load steps, rotating tips, then "click to continue" (which also gives the game the click it needs to
 * capture the mouse).
 */
export class LoadingScreen {
  private readonly root = $('missionLoading');
  private tipTimer = 0;
  private tipIndex = Math.floor(Math.random() * TIPS.length);

  show(info: LoadingInfo): void {
    $('mlKicker').textContent = info.kicker;
    $('mlTitle').textContent = info.title;
    $('mlLocation').textContent = info.location ?? '';
    $('mlDesc').textContent = info.description;
    const bg = $('mlBg');
    bg.style.backgroundImage = info.image ? `url("${import.meta.env.BASE_URL}${info.image}")` : '';
    bg.classList.toggle('none', !info.image);
    this.root.classList.remove('ready', 'leaving');
    this.progress(0, 'Loading');
    this.root.style.display = 'flex';
    this.nextTip();
    clearInterval(this.tipTimer);
    this.tipTimer = window.setInterval(() => this.nextTip(), 6000);
  }

  progress(k: number, label: string): void {
    $('mlFill').style.width = `${Math.round(Math.max(0, Math.min(1, k)) * 100)}%`;
    $('mlStatus').textContent = label;
  }

  /** Shows the continue prompt and resolves on the next click or key press. */
  waitForContinue(): Promise<void> {
    this.root.classList.add('ready');
    return new Promise(resolve => {
      const go = (e: Event) => {
        if (e instanceof KeyboardEvent && ['Escape', 'F11', 'F12'].includes(e.key)) return;
        removeEventListener('mousedown', go, true);
        removeEventListener('keydown', go, true);
        resolve();
      };
      // Let the click that may have started loading pass first.
      setTimeout(() => {
        addEventListener('mousedown', go, true);
        addEventListener('keydown', go, true);
      }, 150);
    });
  }

  hide(): void {
    clearInterval(this.tipTimer);
    this.root.classList.add('leaving');
    setTimeout(() => {
      if (this.root.classList.contains('leaving')) this.root.style.display = 'none';
    }, 450);
  }

  /** Immediately, e.g. when quitting to the menu mid-load. */
  cancel(): void {
    clearInterval(this.tipTimer);
    this.root.style.display = 'none';
  }

  private nextTip(): void {
    this.tipIndex = (this.tipIndex + 1) % TIPS.length;
    const tip = $('mlTip');
    tip.classList.remove('in');
    void tip.offsetWidth;
    tip.textContent = TIPS[this.tipIndex];
    tip.classList.add('in');
  }
}
