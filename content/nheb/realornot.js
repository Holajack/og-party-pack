// Real or Not? in the New Heart English Bible (public domain). Keyed by the
// KJV item's id (see ../realornot.js); these fields replace the KJV ones.
// Only items whose text or note quotes Scripture need an entry. The answer
// (real, twisted or not) never changes. In notes, “double quotes” are NHEB Scripture
// (checked by npm run verify); ‘single quotes’ are for anything else,
// including KJV wording.

export default {
  // ---------- REAL ----------
  bears: { note: '“Go up, you baldhead!” Elisha cursed them in the name of the Lord.' },
  donkey: { note: 'Balaam’s donkey asked, “What have I done to you, that you have struck me these three times?”' },
  ehud: { note: 'It was King Eglon: “the fat closed on the blade, for he didn’t draw the sword out of his body.”' },
  'axe-head': { note: 'Elisha threw a stick in the Jordan and “made the iron float.”' },
  jawbone: { note: 'It was “a fresh jawbone of a donkey.”' },
  'coin-fish': { note: '“When you have opened its mouth, you will find a stater coin. Take that, and give it to them for me and you.”' },
  handkerchiefs: { note: 'God “worked special miracles by the hands of Paul, so that even handkerchiefs or aprons were carried away from his body to the sick.”' },
  'money-answereth': { text: 'The Bible says “money is the answer for all things.”' },
  'merry-heart': { text: 'The Bible says “a cheerful heart makes good medicine.”' },
  'pearl-gates': { note: '“Each one of the gates was made of one pearl.” The street is pure gold, too.' },
  'sun-still': { note: '“The sun stayed in the midst of the sky, and did not hurry to go down about a whole day.”' },
  '153': { note: '“One hundred fifty-three,” and the net didn’t break.' },
  'skin-teeth': { note: '“I have escaped by the skin of my teeth.”' },
  'wine-stomach': { note: '“Be no longer a drinker of water only, but use a little wine for your stomach’s sake.”' },
  'fourth-man': { note: '“The aspect of the fourth is like a son of the gods.”' },
  lazarus: { note: 'Martha warned, “Lord, by this time there is a stench, for he has been dead four days.”' },
  'holy-kiss': { note: '“Greet one another with a holy kiss.” A handshake also works.' },
  enoch: { note: 'Enoch. Hebrews 11:5 says he was taken away “so that he would not see death.”' },
  'powers-that-be': { note: 'From the KJV’s ‘the powers that be are ordained of God.’ The NHEB says “there is no authority except from God, and those who exist are ordained by God.”' },
  'labour-love': { note: '“Your work of faith and labor of love and patience of hope.”' },
  'house-divided': { note: 'Jesus said it first: “If a house is divided against itself, that house cannot stand.” Abraham Lincoln quoted it in 1858.' },
  'sheeps-clothing': { note: 'False prophets “come to you in sheep’s clothing, but inwardly are ravening wolves.” (The fable credited to Aesop came much later.)' },
  'mouth-babes': { note: 'Jesus quoted Psalm 8:2 in Matthew 21:16: “Out of the mouth of babes and nursing babies you have perfected praise.”' },
  season: { text: '“For everything there is a season” is from the Bible.', note: 'The NHEB says “For everything there is a season.” Pete Seeger set the KJV’s ‘To every thing there is a season’ to music, and The Byrds made it a hit.' },
  physician: { text: '“Physician, heal yourself” is in the Bible.' },
  meek: { note: 'From the KJV’s ‘Blessed are the meek: for they shall inherit the earth.’ The NHEB says “Blessed are the gentle, for they shall inherit the earth.” Jesus was echoing Psalm 37:11.' },
  'money-root': { note: 'Close! “The love of money is a root of all kinds of evil.”' },


  // About the King James wording itself, so they're left out here.
  unicorns: { skip: true, why: 'About the King James wording; modern translations say wild ox.' },
  // In the NHEB too, “Jesus wept.” is the shortest verse.
  'jesus-wept': { text: '“Jesus wept” is the shortest verse in the Bible.' },
  'twelve-baskets': { note: 'Twelve baskets of broken pieces from five barley loaves.' },
};
