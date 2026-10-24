// Visual check: drives a real browser as the projector and as one phone
// (plus bot players) through every game, saving screenshots of each screen
// to test/screenshots/. Needs Playwright with Chromium installed.
//
//   node test/screenshots.js

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { io } from 'socket.io-client';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'test', 'screenshots');
const PORT = 3990;
const URL = `http://localhost:${PORT}`;
const NAMES = ['Grandma Jo', 'Pastor Mike', 'Linda', 'Dave', 'Keisha', 'Tom', 'Rosa', 'Earl', 'Beth', 'Marcus'];
const FUNNY = [
  'He forgot to pack the snacks',
  'Ninety-nine bottles of rain on the wall',
  'Are we there yet? -Ham',
  'I should have built a bigger window',
  'Two of everything EXCEPT patience',
  'The giraffes keep hitting the ceiling',
  'Who let the woodpeckers on board',
  'Honey, did you lock the ark?',
  'This is fine. Everything is fine.',
  'I regret the two mosquitoes',
];

fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'inherit' });
await sleep(800);

const browser = await chromium.launch();
const hostPage = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const phone = await phoneCtx.newPage();
hostPage.on('pageerror', (e) => console.error('[host page error]', e));
phone.on('pageerror', (e) => console.error('[phone page error]', e));

let n = 0;
async function shot(name, which = 'both') {
  n += 1;
  const tag = String(n).padStart(2, '0');
  await sleep(700);
  if (which !== 'phone') await hostPage.screenshot({ path: path.join(OUT, `${tag}-${name}-host.png`) });
  if (which !== 'host') await phone.screenshot({ path: path.join(OUT, `${tag}-${name}-phone.png`) });
  console.log('📸', tag, name);
}

// ---- host + players ----

await hostPage.goto(`${URL}/host`);
await hostPage.click('[data-act=create]');
await hostPage.waitForSelector('.lobby');
const code = (await hostPage.textContent('.join-info .code')).replace(/\s/g, '');

const bots = [];
for (const name of NAMES) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const bot = { name, socket, view: null };
  socket.on('view', ({ v }) => (bot.view = v));
  await new Promise((r) => socket.emit('player:join', { code, name }, r));
  bots.push(bot);
}

await phone.goto(`${URL}/?code=${code}`);
await shot('join', 'phone');
await phone.fill('input[name=name]', 'Sam');
await phone.click('#join-form button');
await phone.waitForSelector('.p-lobby');

const hostSocket = io(URL, { transports: ['websocket'], forceNew: true });
const hostView = { v: null };
hostSocket.on('view', ({ v }) => (hostView.v = v));
const session = await hostPage.evaluate(() => JSON.parse(localStorage.getItem('og-host')));
await new Promise((r) => hostSocket.emit('host:resume', session, r));
const control = (type, extra = {}) => hostSocket.emit('host:control', { type, ...extra });
const screen = () => hostView.v.screen;
async function waitPhase(phase, game) {
  for (let i = 0; i < 400; i++) {
    const s = screen();
    if (s.phase === phase && (!game || s.game === game)) return s;
    await sleep(50);
  }
  throw new Error(`never reached ${game}:${phase} (at ${screen().game}:${screen().phase})`);
}
async function next() {
  const seq = screen().seq;
  const phase = screen().phase;
  await sleep(750);
  control('continue');
  for (let i = 0; i < 100 && screen().seq === seq && screen().phase === phase; i++) await sleep(30);
}

await sleep(300);
const sam = hostView.v.players.find((p) => p.name === 'Sam');
control('leader', { player: sam.id });
control('settings', { length: 'short' });
await sleep(400);
await shot('lobby');

// Bots act on the current screen.
function botsAct(fraction = 1) {
  const s0 = screen();
  bots.forEach((b, i) => {
    if (i >= Math.round(bots.length * fraction)) return;
    const s = b.view.screen;
    const act = (a) => b.socket.emit('player:action', a);
    if (s.phase === 'question') act({ type: 'answer', choice: Math.random() < 0.6 ? 0 : 1 });
    else if (s0.game === 'bluff' && s.phase === 'write') act({ type: 'lie', text: ['thunder', 'camel', 'fig tree', 'lantern', 'sandals', 'honey', 'rooster', 'olive', 'harp', 'scroll'][i] });
    else if (s0.game === 'bluff' && s.phase === 'choose') act({ type: 'choose', option: s.options[i % s.options.length].id });
    else if (s.phase === 'order') {
      const ids = s.events.map((e) => e.id);
      act({ type: 'lock', order: i % 3 ? ids.slice().sort() : ids.slice().reverse() });
    } else if (s.phase === 'draw' && s.prompt) {
      // A little sun and a hill.
      const circle = [];
      for (let a = 0; a <= 40; a++) circle.push(Math.round(300 + 120 * Math.cos(a / 6.37)), Math.round(300 + 120 * Math.sin(a / 6.37)));
      act({ type: 'stroke', stroke: { c: 3, w: 2, p: circle } });
      act({ type: 'stroke', stroke: { c: 4, w: 1, p: [0, 800, 250, 650, 500, 600, 750, 650, 1000, 800] } });
      act({ type: 'stroke', stroke: { c: i % 8, w: 1, p: [100 + i * 60, 900, 150 + i * 60, 700, 200 + i * 60, 900] } });
      act({ type: 'done' });
    } else if (s.phase === 'guess' && !s.isArtist) act({ type: 'guess', choice: i % 3 === 0 ? 1 : 0 });
    else if (s0.game === 'laughs' && s.phase === 'write') act({ type: 'answer', text: FUNNY[i] });
    else if (s.phase === 'vote' && s.entries?.length) act({ type: 'vote', entry: s.entries[i % 3]?.id ?? s.entries[0].id });
  });
}

async function finishGame() {
  for (let i = 0; i < 80 && screen().phase !== 'final'; i++) {
    const s = screen();
    if (['question', 'write', 'choose', 'order', 'draw', 'guess', 'vote'].includes(s.phase)) {
      botsAct(1);
      await sleep(400);
      control('continue');
      await sleep(300);
    } else await next();
  }
}

async function start(game) {
  await phone.click(`[data-act=pick-game][data-game=${game}]`);
  await sleep(300);
  if (game === 'realornot') await shot('leader-confirm', 'phone');
  await phone.click('[data-act=confirm-start]');
  await waitPhase('intro', game);
}

async function backToMenu(name) {
  await waitPhase('final');
  await sleep(1500);
  await shot(`${name}-final`);
  await phone.click('[data-act=next]');
  await waitPhase('lobby');
}

// ---- Real or Not? ----
await start('realornot');
await shot('ron-intro');
await next();
await waitPhase('question');
botsAct(0.6);
await shot('ron-question');
await phone.click('.ans.real');
await sleep(300);
await shot('ron-locked', 'phone');
botsAct(1);
await waitPhase('reveal');
await shot('ron-reveal');
for (let i = 0; i < 6 && screen().phase !== 'scores'; i++) {
  await next();
  if (screen().phase === 'question') botsAct(1), await phone.click('.ans.not').catch(() => {});
}
await waitPhase('scores');
await shot('ron-scores');
await finishGame();
await backToMenu('ron');

// ---- Bluff the Verse ----
await start('bluff');
await next();
await waitPhase('write');
await phone.fill('#lie', 'trumpet');
await shot('bluff-write');
await phone.click('#lie-form button');
botsAct(0.8);
await sleep(300);
control('continue');
await waitPhase('choose');
await shot('bluff-choose');
await phone.click('.opt >> nth=0');
botsAct(1);
await waitPhase('reveal');
await shot('bluff-reveal-lie', 'host');
for (let i = 0; i < 12 && !screen().steps?.[screen().step]?.truth; i++) await next();
await shot('bluff-reveal-truth');
await finishGame();
await backToMenu('bluff');

// ---- Who Said It? ----
await start('whosaid');
await next();
await waitPhase('question');
botsAct(0.5);
await shot('whosaid-question');
await phone.click('.ans.c0');
botsAct(1);
await waitPhase('reveal');
await shot('whosaid-reveal');
await finishGame();
await waitPhase('final');
await sleep(800);
await phone.click('[data-act=next]');
await waitPhase('lobby');

// ---- Which Book? ----
await start('whichbook');
await next();
await waitPhase('question');
botsAct(0.3);
await shot('whichbook-question');
await phone.click('.ans.c2');
botsAct(1);
await waitPhase('reveal');
await shot('whichbook-reveal', 'host');
await finishGame();
await waitPhase('final');
await sleep(800);
await phone.click('[data-act=next]');
await waitPhase('lobby');

// ---- Timeline ----
await start('timeline');
await next();
await waitPhase('order');
await phone.click('.pool-item >> nth=1');
await phone.click('.pool-item >> nth=0');
botsAct(0.5);
await shot('timeline-order');
await phone.click('.pool-item >> nth=0');
await phone.click('.pool-item >> nth=0');
await phone.click('.pool-item >> nth=0');
await shot('timeline-full', 'phone');
await phone.click('[data-act=tl-lock]');
botsAct(1);
await waitPhase('reveal');
await shot('timeline-reveal');
await finishGame();
await backToMenu('timeline');

// ---- Draw the Word ----
await start('draw');
await next();
await waitPhase('draw');
botsAct(0.5);
const box = await phone.locator('#pad').boundingBox();
const stroke = async (pts) => {
  await phone.mouse.move(box.x + pts[0][0] * box.width, box.y + pts[0][1] * box.height);
  await phone.mouse.down();
  for (const [x, y] of pts.slice(1)) await phone.mouse.move(box.x + x * box.width, box.y + y * box.height, { steps: 6 });
  await phone.mouse.up();
};
await stroke([[0.1, 0.7], [0.3, 0.75], [0.7, 0.75], [0.9, 0.7], [0.8, 0.85], [0.2, 0.85], [0.1, 0.7]]);
await phone.click('[data-act=color][data-i="5"]');
await stroke([[0.05, 0.9], [0.25, 0.85], [0.45, 0.92], [0.65, 0.86], [0.95, 0.9]]);
await phone.click('[data-act=color][data-i="8"]');
await stroke([[0.5, 0.72], [0.5, 0.35]]);
await stroke([[0.5, 0.38], [0.75, 0.6], [0.5, 0.6]]);
await shot('draw-drawing');
await phone.click('[data-act=draw-done]');
botsAct(1);
await waitPhase('guess');
await sleep(4500);
await shot('draw-guess');
for (let i = 0; i < 40 && screen().phase !== 'reveal'; i++) {
  botsAct(1);
  await phone.click('.opt >> nth=0').catch(() => {});
  await sleep(300);
}
await waitPhase('reveal');
await shot('draw-reveal');
for (let i = 0; i < 60 && screen().phase !== 'gallery'; i++) {
  if (screen().phase === 'guess') botsAct(1), await phone.click('.opt >> nth=0').catch(() => {});
  await next();
}
await waitPhase('gallery');
await sleep(800);
await shot('draw-gallery', 'host');
await next();
await backToMenu('draw');

// ---- Loaves & Laughs ----
await start('laughs');
await next();
await waitPhase('write');
await phone.fill('#laugh', 'He kept saying “just one more lap around the boat”');
botsAct(0.6);
await shot('laughs-write');
await phone.click('#laugh-form button');
botsAct(1);
await waitPhase('vote');
await shot('laughs-vote');
await phone.click('.opt >> nth=1');
botsAct(1);
await waitPhase('results');
await shot('laughs-results');
await finishGame();
await backToMenu('laughs');
await shot('lobby-after');

await browser.close();
server.kill();
console.log(`Saved ${n} screenshot sets to ${OUT}`);
process.exit(0);
