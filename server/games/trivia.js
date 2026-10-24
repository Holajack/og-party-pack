// Real or Not?, Who Said It? and Which Book? all play the same way: a
// question, a short answer window, a reveal. Faster right answers score more
// and the last question counts double.

import { BaseGame } from './base.js';
import { shuffle } from '../util.js';

class TriviaGame extends BaseGame {
  begin() {
    const items = this.room.pickFresh(this.meta.id, this.bank, this.byLength(this.counts));
    this.questions = items.map((item) => this.buildQuestion(item));
    this.index = -1;
    this.nextQuestion();
  }

  get question() {
    return this.questions[this.index];
  }

  get isLast() {
    return this.index === this.questions.length - 1;
  }

  nextQuestion() {
    this.index += 1;
    if (this.index >= this.questions.length) return this.finish();
    this.answers = new Map();
    this.points = new Map();
    this.setPhase('question', this.answerTime(this.seconds), () => this.reveal());
  }

  onAction(pid, action) {
    if (this.phase !== 'question' || action.type !== 'answer' || this.answers.has(pid)) return;
    const choice = action.choice;
    if (!Number.isInteger(choice) || choice < 0 || choice >= this.question.choices.length) return;
    this.answers.set(pid, { choice, speed: this.speedFraction() });
    this.room.broadcast();
    this.endWhenAllDone(this.answers);
  }

  checkAllDone() {
    if (this.phase === 'question') this.endWhenAllDone(this.answers);
  }

  reveal() {
    const q = this.question;
    const multiplier = this.isLast ? 2 : 1;
    for (const [pid, answer] of this.answers) {
      if (answer.choice !== q.correct) continue;
      const points = Math.round(((500 + 500 * answer.speed) * multiplier) / 10) * 10;
      this.points.set(pid, points);
      this.addPoints(pid, points);
    }
    this.setPhase('reveal', 10000, () => this.afterReveal());
  }

  afterReveal() {
    if (this.isLast) return this.finish();
    if ((this.index + 1) % 4 === 0) return this.showScores(() => this.nextQuestion());
    this.nextQuestion();
  }

  questionView() {
    const q = this.question;
    return {
      kind: this.meta.id,
      n: this.index + 1,
      total: this.questions.length,
      double: this.isLast,
      prompt: q.prompt,
      choices: q.choices,
    };
  }

  hostPhaseView() {
    if (this.phase === 'question') {
      return { ...this.questionView(), answered: [...this.answers.keys()] };
    }
    if (this.phase === 'reveal') {
      const q = this.question;
      const counts = q.choices.map(() => []);
      for (const [pid, answer] of this.answers) counts[answer.choice].push(this.room.publicPlayer(pid));
      return {
        ...this.questionView(),
        correct: q.correct,
        pickers: counts,
        ref: q.ref,
        note: q.note,
        points: Object.fromEntries(this.points),
        answered: [...this.answers.keys()],
      };
    }
    return {};
  }

  playerPhaseView(pid) {
    if (this.phase === 'question') {
      return { ...this.questionView(), picked: this.answers.get(pid)?.choice ?? null };
    }
    if (this.phase === 'reveal') {
      const q = this.question;
      const answer = this.answers.get(pid);
      return {
        kind: this.meta.id,
        answered: Boolean(answer),
        right: answer ? answer.choice === q.correct : false,
        correctText: q.choices[q.correct],
        pickedText: answer ? q.choices[answer.choice] : null,
        points: this.points.get(pid) || 0,
        ref: q.ref,
      };
    }
    return {};
  }
}

const quickRules = 'Faster right answers score more. The last one is worth double!';

export class RealOrNotGame extends TriviaGame {
  static meta = {
    id: 'realornot',
    name: 'Real or Not?',
    tagline: 'Is that really in the Bible?',
    emoji: '🤔',
    minutes: '8–12',
    rules: [
      'A saying or a story pops up on the big screen.',
      'Tap REAL if it’s in the Bible, or NOT if it isn’t.',
      quickRules,
    ],
  };

  get bank() {
    return this.content.realornot;
  }

  counts = { short: 8, standard: 12, long: 16 };
  seconds = 15;

  buildQuestion(item) {
    return {
      prompt: item.text,
      choices: ['Real', 'Not in the Bible'],
      correct: item.real ? 0 : 1,
      ref: item.ref,
      note: item.note,
    };
  }
}

export class WhoSaidGame extends TriviaGame {
  static meta = {
    id: 'whosaid',
    name: 'Who Said It?',
    tagline: 'Name that Bible voice.',
    emoji: '🗣️',
    minutes: '8–12',
    rules: [
      'A famous line from the King James Bible appears.',
      'Pick who actually said it.',
      'Watch out for sneaky look-alikes! ' + quickRules,
    ],
  };

  get bank() {
    return this.content.whosaid;
  }

  counts = { short: 7, standard: 10, long: 14 };
  seconds = 20;

  buildQuestion(item) {
    const choices = shuffle([item.answer, ...item.options]);
    return { prompt: item.quote, choices, correct: choices.indexOf(item.answer), ref: item.ref, note: item.note };
  }
}

export class WhichBookGame extends TriviaGame {
  static meta = {
    id: 'whichbook',
    name: 'Which Book?',
    tagline: 'From Genesis to Revelation.',
    emoji: '📖',
    minutes: '8–12',
    rules: [
      'A verse from the King James Bible appears.',
      'Pick which book of the Bible it comes from.',
      quickRules,
    ],
  };

  get bank() {
    return this.content.whichbook;
  }

  counts = { short: 7, standard: 10, long: 14 };
  seconds = 20;

  buildQuestion(item) {
    const choices = shuffle([item.answer, ...item.options]);
    return { prompt: item.quote, choices, correct: choices.indexOf(item.answer), ref: item.ref, note: item.note };
  }
}
