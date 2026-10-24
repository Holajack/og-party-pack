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
import { TRANSLATIONS, loadContent } from '../content/index.js';

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

  // Quotes shown in notes must come from the ref's chapter (or a ref the note names).
  const checkNote = (game, item) => {
    for (const bit of quotedBits(item.note)) {
      const pool = [chapterText(bible, item.ref), ...refsIn(item.note).map((r) => chapterText(bible, r))].join(' ');
      if (!pool || !contains(pool, bit)) bad(game, item, `note quote not found in ${item.ref}: “${bit}”`);
    }
  };

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
    const needle = norm(it.quote.split('…')[0]);
    for (const opt of it.options) if (bookNorm.get(toSourceBook(opt))?.includes(needle)) bad('whichbook', it, `wrong option ${opt} also contains this quote`);
  }

  for (const it of c.realornot) checkNote('realornot', it);

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
