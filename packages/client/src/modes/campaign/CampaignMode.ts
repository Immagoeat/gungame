import type { Game } from '../../core/Game';
import type { GameMode } from '../GameMode';
import type { MissionDef } from './types';

/**
 * Runs one campaign mission. For now: load the map, hand out the loadout, show where you are.
 * Objectives and story beats from MissionDef plug in here next.
 */
export class CampaignMode implements GameMode {
  readonly id = 'campaign';
  readonly allowFly = true;
  private location = '';

  constructor(private readonly game: Game, private readonly mission: MissionDef) {}

  get mapId() {
    return this.mission.mapId;
  }

  start(): void {
    this.game.weapons.setInventory(this.mission.loadout);
    this.location = '';
    this.refreshLocation();
    this.game.hud.banner(this.mission.title, `Chapter ${this.mission.chapter}`);
  }

  update(): void {
    this.refreshLocation();
  }

  onBotKilled(): void {}

  onPlayerDied(): void {
    this.game.endMatch({ won: false, title: 'MISSION FAILED', subtitle: this.mission.title, stats: [] });
  }

  pauseInfo(): string {
    return `${this.mission.title} · ${this.mission.briefing}`;
  }

  dispose(): void {}

  private refreshLocation(): void {
    const p = this.game.player.pos;
    const zone = this.game.world.zoneAt({ x: p.x, y: p.y + 1, z: p.z });
    const where = zone ? `${zone.floor} · ${zone.name}` : 'Outside';
    if (where === this.location) return;
    this.location = where;
    this.game.hud.setProgress(`${this.mission.title} — ${where}`, []);
  }
}
