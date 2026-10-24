// Real or Not? in the New Heart English Bible (public domain). Keyed by the
// KJV item's id (see ../realornot.js); these fields replace the KJV ones.
// Only items whose text or note quotes Scripture need an entry. Whether an
// item is real never changes. In notes, “double quotes” are NHEB Scripture
// (checked by npm run verify); ‘single quotes’ are for anything else,
// including KJV wording.

export default {
  // ---------- REAL ----------
  bears: { note: '“Go up, you baldhead!” Elisha did not appreciate it.' },
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
  'sheeps-clothing': { note: 'False prophets “come to you in sheep’s clothing, but inwardly are ravening wolves.”' },
  'mouth-babes': { note: 'Jesus quoted Psalm 8:2 in Matthew 21:16: “Out of the mouth of babes and nursing babies you have perfected praise.”' },
  season: { note: 'The NHEB says “For everything there is a season.” Pete Seeger set the KJV’s ‘To every thing there is a season’ to music, and The Byrds made it a hit.' },
  physician: { text: '“Physician, heal yourself” is in the Bible.' },
  meek: { text: '“The meek shall inherit the earth” comes from the Bible.', note: 'From the KJV’s ‘Blessed are the meek: for they shall inherit the earth.’ The NHEB says “Blessed are the gentle, for they shall inherit the earth.”' },

  // ---------- NOT ----------
  'money-root': { note: 'Close! It’s “the LOVE of money is a root of all kinds of evil.”' },
  'more-than-handle': { note: 'That verse is about temptation: God “will not allow you to be tempted above what you are able.”' },
  'spare-rod': { note: 'The Bible says “One who spares the rod hates his son.” The catchy version is from a 1663 poem.' },
  'two-by-two': { note: 'Of the clean animals, Noah took “seven pairs.”' },
  // The NHEB's wording ("she called for a man, and shaved off…") reads as if
  // she did it herself, so this one would be confusing here.
  delilah: { skip: true },
  'paul-horse': { note: '“He fell on the earth.” No horse is ever mentioned.' },
  'sinai-ark': { note: '“On Ararat’s mountains.”' },
  'horse-entry': { note: 'He rode a donkey (“the donkey and the colt”), fulfilling Zechariah 9:9.' },
  whale: { note: 'Jonah says “a great fish.” (In Matthew 12:40, Jesus says “the belly of the whale.” Sneaky!)' },
  'age-33': { note: 'It says He was “about thirty years old” when His ministry began. The 33 is worked out from there.' },
  'golden-rule': { note: 'Close idea, different words. The KJV says ‘Whatsoever ye would that men should do to you, do ye even so to them.’ The NHEB says “whatever you desire for men to do to you, you shall also do to them.”' },
  'twelve-baskets': { note: 'Twelve baskets of broken pieces from five barley loaves.' },
};
