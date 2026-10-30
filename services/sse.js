'use strict';
/**
 * Server-Sent Events hub: a one-way, long-lived HTTP response the server can keep writing
 * to. It lets us PUSH live-feed and leaderboard updates to every open browser without the
 * browser polling. (Alternative considered: WebSockets via Socket.IO, which is two-way but
 * heavier than we need here.)
 */
const clients = new Set();

function addClient(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  clients.add(res);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

function broadcast(event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

module.exports = { addClient, broadcast };
