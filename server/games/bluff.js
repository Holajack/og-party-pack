// Bluff the Verse: everyone writes a fake word for the blank, then tries to
// pick the real one out of all the fakes.
//
// Scoring: 1000 for finding the truth, 500 for every player your fake fools.
// The last verse counts double.

import { BaseGame } from './base.js';
import { cleanText, levenshtein, looseKey, normalize, randomId, sample, shuffle } from '../util.js';

const MAX_LIE = 40;

export class BluffGame extends BaseGame {
  static meta = {
    id: 'bluff',
    name: 'Bluff the Verse',
    tagline: 'Fake a word. Find the real one.',
    emoji: '🎭',
    minutes: '12–15',
    rules: [
      'A King James verse appears with one word missing.',
      'Type a fake word that sounds real enough to fool everybody.',
      'Then find the real word. Score for finding the truth AND for every friend you fool!',
    ],
  };

  begin() {
    this.items = this.room.pickFresh('bluff', this.content.bluff, this.byLength({ short: 4, standard: 6, long: 8 }));
    this.index = -1;
    this.nextVerse();
  }

  get item() {
    return this.items[this.index];
  }

  get isLast() {
    return this.index === this.items.length - 1;
  }

  nextVerse() {
    this.index += 1;
    if (this.index >= this.items.length) return this.finish();
    const item = this.item;
    this.truthKeys = [item.answer, ...item.alts].map(looseKey);
    this.lies = new Map();
    this.errors = new Map();
    this.choices = new Map();
    this.options = [];
    this.points = new Map();
    this.setPhase('write', this.answerTime(50), () => this.startChoosing());
  }

  // True when a fake is the real answer, a synonym of it, a near-miss
  // spelling of it, or contains it as a word.
  tooClose(text) {
    const key = looseKey(text);
    const words = normalize(text).split(' ');
    return this.truthKeys.some((truth) => {
      if (key === truth) return true;
      if (truth.length >= 5 && levenshtein(key, truth) <= 1) return true;
      return !truth.includes(' ') && words.some((w) => looseKey(w) === truth);
    });
  }

  onAction(pid, action) {
    if (this.phase === 'write' && action.type === 'lie') return this.submitLie(pid, action.text);
    if (this.phase === 'choose' && action.type === 'choose') return this.choose(pid, action.option);
  }

  submitLie(pid, raw) {
    if (this.lies.has(pid)) return;
    const text = cleanText(raw, MAX_LIE);
    const prev = this.errors.get(pid)?.n || 0;
    if (!normalize(text)) {
      this.errors.set(pid, { n: prev + 1, message: 'Use regular letters or numbers for your fake word.' });
    } else if (this.tooClose(text)) {
      this.errors.set(pid, {
        n: prev + 1,
        message: 'Whoa, that’s the real answer (or way too close)! Try a sneakier fake.',
      });
    } else {
      this.lies.set(pid, { text, key: looseKey(text) });
    }
    this.room.broadcast();
    this.endWhenAllDone(this.lies);
  }

  startChoosing() {
    // Ids are random so nothing in the data gives away which one is true.
    const groups = new Map();
    for (const [pid, lie] of this.lies) {
      if (!groups.has(lie.key)) groups.set(lie.key, { id: randomId(4), text: lie.text.toLowerCase(), authors: [] });
      groups.get(lie.key).authors.push(pid);
    }
    const options = [...groups.values()];
    // Top up with house lies (this verse's, then other verses') so there are
    // always at least four choices.
    const others = sample(this.content.bluff.filter((v) => v.id !== this.item.id).flatMap((v) => v.decoys), 6);
    for (const decoy of [...this.item.decoys, ...others]) {
      if (options.length >= 3) break;
      const key = looseKey(decoy);
      if (groups.has(key) || this.tooClose(decoy)) continue;
      groups.set(key, null);
      options.push({ id: randomId(4), text: decoy.toLowerCase(), authors: [], house: true });
    }
    options.push({ id: randomId(4), text: this.item.answer.toLowerCase(), authors: [], truth: true });
    this.options = shuffle(options);
    this.setPhase('choose', this.answerTime(25), () => this.reveal());
  }

  optionsFor(pid) {
    return this.options.filter((o) => !o.authors.includes(pid)).map(({ id, text }) => ({ id, text }));
  }

  choose(pid, optionId) {
    if (this.choices.has(pid)) return;
    if (!this.optionsFor(pid).some((o) => o.id === optionId)) return;
    this.choices.set(pid, optionId);
    this.room.broadcast();
    this.endWhenAllDone(this.choices);
  }

  checkAllDone() {
    if (this.phase === 'write') this.endWhenAllDone(this.lies);
    else if (this.phase === 'choose') this.endWhenAllDone(this.choices);
  }

  reveal() {
    const multiplier = this.isLast ? 2 : 1;
    const give = (pid, pts) => {
      this.points.set(pid, (this.points.get(pid) || 0) + pts);
      this.addPoints(pid, pts);
    };
    for (const option of this.options) option.pickers = [];
    for (const [pid, optionId] of this.choices) this.options.find((o) => o.id === optionId)?.pickers.push(pid);
    for (const option of this.options) {
      for (const picker of option.pickers) {
        if (option.truth) give(picker, 1000 * multiplier);
        else for (const author of option.authors) give(author, 500 * multiplier);
      }
    }
    // Reveal the fakes that fooled somebody (least popular first), then the truth.
    const truth = this.options.find((o) => o.truth);
    this.steps = [
      ...this.options.filter((o) => !o.truth && o.pickers.length).sort((a, b) => a.pickers.length - b.pickers.length),
      truth,
    ];
    this.step = 0;
    this.revealStep();
  }

  revealStep() {
    const current = this.steps[this.step];
    this.setPhase('reveal', current.truth ? 9000 : 5000, () => {
      this.step += 1;
      if (this.step < this.steps.length) this.revealStep();
      else if (this.isLast) this.finish();
      else this.showScores(() => this.nextVerse());
    });
  }

  verseView() {
    const { before, after, ref } = this.item;
    return { before, after, ref, n: this.index + 1, total: this.items.length, double: this.isLast };
  }

  hostPhaseView() {
    if (this.phase === 'write') return { ...this.verseView(), submitted: [...this.lies.keys()] };
    if (this.phase === 'choose') {
      return {
        ...this.verseView(),
        options: this.options.map(({ id, text }) => ({ id, text })),
        chosen: [...this.choices.keys()],
      };
    }
    if (this.phase === 'reveal') {
      const people = (ids) => ids.map((id) => this.room.publicPlayer(id));
      return {
        ...this.verseView(),
        answer: this.item.answer,
        step: this.step,
        steps: this.steps.slice(0, this.step + 1).map((o) => ({
          text: o.text,
          truth: Boolean(o.truth),
          house: Boolean(o.house),
          authors: people(o.authors),
          pickers: people(o.pickers),
        })),
        options: this.options.map(({ id, text }) => ({ id, text })),
      };
    }
    return {};
  }

  playerPhaseView(pid) {
    if (this.phase === 'write') {
      const error = this.errors.get(pid);
      return {
        ...this.verseView(),
        submitted: this.lies.has(pid),
        lie: this.lies.get(pid)?.text ?? null,
        error: error?.message ?? null,
        errorN: error?.n ?? 0,
        maxLength: MAX_LIE,
      };
    }
    if (this.phase === 'choose') {
      return { ...this.verseView(), options: this.optionsFor(pid), picked: this.choices.get(pid) ?? null };
    }
    if (this.phase === 'reveal') {
      const picked = this.options.find((o) => o.id === this.choices.get(pid));
      const mine = this.options.find((o) => o.authors.includes(pid));
      return {
        foundTruth: Boolean(picked?.truth),
        pickedText: picked?.text ?? null,
        fooled: mine ? mine.pickers.length : 0,
        lie: mine?.text ?? null,
        points: this.points.get(pid) || 0,
        truthShown: this.steps[this.step]?.truth ?? false,
        answer: this.steps[this.step]?.truth ? this.item.answer : null,
      };
    }
    return {};
  }
}
