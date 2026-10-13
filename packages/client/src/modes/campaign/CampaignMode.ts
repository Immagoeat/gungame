import type { Game } from '../../core/Game';
import { CUTSCENES } from '../../cutscenes';
import type { Cutscene } from '../../cutscenes/Cutscene';
import type { GameMode, MatchOptions } from '../GameMode';
import { MansionMission, type MansionCheckpoint } from './mansionMission';
import type { MissionDef } from './types';

/**
 * Runs one campaign mission. For now: load the map, hand out the loadout, show where you are.
 * Objectives and story beats from MissionDef plug in here next.
 */
export class CampaignMode implements GameMode {
  readonly id = 'campaign';
  /** Fly mode (noclip) is for reviewing layouts in development builds only. */
  readonly allowFly = import.meta.env.DEV;
  private location = '';
  private cutscene: Cutscene | null = null;
  /** The mission's gameplay (guards, objectives...), for missions that have one. */
  private script: MansionMission | null = null;

  constructor(private readonly game: Game, private readonly mission: MissionDef, private readonly options: MatchOptions) {}

  get mapId() {
    return this.mission.mapId;
  }

  start(): void {
    this.game.weapons.setInventory(this.mission.loadout);
    this.location = '';
    if (this.mission.id === 'mansion') {
      this.script = new MansionMission(this.game, this.game.world.map.props, this.options.difficulty, (this.options.checkpoint as MansionCheckpoint | undefined) ?? null);
      this.script.start();
    }
    this.refreshLocation();
    if (!this.mission.intro || this.script?.skipIntro) this.onIntroDone();
  }

  scenery(dt: number): void {
    this.script?.scenery(dt);
  }

  interact(): boolean {
    return this.script?.interact() ?? false;
  }

  prompt(): string | null {
    return this.script?.prompt() ?? null;
  }

  loadingInfo() {
    const m = this.mission;
    return { kicker: `Chapter ${m.chapter}`, title: m.title.toUpperCase(), description: m.briefing, location: m.location, image: m.loadingImage };
  }

  intro(): Cutscene | null {
    if (this.script?.skipIntro) return null;
    const make = this.mission.intro ? CUTSCENES[this.mission.intro] : undefined;
    this.cutscene = make ? make(this.game) : null;
    return this.cutscene;
  }

  onIntroDone(): void {
    if (!this.script?.skipIntro) this.game.hud.banner(this.mission.title, `Chapter ${this.mission.chapter}`);
    this.script?.introDone();
  }

  update(dt: number): void {
    this.script?.update(dt);
    this.refreshLocation();
  }

  onBotKilled(): void {}

  onPlayerDied(): void {
    if (this.script) return this.script.fail('You were killed.');
    this.game.endMatch({ won: false, title: 'MISSION FAILED', subtitle: this.mission.title, stats: [] });
  }

  pauseInfo(): string {
    return `${this.mission.title} · ${this.mission.briefing}`;
  }

  dispose(): void {
    this.script?.dispose();
    this.script = null;
    this.cutscene?.dispose();
    this.cutscene = null;
  }

  private refreshLocation(): void {
    const p = this.game.player.pos;
    const zone = this.game.world.zoneAt({ x: p.x, y: p.y + 1, z: p.z });
    const where = zone ? `${zone.floor} · ${zone.name}` : 'Outside';
    if (where === this.location) return;
    this.location = where;
    this.game.hud.setProgress(`${this.mission.title} — ${where}`, []);
  }
}
