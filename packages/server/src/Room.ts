import type { WebSocket } from 'ws';
import {
  createMap, encodeMessage, mapColliders, mapWater, stepMovement,
  PLAYER_HEIGHT, PLAYER_MAX_HP, PLAYER_RADIUS, SERVER_TICK_RATE,
  type AABB, type ClientMessage, type Mover, type MapDef, type MapId, type PlayerSnapshot, type ServerMessage, type WeaponId,
} from '@gungame/shared';

interface ServerPlayer {
  id: string;
  name: string;
  socket: WebSocket;
  body: Mover;
  yaw: number;
  pitch: number;
  buttons: number;
  lastSeq: number;
  hp: number;
  weapon: WeaponId;
}

/**
 * One match. The server simulates movement with the same shared code the client uses,
 * so it is the authority on where everyone is. Combat is not networked yet.
 */
export class Room {
  readonly map: MapDef;
  private readonly colliders: AABB[];
  private readonly water: AABB[];
  private readonly players = new Map<string, ServerPlayer>();
  private tick = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(readonly mapId: MapId) {
    this.map = createMap(mapId);
    this.colliders = mapColliders(this.map);
    this.water = mapWater(this.map);
  }

  get size(): number {
    return this.players.size;
  }

  join(id: string, name: string, socket: WebSocket): void {
    const s = this.map.playerSpawn;
    this.players.set(id, {
      id, name, socket,
      body: {
        pos: { ...s }, vel: { x: 0, y: 0, z: 0 }, radius: PLAYER_RADIUS, height: PLAYER_HEIGHT, onGround: true, canStep: true,
        stance: 'stand', swimming: false, submerged: 0, waterLevel: -Infinity,
      },
      yaw: 0, pitch: 0, buttons: 0, lastSeq: 0, hp: PLAYER_MAX_HP, weapon: 'pistol',
    });
    this.send(socket, { t: 'welcome', id, mapId: this.mapId, tickRate: SERVER_TICK_RATE });
    this.broadcast({ t: 'playerJoined', id, name });
    if (!this.timer) this.timer = setInterval(() => this.step(), 1000 / SERVER_TICK_RATE);
  }

  leave(id: string): void {
    if (!this.players.delete(id)) return;
    this.broadcast({ t: 'playerLeft', id });
    if (this.players.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  handle(id: string, m: ClientMessage): void {
    const p = this.players.get(id);
    if (!p) return;
    switch (m.t) {
      case 'input':
        if (!Number.isFinite(m.yaw) || !Number.isFinite(m.pitch) || !Number.isInteger(m.buttons)) return;
        p.buttons = m.buttons;
        p.yaw = m.yaw;
        p.pitch = Math.max(-1.5, Math.min(1.5, m.pitch));
        p.lastSeq = m.seq;
        break;
      case 'ping':
        this.send(p.socket, { t: 'pong', time: m.time });
        break;
      case 'hello':
        break; // already handled on connect
    }
  }

  private step(): void {
    const dt = 1 / SERVER_TICK_RATE;
    this.tick++;
    for (const p of this.players.values()) stepMovement(p.body, { buttons: p.buttons, yaw: p.yaw }, dt, this.colliders, this.water);
    const snapshot: PlayerSnapshot[] = [...this.players.values()].map(p => ({
      id: p.id, name: p.name, pos: { ...p.body.pos }, yaw: p.yaw, pitch: p.pitch, hp: p.hp, weapon: p.weapon,
    }));
    for (const p of this.players.values()) {
      this.send(p.socket, { t: 'snapshot', tick: this.tick, ackSeq: p.lastSeq, players: snapshot });
    }
  }

  private send(socket: WebSocket, m: ServerMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(encodeMessage(m));
  }

  private broadcast(m: ServerMessage): void {
    for (const p of this.players.values()) this.send(p.socket, m);
  }
}
