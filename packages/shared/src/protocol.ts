import type { Vec3 } from './math/vec';
import type { MapId } from './maps';
import type { WeaponId } from './weapons';

/**
 * Multiplayer wire format. Messages are JSON with a `t` discriminator.
 * Bump PROTOCOL_VERSION whenever a message shape changes.
 */
export const PROTOCOL_VERSION = 1;

export interface PlayerSnapshot {
  id: string;
  name: string;
  pos: Vec3;
  yaw: number;
  pitch: number;
  hp: number;
  weapon: WeaponId;
}

export type ClientMessage =
  | { t: 'hello'; version: number; name: string }
  | { t: 'input'; seq: number; buttons: number; yaw: number; pitch: number }
  | { t: 'ping'; time: number };

export type ServerMessage =
  | { t: 'welcome'; id: string; mapId: MapId; tickRate: number }
  | { t: 'snapshot'; tick: number; ackSeq: number; players: PlayerSnapshot[] }
  | { t: 'playerJoined'; id: string; name: string }
  | { t: 'playerLeft'; id: string }
  | { t: 'pong'; time: number }
  | { t: 'error'; message: string };

export const encodeMessage = (m: ClientMessage | ServerMessage): string => JSON.stringify(m);

const CLIENT_TYPES = new Set<ClientMessage['t']>(['hello', 'input', 'ping']);
const SERVER_TYPES = new Set<ServerMessage['t']>(['welcome', 'snapshot', 'playerJoined', 'playerLeft', 'pong', 'error']);

function parse(raw: string, types: Set<string>): unknown {
  try {
    const m: unknown = JSON.parse(raw);
    if (typeof m === 'object' && m !== null && types.has((m as { t?: unknown }).t as string)) return m;
  } catch {
    // fall through
  }
  return null;
}

/** Returns null for anything malformed. The server must still validate field values. */
export const parseClientMessage = (raw: string) => parse(raw, CLIENT_TYPES) as ClientMessage | null;
export const parseServerMessage = (raw: string) => parse(raw, SERVER_TYPES) as ServerMessage | null;
