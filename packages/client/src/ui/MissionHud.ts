import * as THREE from 'three';
import { $ } from './dom';

export type AlarmName = 'undetected' | 'suspicious' | 'alert' | 'lockdown';

/**
 * Mission HUD: the current objective, a waypoint marker with distance, the alarm state, detection
 * wedges around the crosshair pointing at whoever is noticing you (filling as they become sure),
 * and radio / chatter subtitles.
 */
export class MissionHud {
  private readonly root = $('mission');
  private readonly wedges: HTMLElement[] = [];
  private radioTimer = 0;
  private intelTimer = 0;
  private readonly tagEls: HTMLElement[] = [];

  constructor() {
    const ring = $('detect');
    for (let i = 0; i < 8; i++) {
      const w = document.createElement('div');
      w.className = 'wedge';
      w.innerHTML = '<span></span>';
      ring.appendChild(w);
      this.wedges.push(w);
    }
  }

  show(): void { this.root.style.display = 'block'; }
  hide(): void {
    this.root.style.display = 'none';
    this.restricted(null);
    this.hideIntel();
    this.leads([]);
    this.gadgets('');
    this.dialogue(null);
    for (const el of this.tagEls) el.remove();
    this.tagEls.length = 0;
    $('tacmap').classList.remove('on');
  }

  objective(title: string, text: string, sub = ''): void {
    $('objTitle').textContent = title;
    $('objText').textContent = text;
    $('objSub').textContent = sub;
    const el = $('objective');
    el.classList.remove('new');
    void el.offsetWidth;
    el.classList.add('new');
  }

  sub(text: string): void {
    $('objSub').textContent = text;
  }

  /** A checklist under the objective (leads to follow up). Empty to hide it. */
  leads(items: { name: string; state: 'open' | 'found' | 'lost' }[]): void {
    const ul = $('objLeads');
    ul.innerHTML = '';
    for (const it of items) {
      const li = document.createElement('li');
      li.className = it.state;
      li.textContent = it.name;
      ul.appendChild(li);
    }
  }

  /**
   * Shows what a clue says for a while: `kind` styles it as paper, a screen or a phone.
   * `body` is trusted markup written in the mission script.
   */
  intel(kind: 'paper' | 'screen' | 'phone', from: string, title: string, body: string, seconds = 14): void {
    const el = $('intel');
    el.className = `k-${kind}`;
    el.querySelector('.intel-from')!.textContent = from;
    el.querySelector('.intel-title')!.textContent = title;
    el.querySelector('.intel-body')!.innerHTML = body;
    void el.offsetWidth;
    el.classList.add('on');
    this.intelTimer = seconds;
  }

  /** Your replies in a conversation (null: none showing). */
  dialogue(choices: string[] | null): void {
    const el = $('dialogue');
    el.innerHTML = '';
    el.classList.toggle('on', !!choices?.length);
    choices?.forEach((text, i) => {
      const row = document.createElement('div');
      const k = document.createElement('kbd');
      k.textContent = String(i + 1);
      row.append(k, document.createTextNode(text));
      el.appendChild(row);
    });
  }

  /** The gadget line (coins left, key hints); trusted markup. */
  gadgets(html: string): void {
    const el = $('gadgets');
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /**
   * Markers over tagged guards, seen through walls: colour by how alert they are, with their
   * awareness of you as a small bar.
   */
  tags(camera: THREE.PerspectiveCamera, list: { pos: THREE.Vector3; mood: 'calm' | 'wary' | 'combat'; awareness: number }[]): void {
    const root = $('tags');
    let n = 0;
    const p = new THREE.Vector3();
    for (const t of list) {
      p.copy(t.pos).project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05) continue;
      let el = this.tagEls[n];
      if (!el) {
        el = document.createElement('div');
        el.innerHTML = '<s><b></b></s><i></i>';
        root.appendChild(el);
        this.tagEls.push(el);
      }
      const d = camera.position.distanceTo(t.pos);
      el.className = `tag ${t.mood}${d > 35 ? ' far' : ''}`;
      el.style.display = '';
      el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
      el.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
      (el.firstElementChild!.firstElementChild as HTMLElement).style.width = `${Math.round(t.awareness * 100)}%`;
      n++;
    }
    for (let i = n; i < this.tagEls.length; i++) this.tagEls[i].style.display = 'none';
  }

  hideIntel(): void {
    this.intelTimer = 0;
    $('intel').classList.remove('on');
  }

  alarm(level: AlarmName): void {
    const el = $('alarm');
    el.className = level;
    el.textContent = level.toUpperCase();
  }

  /** The status badge with its own words (undercover: your cover and where you are). */
  /**
   * Somewhere you're not allowed (label: who is), or null once you're out. Entering flashes the
   * warning card; the red edge stays while you're in.
   */
  restricted(label: string | null, detail = ''): boolean {
    const el = $('restricted');
    const was = el.classList.contains('on');
    if (!label) {
      if (was) el.classList.remove('on', 'flash');
      this.rzLabel = '';
      return false;
    }
    // Already in, and it's the same kind of place: nothing new to say.
    const text = `${label}${detail ? ` · ${detail}` : ''}`;
    if (was && text === this.rzLabel) return false;
    this.rzLabel = text;
    $('rzText').textContent = text;
    el.classList.add('on', 'flash');
    clearTimeout(this.rzTimer);
    this.rzTimer = window.setTimeout(() => el.classList.remove('flash'), 3200);
    return true;
  }
  private rzTimer = 0;
  private rzLabel = '';

  status(text: string, level: AlarmName): void {
    const el = $('alarm');
    if (el.className !== level) el.className = level;
    if (el.textContent !== text) el.textContent = text;
  }

  /** A radio line or overheard chatter, for a few seconds. */
  radio(speaker: string, text: string, seconds = 4): void {
    const el = $('radio');
    el.innerHTML = '';
    const who = document.createElement('b');
    who.textContent = speaker;
    el.append(who, document.createTextNode(text));
    el.classList.add('on');
    this.radioTimer = seconds;
  }

  update(
    dt: number, camera: THREE.PerspectiveCamera, marker: { pos: THREE.Vector3; label: string } | null,
    detections: { dir: THREE.Vector3; amount: number; combat: boolean }[],
  ): void {
    if (this.radioTimer > 0) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) $('radio').classList.remove('on');
    }
    if (this.intelTimer > 0) {
      this.intelTimer -= dt;
      if (this.intelTimer <= 0) $('intel').classList.remove('on');
    }
    // Waypoint: on screen at the target, or pinned to the edge pointing at it.
    const wp = $('waypoint');
    if (marker) {
      const p = marker.pos.clone().project(camera);
      const behind = p.z > 1;
      let x = p.x;
      let y = p.y;
      if (behind) { x = -x; y = -y; }
      const edge = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.85;
      if (edge) {
        const k = Math.min(0.92 / Math.max(Math.abs(x), 1e-3), 0.85 / Math.max(Math.abs(y), 1e-3));
        x *= k; y *= k;
        if (behind && Math.abs(y) < 0.85) y = -0.85;
      }
      const d = camera.position.distanceTo(marker.pos);
      wp.style.display = 'block';
      wp.style.left = `${(x * 0.5 + 0.5) * 100}%`;
      wp.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
      wp.classList.toggle('edge', edge);
      $('wpLabel').textContent = `${marker.label} · ${Math.round(d)}m`;
    } else wp.style.display = 'none';

    // Detection wedges: angle round the crosshair from the camera's facing.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    const list = [...detections].sort((a, b) => b.amount - a.amount).slice(0, this.wedges.length);
    this.wedges.forEach((w, i) => {
      const d = list[i];
      if (!d) { w.style.opacity = '0'; return; }
      const to = d.dir.clone().sub(camera.position).setY(0).normalize();
      const angle = Math.atan2(to.dot(right), to.dot(fwd));
      w.style.opacity = String(0.35 + 0.65 * d.amount);
      w.style.transform = `rotate(${angle}rad)`;
      const fill = w.firstElementChild as HTMLElement;
      fill.style.transform = `scaleY(${Math.max(0.08, d.amount)})`;
      fill.style.background = d.combat ? '#ff3b30' : d.amount > 0.45 ? '#ffb020' : '#f2f2f2';
    });
  }
}
