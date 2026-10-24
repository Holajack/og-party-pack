// A room is one game night: a host screen (the projector), the players who
// joined from their phones, the game being played and the night's totals.

import config from '../config.js';
import { TRANSLATIONS } from '../content/index.js';
import { gameById, gameMenu } from './games/index.js';
import { cleanText, randomId, shuffle } from './util.js';

export const MAX_PLAYERS = 20;
const MAX_NAME = 14;

export const AVATARS = [
  '🦁', '🐑', '🐟', '🕊️', '🐫', '🐻', '🍇', '🌿', '⭐', '🔥', '🌈', '🐍',
  '🦅', '🐂', '🐸', '🍞', '🐳', '🦊', '🌾', '🐝', '🐢', '🦉', '🌻', '🐓',
];

const COLORS = [
  '#ef476f', '#f78c6b', '#ffd166', '#06d6a0', '#118ab2', '#8338ec', '#ff5d8f',
  '#3a86ff', '#fb5607', '#2ec4b6', '#9b5de5', '#f15bb5', '#00bbf9', '#43aa8b',
  '#e76f51', '#577590', '#f9844a', '#90be6d', '#c77dff', '#ff9f1c',
];

const LENGTHS = ['short', 'standard', 'long'];

// Speeds every timer up (or down). Only the automated tests change this.
const TIME_SCALE = Number(process.env.OG_TIME_SCALE) || 1;

export class Room {
  constructor(code, io, used = []) {
    this.code = code;
    this.io = io;
    this.hostToken = randomId(18);
    this.hostSockets = new Set();
    this.players = new Map();
    this.joinCount = 0;
    this.leaderPick = null;
    this.game = null;
    this.totals = new Map();
    this.history = [];
    this.settings = { length: 'standard', relaxed: false, translation: 'kjv' };
    this.used = new Set(used);
    this.usedDirty = false;
    this.timer = null;
    this.timerSeq = 0;
    this.paused = false;
    this.lastPhaseAt = 0;
    this.lastContinueAt = 0;
    this.sent = new Map();
    this.flushQueued = false;
    this.touch();
  }

  touch() {
    this.lastActive = Date.now();
  }

  // ---- players ----------------------------------------------------------

  playerIds() {
    return [...this.players.keys()];
  }

  connectedIds() {
    return this.playerIds().filter((id) => this.players.get(id).connected);
  }

  publicPlayer(id) {
    const p = this.players.get(id);
    if (!p) return { id, name: 'Someone', avatar: '❔', color: '#888888' };
    return { id: p.id, name: p.name, avatar: p.avatar, color: p.color };
  }

  get leaderId() {
    if (this.leaderPick && this.players.get(this.leaderPick)?.connected) return this.leaderPick;
    return this.connectedIds()[0] ?? null;
  }

  uniqueName(name, selfId) {
    const taken = new Set(
      [...this.players.values()].filter((p) => p.id !== selfId).map((p) => p.name.toLowerCase()),
    );
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name.slice(0, MAX_NAME - String(n).length - 1)} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  freeAvatar() {
    const taken = new Set([...this.players.values()].map((p) => p.avatar));
    const free = AVATARS.filter((a) => !taken.has(a));
    const pool = free.length ? free : AVATARS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Join or rejoin. Returns { player } or { error }. An automatic rejoin
  // (phone waking up) for a player who was removed gets an error instead of
  // quietly creating them again.
  join({ name, playerId, rejoin = false }, socketId) {
    const existing = playerId && this.players.get(playerId);
    if (rejoin && !existing) return { error: 'gone' };
    if (existing) {
      const newName = cleanText(name, MAX_NAME);
      if (newName && newName !== existing.name) existing.name = this.uniqueName(newName, existing.id);
      existing.connected = true;
      existing.socketId = socketId;
      this.game?.onPlayerJoined(existing.id);
      this.touch();
      this.broadcast();
      return { player: existing };
    }
    const clean = cleanText(name, MAX_NAME);
    if (!clean) return { error: 'Type your name first.' };
    if (this.players.size >= MAX_PLAYERS) return { error: `This room is full (${MAX_PLAYERS} players max).` };
    const player = {
      id: randomId(),
      name: this.uniqueName(clean),
      avatar: this.freeAvatar(),
      color: COLORS[this.joinCount % COLORS.length],
      connected: true,
      socketId,
    };
    this.joinCount += 1;
    this.players.set(player.id, player);
    this.game?.onPlayerJoined(player.id);
    this.touch();
    this.broadcast();
    return { player };
  }

  disconnect(playerId, socketId) {
    const p = this.players.get(playerId);
    if (!p || p.socketId !== socketId) return;
    p.connected = false;
    p.socketId = null;
    this.game?.onPlayerLeft(playerId);
    this.broadcast();
  }

  remove(playerId, { notify = true } = {}) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.socketId) {
      if (notify) this.io.to(p.socketId).emit('kicked');
      this.sent.delete(p.socketId);
    }
    this.players.delete(playerId);
    this.totals.delete(playerId);
    if (this.leaderPick === playerId) this.leaderPick = null;
    this.game?.onPlayerRemoved(playerId);
    this.broadcast();
  }

  setAvatar(playerId, avatar) {
    const p = this.players.get(playerId);
    if (!p || !AVATARS.includes(avatar)) return;
    const owner = [...this.players.values()].find((o) => o.avatar === avatar);
    if (owner && owner.id !== playerId) return;
    p.avatar = avatar;
    this.broadcast();
  }

  // ---- games ------------------------------------------------------------

  startGame(gameId) {
    const Game = gameById.get(gameId);
    if (!Game || this.game || !this.players.size) return;
    this.paused = false;
    this.game = new Game(this);
    this.game.start();
  }

  // Called by a game when it reaches its podium.
  recordResult(game) {
    const standings = game.standings();
    for (const row of standings) this.totals.set(row.id, (this.totals.get(row.id) || 0) + row.score);
    const best = standings[0]?.score ?? 0;
    this.history.push({
      game: game.meta.name,
      emoji: game.meta.emoji,
      winners: best > 0 ? standings.filter((r) => r.score === best).map((r) => r.name) : [],
    });
  }

  endGame() {
    this.clearTimer();
    this.game = null;
    this.paused = false;
    this.broadcast();
  }

  // Prefer content nobody has seen yet tonight (or on this host's last few
  // nights); start over once a game's whole bank has been used.
  pickFresh(gameKey, list, n) {
    const idOf = (item) => `${gameKey}:${typeof item === 'string' ? item : item.id}`;
    const fresh = list.filter((item) => !this.used.has(idOf(item)));
    let picked = shuffle(fresh).slice(0, n);
    if (picked.length < n) {
      for (const key of [...this.used]) if (key.startsWith(`${gameKey}:`)) this.used.delete(key);
      const rest = shuffle(list.filter((item) => !picked.includes(item)));
      picked = picked.concat(rest.slice(0, n - picked.length));
    }
    for (const item of picked) this.used.add(idOf(item));
    this.usedDirty = true;
    return picked;
  }

  // ---- controls (host screen, or the leader's phone) --------------------

  control(action, fromHost) {
    const type = action?.type;
    this.touch();
    if (type === 'start') return this.startGame(action.game);
    if (type === 'settings') {
      if (this.game) return;
      if (LENGTHS.includes(action.length)) this.settings.length = action.length;
      if (typeof action.relaxed === 'boolean') this.settings.relaxed = action.relaxed;
      if (Object.hasOwn(TRANSLATIONS, action.translation)) this.settings.translation = action.translation;
      return this.broadcast();
    }
    if (!this.game) {
      if (type === 'kick' && fromHost) this.remove(action.player);
      if (type === 'leader' && fromHost && this.players.has(action.player)) {
        this.leaderPick = action.player;
        this.broadcast();
      }
      return;
    }
    if (type === 'continue') {
      // A press only counts for the screen it was made on, and double-taps
      // are ignored, so one press never skips two screens.
      if (Number.isInteger(action.seq) && action.seq !== this.game.seq) return;
      const now = Date.now();
      if (now - this.lastContinueAt < 600 || now - this.lastPhaseAt < 250) return;
      if (!fromHost && !this.game.continuable) return;
      this.lastContinueAt = now;
      return this.game.onContinue();
    }
    if (type === 'pause') return this.pause();
    if (type === 'resume') return this.resume();
    if (type === 'quit') return this.endGame();
  }

  action(playerId, action) {
    // Answers that arrive while paused still count; the phones show a pause
    // screen, so these are only ones already on their way.
    if (!this.game || !this.players.has(playerId)) return;
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') return;
    this.touch();
    this.game.onAction(playerId, action);
  }

  // ---- timer ------------------------------------------------------------

  startTimer(ms, onEnd) {
    this.clearTimer();
    ms = Math.max(30, Math.round(ms * TIME_SCALE));
    this.lastPhaseAt = Date.now();
    const timer = { id: ++this.timerSeq, total: ms, endsAt: Date.now() + ms, remaining: ms, onEnd, handle: null };
    this.timer = timer;
    if (!this.paused) timer.handle = setTimeout(() => this.fire(timer), ms);
  }

  clearTimer() {
    if (this.timer?.handle) clearTimeout(this.timer.handle);
    this.timer = null;
    this.lastPhaseAt = Date.now();
  }

  fire(timer) {
    if (this.timer !== timer) return;
    clearTimeout(timer.handle);
    this.timer = null;
    try {
      timer.onEnd();
    } catch (err) {
      console.error(`[room ${this.code}] game error`, err);
    }
    this.broadcast();
  }

  skipTimer() {
    if (this.timer) this.fire(this.timer);
  }

  timeLeft() {
    const t = this.timer;
    if (!t) return 0;
    return this.paused ? t.remaining : Math.max(0, t.endsAt - Date.now());
  }

  pause() {
    if (this.paused || !this.game) return;
    this.paused = true;
    const t = this.timer;
    if (t) {
      clearTimeout(t.handle);
      t.handle = null;
      t.remaining = Math.max(0, t.endsAt - Date.now());
    }
    this.broadcast();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    const t = this.timer;
    if (t) {
      t.endsAt = Date.now() + t.remaining;
      t.handle = setTimeout(() => this.fire(t), t.remaining);
    }
    this.broadcast();
  }

  timerView() {
    const t = this.timer;
    if (!t) return null;
    return { id: t.id, total: t.total, endsAt: t.endsAt, paused: this.paused, remaining: this.paused ? t.remaining : null };
  }

  // ---- views ------------------------------------------------------------

  playerList() {
    const leader = this.leaderId;
    return this.playerIds().map((id) => {
      const p = this.players.get(id);
      return { ...this.publicPlayer(id), connected: p.connected, leader: id === leader, total: this.totals.get(id) || 0 };
    });
  }

  hostView() {
    return {
      role: 'host',
      code: this.code,
      pack: config,
      players: this.playerList(),
      maxPlayers: MAX_PLAYERS,
      settings: this.settings,
      translations: Object.values(TRANSLATIONS),
      paused: this.paused,
      timer: this.timerView(),
      menu: gameMenu,
      history: this.history,
      canContinue: Boolean(this.game),
      screen: this.game ? this.game.hostView() : { game: null, phase: 'lobby' },
    };
  }

  playerView(id) {
    const p = this.players.get(id);
    const leader = this.leaderId === id;
    const view = {
      role: 'player',
      code: this.code,
      pack: config,
      me: { ...this.publicPlayer(id), leader, total: this.totals.get(id) || 0 },
      paused: this.paused,
      timer: this.timerView(),
      screen: this.game
        ? this.game.playerView(id)
        : {
            game: null,
            phase: 'lobby',
            players: this.players.size,
            avatars: AVATARS,
            taken: [...this.players.values()].filter((o) => o.id !== p.id).map((o) => o.avatar),
            last: this.history.at(-1) ?? null,
          },
    };
    if (leader) {
      view.leader = this.game
        ? { inGame: true, canContinue: this.game.continuable, final: this.game.phase === 'final' }
        : { inGame: false, menu: gameMenu, settings: this.settings, translations: Object.values(TRANSLATIONS) };
    }
    return view;
  }

  // Coalesce changes made in the same tick into one update per screen, and
  // only send a screen its view when something in it actually changed.
  broadcast() {
    if (this.flushQueued) return;
    this.flushQueued = true;
    setImmediate(() => {
      this.flushQueued = false;
      this.flush();
    });
  }

  flush() {
    const now = Date.now();
    const send = (socketId, view) => {
      const json = JSON.stringify(view);
      if (this.sent.get(socketId) === json) return;
      this.sent.set(socketId, json);
      this.io.to(socketId).emit('view', { v: view, now });
    };
    if (this.hostSockets.size) {
      const view = this.hostView();
      for (const socketId of this.hostSockets) send(socketId, view);
      if (this.usedDirty) {
        this.usedDirty = false;
        for (const socketId of this.hostSockets) this.io.to(socketId).emit('used', [...this.used]);
      }
    }
    for (const p of this.players.values()) if (p.socketId) send(p.socketId, this.playerView(p.id));
  }

  // Forget what a socket was last sent so its next update is a full one.
  resend(socketId) {
    this.sent.delete(socketId);
    this.broadcast();
  }

  isIdle(now) {
    const anyone = this.hostSockets.size || this.connectedIds().length;
    return !anyone && now - this.lastActive > 45 * 60 * 1000;
  }

  close() {
    this.clearTimer();
  }
}

