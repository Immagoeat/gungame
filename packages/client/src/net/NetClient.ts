import {
  encodeMessage, parseServerMessage, PROTOCOL_VERSION,
  type ClientMessage, type ServerMessage,
} from '@gungame/shared';

type Welcome = Extract<ServerMessage, { t: 'welcome' }>;

/** Typed WebSocket connection to the game server. */
export class NetClient {
  private ws: WebSocket | null = null;
  onMessage: (m: ServerMessage) => void = () => {};
  onClose: () => void = () => {};

  /** Connects and resolves once the server accepts the handshake. */
  connect(url: string, name: string): Promise<Welcome> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.addEventListener('open', () => this.send({ t: 'hello', version: PROTOCOL_VERSION, name }));
      ws.addEventListener('message', ev => {
        const m = parseServerMessage(String(ev.data));
        if (!m) return;
        if (m.t === 'welcome') resolve(m);
        else if (m.t === 'error') reject(new Error(m.message));
        this.onMessage(m);
      });
      ws.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)));
      ws.addEventListener('close', () => this.onClose());
    });
  }

  send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeMessage(m));
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
