// The phone controller. Join a room, then answer, draw, vote and type here
// while the big screen shows the game.

import { $, avatar, createPainter, esc, fmt, keepAwake, msLeft, ordinal, store, syncClock } from './common.js';
import { DrawingPad, PALETTE, WIDTHS } from './draw-canvas.js';

const socket = window.io({ transports: ['websocket', 'polling'] });
const app = $('#app');
const paint = createPainter(app);
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const ANSWER_PHASES = new Set(['question', 'write', 'choose', 'order', 'draw', 'guess', 'vote']);

let saved = store.get('og-player');
let view = null;
let joined = false;
let joining = false;
let joinError = '';
let lastSeq = null;

// Phone-only UI state.
const ui = {
  picker: false, // avatar picker open
  confirm: null, // game id waiting for "Start" confirmation
  order: [], // timeline order being built
  orderKey: null,
  pad: null, // drawing pad
  sentAnswer: null, // optimistic lock-in while the server catches up
};

let packName = 'OG Party Pack';
fetch('/api/pack')
  .then((r) => r.json())
  .then((pack) => {
    packName = pack.name || packName;
    document.title = packName;
    if (!joined) {
      const h1 = document.querySelector('.join h1');
      if (h1) h1.textContent = packName;
    }
  })
  .catch(() => {});

const params = new URLSearchParams(location.search);
const urlCode = (params.get('code') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

// ---- joining -----------------------------------------------------------

// Taps made while the phone is reconnecting wait here and are sent once the
// server knows who this phone is again, so nothing gets lost.
let ready = false;
const outbox = [];

function send(event, data) {
  if (ready && socket.connected) socket.emit(event, data);
  else outbox.push([event, data]);
}

// `quiet` is the automatic rejoin when a phone wakes up or reloads.
function join(code, name, quiet = false) {
  joining = true;
  joinError = '';
  if (!quiet) render();
  const playerId = saved && saved.code === code ? saved.playerId : null;
  socket.emit('player:join', { code, name, playerId, rejoin: quiet && Boolean(playerId) }, (res) => {
    joining = false;
    if (res?.error) {
      joined = false;
      ready = false;
      outbox.length = 0;
      view = null;
      if (quiet) {
        store.remove('og-player');
        saved = { name: saved?.name };
        joinError = 'That game has ended (or you were removed). Join again below.';
      } else {
        joinError = res.error;
      }
      return render();
    }
    joined = true;
    saved = { code: res.code, playerId: res.playerId, name: res.name };
    store.set('og-player', saved);
    if (urlCode) history.replaceState(null, '', location.pathname);
    keepAwake();
    ready = true;
    while (outbox.length) socket.emit(...outbox.shift());
    // Rebuild the screen from what the server has (drawings included),
    // keeping anything the player was in the middle of typing.
    const typing = app.querySelector('#lie, #laugh');
    const draft = typing ? { id: typing.id, value: typing.value } : null;
    ui.sentAnswer = null;
    paint.reset();
    render();
    const field = draft && app.querySelector(`#${draft.id}`);
    if (field && !field.value) field.value = draft.value;
  });
}

socket.on('connect', () => {
  $('#net').hidden = true;
  if (joined && saved) join(saved.code, saved.name, true);
});

socket.on('disconnect', () => {
  ready = false;
  if (joined) $('#net').hidden = false;
});

socket.on('kicked', () => {
  joined = false;
  ready = false;
  view = null;
  store.remove('og-player');
  saved = { name: saved?.name };
  joinError = 'You were removed from the room. You can join again below.';
  render();
});

socket.on('view', ({ v, now }) => {
  syncClock(now);
  const before = view;
  view = v;
  if (!joined) return;
  const s = v.screen;
  const seqKey = `${s.game}:${s.phase}:${s.seq}`;
  if (seqKey !== lastSeq) {
    lastSeq = seqKey;
    ui.sentAnswer = null;
    if (ANSWER_PHASES.has(s.phase) && before) buzz(40);
  }
  render();
});

// Rejoin automatically (once connected) if this phone was already in the room.
if (saved?.code && saved.playerId && (!urlCode || urlCode === saved.code)) {
  joined = true;
  joining = true;
}

function buzz(ms) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

// ---- actions -----------------------------------------------------------

const act = (action) => send('player:action', action);
const leaderControl = (action) => send('player:control', action);

app.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'join-form') {
    const code = form.code.value.toUpperCase().replace(/[^A-Z]/g, '');
    const name = form.name.value.trim();
    if (code.length !== 4) return showFormError('Room codes are 4 letters. Check the big screen.');
    if (!name) return showFormError('Type your name so everyone knows who you are.');
    return join(code, name);
  }
  if (form.id === 'lie-form' || form.id === 'laugh-form') {
    const text = form.text.value.trim();
    if (!text) return form.text.focus();
    form.querySelector('button').disabled = true;
    act({ type: form.id === 'lie-form' ? 'lie' : 'answer', text });
    form.text.blur();
  }
});

function showFormError(msg) {
  joinError = msg;
  const el = $('#join-error');
  if (el) {
    el.textContent = msg;
    el.hidden = false;
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const a = el.dataset.act;
  buzz(15);
  switch (a) {
    case 'answer':
    case 'guess': {
      const choice = Number(el.dataset.i);
      ui.sentAnswer = choice;
      act({ type: a, choice });
      markChosen(el);
      break;
    }
    case 'choose':
      ui.sentAnswer = el.dataset.id;
      act({ type: 'choose', option: el.dataset.id });
      markChosen(el);
      break;
    case 'vote':
      ui.sentAnswer = el.dataset.id;
      act({ type: 'vote', entry: el.dataset.id });
      markChosen(el);
      break;
    case 'tl-add':
      if (!ui.order.includes(el.dataset.id)) ui.order.push(el.dataset.id);
      timelineChanged();
      break;
    case 'tl-remove':
      ui.order = ui.order.filter((id) => id !== el.dataset.id);
      timelineChanged();
      break;
    case 'tl-reset':
      ui.order = [];
      timelineChanged();
      break;
    case 'tl-lock':
      act({ type: 'lock', order: ui.order });
      el.disabled = true;
      break;
    case 'color':
      if (ui.pad) ui.pad.color = Number(el.dataset.i);
      selectTool('.swatch', el);
      break;
    case 'width':
      if (ui.pad) ui.pad.width = Number(el.dataset.i);
      selectTool('.size', el);
      break;
    case 'undo':
      ui.pad?.undo();
      act({ type: 'undo' });
      break;
    case 'clear':
      if (ui.pad?.strokes.length && confirm('Erase your whole drawing?')) {
        ui.pad.clear();
        act({ type: 'clear' });
      }
      break;
    case 'draw-done':
      if (!ui.pad?.strokes.length) return alert('Draw something first!');
      act({ type: 'done' });
      el.disabled = true;
      break;
    case 'next':
      leaderControl({ type: 'continue', seq: view?.screen?.seq });
      el.disabled = true;
      setTimeout(() => (el.disabled = false), 1200);
      break;
    case 'pick-game':
      ui.confirm = el.dataset.game;
      render();
      break;
    case 'confirm-start':
      leaderControl({ type: 'start', game: ui.confirm });
      ui.confirm = null;
      break;
    case 'cancel':
      ui.confirm = null;
      ui.picker = false;
      render();
      break;
    case 'length':
      leaderControl({ type: 'settings', length: el.dataset.value });
      break;
    case 'relaxed':
      leaderControl({ type: 'settings', relaxed: el.dataset.value === 'on' });
      break;
    case 'picker':
      ui.picker = true;
      render();
      break;
    case 'avatar':
      send('player:avatar', el.dataset.avatar);
      ui.picker = false;
      render();
      break;
    case 'leave':
      if (confirm('Leave this room?')) {
        socket.emit('player:leave');
        joined = false;
        view = null;
        store.remove('og-player');
        saved = { name: saved?.name };
        render();
      }
      break;
  }
});

function markChosen(el) {
  const group = el.closest('[data-group]');
  if (!group) return;
  group.classList.add('locked');
  for (const b of group.querySelectorAll('button')) b.disabled = true;
  el.classList.add('chosen');
}

function selectTool(selector, el) {
  for (const b of app.querySelectorAll(selector)) b.classList.toggle('on', b === el);
}

function timelineChanged() {
  act({ type: 'draft', order: ui.order });
  const s = view.screen;
  app.querySelector('.tl-builder').outerHTML = timelineBuilder(s);
}

// ---- rendering ---------------------------------------------------------

function render() {
  const bar = $('#bar');
  if (!joined || !view || view.role !== 'player') {
    bar.hidden = true;
    $('#tbar').hidden = true;
    $('#paused').hidden = true;
    $('#footer').innerHTML = '';
    document.body.dataset.theme = 'lobby';
    if (joined && joining) return paint('joining', `<div class="center"><div class="spinner"></div><p>Joining…</p></div>`);
    return paint(`join:${joinError}`, joinForm(), (root) => {
      const field = root.querySelector(urlCode || saved?.code ? 'input[name=name]' : 'input[name=code]');
      if (field && !matchMedia('(pointer: coarse)').matches) field.focus();
    });
  }
  const s = view.screen;
  document.body.dataset.theme = s.game || 'lobby';
  bar.hidden = false;
  bar.innerHTML = `${avatar(view.me, 'sm')}<span class="bar-name">${view.me.leader ? '👑 ' : ''}${esc(view.me.name)}</span><span class="bar-code">${esc(view.code)}</span>`;

  const [key, html, mount] = screen(s);
  paint(key, html, mount);
  $('#paused').hidden = !view.paused;
  renderFooter(s);
}

function renderFooter(s) {
  const foot = $('#footer');
  const L = view.leader;
  if (L?.inGame && L.canContinue) {
    const label = L.final ? 'Back to the games' : s.phase === 'intro' ? 'Skip intro ▶' : 'Next ▶';
    const html = `<div class="leader-bar"><span>👑 You’re the leader</span><button class="btn primary" data-act="next">${label}</button></div>`;
    if (foot.dataset.k !== `${s.phase}:${s.seq}`) {
      foot.dataset.k = `${s.phase}:${s.seq}`;
      foot.innerHTML = html;
    }
  } else {
    foot.dataset.k = '';
    foot.innerHTML = '';
  }
}

function joinForm() {
  const code = urlCode || saved?.code || '';
  return `<div class="join">
    <div class="logo"><span>OG</span></div>
    <h1>${esc(packName)}</h1>
    <p class="sub">Bible games with your small group</p>
    <form id="join-form" class="card join-card" autocomplete="off">
      <label>Room code
        <input name="code" value="${esc(code)}" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" inputmode="text" placeholder="ABCD" class="code-input" required />
      </label>
      <label>Your name
        <input name="name" value="${esc(saved?.name || '')}" maxlength="14" autocomplete="nickname" placeholder="First name" required />
      </label>
      <p id="join-error" class="error" ${joinError ? '' : 'hidden'}>${esc(joinError)}</p>
      <button class="btn primary big" ${joining ? 'disabled' : ''}>${joining ? 'Joining…' : 'Join game'}</button>
    </form>
    <p class="fine">The room code is on the big screen.</p>
  </div>`;
}

function screen(s) {
  if (!s.game) return lobby(s);
  if (s.phase === 'intro') return intro(s);
  if (s.phase === 'scores') return standing(s, false);
  if (s.phase === 'final') return standing(s, true);
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
  }
  return ['empty', watch('Look at the big screen!')];
}

const watch = (msg, emoji = '👀') =>
  `<div class="center watch"><div class="big-emoji pop">${emoji}</div><p>${esc(msg)}</p></div>`;

const sent = (title, detail = '', emoji = '✅') =>
  `<div class="center sent"><div class="big-emoji pop">${emoji}</div><h2>${esc(title)}</h2>${detail ? `<p>${detail}</p>` : ''}<p class="muted">Waiting for everyone else…</p></div>`;

// ---- lobby -------------------------------------------------------------

function lobby(s) {
  const me = view.me;
  if (ui.picker) {
    const taken = new Set(s.taken);
    return [
      'picker',
      `<div class="picker">
        <h2>Pick your look</h2>
        <div class="avatar-grid" data-live="avatars">${s.avatars
          .map((a) => `<button data-act="avatar" data-avatar="${esc(a)}" class="${a === me.avatar ? 'mine' : ''}" ${taken.has(a) ? 'disabled' : ''}><span class="avatar" style="--c:${esc(me.color)}">${esc(a)}</span></button>`)
          .join('')}</div>
        <button class="btn" data-act="cancel">Done</button>
      </div>`,
    ];
  }
  const L = view.leader;
  let leaderPanel = '';
  if (L && !L.inGame) {
    if (ui.confirm) {
      const g = L.menu.find((x) => x.id === ui.confirm);
      leaderPanel = `<div class="confirm card pop" data-theme="${esc(g.id)}">
        <div class="big-emoji">${esc(g.emoji)}</div>
        <h2>${esc(g.name)}</h2>
        <p>${esc(g.tagline)}</p>
        <button class="btn primary big" data-act="confirm-start">Start it! ▶</button>
        <button class="btn" data-act="cancel">Pick something else</button>
      </div>`;
    } else {
      leaderPanel = `<section class="leader card">
        <h3>👑 You’re the leader</h3>
        <p>Pick a game when everyone’s in:</p>
        <div class="menu-list">${L.menu
          .map((g) => `<button class="menu-item" data-theme="${esc(g.id)}" data-act="pick-game" data-game="${esc(g.id)}"><span>${esc(g.emoji)}</span><b>${esc(g.name)}</b></button>`)
          .join('')}</div>
        <div class="seg-row" data-live="settings">
          <div class="seg">${['short', 'standard', 'long']
            .map((l) => `<button class="${L.settings.length === l ? 'on' : ''}" data-act="length" data-value="${l}">${l[0].toUpperCase() + l.slice(1)}</button>`)
            .join('')}</div>
          <div class="seg"><button class="${L.settings.relaxed ? '' : 'on'}" data-act="relaxed" data-value="off">Normal timers</button><button class="${L.settings.relaxed ? 'on' : ''}" data-act="relaxed" data-value="on">Relaxed</button></div>
        </div>
      </section>`;
    }
  }
  const last = s.last
    ? `<p class="last">Last game: ${esc(s.last.emoji)} ${esc(s.last.game)}${s.last.winners.length ? ` · won by <b>${esc(s.last.winners.join(' & '))}</b>` : ''}</p>`
    : '';
  return [
    `lobby:${Boolean(L)}:${ui.confirm}`,
    `<div class="p-lobby">
      <button class="me" data-act="picker" aria-label="Change your avatar">
        ${avatar(me, 'xl')}
        <span class="change">Change</span>
      </button>
      <h1>You’re in, ${esc(me.name)}!</h1>
      <p class="sub" data-live="count">${s.players} player${s.players === 1 ? '' : 's'} here · watch the big screen</p>
      <div data-live="last">${last}</div>
      ${leaderPanel || (L ? '' : '<p class="muted">The leader 👑 picks the games.</p>')}
      ${me.total ? `<p class="total" data-live="total">Tonight’s total: <b>${fmt(me.total)}</b></p>` : ''}
      <button class="link" data-act="leave">Leave room</button>
    </div>`,
  ];
}

function intro(s) {
  return [
    `intro:${s.seq}`,
    `<div class="center intro">
      <div class="big-emoji pop">${esc(s.emoji)}</div>
      <h1>${esc(s.name)}</h1>
      <p class="tagline">${esc(s.tagline)}</p>
      <p class="muted">The rules are on the big screen. Get ready!</p>
    </div>`,
  ];
}

function standing(s, final) {
  const medal = s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : final ? '🎉' : '📊';
  const lead = final ? (s.rank === 1 ? 'You won!' : `You finished ${ordinal(s.rank)}`) : `You’re in ${ordinal(s.rank)} place`;
  return [
    `standing:${s.seq}`,
    `<div class="center standing ${final ? 'final' : ''}">
      <div class="big-emoji pop">${medal}</div>
      <h1>${lead}</h1>
      <p class="score-big">${fmt(s.score)} <span>points</span></p>
      ${!final && s.gain ? `<p class="gain-chip pop">+${fmt(s.gain)} this round</p>` : ''}
      <p class="muted">${s.of} player${s.of === 1 ? '' : 's'} · ${final ? 'Great game!' : 'Next one coming up…'}</p>
    </div>`,
  ];
}

// ---- trivia ------------------------------------------------------------

function trivia(s) {
  if (s.phase === 'question') {
    const picked = s.picked ?? ui.sentAnswer;
    const isRon = s.game === 'realornot';
    if (picked != null) {
      const label = isRon ? (picked === 0 ? 'REAL' : 'NOT in the Bible') : s.choices[picked];
      return [`q:${s.seq}:locked`, sent('Locked in!', `You picked <b>${esc(label)}</b>`)];
    }
    const quote = isRon ? esc(s.prompt) : `“${esc(s.prompt.replace(/[.,;:]$/, ''))}”`;
    const ask = { realornot: 'Is this in the Bible?', whosaid: 'Who said it?', whichbook: 'Which book?' }[s.game];
    return [
      `q:${s.seq}`,
      `<div class="question">
        ${s.double ? '<span class="double-badge">Double points!</span>' : ''}
        <p class="mini-prompt">${quote}</p>
        <h2 class="ask">${ask}</h2>
        <div class="answers ${isRon ? 'ron' : 'mc'}" data-group>
          ${s.choices
            .map((c, i) =>
              isRon
                ? `<button class="ans ${i === 0 ? 'real' : 'not'}" data-act="answer" data-i="${i}">${i === 0 ? '✅<b>REAL</b>' : '❌<b>NOT</b><small>in the Bible</small>'}</button>`
                : `<button class="ans c${i}" data-act="answer" data-i="${i}"><span class="letter">${LETTERS[i]}</span><span>${esc(c)}</span></button>`,
            )
            .join('')}
        </div>
      </div>`,
    ];
  }
  if (s.phase === 'reveal') {
    if (!s.answered) return [`r:${s.seq}`, result('⏰', 'Time’s up!', `The answer was <b>${esc(s.correctText)}</b>`, s.ref)];
    if (s.right) return [`r:${s.seq}`, result('🎉', 'Correct!', `<span class="gain-chip">+${fmt(s.points)}</span>`, s.ref, 'good')];
    return [`r:${s.seq}`, result('😬', 'Not quite!', `The answer was <b>${esc(s.correctText)}</b>`, s.ref, 'bad')];
  }
  return ['t-wait', watch('Look at the big screen!')];
}

function result(emoji, title, detail, ref, tone = '') {
  return `<div class="center result ${tone}">
    <div class="big-emoji pop">${emoji}</div>
    <h1>${title}</h1>
    <p>${detail}</p>
    ${ref ? `<p class="ref">📖 ${esc(ref)}</p>` : ''}
  </div>`;
}

// ---- Bluff the Verse ---------------------------------------------------

function verse(s) {
  const sep = /^[A-Za-z]/.test(s.after) ? ' ' : '';
  return `<div class="mini-verse card"><p>${esc(s.before)} <span class="blank">_____</span>${sep}${esc(s.after)}</p><span class="ref">${esc(s.ref)}</span></div>`;
}

function bluff(s) {
  if (s.phase === 'write') {
    if (s.submitted) return [`bw:${s.seq}:done`, sent('Sneaky!', `Your fake: <b>“${esc(s.lie)}”</b>`, '🎭')];
    return [
      `bw:${s.seq}:${s.errorN}`,
      `<div class="write">
        ${s.double ? '<span class="double-badge">Double points!</span>' : ''}
        ${verse(s)}
        <form id="lie-form" class="entry" autocomplete="off">
          <label for="lie">Write a <b>fake</b> word for the blank</label>
          <input id="lie" name="text" maxlength="${s.maxLength}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Something believable…" enterkeyhint="send" required />
          ${s.error ? `<p class="error pop">${esc(s.error)}</p>` : ''}
          <button class="btn primary big">Submit my fake</button>
        </form>
      </div>`,
      (root) => root.querySelector('#lie')?.focus(),
    ];
  }
  if (s.phase === 'choose') {
    const picked = s.picked ?? ui.sentAnswer;
    if (picked != null) {
      const o = s.options.find((x) => x.id === picked);
      return [`bc:${s.seq}:done`, sent('Locked in!', o ? `You picked <b>“${esc(o.text)}”</b>` : '')];
    }
    return [
      `bc:${s.seq}`,
      `<div class="choose">
        ${verse(s)}
        <h2 class="ask">Which is the <u>real</u> word?</h2>
        <div class="options" data-group>${s.options.map((o) => `<button class="opt" data-act="choose" data-id="${esc(o.id)}">${esc(o.text)}</button>`).join('')}</div>
      </div>`,
    ];
  }
  if (s.phase === 'reveal') {
    if (!s.truthShown) return [`br:${s.seq}`, watch('Watch the big screen to see who got fooled…', '🕵️')];
    const lines = [];
    if (s.foundTruth) lines.push('You found the real word! 🎯');
    else if (s.pickedText) lines.push(`You picked “${esc(s.pickedText)}”. Fooled!`);
    if (s.lie) lines.push(s.fooled ? `Your fake fooled <b>${s.fooled}</b> ${s.fooled === 1 ? 'person' : 'people'}! 😈` : 'Your fake didn’t fool anyone this time.');
    return [
      `br:${s.seq}`,
      `<div class="center result ${s.points ? 'good' : ''}">
        <div class="big-emoji pop">${s.points ? '🎉' : '😅'}</div>
        <h1>${s.points ? `+${fmt(s.points)}` : 'No points this time'}</h1>
        ${lines.map((l) => `<p>${l}</p>`).join('')}
        <p class="muted">The real word was <b>${esc(s.answer)}</b></p>
      </div>`,
    ];
  }
  return ['b-wait', watch('Look at the big screen!')];
}

// ---- Timeline ----------------------------------------------------------

function timeline(s) {
  if (s.phase === 'order') {
    if (s.locked) return [`to:${s.seq}:locked`, sent('Timeline locked in!', '', '🔒')];
    const key = `to:${s.seq}`;
    if (ui.orderKey !== key) {
      ui.orderKey = key;
      ui.order = (s.draft || []).filter((id) => s.events.some((e) => e.id === id));
    }
    return [
      key,
      `<div class="tl">
        ${s.double ? '<span class="double-badge">Double points!</span>' : ''}
        <h2 class="tl-head">${esc(s.title)}</h2>
        <p class="sub">Tap the events in order, <b>earliest first</b>.</p>
        ${timelineBuilder(s)}
      </div>`,
    ];
  }
  if (s.phase === 'reveal') {
    if (!s.played) return [`tr:${s.seq}`, result('⏰', 'Time’s up!', 'Check the big screen for the right order.', '')];
    return [
      `tr:${s.seq}`,
      `<div class="tl-result">
        <div class="center">
          <div class="big-emoji pop">${s.perfect ? '🌟' : s.right >= 3 ? '👏' : '📜'}</div>
          <h1>${s.perfect ? 'Perfect timeline!' : `${s.right} of ${s.yours.length} right`}</h1>
          ${s.points ? `<p class="gain-chip">+${fmt(s.points)}</p>` : ''}
        </div>
        <ol class="tl-check">${s.yours.map((y, i) => `<li class="${y.ok ? 'ok' : 'no'}"><span>${y.ok ? '✓' : '✗'}</span>${esc(y.text)}${y.ok ? '' : `<em>Should be: ${esc(s.correct[i])}</em>`}</li>`).join('')}</ol>
      </div>`,
    ];
  }
  return ['tl-wait', watch('Look at the big screen!')];
}

function timelineBuilder(s) {
  const placed = ui.order.map((id) => s.events.find((e) => e.id === id)).filter(Boolean);
  const left = s.events.filter((e) => !ui.order.includes(e.id));
  const slots = s.events
    .map((_, i) => {
      const e = placed[i];
      return e
        ? `<li><button class="slot filled" data-act="tl-remove" data-id="${esc(e.id)}"><span class="n">${i + 1}</span><span>${esc(e.text)}</span><span class="x">✕</span></button></li>`
        : `<li><div class="slot empty"><span class="n">${i + 1}</span><span>${i === 0 ? 'Earliest' : i === s.events.length - 1 ? 'Latest' : ''}</span></div></li>`;
    })
    .join('');
  const complete = placed.length === s.events.length;
  return `<div class="tl-builder">
    <ol class="slots">${slots}</ol>
    ${
      left.length
        ? `<div class="pool"><p class="pool-label">Tap the ${placed.length ? 'next' : 'earliest'} event:</p>${left.map((e) => `<button class="pool-item" data-act="tl-add" data-id="${esc(e.id)}">${esc(e.text)}</button>`).join('')}</div>`
        : ''
    }
    <div class="tl-actions">
      <button class="btn" data-act="tl-reset" ${placed.length ? '' : 'disabled'}>Start over</button>
      <button class="btn primary" data-act="tl-lock" ${complete ? '' : 'disabled'}>Lock it in 🔒</button>
    </div>
  </div>`;
}

// ---- Draw the Word -----------------------------------------------------

function draw(s) {
  if (s.phase === 'draw') {
    if (s.waiting) return ['dw-wait', watch('You joined mid-round. You’ll draw next time!', '🎨')];
    if (s.done) return [`dd:${s.seq}:done`, sent('Masterpiece submitted!', 'Now wait for the other artists.', '🖼️')];
    return [
      `dd:${s.seq}`,
      `<div class="drawpad">
        <p class="draw-prompt">Draw: <b>${esc(s.prompt)}</b></p>
        <div class="canvas-wrap"><canvas id="pad"></canvas></div>
        <div class="tools">
          <div class="swatches">${PALETTE.map((c, i) => `<button class="swatch ${i === 0 ? 'on' : ''}" data-act="color" data-i="${i}" style="--sw:${c}" aria-label="Color ${i + 1}"></button>`).join('')}</div>
          <div class="tool-row">
            ${WIDTHS.map((w, i) => `<button class="size ${i === 1 ? 'on' : ''}" data-act="width" data-i="${i}" aria-label="Brush size ${i + 1}"><i style="--d:${[6, 12, 22][i]}px"></i></button>`).join('')}
            <button class="tool" data-act="undo">↶ Undo</button>
            <button class="tool" data-act="clear">🗑️</button>
          </div>
        </div>
        <button class="btn primary big" data-act="draw-done">I’m done ✓</button>
        <p class="fine">No letters or words. Draw it so people can guess!</p>
      </div>`,
      mountPad,
    ];
  }
  if (s.phase === 'guess') {
    if (s.isArtist) return [`dg:${s.seq}:artist`, watch('That’s YOUR drawing up there! Sit back and watch them guess.', '🎨')];
    const picked = s.picked ?? ui.sentAnswer;
    if (picked != null) return [`dg:${s.seq}:done`, sent('Guess locked in!', `You said <b>${esc(s.choices[picked])}</b>`)];
    return [
      `dg:${s.seq}`,
      `<div class="choose">
        <h2 class="ask">What’s being drawn?</h2>
        <div class="options" data-group>${s.choices.map((c, i) => `<button class="opt lettered" data-act="guess" data-i="${i}"><span class="letter">${LETTERS[i]}</span>${esc(c)}</button>`).join('')}</div>
      </div>`,
    ];
  }
  if (s.phase === 'reveal') {
    if (s.isArtist) {
      return [
        `dr:${s.seq}`,
        result(s.rightGuesses ? '🎨' : '🙈', s.rightGuesses ? `${s.rightGuesses} got it!` : 'Nobody got it!', s.points ? `<span class="gain-chip">+${fmt(s.points)}</span>` : 'Abstract art is hard to read.', '', s.points ? 'good' : ''),
      ];
    }
    if (!s.guessed) return [`dr:${s.seq}`, result('⏰', 'Too slow!', `It was <b>${esc(s.answer)}</b>`, '')];
    if (s.right) return [`dr:${s.seq}`, result('🎉', 'You got it!', `<span class="gain-chip">+${fmt(s.points)}</span>`, '', 'good')];
    return [`dr:${s.seq}`, result('😅', 'Nope!', `It was <b>${esc(s.answer)}</b>`, '', 'bad')];
  }
  if (s.phase === 'gallery') return ['gallery', watch('Check out the gallery on the big screen!', '🖼️')];
  return ['d-wait', watch('Look at the big screen!')];
}

function mountPad(root) {
  ui.pad?.destroy();
  const canvas = root.querySelector('#pad');
  socket.emit('drawing:mine', (strokes) => {
    if (!canvas.isConnected) return;
    ui.pad = new DrawingPad(canvas, {
      initial: Array.isArray(strokes) ? strokes : [],
      onStroke: (stroke) => act({ type: 'stroke', stroke }),
      onFull: () => alert('Your canvas is full! Undo a little, or press “I’m done”.'),
    });
  });
}

// ---- Loaves & Laughs ---------------------------------------------------

function laughs(s) {
  if (s.phase === 'write') {
    if (s.submitted) return [`lw:${s.seq}:done`, sent('Answer sent!', `<b>“${esc(s.answer)}”</b>`, '😂')];
    return [
      `lw:${s.seq}`,
      `<div class="write">
        ${s.double ? '<span class="double-badge">Double points!</span>' : ''}
        <div class="mini-verse card prompt"><p>${esc(s.prompt)}</p></div>
        <form id="laugh-form" class="entry" autocomplete="off">
          <label for="laugh">Your funniest answer</label>
          <textarea id="laugh" name="text" maxlength="${s.maxLength}" rows="3" placeholder="Make the room laugh…" enterkeyhint="send" required></textarea>
          <p class="counter"><span id="left">${s.maxLength}</span> letters left</p>
          <button class="btn primary big">Send it</button>
        </form>
      </div>`,
      (root) => {
        const ta = root.querySelector('#laugh');
        const left = root.querySelector('#left');
        ta.addEventListener('input', () => (left.textContent = String(s.maxLength - ta.value.length)));
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            ta.form.requestSubmit();
          }
        });
        ta.focus();
      },
    ];
  }
  if (s.phase === 'vote') {
    if (!s.entries.length) return [`lv:${s.seq}:none`, watch('Only your answer came in. Watch the big screen!', '🍞')];
    const picked = s.picked ?? ui.sentAnswer;
    if (picked != null) {
      const e = s.entries.find((x) => x.id === picked);
      return [`lv:${s.seq}:done`, sent('Vote cast!', e ? `<b>“${esc(e.text)}”</b>` : '', '🗳️')];
    }
    return [
      `lv:${s.seq}`,
      `<div class="choose">
        <p class="mini-prompt">${esc(s.prompt)}</p>
        <h2 class="ask">Vote for your favorite</h2>
        <div class="options laughs-opts" data-group>${s.entries.map((e) => `<button class="opt" data-act="vote" data-id="${esc(e.id)}">${esc(e.text)}</button>`).join('')}</div>
      </div>`,
    ];
  }
  if (s.phase === 'results') {
    if (!s.answered) return [`lr:${s.seq}`, watch('See who won on the big screen!', '🏆')];
    return [
      `lr:${s.seq}`,
      result(s.winner ? '👑' : s.votes ? '😄' : '🦗', s.winner ? 'Crowd favorite!' : `${s.votes} vote${s.votes === 1 ? '' : 's'}`, s.points ? `<span class="gain-chip">+${fmt(s.points)}</span>` : 'Tough crowd tonight.', '', s.points ? 'good' : ''),
    ];
  }
  return ['l-wait', watch('Look at the big screen!')];
}

// ---- countdown bar -----------------------------------------------------

function timerLoop() {
  const tbar = $('#tbar');
  const t = view?.timer;
  const s = view?.screen;
  const show = Boolean(joined && t && s?.game && ANSWER_PHASES.has(s.phase));
  tbar.hidden = !show;
  if (show) {
    const frac = msLeft(t) / t.total;
    tbar.firstElementChild.style.transform = `scaleX(${frac})`;
    tbar.classList.toggle('urgent', msLeft(t) < 5000);
  }
  requestAnimationFrame(timerLoop);
}
requestAnimationFrame(timerLoop);

render();
