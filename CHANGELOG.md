# Friend Jeopardy: what changed, and when

Every change to the game gets an entry here, newest first. The version number is the same one
shown in small print on the TV's start screen and on the phone join screen, so you can tell at a
glance which version a screen is running.

Times are Pacific.

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
