# OG Party Pack

Bible party games for a projector and everyone's phones. It works like a Jackbox
party pack: the big screen shows the game, and each player joins from their
phone's web browser with a 4-letter room code. There's no app to install.

Made for the **Older, Older and Growing** small group (10–15 players, 20 max).

## The games

| Game | How it plays | Length |
| --- | --- | --- |
| 🤔 **Real or Not?** | A saying or story pops up. Is it really in the Bible? Tap REAL or NOT. | 8–12 min |
| 🎭 **Bluff the Verse** | A King James verse with a word missing. Type a fake word that could fool everyone, then find the real one. | 12–15 min |
| 🗣️ **Who Said It?** | A famous line. Pick who actually said it. | 8–12 min |
| 📖 **Which Book?** | A verse. Pick the book it comes from. | 8–12 min |
| ⏳ **Timeline** | Tap Bible events into order, earliest first. | 8–12 min |
| 🎨 **Draw the Word** | Everyone draws a secret Bible story on their phone; everyone else guesses what it is. | 10–15 min |
| 🍞 **Loaves & Laughs** | Everyone answers the same funny prompt, then votes for the funniest answer. | 10–15 min |

All scripture is quoted from the King James Version (public domain), and every
quote has been checked word-for-word against the KJV text. The question banks
hold about 500 items (98 Real or Not, 72 Bluff the Verse, 72 Who Said It,
96 Which Book, 11 timelines, 85 drawing prompts, 90 funny prompts). The game
avoids repeating anything until it has used everything in that game, even
across game nights on the same laptop.

## Playing a game night

1. On the laptop connected to the projector, open the big-screen page:
   `https://YOUR-ADDRESS/host` (see **Hosting** below). Click
   **Start game night**, then press **F** for full screen.
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
2. Click **New → Web Service** and pick the `marketmindsglobal` repository.
3. Fill in:
   - **Branch**: the branch that has the `og-party-pack` folder
   - **Root Directory**: `og-party-pack`
   - **Runtime / Language**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
4. Click **Create Web Service**. After a few minutes you'll get an address like
   `https://og-party-pack.onrender.com`. The big screen is
   `https://og-party-pack.onrender.com/host`, and phones just go to
   `https://og-party-pack.onrender.com`.

Free Render services go to sleep after about 15 minutes without visitors. The
first visit after that takes up to a minute to load, so **open the big-screen
page a few minutes before people arrive**. While the big screen is open it keeps
the server awake.

### Option B: run it on the laptop (no internet needed)

1. Install [Node.js](https://nodejs.org) (the LTS version) on the laptop.
2. Open a terminal in the `og-party-pack` folder and run:

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
  - `realornot.js`: statements with `real: true/false`, a reference and a note
  - `bluff.js`: a verse split into `before` / `answer` / `after`
  - `whosaid.js` and `whichbook.js`: a quote, the right answer and three wrong ones
  - `timeline.js`: sets of events listed in Bible order
  - `draw.js` and `laughs.js`: plain lists of prompts

## For developers

```
npm install
npm run dev     # restarts on file changes
npm test        # plays all 7 games start to finish with 12 bot players
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

- Scripture: King James Version (public domain).
- Fonts: Fredoka, Lora and Nunito, under the SIL Open Font License (see
  `public/fonts/`).
- Sounds and music are generated in the browser. There are no audio files.
