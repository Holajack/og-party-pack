// Loaves & Laughs: everyone answers the same funny prompt, then everyone
// votes for their favorite answer (not their own).
// 200 points per vote, +300 for the top answer. The last prompt counts double.

import { BaseGame } from './base.js';
import { cleanText, shuffle } from '../util.js';
import prompts from '../../content/laughs.js';

const MAX_ANSWER = 80;

export class LaughsGame extends BaseGame {
  static meta = {
    id: 'laughs',
    name: 'Loaves & Laughs',
    tagline: 'The funniest answer wins.',
    emoji: '🍞',
    minutes: '10–15',
    rules: [
      'Everyone answers the same funny prompt on their phone.',
      'All the answers go up on the big screen, with no names attached.',
      'Vote for your favorite. Every vote you get is worth points!',
    ],
  };

  begin() {
    this.prompts = this.room.pickFresh('laughs', prompts, this.byLength({ short: 2, standard: 3, long: 5 }));
    this.index = -1;
    this.nextPrompt();
  }

  get prompt() {
    return this.prompts[this.index];
  }

  get isLast() {
    return this.index === this.prompts.length - 1;
  }

  nextPrompt() {
    this.index += 1;
    if (this.index >= this.prompts.length) return this.finish();
    this.answers = new Map();
    this.votes = new Map();
    this.entries = [];
    this.points = new Map();
    this.setPhase('write', this.answerTime(60), () => this.startVoting());
  }

  onAction(pid, action) {
    if (this.phase === 'write' && action.type === 'answer') return this.answer(pid, action.text);
    if (this.phase === 'vote' && action.type === 'vote') return this.vote(pid, action.entry);
  }

  answer(pid, raw) {
    if (this.answers.has(pid)) return;
    const text = cleanText(raw, MAX_ANSWER);
    if (!text) return;
    this.answers.set(pid, text);
    this.room.broadcast();
    this.endWhenAllDone(this.answers);
  }

  startVoting() {
    this.entries = shuffle([...this.answers]).map(([pid, text], i) => ({ id: `a${i}`, pid, text, voters: [] }));
    if (this.entries.length < 2) return this.results();
    this.setPhase('vote', this.answerTime(35), () => this.results());
  }

  voters() {
    return this.activeIds().filter((id) => this.entries.some((e) => e.pid !== id));
  }

  vote(pid, entryId) {
    if (this.votes.has(pid)) return;
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry || entry.pid === pid) return;
    this.votes.set(pid, entryId);
    this.room.broadcast();
    this.endWhenAllDone(this.votes, this.voters());
  }

  checkAllDone() {
    if (this.phase === 'write') this.endWhenAllDone(this.answers);
    else if (this.phase === 'vote') this.endWhenAllDone(this.votes, this.voters());
  }

  results() {
    const multiplier = this.isLast ? 2 : 1;
    for (const [voter, entryId] of this.votes) this.entries.find((e) => e.id === entryId)?.voters.push(voter);
    const top = Math.max(0, ...this.entries.map((e) => e.voters.length));
    for (const entry of this.entries) {
      entry.winner = top > 0 && entry.voters.length === top;
      const pts = (entry.voters.length * 200 + (entry.winner ? 300 : 0)) * multiplier;
      this.points.set(entry.pid, pts);
      this.addPoints(entry.pid, pts);
    }
    this.entries.sort((a, b) => b.voters.length - a.voters.length);
    this.setPhase('results', 9000 + 700 * this.entries.length, () => {
      if (this.isLast) this.finish();
      else this.showScores(() => this.nextPrompt());
    });
  }

  promptView() {
    return { prompt: this.prompt, n: this.index + 1, total: this.prompts.length, double: this.isLast };
  }

  hostPhaseView() {
    if (this.phase === 'write') return { ...this.promptView(), submitted: [...this.answers.keys()] };
    if (this.phase === 'vote') {
      return {
        ...this.promptView(),
        entries: this.entries.map(({ id, text }) => ({ id, text })),
        voted: [...this.votes.keys()],
      };
    }
    if (this.phase === 'results') {
      return {
        ...this.promptView(),
        entries: this.entries.map((e) => ({
          text: e.text,
          author: this.room.publicPlayer(e.pid),
          voters: e.voters.map((id) => this.room.publicPlayer(id)),
          winner: e.winner,
          points: this.points.get(e.pid) || 0,
        })),
      };
    }
    return {};
  }

  playerPhaseView(pid) {
    if (this.phase === 'write') {
      return { ...this.promptView(), submitted: this.answers.has(pid), answer: this.answers.get(pid) ?? null, maxLength: MAX_ANSWER };
    }
    if (this.phase === 'vote') {
      return {
        ...this.promptView(),
        entries: this.entries.filter((e) => e.pid !== pid).map(({ id, text }) => ({ id, text })),
        mine: this.answers.get(pid) ?? null,
        picked: this.votes.get(pid) ?? null,
      };
    }
    if (this.phase === 'results') {
      const mine = this.entries.find((e) => e.pid === pid);
      return {
        ...this.promptView(),
        answered: Boolean(mine),
        answer: mine?.text ?? null,
        votes: mine?.voters.length ?? 0,
        winner: mine?.winner ?? false,
        points: this.points.get(pid) || 0,
      };
    }
    return {};
  }
}
