// All game content, in each Bible translation.
//
// The KJV files in this folder are the master list. Each other translation
// has a folder (bsb/, nheb/) with that translation's wording, keyed by the
// same ids:
//   bluff, whosaid, whichbook → an item is only used in a translation if that
//     translation's file has it (the wording always differs).
//   realornot → optional; only items whose text or note quotes Scripture
//     need an entry. The rest are the same in every translation.
//   Any entry can be { skip: true } to leave an item out of that translation.
// Timeline, drawing and funny prompts don't quote Scripture.

import bluff from './bluff.js';
import whosaid from './whosaid.js';
import whichbook from './whichbook.js';
import realornot from './realornot.js';
import timeline from './timeline.js';
import draw from './draw.js';
import laughs from './laughs.js';
import bsbBluff from './bsb/bluff.js';
import bsbWhosaid from './bsb/whosaid.js';
import bsbWhichbook from './bsb/whichbook.js';
import bsbRealornot from './bsb/realornot.js';
import nhebBluff from './nheb/bluff.js';
import nhebWhosaid from './nheb/whosaid.js';
import nhebWhichbook from './nheb/whichbook.js';
import nhebRealornot from './nheb/realornot.js';

export const TRANSLATIONS = {
  kjv: { id: 'kjv', short: 'KJV', name: 'King James Version', blurb: 'The classic' },
  bsb: { id: 'bsb', short: 'BSB', name: 'Berean Standard Bible', blurb: 'Modern, like the ESV or NIV' },
  nheb: { id: 'nheb', short: 'NHEB', name: 'New Heart English Bible', blurb: 'Modern, like the NKJV' },
};

const WORDING = {
  bsb: { bluff: bsbBluff, whosaid: bsbWhosaid, whichbook: bsbWhichbook, realornot: bsbRealornot },
  nheb: { bluff: nhebBluff, whosaid: nhebWhosaid, whichbook: nhebWhichbook, realornot: nhebRealornot },
};

function reword(base, wording, required, strict) {
  if (!wording) return base;
  const out = [];
  for (const item of base) {
    const w = wording[item.id];
    if (w?.skip) continue;
    if (w) out.push({ ...item, ...w, id: item.id });
    else if (!required) out.push(item);
  }
  // Too few items in this translation to make a game: use the KJV ones.
  return required && !strict && out.length < 10 ? base : out;
}

const cache = new Map();

// `strict` skips the KJV fallback (used by the quote checker).
export function contentFor(translation, { strict = false } = {}) {
  const id = TRANSLATIONS[translation] ? translation : 'kjv';
  const key = `${id}:${strict}`;
  if (!cache.has(key)) {
    const w = WORDING[id];
    cache.set(key, {
      bluff: reword(bluff, w?.bluff, true, strict),
      whosaid: reword(whosaid, w?.whosaid, true, strict),
      whichbook: reword(whichbook, w?.whichbook, true, strict),
      realornot: reword(realornot, w?.realornot, false, strict),
      timeline,
      draw,
      laughs,
    });
  }
  return cache.get(key);
}

export const loadContent = async (translation) => contentFor(translation, { strict: true });

// For the quote checker: the KJV master lists and each translation's raw wording.
export const BASE = { bluff, whosaid, whichbook, realornot, timeline, draw, laughs };
export const wordingFor = (translation) => WORDING[translation] ?? null;
