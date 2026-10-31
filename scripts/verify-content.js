// Checks every Bible quote in content/ against the real text of each
// translation, so nothing on screen is misquoted.
//
//   npm run verify            all translations
//   npm run verify -- bsb     just one
//
// The Bible texts (public domain) are downloaded once from the scrollmapper
// bible_databases project into .bible-cache/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE, TRANSLATIONS, loadContent, wordingFor } from '../content/index.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CACHE = path.join(ROOT, '.bible-cache');
const SOURCE = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json';
const FILES = { kjv: 'KJV', bsb: 'BSB', nheb: 'NHEB' };

// Our book names → the source's book names.
const BOOK_ALIASES = { Psalm: 'Psalms', Revelation: 'Revelation of John' };
const toSourceBook = (name) => BOOK_ALIASES[name] ?? name.replace(/^1 /, 'I ').replace(/^2 /, 'II ').replace(/^3 /, 'III ');

async function loadBible(id) {
  const file = path.join(CACHE, `${FILES[id]}.json`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE, { recursive: true });
    console.log(`Downloading ${FILES[id]}…`);
    const res = await fetch(`${SOURCE}/${FILES[id]}.json`);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    fs.writeFileSync(file, await res.text());
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const verses = new Map();
  for (const b of data.books) for (const c of b.chapters) for (const v of c.verses) verses.set(`${b.name}|${c.chapter}|${v.verse}`, v.text);
  return verses;
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\[|\]|¶/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/'(?![a-z])|(?<![a-z])'/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// "Proverbs 30:26-28" → text of those verses. "Esther" or "Not in the Bible" → null.
function lookup(bible, ref) {
  const m = /^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) return null;
  const book = toSourceBook(m[1]);
  const [ch, v1, v2] = [Number(m[2]), Number(m[3]), Number(m[4] || m[3])];
  const out = [];
  for (let v = v1; v <= v2; v++) {
    const t = bible.get(`${book}|${ch}|${v}`);
    if (t == null) throw new Error(`no verse ${ref}`);
    out.push(t);
  }
  return out.join(' ');
}

// Every passage a ref names, e.g. "Daniel 3 & 6", "Matthew 2:1-11; Luke 2:16",
// "Genesis 37:5-10". Returns [{ book, chapter, from, to }] or null if unreadable.
function passages(ref) {
  const out = [];
  for (const part of String(ref).split(';')) {
    const m = /^\s*((?:[123] )?[A-Za-z][A-Za-z ]*?)\s+(\d[\d:,&\s–-]*)$/.exec(part);
    if (!m) return null;
    const book = toSourceBook(m[1].trim());
    for (const piece of m[2].split(/[&,]/)) {
      const p = /^\s*(\d+)(?::(\d+)(?:[–-](\d+))?)?(?:[–-](\d+))?\s*$/.exec(piece);
      if (!p) return null;
      if (p[4]) out.push({ book, chapter: Number(p[1]), to: Number(p[4]), chapters: true });
      else out.push({ book, chapter: Number(p[1]), from: p[2] ? Number(p[2]) : null, to: p[3] ? Number(p[3]) : p[2] ? Number(p[2]) : null });
    }
  }
  return out;
}

// Problem text if a ref doesn't point at real verses, else null.
function refProblem(bible, ref) {
  const list = passages(ref);
  if (!list || !list.length) return `can't read the reference "${ref}"`;
  for (const p of list) {
    const last = p.chapters ? p.to : p.chapter;
    for (let ch = p.chapter; ch <= last; ch++) if (!bible.has(`${p.book}|${ch}|1`)) return `no chapter ${p.book} ${ch} (in "${ref}")`;
    if (!p.chapters && p.from != null) for (let v = p.from; v <= p.to; v++) if (!bible.has(`${p.book}|${p.chapter}|${v}`)) return `no verse ${p.book} ${p.chapter}:${v} (in "${ref}")`;
  }
  return null;
}

function chapterText(bible, ref) {
  const m = /^(.+?)\s+(\d+)/.exec(ref.trim());
  if (!m) return '';
  const book = toSourceBook(m[1]);
  const out = [];
  for (let v = 1; v < 200; v++) {
    const t = bible.get(`${book}|${m[2]}|${v}`);
    if (t == null) break;
    out.push(t);
  }
  return out.join(' ');
}

// Every "…"-separated piece of `quote` must appear, in order, in `text`.
function contains(text, quote) {
  const hay = norm(text);
  let pos = 0;
  for (const part of quote.split('…')) {
    const needle = norm(part);
    if (!needle) continue;
    const i = hay.indexOf(needle, pos);
    if (i < 0) return false;
    pos = i + needle.length;
  }
  return true;
}

const quotedBits = (note) => [...String(note ?? '').matchAll(/“([^”]+)”/g)].map((m) => m[1].replace(/^[A-Z]{1}[a-z]*\s…\s/, ''));
const refsIn = (note) => [...String(note ?? '').matchAll(/((?:[123] )?[A-Z][a-z]+(?: of [A-Z][a-z]+)?) (\d+):(\d+)(?:-(\d+))?/g)].map((m) => m[0]);

async function verify(id) {
  const bible = await loadBible(id);
  const c = await loadContent(id);
  const problems = [];
  const bad = (game, item, msg) => problems.push(`[${id} ${game}] ${item.id}: ${msg}`);

  // Quotes shown in notes (and Real or Not statements) must come from a
  // chapter the item's ref names, or a ref the note itself names.
  const chaptersOf = (ref) =>
    (passages(ref) ?? []).flatMap((p) => {
      const out = [];
      for (let ch = p.chapter; ch <= (p.chapters ? p.to : p.chapter); ch++) out.push(chapterText(bible, `${p.book} ${ch}`));
      return out;
    });
  const checkQuotes = (game, item, field) => {
    for (const bit of quotedBits(item[field])) {
      const pool = [...chaptersOf(item.ref), ...refsIn(item.note).map((r) => chapterText(bible, r))].join(' ');
      if (!pool || !contains(pool, bit)) bad(game, item, `${field} quote not found in ${item.ref}: “${bit}”`);
    }
  };
  const checkNote = (game, item) => checkQuotes(game, item, 'note');

  // Every KJV question must also exist in this translation, unless it's
  // skipped on purpose (with a reason).
  const wording = wordingFor(id);
  if (wording) {
    for (const game of ['bluff', 'whosaid', 'whichbook']) {
      for (const item of BASE[game]) {
        const w = wording[game][item.id];
        if (!w) bad(game, item, `has no ${TRANSLATIONS[id].short} wording`);
        else if (w.skip && !w.why) bad(game, item, 'is skipped without a reason (add why: "...")');
      }
    }
    for (const [key, w] of Object.entries(wording.realornot)) if (w.skip && !w.why) bad('realornot', { id: key }, 'is skipped without a reason (add why: "...")');
  }

  for (const it of c.bluff) {
    const joined = `${it.before} ${it.answer}${/^[A-Za-z]/.test(it.after) ? ' ' : ''}${it.after}`;
    let verse;
    try {
      verse = lookup(bible, it.ref);
    } catch (e) {
      bad('bluff', it, e.message);
      continue;
    }
    if (!contains(verse, joined)) bad('bluff', it, `does not match ${it.ref}\n     ours:  ${norm(joined)}\n     bible: ${norm(verse)}`);
    const words = norm(`${it.before} ${it.after}`).split(' ');
    if (words.includes(norm(it.answer))) bad('bluff', it, `the answer "${it.answer}" also appears in the visible text`);
    for (const d of it.decoys) if (norm(d) === norm(it.answer) || it.alts.map(norm).includes(norm(d))) bad('bluff', it, `decoy "${d}" is the answer`);
  }

  for (const [game, list] of [['whosaid', c.whosaid], ['whichbook', c.whichbook]]) {
    for (const it of list) {
      let verse;
      try {
        verse = lookup(bible, it.ref);
      } catch (e) {
        bad(game, it, e.message);
        continue;
      }
      if (!contains(verse, it.quote)) bad(game, it, `does not match ${it.ref}\n     ours:  ${norm(it.quote)}\n     bible: ${norm(verse)}`);
      if (it.options.includes(it.answer) || new Set(it.options).size !== 3) bad(game, it, 'options must be 3 wrong answers');
      checkNote(game, it);
    }
  }

  // Which Book: no wrong option may contain the same words.
  const books = new Map();
  for (const [key, text] of bible) {
    const book = key.split('|')[0];
    books.set(book, (books.get(book) ?? '') + ' ' + text);
  }
  const bookNorm = new Map([...books].map(([b, t]) => [b, norm(t)]));
  for (const it of c.whichbook) {
    const needle = it.quote
      .split('…')
      .map(norm)
      .sort((a, b) => b.length - a.length)[0];
    for (const opt of it.options) if (bookNorm.get(toSourceBook(opt))?.includes(needle)) bad('whichbook', it, `wrong option ${opt} also contains this quote`);
  }

  const ANSWERS = ['real', 'twisted', 'not'];
  for (const it of c.realornot) {
    if (!ANSWERS.includes(it.answer)) bad('realornot', it, `answer must be one of ${ANSWERS.join(', ')}`);
    if (!it.note) bad('realornot', it, 'needs a note explaining the answer');
    const readable = passages(it.ref);
    if (it.answer !== 'not' || readable) {
      const p = refProblem(bible, it.ref);
      if (p) bad('realornot', it, p);
    }
    checkNote('realornot', it);
    // A real statement that quotes Scripture must quote it exactly. (Twisted
    // and not-in-the-Bible statements quote sayings, so they can't match.)
    if (it.answer === 'real') checkQuotes('realornot', it, 'text');
  }

  for (const deck of c.timeline) {
    for (const e of deck.events) {
      const p = refProblem(bible, e.ref);
      if (p) problems.push(`[${id} timeline] ${deck.id}: ${p}`);
    }
  }

  for (const [game, list] of Object.entries(c)) {
    const keys = list.map((x) => (typeof x === 'string' ? x : x.id));
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length) problems.push(`[${id} ${game}] duplicate entries: ${[...new Set(dupes)].join(', ')}`);
  }

  const counts = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.length]));
  console.log(`${TRANSLATIONS[id].short}: ${JSON.stringify(counts)}`);
  for (const p of problems) console.log('  ✗ ' + p);
  return problems.length;
}

const only = process.argv[2];
let total = 0;
for (const id of Object.keys(TRANSLATIONS)) if (!only || only === id) total += await verify(id);
console.log(total ? `\n${total} problem(s).` : '\nAll quotes check out.');
process.exit(total ? 1 : 0);
