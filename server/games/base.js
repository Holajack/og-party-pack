// Shared plumbing for every game: phases, timers, scores, standings.
//
// A game moves through phases ("intro", "question", "reveal", "scores",
// "final", ...). Each phase usually has a timer; when it runs out (or the
// host presses Next) the game moves on. The server owns all game state.
// Screens just render what hostView() / playerView() return.

export class BaseGame {
  constructor(room) {
    this.room = room;
    this.scores = new Map();
    this.gains = new Map();
    this.phase = 'intro';
    this.seq = 0;
    this.phaseTotal = 0;
  }

  get meta() {
    return this.constructor.meta;
  }

  // Seconds → ms, stretched when the host turned on relaxed timers.
  answerTime(sec) {
    return Math.round(sec * 1000 * (this.room.settings.relaxed ? 1.5 : 1));
  }

  // Pick a value by game length: { short, standard, long }.
  byLength(values) {
    return values[this.room.settings.length] ?? values.standard;
  }

  start() {
    this.setPhase('intro', 16000, () => this.begin());
  }

  // Override: first real phase after the intro.
  begin() {}

  setPhase(phase, ms, onEnd) {
    this.phase = phase;
    this.seq += 1;
    if (ms == null) this.room.clearTimer();
    else this.room.startTimer(ms, onEnd);
    this.phaseTotal = this.room.timer?.total || 0;
    this.room.broadcast();
  }

  // Fraction of the answer window still left right now (1 = answered
  // instantly). Pauses don't count against anyone.
  speedFraction() {
    if (!this.phaseTotal) return 0;
    return Math.max(0, Math.min(1, this.room.timeLeft() / this.phaseTotal));
  }

  addPoints(pid, points) {
    if (!points) return;
    this.scores.set(pid, (this.scores.get(pid) || 0) + points);
    this.gains.set(pid, (this.gains.get(pid) || 0) + points);
  }

  clearGains() {
    this.gains = new Map();
  }

  // Players who should be waited on right now (connected ones).
  activeIds() {
    return this.room.connectedIds();
  }

  // End the current phase early once every active player in `eligible`
  // has done the thing tracked in `done`.
  endWhenAllDone(done, eligible = this.activeIds()) {
    if (eligible.length && eligible.every((id) => done.has(id))) this.room.skipTimer();
  }

  standings() {
    const rows = this.room.playerIds().map((id) => ({
      ...this.room.publicPlayer(id),
      score: this.scores.get(id) || 0,
      gain: this.gains.get(id) || 0,
    }));
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    let rank = 0;
    rows.forEach((row, i) => {
      if (i === 0 || row.score !== rows[i - 1].score) rank = i + 1;
      row.rank = rank;
    });
    return rows;
  }

  rankOf(pid) {
    const rows = this.standings();
    const row = rows.find((r) => r.id === pid);
    return { rank: row?.rank ?? rows.length, of: rows.length, score: row?.score ?? 0, gain: row?.gain ?? 0 };
  }

  // Show the leaderboard (with points gained since the last one) for a few
  // seconds, then carry on.
  showScores(next, ms = 8000) {
    this.setPhase('scores', ms, () => {
      this.clearGains();
      next();
    });
  }

  finish() {
    this.setPhase('final', null);
    this.room.recordResult(this);
  }

  // Host or leader pressed "Next".
  onContinue() {
    if (this.phase === 'final') this.room.endGame();
    else this.room.skipTimer();
  }

  // Can the Next button be pressed now? Answer phases keep it off phones so
  // nobody skips a question by accident; the host screen always has it.
  get continuable() {
    return ['intro', 'reveal', 'scores', 'final', 'gallery', 'results'].includes(this.phase);
  }

  onAction() {}
  onPlayerJoined() {}

  // Someone's phone dropped. If they were the last one we were waiting on,
  // move on, after a short grace period in case it's just a blip.
  onPlayerLeft(pid) {
    const seq = this.seq;
    setTimeout(() => {
      const p = this.room.players.get(pid);
      if (this.room.game === this && this.seq === seq && (!p || !p.connected)) this.checkAllDone();
    }, 4000);
  }

  onPlayerRemoved(pid) {
    this.scores.delete(pid);
    this.gains.delete(pid);
    this.checkAllDone();
  }

  // Override: end the current answer phase if everyone still here is done.
  checkAllDone() {}

  // ---- views -----------------------------------------------------------

  baseView() {
    return { game: this.meta.id, phase: this.phase, seq: this.seq };
  }

  hostView() {
    const view = { ...this.baseView(), ...this.hostPhaseView() };
    if (this.phase === 'intro') Object.assign(view, { intro: true });
    if (this.phase === 'scores' || this.phase === 'final') view.standings = this.standings();
    return view;
  }

  playerView(pid) {
    const view = { ...this.baseView(), ...this.playerPhaseView(pid) };
    if (this.phase === 'intro') Object.assign(view, { name: this.meta.name, emoji: this.meta.emoji, tagline: this.meta.tagline });
    if (['scores', 'final'].includes(this.phase)) Object.assign(view, this.rankOf(pid));
    return view;
  }

  // Override in each game.
  hostPhaseView() {
    return {};
  }

  playerPhaseView() {
    return {};
  }
}
