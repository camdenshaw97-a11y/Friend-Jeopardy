# Friend Jeopardy

A quiz-show party game built the same way as Friend Feud. The board goes on the TV, every
player's phone is their buzzer, and one person hosts from their phone: they read the clues out
loud and judge the answers.

## Playing

1. On the computer plugged into the TV, open `YOUR-SITE/tv` and click **Start a new game**.
   Press `F` for full screen.
2. Everyone else opens `YOUR-SITE` on their phone (or scans the QR code on the TV) and types
   the 4-letter room code and their name.
3. Players tap **Take a podium** (up to 8). One person taps **Be the host** instead.
4. The host taps **Start the game** and follows the prompts on their phone.

## Rules it follows

- **Two rounds and a Final.** Round one has six categories of five clues at $200 to $1,000;
  Double has six new categories at $400 to $2,000.
- **Picking.** A random player picks first. Whoever answers correctly picks next. The player
  with the lowest score picks first in Double. The picker chooses on their phone; the host can
  pick for them.
- **Buzzing.** The host reads the clue, then taps **Open the buzzers**. Buzz before that and
  you're locked out for a quarter of a second, like the real lights. First buzz wins. Once the
  buzzers are open, five bars on the TV count down the buzz window (5 seconds by default; the
  host can make it 8, 10, or turn the clock off and call it themselves).
- **Answering.** Say it out loud, as a question. The host taps **Correct** or **Wrong**.
  Correct adds the value and gives you control of the board. Wrong subtracts it and reopens
  the buzzers for everyone who hasn't tried. If nobody gets it, the response is shown and the
  board comes back. Scores can go negative.
- **Daily Doubles.** One in round one, two in Double, never on the top row. Only the player who
  picked it may answer. They wager on their phone: at least $5, up to the bigger of their score
  and the round's top value (a true Daily Double). Right or wrong, they keep the board.
- **Final.** Only players with more than $0 take part. The category is shown; everyone wagers
  on their phone (anything from $0 to their score) without seeing the clue. Then the clue comes
  up with a 30-second clock and the thinking music, and players type their answer. Whatever is
  typed when the clock runs out counts. Answers are revealed from the lowest score up: the host
  shows the answer, judges it, then the wager is applied. Highest score wins.

## Host tools

- **Clue packs** (in the lobby): General, Sports, Movies/TV/Music, Food & Drink, Science &
  Nature, History & Geography, Pop Culture & Tech, Words & Wordplay, and an adults-only Late
  Night pack. Switch on any mix. A game draws 12 categories and one Final clue from them.
- **No repeats**: a category does not come back until every other category in the packs you
  have on has been played, within a game and across games. The TV remembers what it has shown.
- **Write clues** (lobby, or the **My clues** button on the TV): your own categories (a name
  and five clues) and Final clues. They are used before the built-in packs, and are saved on
  that device. Save to file / Load from file moves them between devices.
- **Buzz for someone**: if a phone acts up while the buzzers are open, the host can buzz for
  that player. **False buzz: reopen** undoes a buzz without charging anyone.
- **Skip this clue** takes a clue off the board without playing it.
- **Menu**: fix a score, hand the board to someone, change the buzz window, remove a player,
  end a round early (the rest of the board is cleared), or end the game.
- **Undo last tap** fixes any mis-tap.
- **Final**: the host can enter a wager for someone whose phone is stuck, show the clue before
  everyone has wagered (missing wagers count as $0), stop the clock early, or skip Final
  altogether.
- **Awards**: the closing screen shows the champion, every score, and Most Correct, Fastest
  Buzzer and Biggest Wager Won. Each phone shows that player's own numbers.
- **If the server restarts mid-game**, nothing is lost. The TV keeps a sealed copy of the game
  and hands it back when the server returns; every screen says "Reconnecting…" for a moment
  (about a minute on a free host) and then carries on. A running clock gets its time back,
  plus five seconds. Keep the TV page open: the copy lives in that browser.

## Running it

Needs Node.js 18 or newer.

    npm install
    npm start

Then open http://localhost:3000/tv. To play over home Wi-Fi without hosting, phones can join
at `http://YOUR-COMPUTER-IP:3000`.

`npm test` plays a whole game against the server with scripted screens and checks the rules.

## Hosting it for free (Render)

1. Put these files in a GitHub repository (everything except `node_modules`).
2. At render.com choose **New > Web Service**, connect the repository, and pick the **Free**
   instance type. Build command `npm install`, start command `node server.js`.
3. Render gives you an address like `friend-jeopardy.onrender.com`. That's `YOUR-SITE`.

A free Render service goes to sleep after 15 minutes with nobody on it and takes about a
minute to wake up, so open the TV page a few minutes before the party. It stays awake while a
game is running. If Render restarts the service mid-game, the game survives it (see above).
The copy the TV keeps is locked with a key only your server has; on Render the key comes from
the service's own id, so there is nothing to set up. To use a key of your own instead, add an
environment variable named `BACKUP_KEY` with any long random text.

## Changing things

- Game name: `F.TITLE` at the top of `common.js`.
- Built-in clues: `clues.js`. Each category is a name and five `[clue, response]` pairs,
  easiest first. Final clues are at the bottom of the file.
- Dollar values, Daily Double count, lockout time, buzz-window choices and the Final clock:
  the "rules" block at the top of `server.js`.

## Music and sounds

All the sound effects are synthesized in the browser, so there are no audio files to load.

- **Final thinking music**: an original 30-second tune, built in. To use a recording of your
  own instead, put a 30-second file named `think.mp3` next to the other files.
- **Lobby music**: off by default (the **Music** button on the TV, or press `B`). Nothing plays
  unless you add a file named `lobby.mp3`. Only add music you have the right to use; if it
  needs a credit, put it in `F.MUSIC_CREDIT` at the top of `common.js`.

## What changed, and when

See [CHANGELOG.md](CHANGELOG.md). The version number on the TV start screen and the phone join
screen matches the entries there.
