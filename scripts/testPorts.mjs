import { once } from 'node:events';
import { createServer } from 'node:net';

export async function testPorts() {
  const sockets = [createServer(), createServer()];
  try {
    for (const socket of sockets) {
      socket.listen(0, '127.0.0.1');
      await once(socket, 'listening');
    }
    const [webPort, apiPort] = sockets.map((socket) => socket.address().port);
    return { webPort, apiPort };
  } finally {
    await Promise.all(sockets.filter((socket) => socket.listening).map((socket) => new Promise((resolve) => socket.close(resolve))));
  }
}
