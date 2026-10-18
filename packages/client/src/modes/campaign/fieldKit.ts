import * as THREE from 'three';
import { FURNITURE, type PropDef } from '@gungame/shared';
import type { Game } from '../../core/Game';
import type { Guard } from '../../npc/Guard';
import type { GuardManager } from '../../npc/GuardManager';
import type { MissionHud } from '../../ui/MissionHud';
import { TacticalMap, type MapFloor, type MapMarker } from '../../ui/TacticalMap';
import { CoinThrower, COIN_HEARD } from './coins';

/** Furniture you can stash a body in. */
const HIDING_FURNITURE = new Set(['wardrobe', 'gunLocker', 'crewLocker']);
/** How far (m) and how close to the crosshair a guard can be tagged. */
const TAG_RANGE = 70;

/**
 * The player's kit beyond the guns: tagging guards (T) so you can track them through walls, coins to
 * throw as a distraction (G), and the tactical map (M). Also knows the hiding spots for bodies.
 */
export class FieldKit {
  readonly tagged = new Set<Guard>();
  readonly coins: CoinThrower;
  readonly map: TacticalMap;
  /** Wardrobes and lockers, and whether a body is already in each. */
  readonly hidingSpots: { pos: THREE.Vector3; used: boolean }[];
  private time = 0;

  constructor(private readonly game: Game, private readonly guards: GuardManager, private readonly hud: MissionHud,
    props: readonly PropDef[], floors: MapFloor[], coins: number) {
    this.coins = new CoinThrower(game.gfx.scene, coins);
    this.map = new TacticalMap(game.world, floors);
    // One spot per wardrobe; a long bank of lockers has one every locker or so along its length.
    this.hidingSpots = props
      .filter((p): p is Extract<PropDef, { kind: 'furniture' }> => p.kind === 'furniture' && HIDING_FURNITURE.has(p.type))
      .flatMap(p => {
        const w = p.w ?? FURNITURE[p.type].size[0];
        const n = Math.max(1, Math.round(w / 1.4));
        const ax = Math.cos(p.yaw), az = -Math.sin(p.yaw);
        return Array.from({ length: n }, (_, i) => {
          const off = (i - (n - 1) / 2) * (w / n);
          return { pos: new THREE.Vector3(p.x + ax * off, p.y, p.z + az * off), used: false };
        });
      });
  }

  /** Keys while playing. Returns true if the kit used it. */
  key(code: string): boolean {
    const g = this.game;
    if (code === 'KeyM') {
      this.map.toggle(g.player.pos.y);
      return true;
    }
    if (this.map.key(code)) return true;
    if (code === 'KeyT') {
      this.tag();
      return true;
    }
    if (code === 'KeyG') {
      const cam = g.gfx.camera;
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      const from = cam.position.clone().addScaledVector(dir, 0.4).add(new THREE.Vector3(0, -0.1, 0));
      if (this.coins.throw(from, dir)) g.audio.beep(900, 0.03, 'triangle', 0.02);
      else g.audio.beep(200, 0.05, 'square', 0.03);
      return true;
    }
    return false;
  }

  /** Tags the guard nearest the crosshair that you can see. */
  private tag(): void {
    const cam = this.game.gfx.camera;
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best: Guard | null = null;
    let bestAngle = Infinity;
    for (const g of this.guards.guards) {
      if (!g.alive || g.hidden) continue;
      const chest = g.eye.add(new THREE.Vector3(0, -0.45, 0));
      const to = chest.clone().sub(cam.position);
      const d = to.length();
      if (d > TAG_RANGE) continue;
      const angle = to.normalize().angleTo(look);
      // A small cone, a little wider up close so a body-width miss still counts.
      if (angle > Math.max(0.045, Math.atan(0.7 / d)) || angle > bestAngle) continue;
      if (!this.game.world.clearLine(cam.position, chest)) continue;
      best = g;
      bestAngle = angle;
    }
    if (best && !this.tagged.has(best)) {
      this.tagged.add(best);
      this.game.audio.beep(1700, 0.04, 'sine', 0.05);
      this.game.audio.beep(2300, 0.05, 'sine', 0.04, 0.06);
    } else this.game.audio.beep(420, 0.04, 'sine', 0.025);
  }

  /** The nearest free hiding spot within reach, if any. */
  hidingSpotNear(p: THREE.Vector3, reach = 1.7): { pos: THREE.Vector3; used: boolean } | null {
    let best: { pos: THREE.Vector3; used: boolean } | null = null;
    let bd = reach;
    for (const s of this.hidingSpots) {
      if (s.used || Math.abs(s.pos.y - p.y) > 1.2) continue;
      const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Coins in flight, tag markers, the map; `markers` are the mission's own (objective, Reyes...). */
  update(dt: number, markers: MapMarker[], note: string, showHints: boolean): void {
    const g = this.game;
    this.time += dt;
    this.coins.update(dt, g.world, at => {
      g.audio.clink(at);
      // Sound carries over low walls and furniture: heard as if from a little above where it lies.
      this.guards.noise(at.clone().add(new THREE.Vector3(0, 0.9, 0)), COIN_HEARD, 'distraction');
    });
    for (const t of this.tagged) if (!t.alive) this.tagged.delete(t);
    const mood = (x: Guard) => (x.state === 'combat' ? 'combat' : x.state === 'investigate' || x.state === 'search' || x.awareness > 0.3 ? 'wary' : 'calm') as 'calm' | 'wary' | 'combat';
    this.hud.tags(g.gfx.camera, [...this.tagged].map(x => ({ pos: x.eye.add(new THREE.Vector3(0, 0.45, 0)), mood: mood(x), awareness: x.awareness })));
    this.hud.gadgets(showHints
      ? `<span><kbd>G</kbd>Coin ×${this.coins.count}</span><span><kbd>T</kbd>Tag</span><span><kbd>M</kbd>Map</span>`
      : `<span><kbd>G</kbd>Coin ×${this.coins.count}</span>`);
    if (!this.map.open) return;
    const all: MapMarker[] = [...markers];
    for (const x of this.tagged) all.push({ kind: 'guard', x: x.pos.x, y: x.pos.y, z: x.pos.z, yaw: x.yaw + x.headTurn, state: mood(x), label: x.name ?? undefined });
    const sec = g.world.security;
    for (const c of sec.cams) {
      if (sec.ignored.has(c.def.id)) continue;
      const p = c.pivot.getWorldPosition(new THREE.Vector3());
      all.push({ kind: 'camera', x: p.x, y: p.y - 2.6, z: p.z, state: c.destroyed || sec.looped ? 'off' : undefined });
    }
    for (const d of g.world.doors.doors) {
      const state = d.locked ? (d.prop.lock === 'pick' ? 'pick' : 'locked') : d.open > 0.5 ? 'open' : 'shut';
      all.push({ kind: 'door', x: d.prop.x, y: d.prop.y, z: d.prop.z, state });
    }
    for (const s of this.hidingSpots) if (!s.used) all.push({ kind: 'hide', x: s.pos.x, y: s.pos.y, z: s.pos.z });
    this.map.draw(all, this.time, note);
  }

  dispose(): void {
    this.coins.dispose();
    this.map.close();
  }
}
