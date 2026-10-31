// Real or Not? in the Berean Standard Bible (BSB), keyed by the id of the KJV
// item in ../realornot.js. Only items whose text or note quotes Scripture in
// KJV wording are here; the rest are the same in every translation. The answer
// (real, twisted or not) never changes.
//
// Statements about where a saying comes from (‘the powers that be’) are true
// because of the KJV, so they keep their text; the note gives the BSB wording.
// In notes, “double quotes” are for BSB Scripture (checked by npm run verify);
// ‘single quotes’ are for anything else, including KJV wording.

export default {
  // ---------- REAL ----------
  'bears': { note: '“Go up, you baldhead!” Elisha did not appreciate it.' },
  'donkey': { note: 'Balaam’s donkey asked, “What have I done to you that you have beaten me these three times?”' },
  'eutychus': { note: 'Paul preached until midnight. Eutychus fell from the third story, and Paul brought him back to life.' },
  'ehud': { note: '“Even the handle sank in after the blade, and Eglon’s fat closed in over it.” Eglon was a king of Moab.' },
  'six-fingers': { note: '“Twenty-four in all.”' },
  'axe-head': { note: 'Elisha threw a stick in the Jordan and “made the iron float.”' },
  'jawbone': { note: '“The fresh jawbone of a donkey.”' },
  'sundial': { text: 'A shadow went backward ten steps as a sign from God.', note: '“He brought the shadow back the ten steps it had descended on the stairway of Ahaz.” It was a sign to King Hezekiah that he would recover.' },
  'coin-fish': { note: '“You will find a four-drachma coin. Take it and give it to them for My tax and yours.”' },
  'handkerchiefs': { note: '“Handkerchiefs and aprons that had touched him were taken to the sick, and the diseases and evil spirits left them.”' },
  'jael': { note: 'Jael, with a tent peg and a hammer. The general was Sisera.' },
  'money-answereth': { text: 'The Bible says “money is the answer for everything.”' },
  'merry-heart': { text: 'The Bible says “a joyful heart is good medicine.”' },
  'pearl-gates': { note: 'The twelve gates were “twelve pearls, with each gate consisting of a single pearl.” The street is pure gold, too.' },
  'solomon': { note: 'Plus 300 concubines. “And his wives turned his heart away.”' },
  'moses-face': { note: '“His face had become radiant from speaking with the LORD.” He wore a veil afterward.' },
  'sun-still': { note: '“So the sun stopped in the middle of the sky and delayed going down about a full day.”' },
  '153': { note: '“It was full of large fish, 153,” and the net didn’t break.' },
  'skin-teeth': { note: '“I have escaped by the skin of my teeth.” (The KJV says ‘with the skin of my teeth.’)' },
  'hand-wall': { note: 'MENE, MENE, TEKEL, PARSIN. Daniel read it for King Belshazzar.' },
  'viper': { note: 'On the island of Malta, after a shipwreck.' },
  'wine-stomach': { note: '“Stop drinking only water and use a little wine instead, because of your stomach.”' },
  'fourth-man': { note: '“The fourth looks like a son of the gods!”' },
  'lazarus': { note: 'Martha warned, “Lord, by now he stinks.”' },
  'holy-kiss': { note: '“Greet one another with a holy kiss.” A handshake also works.' },
  'coals': { text: 'The Bible says being kind to your enemy will “heap burning coals” on his head.' },
  'carpenter': { note: '“Isn’t this the carpenter, the son of Mary…?”' },
  'enoch': { note: 'Enoch. Hebrews 11:5 says he was taken up “so that he did not see death.”' },
  'powers-that-be': { note: 'The KJV says ‘the powers that be are ordained of God.’ The BSB reads “The authorities that exist have been appointed by God.”' },
  'labour-love': { note: '“Your work of faith, your labor of love, and your enduring hope.”' },
  'house-divided': { note: 'Jesus said it first: “If a house is divided against itself, it cannot stand.” Abraham Lincoln quoted it in 1858.' },
  'sheeps-clothing': { note: 'False prophets “come to you in sheep’s clothing, but inwardly they are ravenous wolves.”' },
  'eye-for-eye': { text: '“Eye for eye, tooth for tooth” is in the Bible.', note: 'It goes on: “hand for hand, foot for foot.” Jesus addresses it in Matthew 5:38-39.' },
  'mouth-babes': { note: 'The KJV’s ‘Out of the mouth of babes’ gave us the saying. The BSB reads “From the mouths of children and infants.” Jesus quoted it in Matthew 21:16.' },
  'season': { text: '“To everything there is a season” is from the Bible.' },
  'nothing-new': { text: '“There is nothing new under the sun” is from the Bible.' },
  'physician': { text: '“Physician, heal yourself” is in the Bible.' },
  'meek': { note: '“Blessed are the meek, for they will inherit the earth.”' },

  // About the King James wording itself, so they're left out here.
  unicorns: { skip: true, why: 'About the King James wording; modern translations say wild ox.' },
  'jesus-wept': { skip: true, why: 'The statement is about the King James Bible.' },
  'twelve-baskets': { note: 'Twelve baskets of pieces from five barley loaves.' },
};
