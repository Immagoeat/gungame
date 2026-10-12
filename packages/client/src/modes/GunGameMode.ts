import { DIFFICULTIES, GUN_GAME_LADDER, WEAPONS, type DifficultyId } from '@gungame/shared';
import type { Game } from '../core/Game';
import { storage } from '../core/storage';
import { escapeHtml, formatTime } from '../ui/dom';
import type { GameMode } from './GameMode';

const BASE_BOTS = 4;
const SPAWN_INTERVAL = 1.5;

/** Climb the weapon ladder: kills advance your weapon, a kill with the last one wins. */
export class GunGameMode implements GameMode {
  readonly id = 'gungame';
  readonly mapId = 'arena';
  readonly allowFly = false;
  private rung = 0;
  private rungKills = 0;
  private totalKills = 0;
  private spawnTimer = 0;

  constructor(private readonly game: Game, private readonly difficulty: DifficultyId) {}

  private get extraBots(): number {
    return DIFFICULTIES[this.difficulty].extraBots;
  }

  start(): void {
    this.game.weapons.equip(GUN_GAME_LADDER[0].weapon);
    for (let i = 0; i < BASE_BOTS + this.extraBots; i++) this.game.bots.spawn();
    this.refreshHud();
  }

  update(dt: number): void {
    this.spawnTimer -= dt;
    const maxBots = BASE_BOTS + this.rung + this.extraBots;
    if (this.spawnTimer <= 0 && this.game.bots.aliveCount < maxBots) {
      this.game.bots.spawn();
      this.spawnTimer = SPAWN_INTERVAL;
    }
  }

  onBotKilled(): void {
    this.totalKills++;
    this.rungKills++;
    if (this.rungKills >= GUN_GAME_LADDER[this.rung].kills) {
      if (this.rung === GUN_GAME_LADDER.length - 1) return this.win();
      this.rung++;
      this.rungKills = 0;
      const weapon = WEAPONS[GUN_GAME_LADDER[this.rung].weapon];
      this.game.weapons.equip(GUN_GAME_LADDER[this.rung].weapon);
      const last = this.rung === GUN_GAME_LADDER.length - 1;
      this.game.hud.banner(weapon.name, last ? 'Final weapon — one kill to win!' : `Level ${this.rung + 1} of ${GUN_GAME_LADDER.length}`);
      this.game.audio.arpeggio([523, 659, 784], 0.08, 0.12);
    }
    this.refreshHud();
  }

  onPlayerDied(): void {
    const weapon = WEAPONS[GUN_GAME_LADDER[this.rung].weapon];
    this.game.endMatch({
      won: false,
      title: 'YOU DIED',
      subtitle: `Reached the ${weapon.name} on ${DIFFICULTIES[this.difficulty].label}.`,
      stats: this.stats(),
    });
  }

  pauseInfo(): string {
    const weapon = WEAPONS[GUN_GAME_LADDER[this.rung].weapon];
    return `${DIFFICULTIES[this.difficulty].label} · ${weapon.name} · ${this.totalKills} kills · ${formatTime(this.game.elapsed)}`;
  }

  dispose(): void {}

  private win(): void {
    const time = this.game.elapsed;
    const best = storage.get<Partial<Record<DifficultyId, number>>>('best', {});
    const prev = best[this.difficulty];
    const isRecord = prev === undefined || time < prev;
    if (isRecord) {
      best[this.difficulty] = time;
      storage.set('best', best);
    }
    storage.set('wins', storage.get('wins', 0) + 1);
    this.game.audio.arpeggio([523, 659, 784, 1047], 0.12, 0.2);
    this.game.endMatch({
      won: true,
      title: 'VICTORY',
      subtitle: `You climbed the whole ladder on ${DIFFICULTIES[this.difficulty].label}.${isRecord ? ' New best time!' : ''}`,
      stats: this.stats(),
    });
  }

  private stats() {
    return [
      { label: 'Kills', value: String(this.totalKills) },
      { label: 'Time', value: formatTime(this.game.elapsed) },
      { label: 'Level', value: `${this.rung + 1}/${GUN_GAME_LADDER.length}` },
    ];
  }

  private refreshHud(): void {
    this.game.hud.setProgress(
      `Level ${this.rung + 1} / ${GUN_GAME_LADDER.length} · Kills ${this.rungKills} / ${GUN_GAME_LADDER[this.rung].kills}`,
      GUN_GAME_LADDER.map((r, i) => ({
        label: WEAPONS[r.weapon].name,
        state: i < this.rung ? 'done' : i === this.rung ? 'current' : 'todo',
      })),
    );
  }

  /** Best times and win count for the main menu. */
  static recordSummaryHtml(): string {
    const best = storage.get<Partial<Record<DifficultyId, number>>>('best', {});
    const lines = (Object.keys(DIFFICULTIES) as DifficultyId[])
      .filter(d => best[d] !== undefined)
      .map(d => `${escapeHtml(DIFFICULTIES[d].label)}: <b>${formatTime(best[d]!)}</b>`);
    if (!lines.length) return 'No wins yet. Climb all six weapons to set a record.';
    return `Best times — ${lines.join(' · ')}<br>Total wins: ${storage.get('wins', 0)}`;
  }
}
