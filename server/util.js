import crypto from 'node:crypto';

export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(list, n) {
  return shuffle(list).slice(0, n);
}

export function randomId(bytes = 9) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Lowercase, strip accents and punctuation, collapse spaces.
// "Swine’s!" → "swines", "  The  Ark " → "the ark"
export function normalize(text) {
  return (typeof text === 'string' ? text : '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Normalize, then drop a leading article and a trailing plural "s" so
// "the lions", "a lion" and "lion" all compare equal.
export function looseKey(text) {
  return normalize(text)
    .replace(/^(the|a|an) /, '')
    .replace(/(?<=[a-z]{2}[a-rt-z])s$/, '');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Strip control characters and squeeze whitespace from player text.
export function cleanText(text, max) {
  return (typeof text === 'string' ? text : '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
