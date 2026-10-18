import type { Game } from '../../core/Game';
import { CUTSCENES } from '../../cutscenes';
import type { Cutscene } from '../../cutscenes/Cutscene';
import { aureliaEscape } from '../../cutscenes/aureliaEscape';
import { mansionEscape } from '../../cutscenes/mansionEscape';
import { portEscape } from '../../cutscenes/portEscape';
import type { Van } from '../../world/vehicles/van';
import type { GameMode, MatchOptions } from '../GameMode';
import { AureliaMission, type AureliaCheckpoint } from './aurelia/AureliaMission';
import { MansionMission, type MansionCheckpoint } from './mansionMission';
import { PortMission, type PortCheckpoint } from './port/PortMission';
import type { CampaignScript, MissionDef } from './types';

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
  private script: CampaignScript | null = null;

  constructor(private readonly game: Game, private readonly mission: MissionDef, private readonly options: MatchOptions) {}

  get mapId() {
    return this.mission.mapId;
  }

  start(): void {
    this.game.weapons.setInventory(this.mission.loadout);
    this.location = '';
    const props = this.game.world.map.props;
    if (this.mission.id === 'mansion') {
      this.script = new MansionMission(this.game, props, this.options.difficulty, (this.options.checkpoint as MansionCheckpoint | undefined) ?? null);
      // The getaway, once Reyes is at the van.
      this.script.outro = () => {
        const van = (this.cutscene as { van?: Van } | null)?.van;
        return van ? mansionEscape(this.game, van) : null;
      };
    } else if (this.mission.id === 'aurelia') {
      this.script = new AureliaMission(this.game, props, this.options.difficulty, (this.options.checkpoint as AureliaCheckpoint | undefined) ?? null);
      this.script.outro = () => aureliaEscape(this.game);
    } else if (this.mission.id === 'port') {
      const port = new PortMission(this.game, props, this.options.difficulty, (this.options.checkpoint as PortCheckpoint | undefined) ?? null);
      // (Restoring a checkpoint moves the van before the intro has made it: it's parked when it is.)
      port.moveVan = (x, z, yaw) => { this.vanSpot = [x, z, yaw]; this.parkVan(); };
      this.script = port;
      // Away in the van the intro parked, then the Sirocco at sea.
      this.script.outro = () => {
        const van = (this.cutscene as { van?: Van } | null)?.van;
        return van ? portEscape(this.game, van) : null;
      };
    }
    this.script?.start();
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

  key(code: string): boolean {
    return this.script?.key(code) ?? false;
  }

  pauseDetails(): string {
    return this.script?.pauseDetails() ?? '';
  }

  loadingInfo() {
    const m = this.mission;
    return { kicker: `Chapter ${m.chapter}`, title: m.title.toUpperCase(), description: m.briefing, location: m.location, image: m.loadingImage };
  }

  /** Where the mission wants the intro's van (null: where the intro left it). */
  private vanSpot: [number, number, number] | null = null;

  private parkVan(): void {
    if (this.vanSpot) (this.cutscene as { park?: (x: number, z: number, yaw: number) => void } | null)?.park?.(...this.vanSpot);
  }

  intro(): Cutscene | null {
    const make = this.mission.intro ? CUTSCENES[this.mission.intro] : undefined;
    this.cutscene = make ? make(this.game) : null;
    if (this.script?.skipIntro) {
      // Restarting from a checkpoint: no intro, but leave its props (the parked van) in place.
      this.cutscene?.finish();
      this.parkVan();
      return null;
    }
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
    // With a mission script the briefing is on the pause screen's left; keep the header short.
    if (this.script) return `Chapter ${this.mission.chapter} · ${this.mission.title} · ${this.location}`;
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
    const where = !zone ? 'Outside' : zone.name === zone.floor ? zone.name : `${zone.floor} · ${zone.name}`;
    if (where === this.location) return;
    this.location = where;
    this.game.hud.setProgress(`${this.mission.title} — ${where}`, []);
  }
}
