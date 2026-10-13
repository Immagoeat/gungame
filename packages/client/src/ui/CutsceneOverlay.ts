import type { CutsceneFrame } from '../cutscenes/Cutscene';
import { $ } from './dom';

/** Letterbox bars, vignette, fades, title card, subtitles and the hold-to-skip prompt over a cutscene. */
export class CutsceneOverlay {
  private readonly root = $('cutscene');
  private readonly heading = $('csHeading');
  private readonly sub = $('csSub');
  private readonly title = $('csTitle');
  private readonly fade = $('csFade');
  private readonly subtitle = $('csSubtitle');
  private readonly skip = $('csSkipFill');
  private lastLine = '';

  show(): void {
    this.root.style.display = 'block';
  }

  hide(): void {
    this.root.style.display = 'none';
    this.setSkip(0);
  }

  update(f: CutsceneFrame): void {
    this.root.style.setProperty('--bars', String(f.bars));
    this.title.style.opacity = String(f.title?.opacity ?? 0);
    if (f.title && this.heading.textContent !== f.title.heading) {
      this.heading.textContent = f.title.heading;
      this.sub.textContent = f.title.sub;
    }
    this.fade.style.opacity = String(f.fade ?? 0);
    const line = f.subtitle ? `${f.subtitle.speaker}|${f.subtitle.text}` : '';
    if (line !== this.lastLine) {
      this.lastLine = line;
      this.subtitle.classList.toggle('on', !!f.subtitle);
      if (f.subtitle) {
        this.subtitle.innerHTML = '';
        const who = document.createElement('b');
        who.textContent = f.subtitle.speaker;
        this.subtitle.append(who, document.createTextNode(f.subtitle.text));
      }
    }
  }

  /** Progress of holding the skip key, 0..1. */
  setSkip(k: number): void {
    this.skip.style.width = `${Math.round(k * 100)}%`;
  }
}
