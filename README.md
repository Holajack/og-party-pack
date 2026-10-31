# OG Party Pack

Bible party games for a projector and everyone's phones. It works like a Jackbox
party pack: the big screen shows the game, and each player joins from their
phone's web browser with a 4-letter room code. There's no app to install.

Made for the **Older, Older and Growing** small group (10–15 players, 20 max).

## The games

| Game | How it plays | Length |
| --- | --- | --- |
| 🤔 **Real or Not?** | A saying or story pops up. Tap REAL (the Bible says it), TWISTED (close, but not what it says) or NOT (not in the Bible at all). | 8–12 min |
| 🎭 **Bluff the Verse** | A Bible verse with a word missing. Type a fake word that could fool everyone, then find the real one. | 12–15 min |
| 🗣️ **Who Said It?** | A famous line. Pick who actually said it. | 8–12 min |
| 📖 **Which Book?** | A verse. Pick the book it comes from. | 8–12 min |
| ⏳ **Timeline** | Tap Bible events into order, earliest first. | 8–12 min |
| 🎨 **Draw the Word** | Everyone draws a secret Bible story on their phone; everyone else guesses what it is. | 10–15 min |
| 🍞 **Loaves & Laughs** | Everyone answers the same funny prompt, then votes for the funniest answer. | 10–15 min |

### Three Bible translations

Pick one in the lobby (the **Bible** switch). The verses in Bluff the Verse, Who
Said It? and Which Book?, and the quotes in Real or Not?, all change to match.

| Switch | Translation | Reads like |
| --- | --- | --- |
| **KJV** | King James Version | the classic |
| **BSB** | Berean Standard Bible | the ESV or NIV |
| **NHEB** | New Heart English Bible | the NKJV |

All three are public domain, so there's nothing to license. (The ESV, NIV, NLT and
NKJV themselves are copyrighted, so these are the closest free stand-ins. No free
translation reads like the NLT.) `npm run verify` checks every quote, word for
word, against the real text of each translation.

The question banks hold nearly 800 items: 161 Real or Not, 116 Bluff the
Verse, 115 Who Said It, 142 Which Book, 17 timelines, 115 drawing
prompts and 120 funny prompts. The BSB and NHEB have one or two fewer where a
question doesn't work with their wording. The game avoids repeating anything until it
has used everything in that game, even across game nights on the same laptop.

### How the questions are checked

- **Every quote is the real text.** `npm run verify` compares each verse, word for
  word, against the KJV, BSB and NHEB, and checks every reference points at real
  verses.
- **Real or Not? is about meaning, not just words.** A saying counts as REAL only
  if the Bible says it. Popular sayings that bend a real verse are TWISTED, and the
  answer screen shows what the verse actually says. For example, “God won’t give
  you more than you can handle” is TWISTED: 1 Corinthians 10:13 promises that God
  won’t let you be *tempted* beyond what you can bear and will give you a way out,
  and Paul writes of trouble far beyond his strength, so that he would rely on God
  (2 Corinthians 1:8–9). Sayings with no biblical source at all, like “God helps
  those who help themselves,” are NOT.
- **Every note was fact-checked.** Speakers, books, event order and the facts in
  each answer note were read against the passages they cite.

## Playing a game night

1. On the laptop connected to the projector, go to your game's address (see
   **Hosting** below) and click **Host on this computer**. (Or bookmark
   `https://YOUR-ADDRESS/host` to go straight there.) Click **Start game
   night**, then press **F** for full screen.
2. Everyone opens `YOUR-ADDRESS` on their phone (or scans the QR code), types the
   room code and their name, and they're in. Tap your avatar to change it.
3. Click a game on the big screen to start it. The first person who joined is the
   **leader 👑** and can also pick games and press **Next** from their phone, so
   whoever runs the laptop can sit down and play. To make someone else the leader,
   hover over their name in the lobby and click 👑.
4. After each game the scores go into **Tonight's** totals on the lobby screen.

Before starting, the lobby lets you choose:

- **Game length**: Short, Standard or Long (fewer or more questions per game).
- **Timers**: Normal, or **Relaxed** (50% more time to answer).
- **Bible**: KJV, BSB or NHEB (see above).

Big-screen keyboard shortcuts: **Space** = Next, **P** = Pause, **F** = full screen,
**M** = mute. The buttons in the bottom-right corner do the same things, plus music
on/off and **End game** (back to the menu without counting the scores).

People can join late, lock their phone or reload the page. They land right back in
the game with their score. Hover over a name in the lobby and click ✕ to remove
someone.

## Hosting

The game is a small Node.js app. Pick whichever option suits you. Both are free.

### Option A: free online hosting (Render)

Phones can then join from anywhere, on Wi-Fi or cell data.

1. Make a free account at [render.com](https://render.com) and connect your GitHub
   account.
2. Click **New → Web Service** and pick the `go-party-pack` repository.
3. Fill in:
   - **Branch**: `main`
   - **Root Directory**: leave it blank
   - **Runtime / Language**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
   - Under **Advanced**, set **Health Check Path** to `/healthz` (optional)
4. Click **Create Web Service**. After a few minutes you'll get an address like
   `https://og-party-pack.onrender.com`. The big screen is
   `https://og-party-pack.onrender.com/host`, and phones just go to
   `https://og-party-pack.onrender.com`.

How the free plan behaves:

- After about 15 minutes with nobody visiting, the server goes to sleep. Nothing
  is lost; it just isn't running.
- The next visit wakes it. That first load takes up to a minute (Render shows a
  loading screen), then it's normal speed.
- So on game night, **open the big-screen page a few minutes before people
  arrive**. As long as that page stays open it keeps the server awake, even
  before you click Start, and for the whole night.
- Free accounts get 750 running hours a month, and a sleeping server uses none.
  A few game nights a month uses a tiny fraction.
- When new code is pushed to the branch, Render redeploys and restarts the
  server, which ends any game in progress. Don't push updates during a game
  night.

### Option B: run it on the laptop (no internet needed)

1. Install [Node.js](https://nodejs.org) (the LTS version) on the laptop.
2. Download this project (on GitHub: **Code → Download ZIP**, then unzip it),
   open a terminal in its folder, and run:

   ```
   npm install
   npm start
   ```

3. Open `http://localhost:3000/host` on the laptop. The big screen automatically
   shows the laptop's Wi-Fi address (something like `http://192.168.1.20:3000`).
   Phones on the **same Wi-Fi** go to that address.

If phones can't connect, the laptop's firewall may be blocking port 3000. Allow
Node.js through the firewall when your computer asks.

## Making it yours

- **Names on screen**: edit `config.js` (pack name, group name, tagline).
- **Questions**: everything lives in `content/`. Each file has a short comment at the
  top explaining its format; add, edit or remove entries and restart the server.
  The KJV files are the master list; `content/bsb/` and `content/nheb/` hold the
  same questions in those translations' wording, matched by `id`. After editing,
  run `npm run verify` to check every quote against the real Bible text
  (`node scripts/lookup.js "John 3:16"` shows a verse in all three).
  - `realornot.js`: statements with `answer: 'real' | 'twisted' | 'not'`, a reference
    and a note explaining the answer
  - `bluff.js`: a verse split into `before` / `answer` / `after`
  - `whosaid.js` and `whichbook.js`: a quote, the right answer and three wrong ones
  - `timeline.js`: sets of events listed in Bible order
  - `draw.js` and `laughs.js`: plain lists of prompts

## For developers

```
npm install
npm run dev     # restarts on file changes
npm test        # plays all 7 games start to finish with 12 bot players
npm run verify  # checks every quote against the KJV, BSB and NHEB text
```

`node test/screenshots.js` drives a real browser as the projector and as one phone
through every game and saves screenshots to `test/screenshots/` (needs Playwright
and Chromium).

How it fits together: `server/room.js` holds one game night (players, timers,
totals) and sends every screen its own view whenever something changes.
`server/games/` has one file per game, all built on `base.js`. The pages in
`public/` only draw what the server sends. `public/js/host.js` is the projector,
`public/js/play.js` the phone.

## Credits

- Scripture: King James Version, Berean Standard Bible and New Heart English
  Bible, all public domain. Texts for checking come from the
  [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases)
  project.
- Fonts: Fredoka, Lora and Nunito, under the SIL Open Font License (see
  `public/fonts/`).
- Sounds and music are generated in the browser. There are no audio files.
