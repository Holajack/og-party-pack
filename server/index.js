// OG Party Pack server: serves the projector page (/host) and the phone page
// (/), and relays everything between them over Socket.IO.

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import QRCode from 'qrcode';
import { Server } from 'socket.io';
import config from '../config.js';
import { Room } from './room.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6, pingInterval: 10000, pingTimeout: 8000 });
const rooms = new Map();

app.disable('x-powered-by');
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: '5m' }));

app.get('/healthz', (_req, res) => res.set('Cache-Control', 'no-store').send('ok'));

app.get('/api/pack', (_req, res) => res.json(config));

// Addresses phones on the same Wi-Fi can use when the server runs on a laptop.
app.get('/api/lan', (_req, res) => {
  const urls = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a.address}:${PORT}`);
  res.json({ urls });
});

app.get('/api/qr.svg', async (req, res) => {
  const text = String(req.query.text || '').slice(0, 300);
  if (!text) return res.status(400).end();
  const svg = await QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1b1035', light: '#ffffff' } });
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
});

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

const roomFor = (code) => (typeof code === 'string' ? rooms.get(code.toUpperCase().trim()) : undefined);
const reply = (ack, data) => typeof ack === 'function' && ack(data);

io.on('connection', (socket) => {
  // A bad message from one phone must never take the server down for everyone.
  const on = (event, handler) =>
    socket.on(event, (...args) => {
      try {
        handler(...args);
      } catch (err) {
        console.error(`[socket ${event}] error`, err);
      }
    });

  // ---- host (projector) ----
  on('host:create', (opts, ack) => {
    const used = Array.isArray(opts?.used) ? opts.used.filter((u) => typeof u === 'string' && u.length < 120).slice(-1500) : [];
    const room = new Room(newCode(), io, used);
    rooms.set(room.code, room);
    attachHost(socket, room);
    reply(ack, { code: room.code, token: room.hostToken });
  });

  on('host:resume', (opts, ack) => {
    const room = roomFor(opts?.code);
    if (!room || room.hostToken !== opts?.token) return reply(ack, { error: 'gone' });
    attachHost(socket, room);
    reply(ack, { code: room.code, token: room.hostToken });
  });

  on('host:control', (action) => {
    const room = socket.data.role === 'host' && rooms.get(socket.data.code);
    if (room) room.control(action, true);
  });

  // ---- players (phones) ----
  on('player:join', (opts, ack) => {
    const room = roomFor(opts?.code);
    if (!room) return reply(ack, { error: 'No game with that code. Check the big screen and try again.' });
    const result = room.join(
      { name: opts?.name, playerId: typeof opts?.playerId === 'string' ? opts.playerId : null, rejoin: opts?.rejoin === true },
      socket.id,
    );
    if (result.error) return reply(ack, { error: result.error });
    const d = socket.data;
    if (!(d?.role === 'player' && d.code === room.code && d.playerId === result.player.id)) leaveCurrent(socket);
    socket.data = { role: 'player', code: room.code, playerId: result.player.id };
    room.resend(socket.id);
    reply(ack, { code: room.code, playerId: result.player.id, name: result.player.name });
  });

  const playerRoom = () => (socket.data.role === 'player' ? rooms.get(socket.data.code) : null);

  on('player:action', (action) => playerRoom()?.action(socket.data.playerId, action));

  on('player:control', (action) => {
    const room = playerRoom();
    if (room && room.leaderId === socket.data.playerId) room.control(action, false);
  });

  on('player:avatar', (avatar) => playerRoom()?.setAvatar(socket.data.playerId, avatar));

  on('player:leave', () => {
    const room = playerRoom();
    if (room) room.remove(socket.data.playerId, { notify: false });
    socket.data = {};
  });

  // ---- drawings ----
  on('drawing:get', (id, ack) => {
    const room = rooms.get(socket.data.code);
    reply(ack, typeof id === 'string' ? (room?.game?.drawing?.(id) ?? null) : null);
  });

  on('drawing:mine', (ack) => {
    const room = playerRoom();
    reply(ack, room?.game?.strokesFor?.(socket.data.playerId) ?? []);
  });

  on('sync', () => {
    const room = rooms.get(socket.data.code);
    room?.resend(socket.id);
  });

  socket.on('disconnect', () => leaveCurrent(socket));
});

function attachHost(socket, room) {
  leaveCurrent(socket);
  socket.data = { role: 'host', code: room.code };
  room.hostSockets.add(socket.id);
  room.touch();
  room.resend(socket.id);
}

function leaveCurrent(socket) {
  const room = rooms.get(socket.data?.code);
  if (!room) return;
  room.sent.delete(socket.id);
  if (socket.data.role === 'host') {
    room.hostSockets.delete(socket.id);
    room.touch();
  } else if (socket.data.role === 'player') {
    room.disconnect(socket.data.playerId, socket.id);
  }
}

// Last line of defense: log a surprise error instead of ending everyone's game.
process.on('uncaughtException', (err) => console.error('Unexpected error (server kept running):', err));

// Clean up rooms nobody has used in a while.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.isIdle(now)) {
      room.close();
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`OG Party Pack is running.`);
  console.log(`  Big screen:  http://localhost:${PORT}/host`);
  console.log(`  Phones join: http://localhost:${PORT}  (or this computer's Wi-Fi address)`);
});
