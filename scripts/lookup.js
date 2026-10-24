// Print verses side by side in every translation, to help write content.
//
//   node scripts/lookup.js "Proverbs 17:22" "John 11:35-36"
//   node scripts/lookup.js --tr bsb "Proverbs 17:22"
//
// Needs the texts in .bible-cache/ (run `npm run verify` once to download them).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILES = { kjv: 'KJV', bsb: 'BSB', nheb: 'NHEB' };
const BOOK_ALIASES = { Psalm: 'Psalms', Revelation: 'Revelation of John' };
const toSourceBook = (name) => BOOK_ALIASES[name] ?? name.replace(/^1 /, 'I ').replace(/^2 /, 'II ').replace(/^3 /, 'III ');

const args = process.argv.slice(2);
let only = null;
if (args[0] === '--tr') {
  only = args[1];
  args.splice(0, 2);
}

const bibles = {};
for (const [id, file] of Object.entries(FILES)) {
  if (only && only !== id) continue;
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, '.bible-cache', `${file}.json`), 'utf8'));
  const map = new Map();
  for (const b of data.books) for (const c of b.chapters) for (const v of c.verses) map.set(`${b.name}|${c.chapter}|${v.verse}`, v.text);
  bibles[id] = map;
}

for (const ref of args) {
  const m = /^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) {
    console.log(`${ref}: can't read that reference`);
    continue;
  }
  console.log(`## ${ref}`);
  for (const [id, map] of Object.entries(bibles)) {
    const out = [];
    for (let v = Number(m[3]); v <= Number(m[4] || m[3]); v++) out.push(map.get(`${toSourceBook(m[1])}|${m[2]}|${v}`) ?? '(missing)');
    console.log(`  ${id.toUpperCase().padEnd(5)} ${out.join(' ')}`);
  }
}
