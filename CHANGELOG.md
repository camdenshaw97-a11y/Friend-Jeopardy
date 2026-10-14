# Friend Jeopardy: what changed, and when

Every change to the game gets an entry here, newest first. The version number is the same one
shown in small print on the TV's start screen and on the phone join screen, so you can tell at a
glance which version a screen is running.

Times are Pacific.

## 1.1 · October 13, 2026, 9:50 pm

**Fixes from the first play test**
- **Typing on Android phones works.** The buzzer was swallowing every touch in the play area, which
  on Samsung phones stopped the wager box and the Final answer box from taking focus. Players can
  now type any Daily Double wager (the quick buttons are still there) and type their Final answer.
- **The host sees the answer clock.** While someone is answering (after a buzz, or after a Daily
  Double wager is in) a 5-second countdown shows on the host's phone next to Correct / Wrong. The
  host still decides; the clock is a guide. The TV's five bars count it down too.
- **Board values fit their tiles**: smaller, with a bevelled gold look.

**A look of its own**
- The TV and the phones no longer share Friend Feud's look. Pure blue tiles in a black grid, gold
  bevelled dollar values, white condensed category names with hard black shadows, a white serif
  clue, blue podiums in black frames, square edges everywhere, and a dark stage with soft light
  beams instead of the starburst. The Daily Double splash is white on blue. The buzz-window and
  answer lights are white, like podium lights.
- The Final clock sits at the top left so it never covers the join code.

## 1.0 · October 13, 2026

**The first version**
- Built the same way as Friend Feud: the board on the TV, phones as buzzers, one phone as the
  host, a 4-letter room code or QR code to join, and the same reconnecting and "survives a
  server restart" behavior.
- Follows the show's rules: two rounds of 30 clues ($200–$1,000, then $400–$2,000), the host
  opens the buzzers after reading and an early buzz locks you out for a quarter second, wrong
  answers cost the value and reopen the buzzers, Daily Doubles (one, then two) with true
  Daily Double wagers, and a Final with blind wagers, a 30-second clock, typed answers and a
  lowest-to-highest reveal. Only players with money play Final.
- Nine clue packs with 78 original categories (390 clues) and 18 Final clues, plus an editor
  for the host's own categories and Final clues.
- Host tools: pick for the player, buzz for a player, false-buzz reopen, skip a clue, fix a
  score, hand over the board, end a round early, undo, and a buzz-window clock (5/8/10 seconds
  or host-called).
- Awards on the closing screen: Most Correct, Fastest Buzzer, Biggest Wager Won.
- An original synthesized 30-second thinking tune for Final (or drop in a `think.mp3`).
- `npm test` plays a full game against the server and checks the rules.
