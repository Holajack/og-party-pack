// The big screen (projector). Shows the room code, the game menu and every
// game screen. All game state comes from the server; this file just draws it.

import { $, avatar, createPainter, esc, fmt, keepAwake, msLeft, ordinal, store, syncClock, withBible } from './common.js';
import { animateStrokes, renderStrokes } from './draw-canvas.js';
import * as sound from './sound.js';

const socket = window.io({ transports: ['websocket', 'polling'] });
const app = $('#app');
const paint = createPainter(app);
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

let view = null;
let prev = null;
let session = store.get('og-host');
let joinHost = location.host;
let joinUrl = location.origin;
let started = false;
let drawingCache = new Map();
let stopReplay = null;

// ---- setup -------------------------------------------------------------

(async function findJoinAddress() {
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname)) return;
  // Running on this laptop: phones need the laptop's Wi-Fi address instead.
  try {
    const { urls } = await (await fetch('/api/lan')).json();
    if (urls?.length) {
      joinUrl = urls[0];
      joinHost = urls[0].replace(/^https?:\/\//, '');
      render();
    }
  } catch {
    /* keep localhost */
  }
})();

const prefs = store.get('og-host-prefs') || {};
sound.setMuted(Boolean(prefs.muted));
sound.setMusic(prefs.music !== false);

function savePrefs() {
  store.set('og-host-prefs', { muted: sound.isMuted(), music: sound.isMusicOn() });
}

let packName = 'OG Party Pack';
fetch('/api/pack')
  .then((r) => r.json())
  .then((pack) => {
    packName = pack.name || packName;
    document.title = `${packName} · Big Screen`;
    if (!started) splash(true);
  })
  .catch(() => {});

// Free hosting plans can go to sleep when they see no web requests for a while,
// even with a game running. While this page is open (even before anyone
// clicks Start), a tiny request every few minutes keeps the server awake.
setInterval(() => fetch('/healthz', { cache: 'no-store' }).catch(() => {}), 4 * 60 * 1000);

function splash(force = false) {
  document.body.dataset.theme = 'lobby';
  if (force) paint('splash-reset', '');
  paint(
    `splash-${Boolean(session)}`,
    `<section class="splash">
      <div class="logo-big pop"><span>OG</span></div>
      <h1 class="splash-title rise">${esc(packName)}</h1>
      <p class="splash-sub rise">Bible games for the big screen. Everybody plays on their phone.</p>
      <div class="splash-actions rise">
        ${
          session
            ? `<button class="btn primary big" data-act="resume">Continue game night</button>
               <button class="btn ghost" data-act="create">Start a new room</button>`
            : `<button class="btn primary big" data-act="create">Start game night</button>`
        }
      </div>
      <p class="splash-hint">Tip: press <kbd>F</kbd> for full screen.</p>
    </section>`,
  );
}

function begin(mode) {
  started = true;
  sound.unlock();
  keepAwake();
  if (mode === 'resume' && session) resume();
  else create();
}

function create() {
  socket.emit('host:create', { used: store.get('og-used') || [] }, (res) => {
    session = { code: res.code, token: res.token };
    store.set('og-host', session);
  });
}

function resume() {
  socket.emit('host:resume', session, (res) => {
    if (res?.error) {
      toast('That room has closed. Starting a fresh one!');
      create();
    }
  });
}

socket.on('connect', () => {
  if (started && session) resume();
});

socket.on('disconnect', () => toast('Lost connection to the server. Reconnecting…', 0));

socket.on('used', (used) => store.set('og-used', used.slice(-1500)));

socket.on('view', ({ v, now }) => {
  syncClock(now);
  prev = view;
  view = v;
  hideToast();
  cues(prev, view);
  render();
});

// ---- input -------------------------------------------------------------

function control(type, extra = {}) {
  sound.unlock();
  socket.emit('host:control', { type, ...extra });
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'create' || act === 'resume') return begin(act);
  if (act === 'start') return control('start', { game: el.dataset.game });
  if (act === 'length') return control('settings', { length: el.dataset.value });
  if (act === 'relaxed') return control('settings', { relaxed: el.dataset.value === 'on' });
  if (act === 'bible') return control('settings', { translation: el.dataset.value });
  if (act === 'next') return control('continue', { seq: view?.screen?.seq });
  if (act === 'pause') return control(view?.paused ? 'resume' : 'pause');
  if (act === 'quit') {
    if (confirm('End this game and go back to the menu? Scores from this game won’t count.')) control('quit');
    return;
  }
  if (act === 'kick') {
    if (confirm(`Remove ${el.dataset.name} from the room?`)) control('kick', { player: el.dataset.player });
    return;
  }
  if (act === 'leader') return control('leader', { player: el.dataset.player });
  if (act === 'sound') {
    sound.setMuted(!sound.isMuted());
    savePrefs();
    return renderHud();
  }
  if (act === 'music') {
    sound.setMusic(!sound.isMusicOn());
    savePrefs();
    music();
    return renderHud();
  }
  if (act === 'fullscreen') return toggleFullscreen();
  if (act === 'newroom') {
    if (confirm('Start a brand-new room? Everyone will need the new code.')) {
      store.remove('og-host');
      session = null;
      create();
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea')) return;
  if (!started) {
    if (e.key === 'Enter') begin(session ? 'resume' : 'create');
    return;
  }
  if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'Enter') {
    e.preventDefault();
    if (view?.screen?.game) control('continue', { seq: view.screen.seq });
  } else if (e.key === 'p' || e.key === 'P') {
    if (view?.screen?.game) control(view.paused ? 'resume' : 'pause');
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  } else if (e.key === 'm' || e.key === 'M') {
    sound.setMuted(!sound.isMuted());
    savePrefs();
    renderHud();
  }
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

// ---- sounds & music ----------------------------------------------------

const ANSWER_PHASES = new Set(['question', 'write', 'choose', 'order', 'draw', 'guess', 'vote']);
const SCRIPTURE_GAMES = new Set(['realornot', 'bluff', 'whosaid', 'whichbook']);

function cues(before, after) {
  if (!before) return music();
  const a = before.screen;
  const b = after.screen;
  if (after.players.length > before.players.length) sound.sfx.join();
  if (a.game !== b.game && b.game) sound.sfx.start();
  if (a.phase !== b.phase || a.seq !== b.seq) {
    if (ANSWER_PHASES.has(b.phase)) sound.sfx.question();
    else if (b.phase === 'reveal' && b.game === 'bluff') {
      const step = b.steps?.[b.step];
      if (step?.truth) sound.sfx.reveal();
      else sound.sfx.fooled();
    } else if (b.phase === 'reveal' || b.phase === 'results') sound.sfx.reveal();
    else if (b.phase === 'scores') sound.sfx.scores();
    else if (b.phase === 'final') {
      sound.sfx.fanfare();
      confetti();
    }
  }
  const countA = answeredCount(a);
  const countB = answeredCount(b);
  if (a.phase === b.phase && a.seq === b.seq && countB > countA) sound.sfx.lockIn();
  music();
}

function answeredCount(s) {
  return (s.answered || s.submitted || s.chosen || s.locked || s.guessed || s.voted || s.done || []).length;
}

function music() {
  const phase = view?.screen?.phase;
  const calm = !view || ['lobby', 'intro', 'scores', 'final', 'gallery'].includes(phase);
  if (calm && started) sound.playMusic();
  else sound.stopMusic();
}

// ---- timer ring --------------------------------------------------------

const timerEl = $('#timer');
let lastTickSecond = null;

function timerLoop() {
  const t = view?.timer;
  const phase = view?.screen?.phase;
  const show = Boolean(t && view?.screen?.game && ANSWER_PHASES.has(phase));
  timerEl.hidden = !show;
  if (show) {
    const left = msLeft(t);
    const secs = Math.ceil(left / 1000);
    timerEl.querySelector('.secs').textContent = view.paused ? '❚❚' : String(secs);
    timerEl.querySelector('.fill').style.strokeDashoffset = String(100 - (left / t.total) * 100);
    timerEl.classList.toggle('urgent', secs <= 5 && !view.paused);
    if (secs <= 5 && secs > 0 && secs !== lastTickSecond && !view.paused) sound.sfx.tick();
    lastTickSecond = secs;
  }
  requestAnimationFrame(timerLoop);
}
requestAnimationFrame(timerLoop);

// ---- rendering ---------------------------------------------------------

function render() {
  if (!started) {
    renderHud();
    return splash();
  }
  if (!view) {
    renderHud();
    return paint('connecting', `<section class="splash"><div class="logo-big pop"><span>OG</span></div><h1 class="splash-title">Setting up the room…</h1></section>`);
  }
  const s = view.screen;
  document.body.dataset.theme = s.game || 'lobby';
  // The game buttons unlock when the first player joins, so that's a new screen.
  if (!s.game) paint(`lobby:${view.code}:${joinUrl}:${view.players.length > 0}`, lobby());
  else {
    const key = `${s.game}:${s.phase}:${s.seq}`;
    const body = gameScreen(s);
    paint(key, frame(s, body), (root) => mounted(s, root));
  }
  renderHud();
}

function renderHud() {
  const hud = $('#hud');
  $('#veil').hidden = !(started && view?.paused && view.screen.game);
  if (!view || !started) {
    hud.innerHTML = '';
    return;
  }
  const inGame = Boolean(view.screen.game);
  hud.innerHTML = `
    ${inGame ? `<button class="hud-btn" data-act="quit" title="End this game">✕ End game</button>` : `<button class="hud-btn" data-act="newroom" title="New room">New room</button>`}
    <button class="hud-btn" data-act="music" title="Music">${sound.isMusicOn() ? '🎵 On' : '🎵 Off'}</button>
    <button class="hud-btn" data-act="sound" title="Sound (M)">${sound.isMuted() ? '🔇' : '🔊'}</button>
    <button class="hud-btn" data-act="fullscreen" title="Full screen (F)">⛶</button>
    ${inGame ? `<button class="hud-btn" data-act="pause" title="Pause (P)">${view.paused ? '▶ Resume' : '❚❚ Pause'}</button>` : ''}
    ${inGame ? `<button class="hud-btn next" data-act="next" title="Next (Space)">Next ▶</button>` : ''}`;
}

function lobby() {
  const players = view.players;
  const tonight = view.history.length
    ? `<section class="tonight card" data-live="tonight">
        <h3>Tonight</h3>
        <ul class="history">${view.history
          .slice(-3)
          .map((h) => `<li><span>${esc(h.emoji)} ${esc(h.game)}</span><b>${esc(winnersLabel(h.winners))}</b></li>`)
          .join('')}</ul>
        ${leaderboardMini(players)}
      </section>`
    : '';
  const qrUrl = `/api/qr.svg?text=${encodeURIComponent(`${joinUrl}/?code=${view.code}`)}`;
  return `
  <div class="lobby ${view.history.length ? 'has-tonight' : ''}">
    <header class="brand rise">
      <div class="logo"><span>OG</span></div>
      <div>
        <h1>${esc(view.pack.name)}</h1>
        <p>${esc(view.pack.group)}</p>
      </div>
    </header>

    <section class="join card pop">
      <h2>Grab your phone!</h2>
      <div class="join-body">
        <img class="qr" src="${esc(qrUrl)}" alt="QR code to join" />
        <div class="join-info">
          <p class="label">Go to</p>
          <p class="url" data-live="url">${esc(joinHost)}</p>
          <p class="label">Room code</p>
          <p class="code">${[...view.code].map((c) => `<span>${esc(c)}</span>`).join('')}</p>
        </div>
      </div>
    </section>

    <section class="roster">
      <h3>Players <span class="count" data-live="count">${players.length} / ${view.maxPlayers}</span></h3>
      <div class="players" data-live="players" data-keyed>
        ${
          players.length
            ? players.map(playerTile).join('')
            : `<p class="empty" data-id="empty">Waiting for people to join…</p>`
        }
      </div>
    </section>

    <section class="menu">
      <div class="menu-head rise">
        <h2>Pick a game</h2>
        <p class="menu-hint" data-live="hint">${
          players.length
            ? `Click one, or let <b>${esc(players.find((p) => p.leader)?.name ?? 'the leader')}</b> 👑 pick from their phone.`
            : 'Games unlock once someone joins.'
        }</p>
      </div>
      <div class="games stagger">
        ${view.menu
          .map(
            (g) => `
          <button class="game-card" data-theme="${esc(g.id)}" data-act="start" data-game="${esc(g.id)}" ${players.length ? '' : 'disabled'}>
            <span class="g-emoji">${esc(g.emoji)}</span>
            <span class="g-text">
              <span class="g-name">${esc(g.name)}</span>
              <span class="g-tag">${esc(g.tagline)}</span>
            </span>
          </button>`,
          )
          .join('')}
      </div>
      <div class="settings" data-live="settings">
        <div class="seg">
          <span>Length</span>
          ${['short', 'standard', 'long']
            .map((l) => `<button class="${view.settings.length === l ? 'on' : ''}" data-act="length" data-value="${l}">${l[0].toUpperCase() + l.slice(1)}</button>`)
            .join('')}
        </div>
        <div class="seg">
          <span>Timers</span>
          <button class="${view.settings.relaxed ? '' : 'on'}" data-act="relaxed" data-value="off">Normal</button>
          <button class="${view.settings.relaxed ? 'on' : ''}" data-act="relaxed" data-value="on">Relaxed</button>
        </div>
        <div class="seg">
          <span>Bible</span>
          ${view.translations
            .map((t) => `<button class="${view.settings.translation === t.id ? 'on' : ''}" data-act="bible" data-value="${esc(t.id)}" title="${esc(t.name)}">${esc(t.short)}</button>`)
            .join('')}
        </div>
        ${bibleNote(view.translations, view.settings.translation)}
      </div>
    </section>
    ${tonight}
  </div>`;
}

function bibleNote(translations, id) {
  const t = translations.find((x) => x.id === id);
  return t ? `<p class="bible-note">📖 <b>${esc(t.name)}</b><br />${esc(t.blurb)}</p>` : '';
}

function winnersLabel(names) {
  if (!names.length) return '—';
  if (names.length <= 2) return names.join(' & ');
  return `${names.length}-way tie`;
}

function playerTile(p) {
  return `<div class="player-tile pop ${p.connected ? '' : 'away'}" data-id="${esc(p.id)}">
    ${avatar(p)}
    <span class="p-name">${p.leader ? '👑 ' : ''}${esc(p.name)}</span>
    <span class="p-tools">
      ${p.leader ? '' : `<button data-act="leader" data-player="${esc(p.id)}" title="Make leader">👑</button>`}
      <button data-act="kick" data-player="${esc(p.id)}" data-name="${esc(p.name)}" title="Remove">✕</button>
    </span>
  </div>`;
}

function leaderboardMini(players) {
  const rows = players.filter((p) => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 3);
  if (!rows.length) return '';
  return `<ol class="mini-board">${rows
    .map((p, i) => `<li><span class="r">${i + 1}</span>${avatar(p, 'sm')}<span class="n">${esc(p.name)}</span><b>${fmt(p.total)}</b></li>`)
    .join('')}</ol>`;
}

// Wraps every in-game screen with a top bar (game, progress, join code).
function frame(s, body) {
  const meta = view.menu.find((g) => g.id === s.game);
  const progress = s.n && s.total ? `${progressLabel(s)} ${s.n} of ${s.total}` : '';
  return `
  <div class="game-frame">
    <header class="topbar">
      <div class="tb-game"><span class="tb-emoji">${esc(meta.emoji)}</span>${esc(meta.name)}</div>
      <div class="tb-mid">${progress ? `<span class="pill">${esc(progress)}</span>` : ''}${SCRIPTURE_GAMES.has(s.game) ? `<span class="pill" title="Bible translation">📖 ${esc(s.bible)}</span>` : ''}${s.double && ANSWER_PHASES.has(s.phase) ? ' <span class="double-badge">Double points!</span>' : ''}</div>
      <div class="tb-join">Join at <b>${esc(joinHost)}</b> · code <b class="tb-code">${esc(view.code)}</b></div>
    </header>
    <section class="stage">${body}</section>
  </div>`;
}

function progressLabel(s) {
  if (s.game === 'timeline') return 'Round';
  if (s.game === 'bluff') return 'Verse';
  if (s.game === 'laughs') return 'Prompt';
  if (s.game === 'draw') return 'Drawing';
  return 'Question';
}

function gameScreen(s) {
  if (s.phase === 'intro') return intro(s);
  if (s.phase === 'scores') return scores(s);
  if (s.phase === 'final') return finalScreen(s);
  switch (s.game) {
    case 'realornot':
    case 'whosaid':
    case 'whichbook':
      return trivia(s);
    case 'bluff':
      return bluff(s);
    case 'timeline':
      return timeline(s);
    case 'draw':
      return draw(s);
    case 'laughs':
      return laughs(s);
    default:
      return '';
  }
}

// Shows who has locked in, out of everyone connected.
function waitingRow(doneIds, label = 'locked in') {
  const done = new Set(doneIds || []);
  const players = view.players.filter((p) => p.connected || done.has(p.id));
  return `<div class="waiting" data-live="waiting">
    <div class="waiting-avatars" >${players
      .map((p) => `<span class="w ${done.has(p.id) ? 'in' : ''}" title="${esc(p.name)}">${avatar(p, 'sm')}</span>`)
      .join('')}</div>
    <span class="waiting-count">${done.size} / ${players.length} ${esc(label)}</span>
  </div>`;
}

function intro(s) {
  const meta = view.menu.find((g) => g.id === s.game);
  return `<div class="intro">
    <div class="intro-emoji pop">${esc(meta.emoji)}</div>
    <h1 class="intro-title rise">${esc(meta.name)}</h1>
    <p class="intro-tag rise">${esc(meta.tagline)}</p>
    <ol class="rules stagger">${meta.rules.map((r, i) => `<li><span class="num">${i + 1}</span><span>${esc(r)}</span></li>`).join('')}</ol>
    <p class="hint">Get your phones ready! Starting in a moment… <span class="muted">(Space to skip)</span></p>
  </div>`;
}

function scores(s) {
  return `<div class="scores">
    <h1 class="screen-title pop">Leaderboard</h1>
    ${board(s.standings, true)}
  </div>`;
}

function board(rows, showGain) {
  const top = Math.max(1, ...rows.map((r) => r.score));
  const cols = rows.length > 10 ? 'two-col' : '';
  const style = cols ? ` style="grid-template-rows: repeat(${Math.ceil(rows.length / 2)}, auto)"` : '';
  return `<ol class="board stagger ${cols}"${style}>${rows
    .map(
      (r) => `<li class="${r.rank === 1 ? 'first' : ''}">
        <span class="rank">${r.rank}</span>
        ${avatar(r)}
        <span class="b-name">${esc(r.name)}</span>
        <span class="b-bar"><i style="width:${Math.max(3, (r.score / top) * 100)}%"></i></span>
        <span class="b-score">${fmt(r.score)}</span>
        ${showGain && r.gain ? `<span class="gain">+${fmt(r.gain)}</span>` : '<span class="gain none"></span>'}
      </li>`,
    )
    .join('')}</ol>`;
}

function finalScreen(s) {
  const rows = s.standings;
  const podium = [rows[1], rows[0], rows[2]]
    .map((r, i) => {
      if (!r) return '<div class="podium-slot empty"></div>';
      const place = [2, 1, 3][i];
      return `<div class="podium-slot p${place}">
        <div class="podium-player pop" style="animation-delay:${[0.6, 1.1, 0.2][i]}s">
          ${place === 1 ? '<span class="crown">👑</span>' : ''}
          ${avatar(r, 'xl')}
          <span class="pp-name">${esc(r.name)}</span>
          <span class="pp-score">${fmt(r.score)}</span>
        </div>
        <div class="podium-block"><span>${ordinal(r.rank)}</span></div>
      </div>`;
    })
    .join('');
  const rest = rows.slice(3);
  return `<div class="final">
    <h1 class="screen-title pop">🏆 Final Scores</h1>
    <div class="podium">${podium}</div>
    ${
      rest.length
        ? `<ol class="rest stagger">${rest
            .map((r) => `<li><span class="rank">${r.rank}</span>${avatar(r, 'sm')}<span>${esc(r.name)}</span><b>${fmt(r.score)}</b></li>`)
            .join('')}</ol>`
        : ''
    }
    <p class="hint">Press <b>Next</b> to go back to the games.</p>
  </div>`;
}

// ---- trivia (Real or Not / Who Said It / Which Book) -------------------

function trivia(s) {
  const isRon = s.game === 'realornot';
  const reveal = s.phase === 'reveal';
  const quote = isRon ? esc(s.prompt) : `“${esc(s.prompt.replace(/[.,;:]$/, ''))}”`;
  const ask = { realornot: 'Is this in the Bible?', whosaid: 'Who said it?', whichbook: 'Which book is it from?' }[s.game];
  const choices = s.choices
    .map((c, i) => {
      const cls = reveal ? (i === s.correct ? 'right' : 'wrong') : '';
      const label = isRon ? (i === 0 ? '✅ REAL' : '❌ NOT <small>in the Bible</small>') : esc(c);
      const pickers = reveal
        ? `<span class="pickers">${s.pickers[i].map((p) => avatar(p, 'sm')).join('')}</span>`
        : '';
      return `<div class="choice ${isRon ? (i === 0 ? 'real' : 'not') : `c${i}`} ${cls}">
        ${isRon ? '' : `<span class="letter">${LETTERS[i]}</span>`}
        <span class="c-text">${label}</span>
        ${pickers}
      </div>`;
    })
    .join('');
  const gainers = reveal
    ? Object.entries(s.points)
        .map(([id, pts]) => ({ p: view.players.find((x) => x.id === id), pts }))
        .filter((x) => x.p)
        .sort((a, b) => b.pts - a.pts)
    : [];
  return `<div class="trivia ${isRon ? 'ron' : 'mc'}">
    <p class="ask rise">${ask}</p>
    <div class="prompt card pop ${s.prompt.length > 110 ? 'long' : ''}"><p>${quote}</p></div>
    <div class="choices n${s.choices.length} stagger">${choices}</div>
    ${
      reveal
        ? `<div class="explain card rise">
            <span class="ref">📖 ${esc(withBible(s.ref, s.bible))}</span>
            ${s.note ? `<p>${esc(s.note)}</p>` : ''}
          </div>
          <div class="gainers">${
            gainers.length
              ? gainers.map((g) => `<span class="gainer pop">${avatar(g.p, 'sm')}<b>+${fmt(g.pts)}</b></span>`).join('')
              : '<span class="nobody">Nobody got this one!</span>'
          }</div>`
        : waitingRow(s.answered, 'answered')
    }
  </div>`;
}

// ---- Bluff the Verse ---------------------------------------------------

function verseCard(s, fill) {
  const blank = fill ? `<mark class="truth-word">${esc(fill)}</mark>` : `<span class="blank">______</span>`;
  const after = esc(s.after);
  const sep = /^[A-Za-z]/.test(s.after) ? ' ' : '';
  return `<div class="verse card pop ${s.before.length + s.after.length > 150 ? 'long' : ''}">
    <p>${esc(s.before)} ${blank}${sep}${after}</p>
    <span class="ref">${esc(withBible(s.ref, s.bible))}</span>
  </div>`;
}

function bluff(s) {
  if (s.phase === 'write') {
    return `<div class="bluff">
      ${verseCard(s)}
      <p class="instruct rise">Type a <b>fake</b> word on your phone that could fool everyone.</p>
      ${waitingRow(s.submitted, 'faked')}
    </div>`;
  }
  if (s.phase === 'choose') {
    return `<div class="bluff">
      ${verseCard(s)}
      <p class="instruct">Which one is the <b>real</b> word?</p>
      <div class="options stagger n${s.options.length > 9 ? 'many' : ''}">${s.options.map((o) => `<div class="option">${esc(o.text)}</div>`).join('')}</div>
      ${waitingRow(s.chosen, 'picked')}
    </div>`;
  }
  if (s.phase === 'reveal') {
    const step = s.steps[s.step];
    const names = (list) => list.map((p) => `<span class="who">${avatar(p, 'sm')}${esc(p.name)}</span>`).join('');
    const spotlight = step.truth
      ? `<div class="spotlight truth pop">
          <span class="tag">THE TRUTH</span>
          <p class="big-word">${esc(step.text)}</p>
          <div class="who-row">${step.pickers.length ? `<span class="lbl">Found it (+1,000${s.double ? ' ×2' : ''})</span>${names(step.pickers)}` : '<span class="lbl">Nobody found it. The liars win this one!</span>'}</div>
        </div>`
      : `<div class="spotlight lie pop">
          <span class="tag">${step.house ? 'OUR FAKE' : 'A FAKE'}</span>
          <p class="big-word">${esc(step.text)}</p>
          <div class="who-row"><span class="lbl">Fooled</span>${names(step.pickers)}</div>
          <div class="who-row author">${step.house ? '<span class="lbl">That one was ours 😇</span>' : `<span class="lbl">Written by (+500 each${s.double ? ' ×2' : ''})</span>${names(step.authors)}`}</div>
        </div>`;
    return `<div class="bluff reveal">
      ${verseCard(s, step.truth ? s.answer : null)}
      ${spotlight}
    </div>`;
  }
  return '';
}

// ---- Timeline ----------------------------------------------------------

function timeline(s) {
  if (s.phase === 'order') {
    return `<div class="timeline">
      <h2 class="tl-title pop">${esc(s.title)}</h2>
      <p class="instruct rise">Put these in order on your phone, <b>earliest first</b>.</p>
      <div class="tl-cards stagger">${s.events.map((e) => `<div class="tl-card card">${esc(e.text)}</div>`).join('')}</div>
      <div class="tl-axis rise"><span>Earliest</span><i></i><span>Latest</span></div>
      ${waitingRow(s.locked, 'locked in')}
    </div>`;
  }
  if (s.phase === 'reveal') {
    const results = s.results.length
      ? s.results
          .map((r) => `<span class="tl-res pop ${r.perfect ? 'perfect' : ''}">${avatar(r, 'sm')}<span class="n">${esc(r.name)}</span><b>${r.right}/${s.correct.length}</b>${r.perfect ? '✨' : ''}${r.points ? `<em>+${fmt(r.points)}</em>` : ''}</span>`)
          .join('')
      : '<span class="nobody">Nobody locked in a timeline.</span>';
    return `<div class="timeline reveal">
      <h2 class="tl-title">${esc(s.title)}: the right order</h2>
      <ol class="tl-answer stagger">${s.correct
        .map(
          (e, i) => `<li><span class="dot">${i + 1}</span><div class="tl-a card"><b>${esc(e.text)}</b><span class="ref">${esc(e.ref)}</span></div>
          <span class="hits">${s.players ? `${e.hits}/${s.players} got this spot` : ''}</span></li>`,
        )
        .join('')}</ol>
      <div class="tl-results">${results}</div>
    </div>`;
  }
  return '';
}

// ---- Draw the Word -----------------------------------------------------

function draw(s) {
  if (s.phase === 'draw') {
    const done = new Set(s.done);
    const started_ = new Set(s.started);
    return `<div class="drawing-time">
      <h2 class="screen-title pop">Everybody’s drawing! ✏️</h2>
      <p class="instruct rise">Look at your phone for your secret Bible story. No letters or words allowed!</p>
      <div class="artists" data-live="artists" data-keyed>${s.artists
        .map(
          (p) => `<div class="artist ${done.has(p.id) ? 'done' : started_.has(p.id) ? 'busy' : ''}" data-id="${esc(p.id)}">
            ${avatar(p)}<span>${esc(p.name)}</span><em>${done.has(p.id) ? '✅ Done' : started_.has(p.id) ? '✏️ Drawing…' : '🤔 Thinking…'}</em>
          </div>`,
        )
        .join('')}</div>
      ${s.totalRounds > 1 ? `<p class="hint">Round ${s.round} of ${s.totalRounds}</p>` : ''}
    </div>`;
  }
  if (s.phase === 'guess' || s.phase === 'reveal') {
    const reveal = s.phase === 'reveal';
    return `<div class="guessing">
      <div class="easel card ${reveal ? '' : 'pop'}">
        <canvas class="art" data-drawing="${esc(s.drawingId)}" data-animate="${reveal ? '0' : '1'}"></canvas>
        ${reveal ? `<div class="artist-tag pop">Drawn by ${avatar(s.artist, 'sm')} <b>${esc(s.artist.name)}</b></div>` : ''}
      </div>
      <div class="guess-side">
        <h2>${reveal ? 'It was…' : 'What is it?'}</h2>
        <ol class="guess-options ${reveal ? 'revealed' : 'stagger'}">${s.choices
          .map(
            (c, i) => `<li class="${reveal ? (i === s.correct ? 'right' : 'wrong') : ''}">
              <span class="letter">${LETTERS[i]}</span><span class="g-text">${esc(c)}</span>
              ${reveal ? `<span class="pickers">${s.pickers[i].map((p) => avatar(p, 'sm')).join('')}</span>` : ''}
            </li>`,
          )
          .join('')}</ol>
        ${
          reveal
            ? `<p class="artist-points">${s.points[s.artist.id] ? `${esc(s.artist.name)} earns <b>+${fmt(s.points[s.artist.id])}</b> for a drawing people could read!` : `Tough crowd! Nobody guessed ${esc(s.artist.name)}’s drawing.`}</p>`
            : waitingRow(s.guessed, 'guessed')
        }
      </div>
    </div>`;
  }
  if (s.phase === 'gallery') {
    const n = s.items.length;
    const cols = n <= 4 ? n : n <= 8 ? 4 : n <= 10 ? 5 : n <= 12 ? 6 : n <= 15 ? 5 : n <= 18 ? 6 : 7;
    const rows = Math.ceil(n / cols);
    return `<div class="gallery">
      <h2 class="screen-title pop">The Gallery 🖼️</h2>
      <div class="frames stagger" style="--cols:${cols};--rows:${rows}">${s.items
        .map(
          (it) => `<figure class="frame card">
            <canvas class="art" data-drawing="${esc(it.id)}" data-animate="0"></canvas>
            <figcaption><b>${esc(it.prompt)}</b><span>${avatar(it.artist, 'sm')} ${esc(it.artist.name)}</span></figcaption>
          </figure>`,
        )
        .join('')}</div>
    </div>`;
  }
  return '';
}

function loadDrawing(id) {
  if (drawingCache.has(id)) return Promise.resolve(drawingCache.get(id));
  return new Promise((resolve) => {
    socket.emit('drawing:get', id, (strokes) => {
      if (strokes) drawingCache.set(id, strokes);
      resolve(strokes || []);
    });
  });
}

// ---- Loaves & Laughs ---------------------------------------------------

function laughs(s) {
  if (s.phase === 'write') {
    return `<div class="laughs">
      <div class="lp card pop"><p>${esc(s.prompt)}</p></div>
      <p class="instruct rise">Write your funniest answer on your phone!</p>
      ${waitingRow(s.submitted, 'answered')}
    </div>`;
  }
  if (s.phase === 'vote') {
    return `<div class="laughs">
      <div class="lp card small"><p>${esc(s.prompt)}</p></div>
      <div class="answers stagger ${s.entries.length > 8 ? 'many' : ''} ${s.entries.length > 14 ? 'lots' : ''}">${s.entries
        .map((e) => `<div class="answer card">${esc(e.text)}</div>`)
        .join('')}</div>
      ${waitingRow(s.voted, 'voted')}
    </div>`;
  }
  if (s.phase === 'results') {
    return `<div class="laughs">
      <div class="lp card small"><p>${esc(s.prompt)}</p></div>
      <div class="answers results stagger ${s.entries.length > 8 ? 'many' : ''} ${s.entries.length > 14 ? 'lots' : ''}">${
        s.entries.length
          ? s.entries
              .map(
                (e) => `<div class="answer card ${e.winner ? 'winner' : ''}">
                ${e.winner ? '<span class="crown">👑</span>' : ''}
                <p>${esc(e.text)}</p>
                <div class="by">${avatar(e.author, 'sm')}<b>${esc(e.author.name)}</b><span class="votes">${e.voters.length} vote${e.voters.length === 1 ? '' : 's'}</span>${e.points ? `<em>+${fmt(e.points)}</em>` : ''}</div>
              </div>`,
              )
              .join('')
          : '<p class="nobody">Nobody answered this one!</p>'
      }</div>
    </div>`;
  }
  return '';
}

// After a new screen mounts: start drawing replays.
function mounted(s, root) {
  if (stopReplay) stopReplay();
  stopReplay = null;
  for (const canvas of root.querySelectorAll('canvas[data-drawing]')) {
    const animate = canvas.dataset.animate === '1';
    loadDrawing(canvas.dataset.drawing).then((strokes) => {
      if (!canvas.isConnected) return;
      if (animate) stopReplay = animateStrokes(canvas, strokes, 4000);
      else renderStrokes(canvas, strokes);
    });
  }
  if (s.game !== 'draw' || s.phase === 'intro') drawingCache = new Map();
}

// ---- toast & confetti --------------------------------------------------

let toastTimer = null;
function toast(msg, ms = 4000) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(hideToast, ms);
}

function hideToast() {
  $('#toast').classList.remove('show');
}

let confettiRun = 0;

function confetti() {
  const run = ++confettiRun;
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const colors = ['#ffc53d', '#ff4d8d', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#ffffff'];
  const bits = Array.from({ length: 220 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.6,
    w: 6 + Math.random() * 8,
    h: 10 + Math.random() * 10,
    vy: 2 + Math.random() * 3.5,
    vx: -1.5 + Math.random() * 3,
    r: Math.random() * Math.PI,
    vr: -0.15 + Math.random() * 0.3,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const end = performance.now() + 6000;
  const tick = (now) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (now < end && run === confettiRun && view?.screen?.phase === 'final') requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  requestAnimationFrame(tick);
}

render();
