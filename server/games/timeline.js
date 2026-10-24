// Timeline: put a handful of Bible events in order, earliest first.
// 200 points per event in the right spot, +400 for a perfect timeline.
// The last round counts double.

import { BaseGame } from './base.js';
import { randomId, sample, shuffle } from '../util.js';
import decks from '../../content/timeline.js';

const EVENTS_PER_ROUND = 5;

export class TimelineGame extends BaseGame {
  static meta = {
    id: 'timeline',
    name: 'Timeline',
    tagline: 'Put Bible history in order.',
    emoji: '⏳',
    minutes: '8–12',
    rules: [
      'You’ll get a handful of Bible events on your phone.',
      'Tap them in order, earliest first, then lock it in.',
      'Points for every event in the right spot, plus a big bonus for a perfect timeline!',
    ],
  };

  begin() {
    const chosen = this.room.pickFresh('timeline', decks, this.byLength({ short: 3, standard: 5, long: 7 }));
    this.rounds = chosen.map((deck) => {
      const picks = sample(
        deck.events.map((_, i) => i),
        Math.min(EVENTS_PER_ROUND, deck.events.length),
      ).sort((a, b) => a - b);
      // Random ids, so their order doesn't hint at the answer.
      const events = picks.map((i) => ({ ...deck.events[i], id: randomId(4) }));
      return { title: deck.title, events, display: shuffle(events) };
    });
    this.index = -1;
    this.nextRound();
  }

  get round() {
    return this.rounds[this.index];
  }

  get isLast() {
    return this.index === this.rounds.length - 1;
  }

  nextRound() {
    this.index += 1;
    if (this.index >= this.rounds.length) return this.finish();
    this.drafts = new Map();
    this.locks = new Map();
    this.results = new Map();
    this.setPhase('order', this.answerTime(50), () => this.reveal());
  }

  // A valid order lists event ids from this round with no repeats.
  validOrder(order, complete) {
    if (!Array.isArray(order)) return false;
    const ids = new Set(this.round.events.map((e) => e.id));
    if (new Set(order).size !== order.length || !order.every((id) => ids.has(id))) return false;
    return !complete || order.length === ids.size;
  }

  onAction(pid, action) {
    if (this.phase !== 'order' || this.locks.has(pid)) return;
    if (action.type === 'draft' && this.validOrder(action.order, false)) {
      this.drafts.set(pid, action.order.slice());
    } else if (action.type === 'lock' && this.validOrder(action.order, true)) {
      this.locks.set(pid, action.order.slice());
      this.room.broadcast();
      this.endWhenAllDone(this.locks);
    }
  }

  checkAllDone() {
    if (this.phase === 'order') this.endWhenAllDone(this.locks);
  }

  reveal() {
    // Anyone who finished placing everything but didn't press lock still counts.
    for (const [pid, draft] of this.drafts) {
      if (!this.locks.has(pid) && this.validOrder(draft, true)) this.locks.set(pid, draft);
    }
    const multiplier = this.isLast ? 2 : 1;
    const answer = this.round.events.map((e) => e.id);
    for (const [pid, order] of this.locks) {
      const right = order.filter((id, i) => answer[i] === id).length;
      const perfect = right === answer.length;
      const points = (right * 200 + (perfect ? 400 : 0)) * multiplier;
      this.results.set(pid, { right, perfect, points, order });
      this.addPoints(pid, points);
    }
    this.setPhase('reveal', 14000, () => {
      if (this.isLast) this.finish();
      else this.showScores(() => this.nextRound());
    });
  }

  roundView() {
    return { title: this.round.title, n: this.index + 1, total: this.rounds.length, double: this.isLast };
  }

  hostPhaseView() {
    if (this.phase === 'order') {
      return {
        ...this.roundView(),
        events: this.round.display.map(({ id, text }) => ({ id, text })),
        locked: [...this.locks.keys()],
      };
    }
    if (this.phase === 'reveal') {
      const results = [...this.results].map(([pid, r]) => ({
        ...this.room.publicPlayer(pid),
        right: r.right,
        perfect: r.perfect,
        points: r.points,
      }));
      results.sort((a, b) => b.points - a.points);
      const answers = [...this.results.values()];
      return {
        ...this.roundView(),
        correct: this.round.events.map((e, i) => ({
          text: e.text,
          ref: e.ref,
          // how many players put this event in its spot
          hits: answers.filter((r) => r.order[i] === e.id).length,
        })),
        players: answers.length,
        results,
      };
    }
    return {};
  }

  playerPhaseView(pid) {
    if (this.phase === 'order') {
      return {
        ...this.roundView(),
        events: this.round.display.map(({ id, text }) => ({ id, text })),
        draft: this.drafts.get(pid) ?? [],
        locked: this.locks.has(pid),
      };
    }
    if (this.phase === 'reveal') {
      const result = this.results.get(pid);
      const byId = new Map(this.round.events.map((e) => [e.id, e.text]));
      return {
        ...this.roundView(),
        played: Boolean(result),
        right: result?.right ?? 0,
        perfect: result?.perfect ?? false,
        points: result?.points ?? 0,
        yours: result ? result.order.map((id, i) => ({ text: byId.get(id), ok: this.round.events[i].id === id })) : [],
        correct: this.round.events.map((e) => e.text),
      };
    }
    return {};
  }
}
