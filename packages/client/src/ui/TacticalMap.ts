import type { World } from '../world/World';
import { $, escapeHtml } from './dom';

/** Something to show on the map. */
export interface MapMarker {
  kind: 'player' | 'reyes' | 'objective' | 'guard' | 'camera' | 'door' | 'hide' | 'clue' | 'exit' | 'entry';
  x: number;
  y: number;
  z: number;
  /** Facing (player, guards), same convention as the player's yaw. */
  yaw?: number;
  /** Guards: how alert; cameras: 'off' when looped or broken; doors: lock state. */
  state?: 'calm' | 'wary' | 'combat' | 'off' | 'locked' | 'pick' | 'open' | 'shut';
  label?: string;
}

export interface MapFloor {
  name: string;
  /** Floor top (m). */
  y: number;
}

interface FloorPlan {
  canvas: HTMLCanvasElement;
  minX: number;
  minZ: number;
  scale: number;
}

const WIDTH = 1100;
const MAX_HEIGHT = 640;

const COLORS = {
  calm: '#e9eef2', wary: '#ffb020', combat: '#ff3b30', camera: '#5ad1ff', off: '#5c6670',
  locked: '#ff5a4f', pick: '#ffd166', open: '#6fdc8c', shut: '#c08a52', hide: '#a77b52',
  player: '#ffd166', reyes: '#3ee08f', objective: '#ffd166', clue: '#ffffff', exit: '#3ee08f', entry: '#9fd3ff',
};

/**
 * The tactical map (M): a plan of each floor drawn from the level itself (walkable floor, walls,
 * glass, room names), with you, the objective and whatever you know about on top. Plans are drawn
 * once per floor; markers every frame while it's open.
 */
export class TacticalMap {
  open = false;
  floor = 0;
  private readonly plans = new Map<number, FloorPlan>();
  private readonly canvas = $<HTMLCanvasElement>('tmCanvas');

  private legendKey = '';
  /** Areas where what you're wearing doesn't belong, shaded red (set by the mission). */
  restricted: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }[] = [];

  constructor(private readonly world: World, private readonly floors: MapFloor[]) {}

  /** The key lists only what this level's map can show (no Reyes on the ship). */
  private legend(markers: MapMarker[]): void {
    const has = (kind: MapMarker['kind'], state?: string) => markers.some(m => m.kind === kind && (state === undefined || m.state === state));
    const named = markers.find(m => m.kind === 'reyes')?.label;
    const rows: [string, string, boolean][] = [
      ['You', COLORS.player, true], ['Objective', COLORS.objective, has('objective')], [named ?? '', COLORS.reyes, !!named],
      ['Tagged guard', COLORS.calm, has('guard')], ['Alerted', COLORS.wary, has('guard')], ['Hostile', COLORS.combat, has('guard')],
      ['Camera', COLORS.camera, has('camera')], ['Locked door', COLORS.locked, has('door', 'locked')], ['Pickable lock', COLORS.pick, has('door', 'pick')],
      ['Hiding spot', COLORS.hide, has('hide')], ['Clue', COLORS.clue, has('clue')], ['Exit', COLORS.exit, has('exit')],
      ['Off limits to you', 'rgba(214,40,40,.6)', this.restricted.length > 0],
    ];
    const html = rows.filter(r => r[2]).map(([n, c]) => `<span><i style="background:${c}"></i>${escapeHtml(n)}</span>`).join('');
    if (html === this.legendKey) return;
    this.legendKey = html;
    $('tmLegend').innerHTML = html;
  }

  /** Which floor a height is on. */
  floorOf(y: number): number {
    let best = 0;
    this.floors.forEach((f, i) => { if (y >= f.y - 0.6) best = i; });
    return best;
  }

  toggle(playerY: number): void {
    this.open = !this.open;
    if (this.open) this.floor = this.floorOf(playerY);
    $('tacmap').classList.toggle('on', this.open);
  }

  close(): void {
    this.open = false;
    $('tacmap').classList.remove('on');
  }

  /** Floor keys while open. Returns true if used. */
  key(code: string): boolean {
    if (!this.open) return false;
    if (code === 'ArrowUp' || code === 'PageUp') this.floor = Math.min(this.floors.length - 1, this.floor + 1);
    else if (code === 'ArrowDown' || code === 'PageDown') this.floor = Math.max(0, this.floor - 1);
    else return false;
    return true;
  }

  draw(markers: MapMarker[], time: number, note = ''): void {
    if (!this.open) return;
    this.legend(markers);
    const plan = this.plan(this.floor);
    const cv = this.canvas;
    if (cv.width !== plan.canvas.width || cv.height !== plan.canvas.height) {
      cv.width = plan.canvas.width;
      cv.height = plan.canvas.height;
    }
    const g = cv.getContext('2d')!;
    g.drawImage(plan.canvas, 0, 0);
    const f = this.floors[this.floor];
    $('tmFloor').textContent = `${f.name}${note ? `  ·  ${note}` : ''}`;
    const P = (x: number, z: number) => [(x - plan.minX) * plan.scale, (z - plan.minZ) * plan.scale] as const;
    const s = plan.scale;
    // Off limits to you as you are: hatched red.
    if (this.restricted.length) {
      g.save();
      g.fillStyle = 'rgba(214, 40, 40, 0.22)';
      g.strokeStyle = 'rgba(255, 75, 62, 0.75)';
      g.lineWidth = 1.5;
      for (const r of this.restricted) {
        if (this.floorOf(r.min.y + 0.6) !== this.floor) continue;
        const [x0, z0] = P(r.min.x, r.min.z), [x1, z1] = P(r.max.x, r.max.z);
        g.fillRect(x0, z0, x1 - x0, z1 - z0);
        g.strokeRect(x0, z0, x1 - x0, z1 - z0);
      }
      g.restore();
    }
    const order: MapMarker['kind'][] = ['hide', 'door', 'clue', 'camera', 'exit', 'entry', 'guard', 'reyes', 'objective', 'player'];
    const here = (m: MapMarker) => this.floorOf(m.y + 0.2) === this.floor;
    for (const kind of order) {
      for (const m of markers) {
        if (m.kind !== kind || !here(m)) continue;
        const [x, y] = P(m.x, m.z);
        g.save();
        switch (m.kind) {
          case 'player':
          case 'guard': {
            const col = m.kind === 'player' ? COLORS.player : COLORS[(m.state as 'calm' | 'wary' | 'combat') ?? 'calm'];
            const yaw = m.yaw ?? 0;
            const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
            if (m.kind === 'guard') {
              // View cone.
              g.fillStyle = col + '22';
              g.beginPath();
              g.moveTo(x, y);
              const a = Math.atan2(fz, fx);
              g.arc(x, y, 9 * s, a - 1.0, a + 1.0);
              g.closePath();
              g.fill();
            }
            g.translate(x, y);
            g.rotate(Math.atan2(fz, fx) + Math.PI / 2);
            g.fillStyle = col;
            g.strokeStyle = '#000';
            g.lineWidth = 1.5;
            g.beginPath();
            const r = m.kind === 'player' ? 9 : 6;
            g.moveTo(0, -r); g.lineTo(r * 0.75, r * 0.8); g.lineTo(0, r * 0.35); g.lineTo(-r * 0.75, r * 0.8); g.closePath();
            g.fill(); g.stroke();
            break;
          }
          case 'reyes':
            g.fillStyle = COLORS.reyes;
            g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
            break;
          case 'objective': {
            const pulse = 8 + Math.sin(time * 4) * 2;
            g.strokeStyle = COLORS.objective; g.lineWidth = 2.5;
            g.translate(x, y); g.rotate(Math.PI / 4);
            g.strokeRect(-pulse / 2, -pulse / 2, pulse, pulse);
            break;
          }
          case 'camera':
            g.fillStyle = m.state === 'off' ? COLORS.off : COLORS.camera;
            g.fillRect(x - 4, y - 4, 8, 8);
            break;
          case 'door':
            g.fillStyle = COLORS[(m.state as 'locked' | 'pick' | 'open' | 'shut') ?? 'shut'];
            g.fillRect(x - 4, y - 4, 8, 8);
            break;
          case 'hide':
            g.strokeStyle = COLORS.hide; g.lineWidth = 2;
            g.strokeRect(x - 4, y - 4, 8, 8);
            break;
          case 'clue':
            g.strokeStyle = COLORS.clue; g.lineWidth = 2.5;
            g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x - 1, y + 4); g.lineTo(x + 6, y - 5); g.stroke();
            break;
          case 'exit':
          case 'entry':
            g.fillStyle = m.kind === 'exit' ? COLORS.exit : COLORS.entry;
            g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
            break;
        }
        g.restore();
        if (m.label) {
          g.font = '600 11px system-ui, sans-serif';
          g.fillStyle = '#000';
          g.fillText(m.label, x + 10 + 1, y + 4 + 1);
          g.fillStyle = m.kind === 'objective' ? COLORS.objective : '#dfe7ef';
          g.fillText(m.label, x + 10, y + 4);
        }
      }
    }
  }

  /** The static plan of a floor: walkable floor, walls and glass at chest height, room names. */
  private plan(i: number): FloorPlan {
    const cached = this.plans.get(i);
    if (cached) return cached;
    const f = this.floors[i];
    const nav = this.world.nav;
    const onFloor = (y: number) => this.floorOf(y + 0.2) === i;
    // Bounds: what you can walk on, on this floor.
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let n = 0; n < nav.nodeCount; n++) {
      const y = nav.pos[n * 3 + 1];
      if (!onFloor(y)) continue;
      const x = nav.pos[n * 3], z = nav.pos[n * 3 + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    if (minX === Infinity) { minX = -10; maxX = 10; minZ = -10; maxZ = 10; }
    minX -= 3; minZ -= 3; maxX += 3; maxZ += 3;
    const scale = Math.min(WIDTH / (maxX - minX), MAX_HEIGHT / (maxZ - minZ));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((maxX - minX) * scale);
    canvas.height = Math.round((maxZ - minZ) * scale);
    const g = canvas.getContext('2d')!;
    const P = (x: number, z: number) => [(x - minX) * scale, (z - minZ) * scale] as const;
    g.fillStyle = '#0a0f16';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#1b2736';
    const c = nav.cell * scale;
    for (let n = 0; n < nav.nodeCount; n++) {
      if (!onFloor(nav.pos[n * 3 + 1])) continue;
      const [x, y] = P(nav.pos[n * 3], nav.pos[n * 3 + 2]);
      g.fillRect(x - c / 2, y - c / 2, c + 0.5, c + 0.5);
    }
    const h = f.y + 1.2;
    for (const b of this.world.colliders) {
      if (b.min.y > h || b.max.y < h) continue;
      if (b.max.x - b.min.x > 30 && b.max.z - b.min.z > 30) continue;
      const glass = this.world.colliderInfo.get(b)?.material === 'glass';
      g.fillStyle = glass ? '#3f6f8f' : '#8c9aab';
      const [ax, az] = P(b.min.x, b.min.z);
      const [bx, bz] = P(b.max.x, b.max.z);
      g.fillRect(ax, az, Math.max(1.5, bx - ax), Math.max(1.5, bz - az));
    }
    // Room names.
    g.font = '600 10px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = '#6f8299';
    const done = new Set<string>();
    // Labels that would run into one already placed are left out (small rooms side by side).
    const placed: [number, number, number, number][] = [];
    for (const z of this.world.map.zones) {
      if (!onFloor(z.min.y + 0.8) || z.max.x - z.min.x > 60 || done.has(z.name + z.floor)) continue;
      done.add(z.name + z.floor);
      const [x, y] = P((z.min.x + z.max.x) / 2, (z.min.z + z.max.z) / 2);
      const text = z.name.toUpperCase();
      const w = g.measureText(text).width;
      const room = (z.max.x - z.min.x) * scale;
      const box: [number, number, number, number] = [x - w / 2 - 3, y - 9, x + w / 2 + 3, y + 3];
      if (w > room + 12 || placed.some(b => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
      placed.push(box);
      g.fillText(text, x, y);
    }
    g.textAlign = 'left';
    const plan = { canvas, minX, minZ, scale };
    this.plans.set(i, plan);
    return plan;
  }
}
