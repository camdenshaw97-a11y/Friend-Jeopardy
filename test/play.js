'use strict';
/*
 * Plays a whole game against a real server with scripted screens: a TV, a host phone and three
 * player phones. Checks the rules along the way (lockout, scoring, Daily Doubles, Final) and that
 * a game comes back after the server forgets it.   Run with: npm test
 */
process.env.RESTORE_WINDOW_MS = '600000';
const assert = require('assert');
const WebSocket = require('ws');
const { server, rooms, restoreRoom } = require('../server');

const PORT = 3999;
let failures = 0;
function check(name, ok, extra) {
  if (ok) console.log('  ok   ' + name);
  else { failures++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const wait = ms => new Promise(r => setTimeout(r, ms));

class Screen {
  constructor(name) {
    this.name = name; this.state = null; this.msgs = []; this.last = {};
    this.ws = new WebSocket('ws://localhost:' + PORT + '/ws');
    this.ready = new Promise(res => this.ws.on('open', res));
    this.ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.t === 'state') this.state = m.s;
      this.last[m.t] = m;
      this.msgs.push(m);
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  async until(fn, ms = 2000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn(this.state, this.last)) return true; await wait(15); }
    return false;
  }
  close() { this.ws.close(); }
}

async function main() {
  await new Promise(res => server.listen(PORT, res));
  console.log('server up on ' + PORT);

  // ---- lobby
  const tv = new Screen('tv'); await tv.ready;
  tv.send({ t: 'create', used: [], custom: { cats: [{ name: 'MY CATEGORY', clues: [1, 2, 3, 4, 5].map(i => ({ c: 'Custom clue ' + i, r: 'Custom response ' + i })) }], finals: [] } });
  check('room created', await tv.until((s, l) => l.created && s));
  const code = tv.last.created.code;
  const token = tv.last.created.token;
  const host = new Screen('host'); await host.ready;
  host.send({ t: 'join', code, name: 'Hosty' });
  const ps = [];
  for (const n of ['Ann', 'Ben', 'Cal']) { const p = new Screen(n); await p.ready; p.send({ t: 'join', code, name: n }); ps.push(p); }
  for (const p of [host, ...ps]) check(p.name + ' joined', await p.until((s, l) => l.joined && s));
  host.send({ t: 'host', on: true });
  for (const p of ps) p.send({ t: 'play', on: true });
  check('three podiums and a host', await tv.until(s => s.players.length === 3 && s.host && s.host.name === 'HOSTY'));
  host.send({ t: 'h', a: 'settings', packs: ['general', 'sports'], buzzSecs: 0 });
  check('settings applied', await host.until(s => s.settings.buzzSecs === 0 && s.settings.packs.length === 2));

  // ---- start
  host.send({ t: 'h', a: 'start' });
  check('game started on the board', await tv.until(s => s.phase === 'pick' && s.game && s.game.board && s.game.board.length === 6));
  const g0 = tv.state.game;
  check('custom category leads the board', g0.board[0].name === 'MY CATEGORY');
  check('values 200 to 1000', g0.board[1].clues.map(q => q.value).join() === '200,400,600,800,1000');
  check('board hides responses', JSON.stringify(tv.state).indexOf('Custom response') < 0);
  check('host sees responses', JSON.stringify(host.state.hostView.board).indexOf('Custom response') >= 0);
  const dds = host.state.hostView.board.flatMap((c, ci) => c.clues.map((q, ri) => q.dd ? { ci, ri } : null)).filter(Boolean);
  check('one Daily Double, not on the top row', dds.length === 1 && dds[0].ri > 0, JSON.stringify(dds));

  const byId = {}; for (const p of ps) byId[p.name.toUpperCase()] = p;
  const who = id => tv.state.players.find(p => p.id === id).name;
  const screenOf = id => byId[who(id)];
  const scores = () => tv.state.game.scores;

  // ---- a normal clue: pick, early buzz, open, buzz, wrong, reopen, right
  let ctl = tv.state.game.control;
  let picker = screenOf(ctl);
  const notDD = (ci, ri) => !dds.some(d => d.ci === ci && d.ri === ri);
  let pick = null;
  for (let ci = 1; ci < 6 && !pick; ci++) for (let ri = 0; ri < 5 && !pick; ri++) if (notDD(ci, ri)) pick = { ci, ri };
  const wrongPlayer = ps.find(p => p !== picker);
  wrongPlayer.send({ t: 'pick', cat: pick.ci, row: pick.ri });
  await wait(80);
  check('only the controller can pick', tv.state.phase === 'pick');
  picker.send({ t: 'pick', cat: pick.ci, row: pick.ri });
  check('clue is up, buzzers closed', await tv.until(s => s.phase === 'read' && s.game.cur && s.game.cur.text));
  const value = tv.state.game.cur.value;
  const early = ps[2];
  early.send({ t: 'buzz' });
  check('early buzz is refused with a lockout', await early.until((s, l) => l.early && l.early.until === 250));
  host.send({ t: 'h', a: 'open' });
  check('buzzers open', await tv.until(s => s.phase === 'buzz' && s.game.open));
  early.send({ t: 'buzz' });                                         // still locked out for a moment
  await wait(60);
  check('locked-out player cannot buzz straight away', tv.state.phase === 'buzz');
  await wait(260);
  ps[0].send({ t: 'buzz' }); ps[1].send({ t: 'buzz' });
  check('first buzz wins', await tv.until(s => s.phase === 'answer' && s.game.buzzed));
  const first = tv.state.game.buzzed, firstName = who(first);
  const firstScreen = screenOf(first);
  check('the buzzer knows it is in', await firstScreen.until(s => s.me.answering));
  firstScreen.send({ t: 'buzz' });
  host.send({ t: 'h', a: 'wrong' });
  check('wrong: minus the value, buzzers reopen', await tv.until(s => s.phase === 'buzz' && s.game.scores[first] === -value && s.game.tried.length === 1));
  firstScreen.send({ t: 'buzz' });
  await wait(60);
  check('a player who missed cannot buzz again', tv.state.phase === 'buzz');
  const second = ps.find(p => p !== firstScreen);
  second.send({ t: 'buzz' });
  check('someone else buzzes', await tv.until(s => s.phase === 'answer'));
  const secondId = tv.state.game.buzzed;
  host.send({ t: 'h', a: 'right' });
  check('right: plus the value, control moves, back to the board', await tv.until(s => s.phase === 'pick' && s.game.scores[secondId] === value && s.game.control === secondId && s.game.board[pick.ci].clues[pick.ri].done));
  check('response was shared when the clue ended', tv.state.game.result && tv.state.game.result.r);
  void firstName;

  // ---- nobody buzzes: host closes, reveal, continue
  pick = null;
  for (let ci = 1; ci < 6 && !pick; ci++) for (let ri = 0; ri < 5 && !pick; ri++) if (notDD(ci, ri) && !tv.state.game.board[ci].clues[ri].done) pick = { ci, ri };
  host.send({ t: 'h', a: 'pick', cat: pick.ci, row: pick.ri });        // the host can pick for the controller
  check('host picked for the controller', await tv.until(s => s.phase === 'read'));
  host.send({ t: 'h', a: 'open' });
  await tv.until(s => s.phase === 'buzz');
  host.send({ t: 'h', a: 'close' });
  check('nobody buzzed: response shown', await tv.until(s => s.phase === 'reveal' && s.game.result.r && s.game.result.why === 'time'));
  host.send({ t: 'h', a: 'continue' });
  check('back to the board, same controller', await tv.until(s => s.phase === 'pick' && s.game.control === secondId));

  // ---- the buzz window clock
  host.send({ t: 'h', a: 'settings', buzzSecs: 5 });
  await host.until(s => s.settings.buzzSecs === 5);
  pick = null;
  for (let ci = 1; ci < 6 && !pick; ci++) for (let ri = 0; ri < 5 && !pick; ri++) if (notDD(ci, ri) && !tv.state.game.board[ci].clues[ri].done) pick = { ci, ri };
  host.send({ t: 'h', a: 'pick', cat: pick.ci, row: pick.ri });
  await tv.until(s => s.phase === 'read');
  host.send({ t: 'h', a: 'open' });
  check('clock is running', await tv.until(s => s.phase === 'buzz' && s.game.windowLeft > 4000));
  // a restart in the middle of the open window: the TV hands its copy back
  await wait(400);                                                   // backups are debounced: wait for the one made after the buzzers opened
  const blob = tv.last.backup && tv.last.backup.blob;
  check('TV holds a sealed copy', !!blob && blob.length > 100);
  const roomObj = rooms.get(code);
  clearTimeout(roomObj.timer); clearTimeout(roomObj.backupTimer);
  rooms.delete(code);
  for (const p of [host, ...ps]) { p.ws.room = null; }
  const back = restoreRoom(blob, code, token, 1000);
  check('room restored from the copy', !!back && back.game.phase === 'buzz' && back.players.size === 4);
  check('the window got its time back', back.game.windowEndsAt > Date.now() + 3000);
  // everyone reconnects with their passes
  tv.state = null;
  tv.send({ t: 'watch', code, token });
  host.send({ t: 'rejoin', code, token: host.last.joined.token });
  for (const p of ps) p.send({ t: 'rejoin', code, token: p.last.joined.token });
  check('everyone is back', await tv.until(s => s && s.players.every(p => p.on) && s.host.on && s.phase === 'buzz'));
  await wait(50);
  check('scores survived', JSON.stringify(scores()) === JSON.stringify(back.game.scores));
  check('clock ran out on its own (with 5 extra seconds after the restore): response shown', await tv.until(s => s.phase === 'reveal' && s.game.result.why === 'time', 12000));
  host.send({ t: 'h', a: 'continue' });
  await tv.until(s => s.phase === 'pick');
  host.send({ t: 'h', a: 'settings', buzzSecs: 0 });

  // ---- Daily Double: wager rules
  ctl = tv.state.game.control; picker = screenOf(ctl);
  // give the controller some money first so the wager cap is interesting
  host.send({ t: 'h', a: 'adjust', id: ctl, delta: 1400 });
  await tv.until(s => s.game.scores[ctl] >= 1400);
  const myScore = scores()[ctl];
  picker.send({ t: 'pick', cat: dds[0].ci, row: dds[0].ri });
  check('Daily Double announced', await tv.until(s => s.phase === 'dd' && s.game.dd && s.game.dd.pid === ctl && s.game.dd.max === Math.max(myScore, 1000)));
  check('clue stays hidden until the wager', !tv.state.game.cur.text);
  check('phone knows it is wagering', await picker.until(s => s.me.wagering));
  picker.send({ t: 'wager', amount: 3 });
  await wait(60);
  check('wager below $5 refused', tv.state.phase === 'dd');
  picker.send({ t: 'wager', amount: myScore + 1 });
  await wait(60);
  check('wager above the max refused', tv.state.phase === 'dd');
  picker.send({ t: 'wager', amount: myScore });
  check('true Daily Double accepted', await tv.until(s => s.phase === 'ddAnswer' && s.game.dd.wager === myScore && s.game.cur.text));
  ps.find(p => p !== picker).send({ t: 'buzz' });
  await wait(50);
  check('nobody else can buzz on a Daily Double', tv.state.phase === 'ddAnswer');
  host.send({ t: 'h', a: 'right' });
  check('Daily Double doubled the money, control stays', await tv.until(s => s.phase === 'pick' && s.game.scores[ctl] === myScore * 2 && s.game.control === ctl));

  // ---- undo
  const before = JSON.stringify(scores());
  host.send({ t: 'h', a: 'adjust', id: ctl, delta: 500 });
  await tv.until(s => s.game.scores[ctl] === myScore * 2 + 500);
  host.send({ t: 'h', a: 'undo' });
  check('undo puts the score back', await tv.until(s => JSON.stringify(s.game.scores) === before));

  // ---- end round one early: Double, lowest score picks first
  host.send({ t: 'h', a: 'endRound' });
  check('Double starts', await tv.until(s => s.phase === 'pick' && s.game.round === 2 && s.game.board[0].clues[4].value === 2000));
  const low = Object.keys(scores()).reduce((a, b) => (scores()[a] <= scores()[b] ? a : b));
  check('lowest score picks first in Double', tv.state.game.control === low);
  const dds2 = host.state.hostView.board.flatMap((c, ci) => c.clues.map((q, ri) => q.dd ? ci : null)).filter(x => x != null);
  check('two Daily Doubles in different categories', dds2.length === 2 && dds2[0] !== dds2[1], JSON.stringify(dds2));
  check('round two categories are all new', !tv.state.game.board.some(c => g0.board.some(d => d.name === c.name)));

  // skip straight to Final: make sure someone is at or below zero so they sit out
  const ids = Object.keys(scores());
  const broke = ids.find(id => scores()[id] <= 0) || ids[0];
  if (scores()[broke] > 0) { host.send({ t: 'h', a: 'adjust', id: broke, delta: -scores()[broke] }); await tv.until(s => s.game.scores[broke] === 0); }
  host.send({ t: 'h', a: 'endRound' });
  check('Final begins with the category only', await tv.until(s => s.phase === 'final' && s.game.final.stage === 'wager' && s.game.final.name && !s.game.final.text));
  const f = tv.state.game.final;
  check('the broke player sits out', !f.players.includes(broke) && f.players.length === ids.filter(id => scores()[id] > 0).length);
  const eligible = f.players;
  for (const id of eligible) {
    const p = screenOf(id);
    p.send({ t: 'wager', amount: scores()[id] + 1 });
    await wait(40);
    p.send({ t: 'wager', amount: Math.floor(scores()[id] / 2) });
  }
  check('wagers in, none above the score', await tv.until(s => eligible.every(id => s.game.final.locked[id])));
  const wagers = Object.assign({}, host.state.hostView.final.wagers);
  check('wagers hidden from the TV until revealed', JSON.stringify(tv.state.game.final.shown).indexOf('"wager":' + wagers[eligible[0]]) < 0);
  host.send({ t: 'h', a: 'fClue' });
  check('clue shown, 30 second clock', await tv.until(s => s.game.final.stage === 'clue' && s.game.final.text && s.game.final.left > 29000));
  const [a, b] = eligible;
  screenOf(a).send({ t: 'fAnswer', text: 'what is a draft', lock: false });
  screenOf(a).send({ t: 'fAnswer', text: 'What is the right answer', lock: true });
  if (b) screenOf(b).send({ t: 'fAnswer', text: 'typed but never locked', lock: false });
  await wait(60);
  check('a locked answer cannot change', (screenOf(a).send({ t: 'fAnswer', text: 'changed', lock: true }), await wait(40), host.state.hostView.final.answers[a] === 'What is the right answer'));
  host.send({ t: 'h', a: 'fStop' });
  check('time called: reveal starts with the lowest score', await tv.until(s => s.game.final.stage === 'reveal' && s.game.final.order[0] === eligible.slice().sort((x, y) => scores()[x] - scores()[y])[0]));
  const order = tv.state.game.final.order;
  const startScores = Object.assign({}, scores());
  for (let i = 0; i < order.length; i++) {
    const id = order[i];
    check('answer hidden before the host shows it', tv.state.game.final.shown[i].answer === null);
    host.send({ t: 'h', a: 'fNext' });
    await tv.until(s => s.game.final.step === 1);
    const shownAns = tv.state.game.final.shown[i].answer;
    check('answer shown on the TV: ' + JSON.stringify(shownAns), shownAns === (host.state.hostView.final.answers[id] || ''));
    const correct = id === a;
    host.send({ t: 'h', a: correct ? 'fRight' : 'fWrong' });
    await tv.until(s => s.game.final.step === 2);
    check('wager applied for ' + who(id), scores()[id] === startScores[id] + (correct ? wagers[id] : -wagers[id]));
    host.send({ t: 'h', a: 'fNext' });
    await wait(60);
  }
  check('game over with a winner', await tv.until(s => s.phase === 'gameOver' && Array.isArray(s.game.winner)));
  const top = Math.max(...Object.values(scores()));
  check('winner has the top score', tv.state.game.winner.every(id => scores()[id] === top));
  check('awards handed out', (tv.state.game.awards || []).length >= 1);
  check('players see their own stats', await screenOf(a).until(s => s.me.stats && typeof s.me.stats.right === 'number'));
  host.send({ t: 'h', a: 'endGame' });
  check('back to the lobby, everyone keeps their seat', await tv.until(s => s.phase === 'lobby' && s.players.length === 3));

  for (const p of [tv, host, ...ps]) p.close();
  server.close();
  console.log(failures ? '\n' + failures + ' check(s) failed' : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
