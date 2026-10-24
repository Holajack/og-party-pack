// Little synthesized sounds and music for the big screen: no audio files
// needed. Browsers only allow sound after a click, so call unlock() from a
// click handler first.

let ctx = null;
let master = null;
let muted = false;
let musicOn = true;
let musicTimer = null;
let musicStep = 0;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05);
}

export const isMuted = () => muted;

function tone(freq, { at = 0, dur = 0.25, type = 'sine', vol = 0.2, slide = 0, attack = 0.01 } = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

const N = (semis) => 440 * 2 ** (semis / 12); // semitones from A4

export const sfx = {
  join() {
    tone(N(3), { dur: 0.18, type: 'triangle', vol: 0.18 });
    tone(N(10), { at: 0.09, dur: 0.3, type: 'triangle', vol: 0.18 });
  },
  start() {
    [0, 4, 7, 12].forEach((s, i) => tone(N(s + 3), { at: i * 0.08, dur: 0.35, type: 'triangle', vol: 0.16 }));
  },
  question() {
    tone(N(-2), { dur: 0.12, type: 'square', vol: 0.06 });
    tone(N(5), { at: 0.1, dur: 0.22, type: 'triangle', vol: 0.15 });
  },
  tick() {
    tone(1400, { dur: 0.05, type: 'square', vol: 0.05 });
  },
  lockIn() {
    tone(N(12), { dur: 0.08, type: 'sine', vol: 0.08 });
  },
  reveal() {
    tone(N(-12), { dur: 0.5, type: 'sawtooth', vol: 0.05, slide: 2 });
    [0, 4, 7].forEach((s, i) => tone(N(s + 3), { at: 0.35 + i * 0.05, dur: 0.6, type: 'triangle', vol: 0.12 }));
  },
  fooled() {
    tone(N(0), { dur: 0.25, type: 'triangle', vol: 0.12, slide: 0.7 });
    tone(N(-5), { at: 0.2, dur: 0.35, type: 'triangle', vol: 0.12, slide: 0.7 });
  },
  scores() {
    [7, 12, 16].forEach((s, i) => tone(N(s), { at: i * 0.1, dur: 0.3, type: 'triangle', vol: 0.12 }));
  },
  fanfare() {
    const notes = [[0, 0], [4, 0.15], [7, 0.3], [12, 0.45], [7, 0.7], [12, 0.85]];
    for (const [s, at] of notes) tone(N(s + 3), { at, dur: at > 0.8 ? 1.1 : 0.25, type: 'triangle', vol: 0.16 });
    for (const [s, at] of notes) tone(N(s - 9), { at, dur: at > 0.8 ? 1.1 : 0.25, type: 'sine', vol: 0.08 });
  },
};

// A gentle plucked loop (I–V–vi–IV) for the menu and between rounds.
const CHORDS = [
  [3, 7, 10, 15],
  [10, 14, 17, 22],
  [12, 15, 19, 24],
  [8, 12, 15, 20],
];

export function setMusic(on) {
  musicOn = on;
  if (!on) stopMusic();
}

export const isMusicOn = () => musicOn;

export function playMusic() {
  if (musicTimer || !musicOn) return;
  const beat = () => {
    if (!ctx || muted || !musicOn) return;
    const chord = CHORDS[Math.floor(musicStep / 8) % CHORDS.length];
    const i = musicStep % 8;
    const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
    tone(N(chord[pattern[i]] - 12), { dur: 0.5, type: 'triangle', vol: 0.045, attack: 0.005 });
    if (i === 0) tone(N(chord[0] - 24), { dur: 1.6, type: 'sine', vol: 0.06, attack: 0.02 });
    musicStep += 1;
  };
  musicTimer = setInterval(beat, 260);
}

export function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}
