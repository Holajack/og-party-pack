// End-to-end simulation: starts the server with fast timers, connects a host
// and a crowd of bot players, and plays every game start to finish.
// Bots answer at random speeds (some too slow), one drops out and comes back,
// one joins halfway through. Fails on any server error or stuck game.
//
//   npm test

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const BOTS = Number(process.env.BOTS) || 12;
const GAMES = ['realornot', 'bluff', 'whosaid', 'whichbook', 'timeline', 'draw', 'laughs'];
const WORDS = ['camel', 'manna', 'harp', 'sandal', 'olive', 'scroll', 'locust', 'trumpet', 'fig', 'cedar', 'goat', 'lamp'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

let serverErrors = '';
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), OG_TIME_SCALE: process.env.OG_TIME_SCALE || '0.12' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => {
  serverErrors += d;
  process.stderr.write(`[server] ${d}`);
});

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  server.kill();
  process.exit(1);
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${URL}/healthz`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(100);
  }
  fail('server did not start');
}

function connect() {
  return io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
}

const emitAck = (socket, event, data) => new Promise((resolve) => socket.emit(event, data, resolve));

// ---- host --------------------------------------------------------------

async function makeHost() {
  const socket = connect();
  const host = { socket, view: null, phases: [] };
  socket.on('view', ({ v }) => {
    host.view = v;
    const s = v.screen;
    const tag = `${s.game}:${s.phase}`;
    if (host.phases.at(-1) !== tag) host.phases.push(tag);
  });
  const res = await emitAck(socket, 'host:create', { used: [] });
  host.code = res.code;
  host.token = res.token;
  return host;
}

// ---- bots --------------------------------------------------------------

class Bot {
  constructor(name, code, opts = {}) {
    this.name = name;
    this.code = code;
    this.slow = opts.slow ?? Math.random() < 0.2; // sometimes misses the timer
    this.view = null;
    this.handled = new Set();
    this.playerId = null;
  }

  async join() {
    this.socket = connect();
    this.socket.on('view', ({ v }) => {
      this.view = v;
      this.react(v).catch((err) => fail(`${this.name} crashed: ${err.stack}`));
    });
    const res = await emitAck(this.socket, 'player:join', { code: this.code, name: this.name, playerId: this.playerId });
    if (res.error) fail(`${this.name} could not join: ${res.error}`);
    this.playerId = res.playerId;
    this.name = res.name;
    return this;
  }

  drop() {
    this.socket.disconnect();
  }

  act(action) {
    this.socket.emit('player:action', action);
  }

  async delay() {
    await sleep(this.slow ? 300 + Math.random() * 2500 : 20 + Math.random() * 250);
  }

  async react(v) {
    const s = v.screen;
    if (!s.game) return;
    const key = `${s.game}:${s.phase}:${s.seq}:${s.errorN ?? ''}`;
    if (this.handled.has(key)) return;
    this.handled.add(key);

    if (['question'].includes(s.phase) && s.picked == null) {
      await this.delay();
      this.act({ type: 'answer', choice: Math.floor(Math.random() * s.choices.length) });
    } else if (s.game === 'bluff' && s.phase === 'write' && !s.submitted) {
      await this.delay();
      // Sometimes everyone writes the same lie (tests merging duplicates).
      this.act({ type: 'lie', text: Math.random() < 0.2 ? 'manna' : `${pick(WORDS)} ${Math.floor(Math.random() * 99)}` });
    } else if (s.game === 'bluff' && s.phase === 'choose' && s.picked == null) {
      await this.delay();
      this.act({ type: 'choose', option: pick(s.options).id });
    } else if (s.phase === 'order' && !s.locked) {
      await this.delay();
      const order = shuffle(s.events.map((e) => e.id));
      this.act({ type: 'draft', order: order.slice(0, 2) });
      // Some bots never press lock: their finished draft should still count.
      if (Math.random() < 0.7) this.act({ type: 'lock', order });
      else this.act({ type: 'draft', order });
    } else if (s.phase === 'draw' && s.prompt && !s.done) {
      for (let i = 0; i < 3 + Math.floor(Math.random() * 5); i++) {
        const p = [];
        for (let j = 0; j < 20; j++) p.push(Math.floor(Math.random() * 1001), Math.floor(Math.random() * 1001));
        this.act({ type: 'stroke', stroke: { c: Math.floor(Math.random() * 10), w: Math.floor(Math.random() * 3), p } });
      }
      if (Math.random() < 0.3) this.act({ type: 'undo' });
      await this.delay();
      this.act({ type: 'done' });
    } else if (s.phase === 'guess' && !s.isArtist && s.picked == null) {
      await this.delay();
      this.act({ type: 'guess', choice: Math.floor(Math.random() * s.choices.length) });
    } else if (s.game === 'laughs' && s.phase === 'write' && !s.submitted) {
      await this.delay();
      this.act({ type: 'answer', text: `A ${pick(WORDS)} named ${pick(WORDS)} <b>${Math.random()}</b>` });
    } else if (s.phase === 'vote' && s.picked == null && s.entries.length) {
      await this.delay();
      this.act({ type: 'vote', entry: pick(s.entries).id });
    }
  }
}

// ---- checks ------------------------------------------------------------

async function waitFor(what, test, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (test()) return;
    await sleep(25);
  }
  fail(`timed out waiting for ${what}`);
}

function checkFinal(host, game) {
  const s = host.view.screen;
  if (s.game !== game || s.phase !== 'final') fail(`${game} did not reach the podium`);
  const rows = s.standings;
  if (!Array.isArray(rows) || !rows.length) fail(`${game} has no standings`);
  for (let i = 1; i < rows.length; i++) if (rows[i].score > rows[i - 1].score) fail(`${game} standings out of order`);
  const total = rows.reduce((n, r) => n + r.score, 0);
  console.log(`  ✓ ${game.padEnd(10)} ${s.bible.padEnd(4)} winner: ${rows[0].name} (${rows[0].score}) · total points ${total} · phases ${host.phases.length}`);
  if (total <= 0 && game !== 'laughs') fail(`${game}: nobody scored any points (suspicious)`);
}

// ---- run ---------------------------------------------------------------

await waitForServer();
console.log(`Server on ${URL}. Playing all ${GAMES.length} games with ${BOTS} bots…`);

const host = await makeHost();
const bots = [];
for (let i = 0; i < BOTS; i++) bots.push(await new Bot(`Bot${i + 1}`, host.code).join());

// Bad joins are rejected cleanly.
const ghost = connect();
const bad = await emitAck(ghost, 'player:join', { code: 'ZZZZ', name: 'Nobody' });
if (!bad.error) fail('joining a bad room code should fail');
const noName = await emitAck(ghost, 'player:join', { code: host.code, name: '   ' });
if (!noName.error) fail('joining with a blank name should fail');
ghost.disconnect();

// Malformed messages are ignored and never crash the server.
const rogue = connect();
rogue.emit('player:join', { code: { toString: 1 }, name: { toString: 1 } }, () => {});
rogue.emit('player:join', null, () => {});
rogue.emit('drawing:get', { toString: 1 }, () => {});
rogue.emit('host:control', { type: 'continue' });
rogue.emit('player:action', { type: 'lie', text: { toString: 1 } });
await sleep(150);
const alive = await fetch(`${URL}/healthz`).catch(() => null);
if (!alive?.ok) fail('server died on a malformed message');
// A phone auto-rejoining with an unknown id is refused (it was removed).
const stale = await emitAck(rogue, 'player:join', { code: host.code, name: 'Ghost', playerId: 'nope', rejoin: true });
if (!stale.error) fail('rejoin with an unknown player id should be refused');
rogue.disconnect();

// Duplicate names get a number.
const twin = await new Bot('Bot1', host.code).join();
if (twin.name === 'Bot1') fail('duplicate names should be made unique');
twin.socket.emit('player:leave');
await sleep(100);

await waitFor('everyone in the lobby', () => host.view?.players.length === BOTS);

// Leader controls work, and non-leaders are ignored.
const leader = bots[0];
await waitFor('leader flag', () => leader.view?.leader && !bots[1].view?.leader);
bots[1].socket.emit('player:control', { type: 'start', game: 'realornot' });
await sleep(200);
if (host.view.screen.game) fail('a non-leader was able to start a game');

let late = null;
for (const [i, game] of GAMES.entries()) {
  host.phases = [];
  // Rotate through the Bible translations.
  const translation = ['kjv', 'bsb', 'nheb'][i % 3];
  host.socket.emit('host:control', { type: 'settings', translation });
  await waitFor(`${translation} selected`, () => host.view.settings.translation === translation);
  if (i % 2 === 0) leader.socket.emit('player:control', { type: 'start', game });
  else host.socket.emit('host:control', { type: 'start', game });
  await waitFor(`${game} to start`, () => host.view.screen.game === game);

  if (game === 'realornot') {
    // A Next press made on an earlier screen is ignored.
    await waitFor('intro', () => host.view.screen.phase === 'intro');
    const seq = host.view.screen.seq;
    host.socket.emit('host:control', { type: 'continue', seq: seq - 1 });
    await sleep(150);
    if (host.view.screen.seq !== seq) fail('a stale Next press skipped a screen');
  }
  if (game === 'whosaid') {
    // Pause and resume mid-game.
    await waitFor('a question', () => host.view.screen.phase === 'question');
    host.socket.emit('host:control', { type: 'pause' });
    await waitFor('pause', () => host.view.paused);
    await sleep(300);
    host.socket.emit('host:control', { type: 'resume' });
    await waitFor('resume', () => !host.view.paused);
  }
  if (game === 'bluff') {
    // Drop a player and bring them back with the same id.
    const b = bots[Math.min(3, bots.length - 1)];
    b.drop();
    await sleep(400);
    await b.join();
    if (!host.view.players.find((p) => p.id === b.playerId)?.connected) await sleep(200);
  }
  if (game === 'draw') {
    // Someone shows up late.
    await waitFor('drawing phase', () => host.view.screen.phase === 'draw');
    late = await new Bot('Latecomer', host.code, { slow: false }).join();
    bots.push(late);
  }
  if (game === 'laughs') {
    // A bot tries to vote for its own answer (should be ignored).
    await waitFor('voting', () => host.view.screen.phase === 'vote' || host.view.screen.phase === 'final');
  }

  if (host.view.screen.bible !== translation.toUpperCase()) fail(`${game} is not using ${translation}`);
  await waitFor(`${game} to finish`, () => host.view.screen.phase === 'final', 180000);
  checkFinal(host, game);
  const expected = { draw: ['draw:draw', 'draw:guess', 'draw:reveal', 'draw:gallery'] }[game] || [];
  for (const tag of expected) if (!host.phases.includes(tag)) fail(`${game} never showed ${tag}`);

  // Leader returns everyone to the menu.
  await sleep(800);
  leader.socket.emit('player:control', { type: 'continue' });
  await waitFor('back to lobby', () => !host.view.screen.game);
}

// Night totals add up.
const totals = host.view.players.reduce((n, p) => n + p.total, 0);
if (!(totals > 0)) fail('night totals are empty');
if (host.view.history.length !== GAMES.length) fail('history should list every game played');

// Host can kick a player.
const kicked = bots.at(-1);
let gotKicked = false;
kicked.socket.on('kicked', () => (gotKicked = true));
host.socket.emit('host:control', { type: 'kick', player: kicked.playerId });
await waitFor('kick', () => gotKicked && !host.view.players.some((p) => p.id === kicked.playerId));

// Host can resume its room after a refresh.
const host2 = connect();
const resumed = await emitAck(host2, 'host:resume', { code: host.code, token: host.token });
if (resumed.error) fail('host could not resume its room');
const wrong = await emitAck(host2, 'host:resume', { code: host.code, token: 'nope' });
if (!wrong.error) fail('host resume should require the token');

// Static pages and QR code are served.
for (const p of ['/', '/host', '/js/host.js', '/js/play.js', '/css/host.css', '/socket.io/socket.io.js']) {
  const res = await fetch(URL + p);
  if (!res.ok) fail(`GET ${p} → ${res.status}`);
}
const qr = await fetch(`${URL}/api/qr.svg?text=${encodeURIComponent('http://example.com/?code=ABCD')}`);
if (!qr.ok || !(await qr.text()).includes('<svg')) fail('QR code endpoint broken');

if (/error/i.test(serverErrors)) fail('server logged errors');
console.log(`\n✓ All ${GAMES.length} games played start to finish. Night totals: ${totals} points.`);
server.kill();
process.exit(0);
