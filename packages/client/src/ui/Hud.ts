import { $, escapeHtml, formatTime } from './dom';

export interface HudFrame {
  hp: number;
  weaponName: string;
  ammo: number;
  magazine: number;
  reloading: boolean;
  elapsed: number;
  /** Weapon cone half-angle in radians, drawn as crosshair gap. */
  spread: number;
  fov: number;
  aiming: boolean;
  hasScope: boolean;
  scoped: boolean;
  stance: string;
  /** 0..1, shown only while underwater or recovering. */
  breath: number;
  underwater: boolean;
}

/** One entry in the mode's progress strip (weapon ladder, mission objectives, scoreboard...). */
export interface ProgressItem {
  label: string;
  state: 'done' | 'current' | 'todo';
}

export class Hud {
  private readonly root = $('hud');
  private hitmarkerTimer = 0;
  private damageDirTimer = 0;
  private vignette = 0;
  private bannerTimer = 0;

  show(): void { this.root.style.display = 'block'; }
  hide(): void {
    this.root.style.display = 'none';
    $('scope').style.display = 'none';
  }

  reset(): void {
    $('killfeed').innerHTML = '';
    this.vignette = this.damageDirTimer = this.hitmarkerTimer = 0;
    $('banner').style.opacity = '0';
  }

  setProgress(title: string, items: ProgressItem[]): void {
    $('levelTitle').textContent = title;
    const cls = { done: 'done', current: 'cur', todo: '' } as const;
    $('pips').innerHTML = items.map(i => `<span class="${cls[i.state]}">${escapeHtml(i.label)}</span>`).join('');
  }

  hitmarker(kill: boolean): void {
    const hm = $('hitmarker');
    hm.classList.toggle('kill', kill);
    hm.style.opacity = '1';
    this.hitmarkerTimer = 0.12;
  }

  /** @param relAngle direction of the attacker relative to view, radians clockwise from straight ahead. */
  damage(amount: number, relAngle: number): void {
    this.vignette = Math.min(1, 0.35 + amount / 25);
    const dd = $('dmgdir');
    dd.style.transform = `rotate(${relAngle}rad)`;
    this.damageDirTimer = 1;
  }

  /** Adds a kill feed line. `html` must already be escaped. */
  feed(html: string): void {
    const div = document.createElement('div');
    div.innerHTML = html;
    $('killfeed').prepend(div);
    setTimeout(() => div.remove(), 3600);
  }

  /** The carried weapons by number key, current one highlighted. Hidden when there's only one. */
  setWeaponSlots(names: string[], current: number): void {
    const el = $('wslots');
    el.style.display = names.length > 1 ? 'flex' : 'none';
    el.innerHTML = names.map((n, i) =>
      `<span class="${i === current ? 'on' : ''}"><kbd>${i + 1}</kbd>${escapeHtml(n)}</span>`).join('');
  }

  /** An interaction prompt under the crosshair ("[E] Pick up SMG"); empty hides it. */
  prompt(html: string): void {
    const el = $('prompt');
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.innerHTML = html;
    el.style.opacity = html ? '1' : '0';
  }

  banner(title: string, subtitle: string): void {
    const b = $('banner');
    b.innerHTML = `${escapeHtml(title)}<small>${escapeHtml(subtitle)}</small>`;
    b.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (b.style.opacity = '0'), 1800);
  }

  update(dt: number, f: HudFrame): void {
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) $('hitmarker').style.opacity = '0';
    }
    if (this.damageDirTimer > 0) this.damageDirTimer -= dt;
    $('dmgdir').style.opacity = String(Math.max(0, this.damageDirTimer));
    this.vignette = Math.max(0, this.vignette - dt * 1.2);
    $('vignette').style.opacity = String(this.vignette);

    const hp = Math.ceil(f.hp);
    $('hpNum').textContent = String(hp);
    const fill = $('hpFill');
    fill.style.width = `${hp}%`;
    fill.style.background = hp > 50 ? 'linear-gradient(90deg,#3ddc84,#8ef0b5)'
      : hp > 25 ? 'linear-gradient(90deg,#ffb020,#ffd166)' : 'linear-gradient(90deg,#e53935,#ff6b6b)';

    $('stance').textContent = f.stance;
    $('underwater').style.display = f.underwater ? 'block' : 'none';
    $('breathBar').style.display = f.breath < 0.999 ? 'block' : 'none';
    $('breathFill').style.width = `${Math.round(f.breath * 100)}%`;
    $('wName').textContent = f.weaponName;
    // ammo < 0: unarmed.
    $('ammoCount').innerHTML = f.ammo < 0 ? '—' : `${f.ammo}<small> / ${f.magazine}</small>`;
    $('reloadTxt').textContent = f.reloading ? 'RELOADING…' : f.ammo === 0 ? 'PRESS R' : '';
    $('timer').textContent = formatTime(f.elapsed);
    $('scope').style.display = f.scoped ? 'block' : 'none';

    const gap = 4 + f.spread * innerHeight / (2 * Math.tan((f.fov * Math.PI) / 360));
    $('chL').style.left = `${-gap - 10}px`;
    $('chR').style.left = `${gap}px`;
    $('chT').style.top = `${-gap - 10}px`;
    $('chB').style.top = `${gap}px`;
    $('crosshair').style.opacity = f.aiming && f.hasScope ? '0' : f.aiming ? '0.5' : '1';
  }
}
