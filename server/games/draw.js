// Draw the Word: everyone draws a secret Bible story on their phone, then
// each drawing goes up on the big screen and everyone else guesses which
// story it is.
//
// Guessers: 400 + up to 200 speed bonus. Artist: 250 for every right guess.

import { BaseGame } from './base.js';
import { randomId, sample, shuffle } from '../util.js';
import prompts from '../../content/draw.js';

const COLORS = 10; // palette lives in public/js/draw-canvas.js
const WIDTHS = 3;
const MAX_POINTS = 12000; // per drawing, keeps messages small
const CHOICES = 6;

export class DrawGame extends BaseGame {
  static meta = {
    id: 'draw',
    name: 'Draw the Word',
    tagline: 'Sketch a story. Guess the rest.',
    emoji: '🎨',
    minutes: '10–15',
    rules: [
      'Everyone gets a secret Bible story to draw on their phone. No letters or words!',
      'Each drawing goes up on the big screen and everyone guesses what it is.',
      'Score for guessing right, and the artist scores for every right guess.',
    ],
  };

  begin() {
    this.gameTag = randomId(4); // keeps drawing ids unique from one game to the next
    this.totalRounds = this.byLength({ short: 1, standard: 1, long: 2 });
    this.round = 0;
    this.gallery = [];
    this.archive = new Map();
    this.startDrawing();
  }

  startDrawing() {
    this.round += 1;
    this.sketches = new Map();
    const ids = this.activeIds();
    const picks = this.room.pickFresh('draw', prompts, ids.length);
    ids.forEach((id, i) => this.giveSketch(id, picks[i]));
    const seconds = this.byLength({ short: 70, standard: 80, long: 80 });
    this.setPhase('draw', this.answerTime(seconds), () => this.startGuessing());
  }

  giveSketch(pid, prompt) {
    this.sketches.set(pid, { prompt, strokes: [], points: 0, done: false });
  }

  onPlayerJoined(pid) {
    if (this.phase !== 'draw' || this.sketches.has(pid)) return;
    const taken = new Set([...this.sketches.values()].map((s) => s.prompt));
    const [prompt] = this.room.pickFresh('draw', prompts.filter((p) => !taken.has(p)), 1);
    this.giveSketch(pid, prompt);
    this.room.broadcast();
  }

  onAction(pid, action) {
    if (this.phase === 'draw') return this.drawAction(pid, action);
    if (this.phase === 'guess' && action.type === 'guess') return this.guess(pid, action.choice);
  }

  drawAction(pid, action) {
    const sketch = this.sketches.get(pid);
    if (!sketch || sketch.done) return;
    if (action.type === 'stroke') {
      const stroke = validStroke(action.stroke);
      if (!stroke || sketch.points + stroke.p.length / 2 > MAX_POINTS) return;
      sketch.strokes.push(stroke);
      sketch.points += stroke.p.length / 2;
      if (sketch.strokes.length === 1) this.room.broadcast();
    } else if (action.type === 'undo') {
      const stroke = sketch.strokes.pop();
      if (stroke) sketch.points -= stroke.p.length / 2;
      if (!sketch.strokes.length) this.room.broadcast();
    } else if (action.type === 'clear') {
      sketch.strokes = [];
      sketch.points = 0;
      this.room.broadcast();
    } else if (action.type === 'done' && sketch.strokes.length) {
      sketch.done = true;
      this.room.broadcast();
      this.checkAllDone();
    }
  }

  checkAllDone() {
    if (this.phase === 'draw') {
      const done = new Set([...this.sketches].filter(([, s]) => s.done).map(([id]) => id));
      this.endWhenAllDone(done, this.activeIds().filter((id) => this.sketches.has(id)));
    } else if (this.phase === 'guess') {
      this.endWhenAllDone(this.guesses, this.guessers());
    }
  }

  // The strokes a player has drawn so far (to restore after a reconnect).
  strokesFor(pid) {
    return this.phase === 'draw' ? (this.sketches.get(pid)?.strokes ?? []) : [];
  }

  drawing(id) {
    return this.archive.get(id)?.strokes ?? null;
  }

  startGuessing() {
    const artists = [...this.sketches].filter(([, s]) => s.strokes.length).map(([id]) => id);
    const used = new Set([...this.sketches.values()].map((s) => s.prompt));
    this.queue = shuffle(artists).map((artist) => {
      const sketch = this.sketches.get(artist);
      const id = `${this.gameTag}-r${this.round}-${artist}`;
      this.archive.set(id, { strokes: sketch.strokes });
      this.gallery.push({ id, prompt: sketch.prompt, artist });
      const decoys = sample(prompts.filter((p) => !used.has(p)), CHOICES - 1);
      const choices = shuffle([sketch.prompt, ...decoys]);
      return { id, artist, prompt: sketch.prompt, choices, correct: choices.indexOf(sketch.prompt) };
    });
    this.index = -1;
    this.nextDrawing();
  }

  get current() {
    return this.queue[this.index];
  }

  nextDrawing() {
    this.index += 1;
    if (this.index >= this.queue.length) return this.endRound();
    this.guesses = new Map();
    this.points = new Map();
    this.setPhase('guess', this.answerTime(this.byLength({ short: 15, standard: 20, long: 20 })), () =>
      this.revealDrawing(),
    );
  }

  guessers() {
    return this.activeIds().filter((id) => id !== this.current.artist);
  }

  guess(pid, choice) {
    if (pid === this.current.artist || this.guesses.has(pid)) return;
    if (!Number.isInteger(choice) || choice < 0 || choice >= this.current.choices.length) return;
    this.guesses.set(pid, { choice, speed: this.speedFraction() });
    this.room.broadcast();
    this.endWhenAllDone(this.guesses, this.guessers());
  }

  revealDrawing() {
    const { artist, correct } = this.current;
    const give = (pid, pts) => {
      this.points.set(pid, (this.points.get(pid) || 0) + pts);
      this.addPoints(pid, pts);
    };
    for (const [pid, g] of this.guesses) {
      if (g.choice !== correct) continue;
      give(pid, Math.round((400 + 200 * g.speed) / 10) * 10);
      give(artist, 250);
    }
    this.setPhase('reveal', 8000, () => this.nextDrawing());
  }

  endRound() {
    if (this.round < this.totalRounds) return this.showScores(() => this.startDrawing());
    if (!this.gallery.length) return this.finish();
    this.setPhase('gallery', 6000 + 1500 * this.gallery.length, () => this.finish());
  }

  hostPhaseView() {
    const who = (id) => this.room.publicPlayer(id);
    if (this.phase === 'draw') {
      const ids = [...this.sketches.keys()];
      return {
        round: this.round,
        totalRounds: this.totalRounds,
        artists: ids.map(who),
        started: ids.filter((id) => this.sketches.get(id).strokes.length),
        done: ids.filter((id) => this.sketches.get(id).done),
      };
    }
    if (this.phase === 'guess' || this.phase === 'reveal') {
      const c = this.current;
      const view = {
        drawingId: c.id,
        n: this.index + 1,
        total: this.queue.length,
        choices: c.choices,
        guessed: [...this.guesses.keys()],
      };
      if (this.phase === 'reveal') {
        const pickers = c.choices.map(() => []);
        for (const [pid, g] of this.guesses) pickers[g.choice].push(who(pid));
        Object.assign(view, {
          artist: who(c.artist),
          correct: c.correct,
          pickers,
          points: Object.fromEntries(this.points),
        });
      }
      return view;
    }
    if (this.phase === 'gallery') {
      return { items: this.gallery.map((g) => ({ id: g.id, prompt: g.prompt, artist: who(g.artist) })) };
    }
    return {};
  }

  playerPhaseView(pid) {
    if (this.phase === 'draw') {
      const sketch = this.sketches.get(pid);
      if (!sketch) return { waiting: true };
      return { prompt: sketch.prompt, done: sketch.done, round: this.round, totalRounds: this.totalRounds };
    }
    if (this.phase === 'guess') {
      const c = this.current;
      if (pid === c.artist) return { isArtist: true, n: this.index + 1, total: this.queue.length };
      return { choices: c.choices, picked: this.guesses.get(pid)?.choice ?? null, n: this.index + 1, total: this.queue.length };
    }
    if (this.phase === 'reveal') {
      const c = this.current;
      const g = this.guesses.get(pid);
      return {
        isArtist: pid === c.artist,
        answer: c.prompt,
        guessed: Boolean(g),
        right: g ? g.choice === c.correct : false,
        points: this.points.get(pid) || 0,
        rightGuesses: [...this.guesses.values()].filter((x) => x.choice === c.correct).length,
      };
    }
    if (this.phase === 'gallery') return { gallery: true };
    return {};
  }
}

// Strokes arrive as { c: colorIndex, w: widthIndex, p: [x0, y0, x1, y1, ...] }
// with coordinates on a 0–1000 grid.
function validStroke(stroke) {
  if (!stroke || typeof stroke !== 'object') return null;
  const { c, w, p } = stroke;
  if (!Number.isInteger(c) || c < 0 || c >= COLORS) return null;
  if (!Number.isInteger(w) || w < 0 || w >= WIDTHS) return null;
  if (!Array.isArray(p) || p.length < 2 || p.length % 2 || p.length > 4000) return null;
  if (!p.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000)) return null;
  return { c, w, p: p.slice() };
}
