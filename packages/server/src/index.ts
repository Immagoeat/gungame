import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { DEFAULT_SERVER_PORT, PROTOCOL_VERSION, encodeMessage, parseClientMessage } from '@gungame/shared';
import { Room } from './Room';

const port = Number(process.env.PORT) || DEFAULT_SERVER_PORT;
const wss = new WebSocketServer({ port });
// Single room for now; matchmaking / multiple rooms come later.
const room = new Room('arena');

wss.on('connection', socket => {
  const id = randomUUID();
  let joined = false;

  socket.on('message', data => {
    const m = parseClientMessage(data.toString());
    if (!m) return;
    if (!joined) {
      if (m.t !== 'hello') return;
      if (m.version !== PROTOCOL_VERSION) {
        socket.send(encodeMessage({ t: 'error', message: `Protocol mismatch: server ${PROTOCOL_VERSION}, client ${m.version}` }));
        socket.close();
        return;
      }
      const name = String(m.name).slice(0, 20).trim() || 'Player';
      room.join(id, name, socket);
      joined = true;
      console.log(`+ ${name} (${room.size} online)`);
      return;
    }
    room.handle(id, m);
  });

  socket.on('close', () => {
    if (!joined) return;
    room.leave(id);
    console.log(`- ${id} (${room.size} online)`);
  });
});

console.log(`Gun Game server listening on ws://localhost:${port}`);
