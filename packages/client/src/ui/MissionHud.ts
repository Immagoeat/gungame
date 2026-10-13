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
  hide(): void { this.root.style.display = 'none'; }

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

  alarm(level: AlarmName): void {
    const el = $('alarm');
    el.className = level;
    el.textContent = level.toUpperCase();
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
