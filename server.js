'use strict';
/*
 * Friend Jeopardy server.
 * One process holds every room in memory. The TV page creates a room, phones
 * join it with a 4-letter code, and the server is the single source of truth:
 * every change is pushed to every screen as a fresh snapshot.
 *
 * Built the same way as Friend Feud: the same join flow, the same reconnect
 * and restart-survival tricks, and the same host-on-a-phone idea.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const BANK = require('./clues');

const PORT = process.env.PORT || 3000;
const PUB_DIR = path.join(__dirname, 'public');
const FLAT = !fs.existsSync(path.join(PUB_DIR, 'index.html'));
const PUB = FLAT ? __dirname : PUB_DIR;
// Only the page files are ever handed to a browser: the clues and the server code stay here.
const PAGE_FILES = new Set(['index.html', 'tv.html', 'common.js', 'editor.js', 'style.css', 'anton.woff2', 'lobby.mp3', 'think.mp3']);
// The walkthrough video has a page of its own. Nothing in the game links to it, and its files
// (promo.html, promo.mp4, promo.jpg) are only ever served under this address.
const PROMOS = {
  '/video-clwhrautxw': { video: 'promo.mp4', poster: 'promo.jpg', title: 'Friend Jeopardy: game night, anyone?', head: 'GAME NIGHT, ANYONE?' }
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json', '.mp3': 'audio/mpeg'
};

// A fingerprint of the pages as they are right now. Every page is told which build it is, and can
// ask for the current one, so a screen left open across an update reloads itself.
const BUILD = (() => {
  const h = crypto.createHash('sha1');
  for (const f of ['index.html', 'tv.html', 'common.js', 'editor.js', 'style.css']) {
    try { h.update(fs.readFileSync(path.join(PUB, f))); } catch (e) { /* missing file: nothing to add */ }
  }
  return h.digest('hex').slice(0, 12);
})();

/* ---------------------------------------------------------------- rules */

const VALUES = [[200, 400, 600, 800, 1000], [400, 800, 1200, 1600, 2000]];   // round 1, round 2
const DD_COUNT = [1, 2];                 // Daily Doubles per round
const DD_MIN = 5;                        // the smallest Daily Double wager
const LOCKOUT_MS = 250;                  // buzzing before the host opens the buzzers costs this long
const ANSWER_SECS = 5;                   // shown on the TV after a buzz: the host still decides when time is up
const FINAL_SECS = 30;
const BUZZ_CHOICES = [0, 5, 8, 10];      // 0 = no clock: the host decides when nobody is going to buzz
const MAX_PLAYERS = 8;                   // contestants with a buzzer (plus the host)
const ROOM_IDLE_MS = 6 * 60 * 60 * 1000;

// Surviving a restart: the scoreboard keeps a sealed copy of its room and hands it back if it ever
// reconnects to a server that has forgotten it (see packRoom and restoreRoom).
const BOOT = Date.now();
const RESTORE_WINDOW_MS = Number(process.env.RESTORE_WINDOW_MS) || 10 * 60 * 1000;
const RESTORE_GRACE_MS = 5000;
const SEAT_HOLD_MS = Number(process.env.SEAT_HOLD_MS) || 30000;
const STRAGGLER_MS = Number(process.env.STRAGGLER_MS) || 3 * 60 * 1000;
const BACKUP_V = 1;
const BACKUP_DELAY_MS = 200;
const BACKUP_MAX = 380 * 1024;
const BACKUP_KEY = (() => {
  let seed = process.env.BACKUP_KEY || process.env.RENDER_SERVICE_ID;
  if (!seed) {
    const file = path.join(__dirname, '.backup-key');
    try { seed = fs.readFileSync(file, 'utf8').trim(); } catch (e) { /* first run */ }
    if (!seed) {
      seed = crypto.randomBytes(32).toString('hex');
      try { fs.writeFileSync(file, seed + '\n', { mode: 0o600 }); } catch (e) { /* read-only disk */ }
    }
  }
  return crypto.createHash('sha256').update('friend-jeopardy room backup|' + seed).digest();
})();

const rooms = new Map();

/* ------------------------------------------------------------------ http */

const server = http.createServer((req, res) => {
  let u;
  try { u = new URL(req.url, 'http://localhost'); } catch (e) { res.writeHead(400); return res.end(); }
  let p = decodeURIComponent(u.pathname);
  if (p === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (p === '/version') { res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }); return res.end(BUILD); }
  if (p === '/uptime') {
    res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    return res.end('started ' + new Date(BOOT).toISOString() + ' · up ' + Math.round((Date.now() - BOOT) / 1000) + 's');
  }
  if (p === '/qr.svg') {
    const text = (u.searchParams.get('u') || '').slice(0, 300);
    return QRCode.toString(text || ' ', { type: 'svg', margin: 1, errorCorrectionLevel: 'L' }, (err, svg) => {
      if (err) { res.writeHead(500); return res.end(); }
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' });
      res.end(svg);
    });
  }
  const promo = Object.keys(PROMOS).find(base => p === base || p.startsWith(base + '/'));
  if (promo) return sendPromo(req, res, promo, p.slice(promo.length).replace(/\/$/, ''));
  if (/^\/promo[.-]/.test(p)) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
  if (p === '/') p = '/index.html';
  if (p === '/tv') p = '/tv.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  if (FLAT && !PAGE_FILES.has(path.relative(PUB, file))) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    const ext = path.extname(file);
    if (ext === '.html') data = Buffer.from(String(data).replace('<html lang="en">', '<html lang="en" data-build="' + BUILD + '">'));
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.woff2' ? 'public, max-age=604800' : ext === '.mp3' ? 'public, max-age=3600' : 'no-cache'
    });
    res.end(data);
  });
});

// The video page and its two files. The video is sent in whatever pieces the browser asks for
// ("Range" requests): iPhones will not play a video from a server that can't do that.
function sendPromo(req, res, base, sub) {
  const P = PROMOS[base];
  const entry = { '': ['promo.html', 'text/html; charset=utf-8'], '/video.mp4': [P.video, 'video/mp4'], '/poster.jpg': [P.poster, 'image/jpeg'] }[sub];
  const gone = () => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); };
  if (!entry || (req.method !== 'GET' && req.method !== 'HEAD')) return gone();
  const file = path.join(PUB, entry[0]), type = entry[1];
  const head = { 'content-type': type, 'x-robots-tag': 'noindex, nofollow' };
  if (sub === '') {
    return fs.readFile(file, 'utf8', (err, html) => {
      if (err) return gone();
      const host = /^[a-z0-9.:-]+$/i.test(req.headers.host || '') ? req.headers.host : 'localhost';
      const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() === 'https' ? 'https' : 'http';
      const body = Buffer.from(html.split('{{HERE}}').join(proto + '://' + host + base).split('{{PATH}}').join(base).split('{{TITLE}}').join(P.title).split('{{HEAD}}').join(P.head));
      res.writeHead(200, Object.assign(head, { 'cache-control': 'no-cache', 'content-length': body.length }));
      res.end(req.method === 'HEAD' ? undefined : body);
    });
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return gone();
    let start = 0, end = st.size - 1, code = 200;
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      if (m[1] === '') start = Math.max(0, st.size - Number(m[2]));
      else { start = Number(m[1]); if (m[2]) end = Math.min(end, Number(m[2])); }
      if (start > end || start >= st.size) { res.writeHead(416, { 'content-range': 'bytes */' + st.size }); return res.end(); }
      code = 206;
      head['content-range'] = 'bytes ' + start + '-' + end + '/' + st.size;
    }
    res.writeHead(code, Object.assign(head, { 'content-length': end - start + 1, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' }));
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}

/* --------------------------------------------------------------- helpers */

const rid = (n = 12) => crypto.randomBytes(n).toString('base64url');

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCode() {
  const letters = 'BCDFGHJKLMNPQRSTVWXZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += letters[crypto.randomInt(letters.length)];
    if (!rooms.has(c)) return c;
  }
}

function clean(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// The host's own material: categories (a name and five clues, easiest first) and Final clues.
function cleanCustom(c) {
  const out = { cats: [], finals: [] };
  if (!c || typeof c !== 'object') return out;
  for (const cat of (Array.isArray(c.cats) ? c.cats.slice(0, 60) : [])) {
    if (!cat || typeof cat !== 'object') continue;
    const name = clean(cat.name, 40);
    const clues = [];
    for (const q of (Array.isArray(cat.clues) ? cat.clues.slice(0, 5) : [])) {
      if (!q) continue;
      const text = clean(q.c, 220), resp = clean(q.r, 80);
      if (text && resp) clues.push({ c: text, r: resp });
    }
    if (name && clues.length === 5) out.cats.push({ name, clues });
  }
  for (const f of (Array.isArray(c.finals) ? c.finals.slice(0, 40) : [])) {
    if (!f || typeof f !== 'object') continue;
    const name = clean(f.name, 40), text = clean(f.c, 220), resp = clean(f.r, 80);
    if (name && text && resp) out.finals.push({ name, c: text, r: resp });
  }
  return out;
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

/* ----------------------------------------------------------------- rooms */

function newRoom() {
  const room = {
    code: makeCode(),
    adminToken: rid(),
    touched: Date.now(),
    displays: new Set(),
    players: new Map(),
    order: [],            // contestants, in the order they joined: their podiums on the TV
    hostId: null,
    settings: { packs: ['general'], useCustom: true, buzzSecs: 5, final: true, dd: true },
    custom: { cats: [], finals: [] },
    used: new Set(),      // built-in categories and Final clues already seen on this TV
    game: null,
    history: [],
    fx: [],
    fxSeq: 0,
    timer: null           // the one server clock: the buzz window, or the Final countdown
  };
  rooms.set(room.code, room);
  return room;
}

function fx(room, type, data) {
  room.fx.push(Object.assign({ seq: ++room.fxSeq, type }, data || {}));
  if (room.fx.length > 14) room.fx.shift();
}

const pname = (room, id) => { const p = room.players.get(id); return p ? p.name : null; };

/* ---------------------------------------------------- surviving a restart */

function packRoom(room, lean) {
  const data = {
    v: BACKUP_V, at: Date.now(), code: room.code, adminToken: room.adminToken,
    players: [...room.players.values()].map(p => ({ id: p.id, token: p.token, name: p.name, isHost: p.isHost })),
    order: room.order, hostId: room.hostId, settings: room.settings, custom: room.custom, used: [...room.used],
    game: room.game, history: lean ? [] : room.history, fxSeq: room.fxSeq
  };
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', BACKUP_KEY, iv);
  const body = Buffer.concat([c.update(zlib.deflateRawSync(JSON.stringify(data))), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

function unpackRoom(blob) {
  const raw = Buffer.from(String(blob), 'base64');
  if (raw.length < 30) throw new Error('too short');
  const d = crypto.createDecipheriv('aes-256-gcm', BACKUP_KEY, raw.subarray(0, 12), { authTagLength: 16 });
  d.setAuthTag(raw.subarray(12, 28));
  const body = Buffer.concat([d.update(raw.subarray(28)), d.final()]);
  return JSON.parse(zlib.inflateRawSync(body, { maxOutputLength: 16 * 1024 * 1024 }));
}

function sendBackup(room) {
  if (rooms.get(room.code) !== room) return;
  const to = [...room.displays].filter(ws => ws.admin && ws.readyState === 1);
  if (!to.length) return;
  let blob;
  try {
    blob = packRoom(room, false);
    if (blob.length > BACKUP_MAX) blob = packRoom(room, true);
  } catch (e) { return console.error('backup error', e); }
  if (blob.length > BACKUP_MAX) return;
  const msg = JSON.stringify({ t: 'backup', code: room.code, blob });
  for (const ws of to) ws.send(msg);
}

function queueBackup(room) {
  if (room.backupTimer) return;
  room.backupTimer = setTimeout(() => { room.backupTimer = null; sendBackup(room); }, BACKUP_DELAY_MS);
}

function restoreRoom(blob, code, token, idle) {
  let d;
  try { d = unpackRoom(blob); } catch (e) { return null; }
  if (!d || d.v !== BACKUP_V || d.code !== code || !token || d.adminToken !== token) return null;
  if (!(Date.now() - d.at < ROOM_IDLE_MS) || rooms.has(code)) return null;
  const room = {
    code, adminToken: d.adminToken, touched: Date.now(), displays: new Set(), players: new Map(),
    order: d.order || [], hostId: d.hostId, settings: Object.assign({ packs: ['general'], useCustom: true, buzzSecs: 5, final: true, dd: true }, d.settings),
    custom: cleanCustom(d.custom), used: new Set(d.used),
    game: d.game, history: d.history || [], fx: [], fxSeq: (d.fxSeq || 0) + 50, timer: null
  };
  const hold = Date.now() + SEAT_HOLD_MS;
  for (const p of d.players) room.players.set(p.id, { id: p.id, token: p.token, name: p.name, isHost: p.isHost, connected: false, ws: null, hold, lockedUntil: 0 });
  const g = room.game;
  const used = Math.max(0, Math.min(Number(idle) || 0, 10 * 60 * 1000));
  if (g) {
    // Any clock stood still while the server was away: give it back its time, plus a moment to reconnect.
    if (g.phase === 'buzz' && g.windowEndsAt) { g.openedAt = Date.now(); g.windowEndsAt = Date.now() + Math.max(0, g.windowEndsAt - d.at - used) + RESTORE_GRACE_MS; }
    if (g.phase === 'final' && g.final && g.final.stage === 'clue' && g.final.endsAt) g.final.endsAt = Date.now() + Math.max(0, g.final.endsAt - d.at - used) + RESTORE_GRACE_MS;
  }
  try { publicState(room); hostExtras(room); } catch (e) { console.error('restore error', e); return null; }
  rooms.set(code, room);
  armTimer(room);
  room.tidyTimer = setTimeout(() => {
    room.tidyTimer = null;
    if (rooms.get(code) !== room || room.game) return;
    let gone = 0;
    for (const p of [...room.players.values()]) if (!p.connected && !p.isHost && !room.order.includes(p.id)) { room.players.delete(p.id); gone++; }
    if (gone) pushAll(room);
  }, STRAGGLER_MS);
  fx(room, 'restored');
  console.log('restored room ' + code + ' (' + room.players.size + ' players, ' + (g ? g.phase : 'lobby') + ')');
  return room;
}

/* ----------------------------------------------------------------- clues */

const packIds = () => BANK.packs.map(p => p.id);
function packPool(room, list) {
  const on = (room.settings.packs || []).filter(id => packIds().includes(id));
  const ids = on.length ? on : ['general'];
  return list.filter(x => ids.includes(x.pack));
}

/*
 * No repeats. room.used remembers every category and Final clue this TV has shown, oldest first.
 * The never-seen ones come first (shuffled), then the seen ones starting with the oldest, so nothing
 * comes back until everything else in the packs you have on has had a turn.
 */
function markUsed(room, key) {
  room.used.delete(key);
  room.used.add(key);
  if (room.used.size > 3000) room.used.delete(room.used.values().next().value);
}

function freshFirst(room, items) {
  const rank = new Map([...room.used].map((k, i) => [k, i]));
  const fresh = shuffle(items.filter(x => !rank.has(x.key)));
  const seen = items.filter(x => rank.has(x.key)).sort((a, b) => rank.get(a.key) - rank.get(b.key));
  return fresh.concat(seen);
}

const customKey = c => 'c:' + String(c.name).toLowerCase().slice(0, 40) + '|' + String(c.clues ? c.clues[0].c : c.c).toLowerCase().slice(0, 60);

// Twelve categories for the two rounds: the host's own first, then the built-in packs, no repeats.
function drawCategories(room, n) {
  const g = room.game;
  const mine = room.settings.useCustom ? room.custom.cats.map((c, i) => ({ key: customKey(c), get: () => ({ name: c.name, pack: 'custom', clues: c.clues }) })) : [];
  const built = packPool(room, BANK.cats).map(c => ({ key: c.id, get: () => c }));
  const deck = freshFirst(room, mine).concat(freshFirst(room, built)).filter(x => !g.drawn.includes(x.key));
  const out = [];
  for (const x of deck) {
    if (out.length >= n) break;
    const c = x.get();
    out.push({ name: c.name, pack: c.pack, clues: c.clues.map(q => ({ c: q.c, r: q.r })) });
    markUsed(room, x.key); g.drawn.push(x.key);
  }
  // A thin pack can run out before the board is full: start again from the oldest.
  while (out.length < n && deck.length) {
    const c = deck[out.length % deck.length].get();
    out.push({ name: c.name, pack: c.pack, clues: c.clues.map(q => ({ c: q.c, r: q.r })) });
  }
  return out;
}

function drawFinal(room) {
  const mine = room.settings.useCustom ? room.custom.finals.map(f => ({ key: customKey(f), get: () => ({ name: f.name, pack: 'custom', c: f.c, r: f.r }) })) : [];
  const built = packPool(room, BANK.finals).map(f => ({ key: f.id, get: () => f }));
  const deck = freshFirst(room, mine).concat(freshFirst(room, built));
  if (!deck.length) return null;
  const x = deck[0], f = x.get();
  markUsed(room, x.key);
  return { name: f.name, pack: f.pack, c: f.c, r: f.r };
}

function packName(id) {
  if (id === 'custom') return 'Your clues';
  const p = BANK.packs.find(p => p.id === id);
  return p ? p.name : null;
}

/* ------------------------------------------------------------ game logic */

function snapshot(room) {
  room.history.push(JSON.stringify(room.game));
  if (room.history.length > 80) room.history.shift();
}

function clearTimer(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
}

// One server clock: the buzz window while the buzzers are open, or the Final countdown.
function armTimer(room) {
  clearTimer(room);
  const g = room.game;
  if (!g) return;
  let at = null, what = null;
  if (g.phase === 'buzz' && g.windowEndsAt) { at = g.windowEndsAt; what = 'window'; }
  if (g.phase === 'final' && g.final && g.final.stage === 'clue' && g.final.endsAt) { at = g.final.endsAt; what = 'final'; }
  if (at == null) return;
  room.timer = setTimeout(() => {
    room.timer = null;
    const gg = room.game;
    if (!gg) return;
    if (what === 'window' && gg.phase === 'buzz') { timeUp(room); pushAll(room); }
    else if (what === 'final' && gg.phase === 'final' && gg.final.stage === 'clue') { finalTimeUp(room); pushAll(room); }
  }, Math.max(0, at - Date.now()));
}

function stat(room, id) {
  const g = room.game;
  if (!id || !g) return null;
  if (!g.stats) g.stats = {};
  return g.stats[id] || (g.stats[id] = { right: 0, wrong: 0, won: 0, buzzes: 0, fastest: null, early: 0, dd: 0, bigWin: 0 });
}

function contestants(room) {
  return room.order.filter(id => room.players.has(id));
}

function buildBoard(room, round) {
  const cats = drawCategories(room, 6);
  const vals = VALUES[round - 1];
  const board = cats.map(c => ({ name: c.name, pack: c.pack, clues: c.clues.map((q, i) => ({ value: vals[i], c: q.c, r: q.r, done: false, dd: false })) }));
  if (room.settings.dd) {
    // Daily Doubles never sit on the top row, and no category gets two.
    const catIdx = shuffle([0, 1, 2, 3, 4, 5]).slice(0, DD_COUNT[round - 1]);
    for (const ci of catIdx) {
      const row = [1, 2, 2, 3, 3, 3, 4, 4][crypto.randomInt(8)];
      board[ci].clues[row].dd = true;
    }
  }
  return board;
}

function startGame(room) {
  const ids = contestants(room);
  if (!ids.length || !room.hostId) return;
  room.history = [];
  const scores = {};
  for (const id of ids) scores[id] = 0;
  room.game = {
    phase: 'pick', round: 1, scores, control: ids[crypto.randomInt(ids.length)],
    drawn: [], board: null, cur: null, open: false, openedAt: null, buzzed: null, tried: [], windowEndsAt: null,
    result: null, dd: null, final: null, winner: null, stats: {}, played: 0
  };
  room.game.board = buildBoard(room, 1);
  fx(room, 'start');
  fx(room, 'round', { round: 1, control: pname(room, room.game.control) });
}

const curClue = g => (g && g.cur && g.board ? g.board[g.cur.cat].clues[g.cur.row] : null);
const boardDone = g => g.board.every(c => c.clues.every(q => q.done));
const roundMax = g => VALUES[g.round - 1][4];

function pickClue(room, cat, row, by) {
  const g = room.game;
  if (!g || g.phase !== 'pick' || !Number.isInteger(cat) || !Number.isInteger(row) || cat < 0 || cat > 5 || row < 0 || row > 4) return;
  const q = g.board[cat].clues[row];
  if (q.done) return;
  snapshot(room);
  g.cur = { cat, row };
  g.tried = []; g.buzzed = null; g.open = false; g.result = null; g.windowEndsAt = null;
  if (q.dd) {
    g.phase = 'dd';
    g.dd = { pid: g.control, wager: null, max: Math.max(g.scores[g.control] || 0, roundMax(g)) };
    const st = stat(room, g.control); if (st) st.dd++;
    fx(room, 'dd', { name: pname(room, g.control) });
  } else {
    g.phase = 'read';
    fx(room, 'clue', { cat, row, by });
  }
}

function openBuzzers(room) {
  const g = room.game;
  if (!g || g.phase !== 'read') return;
  snapshot(room);
  g.phase = 'buzz'; g.open = true; g.openedAt = Date.now(); g.buzzed = null;
  g.windowEndsAt = room.settings.buzzSecs ? Date.now() + room.settings.buzzSecs * 1000 : null;
  armTimer(room);
  fx(room, 'open');
}

function doBuzz(room, p, byHost) {
  const g = room.game;
  if (!g || !room.order.includes(p.id)) return false;
  const now = Date.now();
  if (g.phase === 'read' && g.cur && !byHost) {
    // Jumped the gun: locked out for a moment, like the real lights.
    if (g.tried.includes(p.id)) return false;
    p.lockedUntil = now + LOCKOUT_MS;
    const st = stat(room, p.id); if (st) st.early++;
    send(p.ws, { t: 'early', until: LOCKOUT_MS });
    return false;
  }
  if (g.phase !== 'buzz' || g.tried.includes(p.id)) return false;
  if (!byHost && p.lockedUntil && now < p.lockedUntil) { send(p.ws, { t: 'early', until: p.lockedUntil - now }); return false; }
  snapshot(room);
  clearTimer(room);
  g.phase = 'answer'; g.open = false; g.buzzed = p.id; g.windowEndsAt = null;
  g.answerEndsAt = now + ANSWER_SECS * 1000;
  const st = stat(room, p.id);
  if (st) {
    st.buzzes++;
    if (!byHost && g.openedAt) { const ms = now - g.openedAt; if (st.fastest == null || ms < st.fastest) st.fastest = ms; }
  }
  fx(room, 'buzz', { name: p.name, id: p.id });
  return true;
}

function judge(room, correct) {
  const g = room.game, q = curClue(g);
  if (!g || !q) return;
  if (g.phase === 'answer' && g.buzzed) {
    snapshot(room);
    const pid = g.buzzed, st = stat(room, pid);
    g.tried.push(pid);
    if (correct) {
      g.scores[pid] += q.value; if (st) { st.right++; st.won += q.value; }
      g.control = pid; q.done = true; g.played++;
      g.result = { pid, correct: true, value: q.value, r: q.r };
      fx(room, 'right', { name: pname(room, pid), value: q.value, cat: g.cur.cat, row: g.cur.row });
      g.phase = 'pick'; g.cur = null; g.buzzed = null;
      afterClue(room);
    } else {
      g.scores[pid] -= q.value; if (st) st.wrong++;
      fx(room, 'wrong', { name: pname(room, pid), value: q.value });
      const left = contestants(room).filter(id => !g.tried.includes(id));
      g.buzzed = null;
      if (left.length) {
        g.phase = 'buzz'; g.open = true; g.openedAt = Date.now();
        g.windowEndsAt = room.settings.buzzSecs ? Date.now() + room.settings.buzzSecs * 1000 : null;
        armTimer(room);
        fx(room, 'reopen');
      } else reveal(room, 'nobody');
    }
  } else if (g.phase === 'ddAnswer' && g.dd) {
    snapshot(room);
    const pid = g.dd.pid, st = stat(room, pid), w = g.dd.wager;
    if (correct) { g.scores[pid] += w; if (st) { st.right++; st.won += w; if (w > st.bigWin) st.bigWin = w; } }
    else { g.scores[pid] -= w; if (st) st.wrong++; }
    q.done = true; g.played++;
    g.result = { pid, correct, value: w, dd: true, r: q.r };
    fx(room, correct ? 'right' : 'wrong', { name: pname(room, pid), value: w, dd: true });
    // Control stays with the Daily Double player either way.
    g.phase = correct ? 'pick' : 'reveal';
    if (correct) { g.cur = null; g.dd = null; afterClue(room); }
  }
}

// Nobody is going to get it: show the response on every screen. The host taps Continue to go on.
function reveal(room, why) {
  const g = room.game, q = curClue(g);
  if (!g || !q) return;
  clearTimer(room);
  q.done = true; g.played++;
  g.phase = 'reveal'; g.open = false; g.buzzed = null; g.windowEndsAt = null;
  g.result = { pid: null, correct: false, value: q.value, why, r: q.r };
  fx(room, 'reveal', { why });
}

function timeUp(room) {
  const g = room.game;
  if (!g || g.phase !== 'buzz') return;
  snapshot(room);
  fx(room, 'timeUp');
  reveal(room, 'time');
}

function doContinue(room) {
  const g = room.game;
  if (!g || g.phase !== 'reveal') return;
  snapshot(room);
  g.phase = 'pick'; g.cur = null; g.dd = null; g.result = null;
  afterClue(room);
}

// Back on the board. If it's empty, on to the next round or to Final.
function afterClue(room) {
  const g = room.game;
  if (g.phase !== 'pick' || !boardDone(g)) return;
  nextRound(room);
}

function lowestScorer(room) {
  const ids = contestants(room);
  let best = null;
  for (const id of ids) if (best == null || room.game.scores[id] < room.game.scores[best]) best = id;
  return best;
}

function nextRound(room) {
  const g = room.game;
  if (g.round === 1) {
    g.round = 2;
    g.board = buildBoard(room, 2);
    g.cur = null; g.dd = null; g.result = null; g.phase = 'pick';
    g.control = lowestScorer(room);          // the trailing player picks first in Double
    fx(room, 'round', { round: 2, control: pname(room, g.control) });
    return;
  }
  // Final: only players with money can play.
  const eligible = contestants(room).filter(id => g.scores[id] > 0);
  const f = room.settings.final ? drawFinal(room) : null;
  if (!f || !eligible.length) return endGame(room, eligible.length ? null : 'broke');
  g.round = 3; g.board = null; g.cur = null; g.dd = null; g.result = null;
  g.phase = 'final';
  g.final = { name: f.name, pack: f.pack, c: f.c, r: f.r, stage: 'wager', players: eligible, wagers: {}, answers: {}, locked: {}, endsAt: null, order: [], idx: 0, step: 0, results: {} };
  fx(room, 'round', { round: 3 });
}

function endGame(room, note) {
  const g = room.game;
  clearTimer(room);
  g.phase = 'gameOver'; g.cur = null; g.dd = null; g.result = null;
  const ids = contestants(room);
  let top = -Infinity;
  for (const id of ids) top = Math.max(top, g.scores[id]);
  const leaders = ids.filter(id => g.scores[id] === top);
  g.winner = top > 0 || !note ? leaders : [];
  g.note = note || null;
  fx(room, 'win', { names: g.winner.map(id => pname(room, id)), tie: g.winner.length > 1 });
}

/* ---------------------------------------------------------- daily double */

function ddWager(room, pid, amount) {
  const g = room.game;
  if (!g || g.phase !== 'dd' || !g.dd || g.dd.pid !== pid) return;
  const w = Math.round(Number(amount));
  if (!Number.isFinite(w) || w < DD_MIN || w > g.dd.max) return;
  snapshot(room);
  g.dd.wager = w;
  g.phase = 'ddAnswer';
  g.answerEndsAt = Date.now() + ANSWER_SECS * 1000;   // the answer clock starts once the wager is in
  fx(room, 'ddWager', { name: pname(room, pid), wager: w, allIn: w === g.dd.max && w > roundMax(g) });
}

/* ----------------------------------------------------------------- final */

function finalWager(room, pid, amount) {
  const g = room.game, f = g && g.final;
  if (!f || f.stage !== 'wager' || !f.players.includes(pid) || f.locked[pid]) return;
  const w = Math.round(Number(amount));
  if (!Number.isFinite(w) || w < 0 || w > g.scores[pid]) return;
  snapshot(room);
  f.wagers[pid] = w; f.locked[pid] = true;
  fx(room, 'fWager', { name: pname(room, pid) });
}

function finalShowClue(room) {
  const g = room.game, f = g && g.final;
  if (!f || f.stage !== 'wager') return;
  snapshot(room);
  for (const pid of f.players) if (f.wagers[pid] == null) { f.wagers[pid] = 0; f.locked[pid] = true; }   // no wager in: that's a zero
  f.stage = 'clue'; f.locked = {};
  f.endsAt = Date.now() + FINAL_SECS * 1000;
  armTimer(room);
  fx(room, 'fClue');
}

function finalAnswer(room, pid, text, lock) {
  const g = room.game, f = g && g.final;
  if (!f || f.stage !== 'clue' || !f.players.includes(pid) || f.locked[pid]) return;
  f.answers[pid] = clean(text, 80);
  if (lock) { f.locked[pid] = true; fx(room, 'fLock', { name: pname(room, pid) }); }
  if (f.players.every(id => f.locked[id])) finalTimeUp(room);
}

function finalTimeUp(room) {
  const g = room.game, f = g && g.final;
  if (!f || f.stage !== 'clue') return;
  clearTimer(room);
  f.stage = 'reveal'; f.endsAt = null;
  for (const pid of f.players) f.locked[pid] = true;
  // Reveal from the lowest score up, like the show.
  f.order = f.players.slice().sort((a, b) => g.scores[a] - g.scores[b]);
  f.idx = 0; f.step = 0;
  fx(room, 'fTimeUp');
}

function finalStep(room, correct) {
  const g = room.game, f = g && g.final;
  if (!f || f.stage !== 'reveal') return;
  const pid = f.order[f.idx];
  if (!pid) return;
  snapshot(room);
  if (f.step === 0) { f.step = 1; fx(room, 'fAnswer', { name: pname(room, pid) }); return; }      // show their answer
  if (f.step === 1) {
    if (typeof correct !== 'boolean') return;
    const w = f.wagers[pid] || 0, st = stat(room, pid);
    f.results[pid] = correct;
    if (correct) { g.scores[pid] += w; if (st) { st.right++; st.won += w; if (w > st.bigWin) st.bigWin = w; } }
    else { g.scores[pid] -= w; if (st) st.wrong++; }
    f.step = 2;
    fx(room, correct ? 'fRight' : 'fWrong', { name: pname(room, pid), wager: w });
    return;
  }
  // step 2: next player, or the end
  f.idx++; f.step = 0;
  if (f.idx >= f.order.length) { f.stage = 'done'; endGame(room, null); }
}

/* ----------------------------------------------------------- host action */

function hostAction(room, m) {
  const g = room.game;
  switch (m.a) {
    case 'start': if (!g) startGame(room); break;
    case 'settings':
      if (typeof m.useCustom === 'boolean') room.settings.useCustom = m.useCustom;
      if (typeof m.final === 'boolean' && !g) room.settings.final = m.final;
      if (typeof m.dd === 'boolean' && !g) room.settings.dd = m.dd;
      if (BUZZ_CHOICES.includes(m.buzzSecs)) room.settings.buzzSecs = m.buzzSecs;
      if (Array.isArray(m.packs) && !g) room.settings.packs = packIds().filter(id => m.packs.includes(id));
      break;
    case 'custom': if (!g) room.custom = cleanCustom(m.custom); break;
    case 'kick': {
      const p = room.players.get(m.id);
      if (p && !p.isHost) dropPlayer(room, p, true);
      break;
    }
    case 'rename': {
      const p = room.players.get(m.id), name = clean(m.name, 12).toUpperCase();
      if (p && !p.isHost && name && ![...room.players.values()].some(x => x.name === name && x !== p)) p.name = name;
      break;
    }
    case 'pick': pickClue(room, m.cat, m.row, 'host'); break;
    case 'open': openBuzzers(room); break;
    case 'close':                                  // buzzers open, nobody will buzz: the host calls time
      if (g && g.phase === 'buzz') { snapshot(room); reveal(room, 'time'); }
      break;
    case 'manualBuzz': {                           // a phone acted up: the host buzzes for a player
      const p = room.players.get(m.id);
      if (p) doBuzz(room, p, true);
      break;
    }
    case 'clearBuzz':                              // a false buzz: back to the open buzzers, nobody charged
      if (g && g.phase === 'answer' && g.buzzed) {
        snapshot(room);
        const st = g.stats && g.stats[g.buzzed]; if (st) st.buzzes = Math.max(0, st.buzzes - 1);
        g.buzzed = null; g.phase = 'buzz'; g.open = true; g.openedAt = Date.now();
        g.windowEndsAt = room.settings.buzzSecs ? Date.now() + room.settings.buzzSecs * 1000 : null;
        armTimer(room);
        fx(room, 'rebuzz');
      }
      break;
    case 'right': judge(room, true); break;
    case 'wrong': judge(room, false); break;
    case 'skip':                                   // take a clue off the board without playing it
      if (g && (g.phase === 'read' || g.phase === 'buzz' || g.phase === 'answer' || g.phase === 'dd' || g.phase === 'ddAnswer')) { snapshot(room); reveal(room, 'skip'); }
      break;
    case 'continue': doContinue(room); break;
    case 'control':                                // hand the board to someone
      if (g && g.phase === 'pick' && room.order.includes(m.id)) { snapshot(room); g.control = m.id; fx(room, 'control', { name: pname(room, m.id) }); }
      break;
    case 'ddWager': if (g && g.dd) ddWager(room, g.dd.pid, m.amount); break;
    case 'adjust': {
      const p = room.players.get(m.id);
      if (g && p && room.order.includes(p.id) && Number.isFinite(m.delta)) { snapshot(room); g.scores[p.id] += Math.round(m.delta); }
      break;
    }
    case 'endRound':                               // clear what's left of the board and move on
      if (g && (g.phase === 'pick' || g.phase === 'reveal') && g.board) {
        snapshot(room);
        for (const c of g.board) for (const q of c.clues) q.done = true;
        g.phase = 'pick'; g.cur = null; g.dd = null; g.result = null;
        nextRound(room);
      }
      break;
    case 'fWager': if (g && g.final) finalWager(room, m.id, m.amount); break;   // the host enters a wager for someone
    case 'fClue': finalShowClue(room); break;
    case 'fStop': if (g && g.final && g.final.stage === 'clue') { snapshot(room); finalTimeUp(room); } break;
    case 'fNext': finalStep(room, null); break;
    case 'fRight': finalStep(room, true); break;
    case 'fWrong': finalStep(room, false); break;
    case 'fSkip':                                  // call off Final: the scores stand
      if (g && g.final && g.final.stage !== 'done') { snapshot(room); endGame(room, null); }
      break;
    case 'undo':
      if (g && room.history.length) {
        room.game = JSON.parse(room.history.pop());
        const gg = room.game;
        // A clock that was running when the snapshot was taken gets fresh time rather than none.
        if (gg.phase === 'buzz' && gg.windowEndsAt) { gg.openedAt = Date.now(); gg.windowEndsAt = Date.now() + (room.settings.buzzSecs || 5) * 1000; }
        if (gg.phase === 'final' && gg.final && gg.final.stage === 'clue') gg.final.endsAt = Math.max(gg.final.endsAt || 0, Date.now() + 5000);
        armTimer(room);
        fx(room, 'undo');
      }
      break;
    case 'endGame':
      clearTimer(room);
      room.game = null; room.history = [];
      fx(room, 'lobby');
      break;
  }
}

/* ----------------------------------------------------------------- state */

const money = n => (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US');

function publicState(room) {
  const g = room.game;
  const pl = id => { const p = room.players.get(id); return p ? { id: p.id, name: p.name, on: p.connected } : null; };
  const s = {
    code: room.code,
    phase: g ? g.phase : 'lobby',
    players: contestants(room).map(pl).filter(Boolean),
    host: room.hostId ? pl(room.hostId) : null,
    settings: room.settings,
    packs: BANK.packs.map(p => ({ id: p.id, name: p.name, blurb: p.blurb, adult: !!p.adult, count: p.count })),
    customCount: room.custom.cats.length, customFinals: room.custom.finals.length,
    maxPlayers: MAX_PLAYERS, buzzChoices: BUZZ_CHOICES,
    fx: room.fx,
    game: null
  };
  if (g) {
    const q = curClue(g);
    const showClue = ['read', 'buzz', 'answer', 'reveal', 'ddAnswer'].includes(g.phase);
    s.game = {
      round: g.round, scores: g.scores, control: g.control, played: g.played,
      board: g.board ? g.board.map(c => ({ name: c.name, pack: packName(c.pack), clues: c.clues.map(x => ({ value: x.value, done: x.done })) })) : null,
      cur: g.cur ? { cat: g.cur.cat, row: g.cur.row, value: q.value, category: g.board[g.cur.cat].name, text: showClue ? q.c : null, dd: !!q.dd } : null,
      open: g.open, buzzed: g.buzzed, tried: g.tried,
      windowLeft: g.phase === 'buzz' && g.windowEndsAt ? Math.max(0, g.windowEndsAt - Date.now()) : null,
      answerLeft: (g.phase === 'answer' || g.phase === 'ddAnswer') && g.answerEndsAt ? Math.max(0, g.answerEndsAt - Date.now()) : null,
      result: g.result,                               // includes the response once a clue is over
      dd: g.dd ? { pid: g.dd.pid, max: g.dd.max, min: DD_MIN, wager: g.phase === 'ddAnswer' || g.phase === 'reveal' ? g.dd.wager : null } : null,
      final: null, winner: g.winner, note: g.note || null,
      awards: g.phase === 'gameOver' ? awards(room) : null
    };
    if (g.final) {
      const f = g.final, revealing = f.stage === 'reveal' || f.stage === 'done';
      const cur = revealing ? f.order[f.idx] : null;
      s.game.final = {
        stage: f.stage, name: f.name, pack: packName(f.pack), seconds: FINAL_SECS,
        text: f.stage === 'wager' ? null : f.c,
        response: f.stage === 'done' ? f.r : null,          // the correct response waits until everyone has been judged
        players: f.players, locked: f.locked,
        left: f.stage === 'clue' && f.endsAt ? Math.max(0, f.endsAt - Date.now()) : null,
        order: f.order, idx: f.idx, step: f.step, cur,
        // Each player's answer and wager come out one at a time, in order.
        shown: f.order.map((pid, i) => {
          const done = i < f.idx || f.stage === 'done';
          const now = i === f.idx && f.stage === 'reveal';
          return { pid, answer: done || (now && f.step >= 1) ? (f.answers[pid] || '') : null, wager: done || (now && f.step >= 2) ? f.wagers[pid] : null, correct: done || (now && f.step >= 2) ? !!f.results[pid] : null };
        })
      };
    }
  }
  return s;
}

function hostExtras(room) {
  const g = room.game;
  const h = { canUndo: room.history.length > 0, custom: room.custom, bank: { cats: BANK.cats.length, finals: BANK.finals.length } };
  if (g) {
    if (g.board) h.board = g.board.map(c => ({ clues: c.clues.map(x => ({ c: x.c, r: x.r, dd: x.dd })) }));
    const q = curClue(g);
    if (q) h.cur = { c: q.c, r: q.r };
    if (g.final) h.final = { c: g.final.c, r: g.final.r, wagers: g.final.wagers, answers: g.final.answers };
  }
  return h;
}

function stateFor(room, pub, p) {
  const s = Object.assign({}, pub);
  const g = room.game;
  const playing = room.order.includes(p.id);
  s.me = { id: p.id, name: p.name, isHost: p.isHost, playing, lockedFor: p.lockedUntil ? Math.max(0, p.lockedUntil - Date.now()) : 0 };
  if (p.isHost) s.hostView = hostExtras(room);
  if (g && playing) {
    s.me.score = g.scores[p.id];
    s.me.control = g.control === p.id && g.phase === 'pick';
    s.me.canBuzz = (g.phase === 'read' || g.phase === 'buzz') && !g.tried.includes(p.id);
    s.me.tried = g.tried.includes(p.id);
    s.me.answering = g.buzzed === p.id || (g.phase === 'ddAnswer' && g.dd && g.dd.pid === p.id);
    s.me.wagering = g.phase === 'dd' && g.dd && g.dd.pid === p.id;
    if (g.final) {
      const f = g.final;
      s.me.final = { in: f.players.includes(p.id), wager: f.wagers[p.id], answer: f.answers[p.id] || '', locked: !!f.locked[p.id] };
    }
    if (g.phase === 'gameOver') {
      const st = (g.stats && g.stats[p.id]) || {};
      s.me.stats = { right: st.right || 0, wrong: st.wrong || 0, won: st.won || 0, buzzes: st.buzzes || 0, fastest: st.fastest == null ? null : st.fastest, dd: st.dd || 0 };
      s.me.awards = (pub.game.awards || []).filter(a => a.id === p.id).map(a => a.key);
    }
  }
  return s;
}

function awards(room) {
  const g = room.game;
  const rows = Object.keys(g.stats || {}).map(id => { const p = room.players.get(id); return p && room.order.includes(id) ? { id, name: p.name, s: g.stats[id] } : null; }).filter(Boolean);
  const out = [];
  const sharp = rows.filter(r => r.s.right > 0).sort((a, b) => b.s.right - a.s.right || a.s.wrong - b.s.wrong)[0];
  if (sharp) out.push({ key: 'sharp', title: 'MOST CORRECT', id: sharp.id, name: sharp.name, note: sharp.s.right + ' right · ' + money(sharp.s.won) + ' won' });
  const fast = rows.filter(r => r.s.fastest != null).sort((a, b) => a.s.fastest - b.s.fastest)[0];
  if (fast) out.push({ key: 'fast', title: 'FASTEST BUZZER', id: fast.id, name: fast.name, note: (fast.s.fastest / 1000).toFixed(2) + ' seconds' });
  const risk = rows.filter(r => r.s.bigWin > 0).sort((a, b) => b.s.bigWin - a.s.bigWin)[0];
  if (risk) out.push({ key: 'risk', title: 'BIGGEST WAGER WON', id: risk.id, name: risk.name, note: money(risk.s.bigWin) });
  const miss = rows.filter(r => r.s.wrong > 0).sort((a, b) => b.s.wrong - a.s.wrong || a.s.right - b.s.right)[0];
  if (miss && out.length < 4) out.push({ key: 'miss', title: 'MOST WRONG', id: miss.id, name: miss.name, note: miss.s.wrong + ' wrong' + (miss.s.early ? ' · ' + miss.s.early + ' early buzz' + (miss.s.early === 1 ? '' : 'es') : '') });
  return out.slice(0, 3);
}

function pushAll(room) {
  room.touched = Date.now();
  const pub = publicState(room);
  if (room.displays.size) {
    const d = JSON.stringify({ t: 'state', s: Object.assign({}, pub, { display: true, used: [...room.used] }) });
    for (const ws of room.displays) if (ws.readyState === 1) ws.send(d);
  }
  for (const p of room.players.values()) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify({ t: 'state', s: stateFor(room, pub, p) }));
  }
  queueBackup(room);
}

/* -------------------------------------------------------------- messages */

function dropPlayer(room, p, kicked) {
  const i = room.order.indexOf(p.id);
  if (i >= 0) room.order.splice(i, 1);
  if (room.hostId === p.id) room.hostId = null;
  room.players.delete(p.id);
  const g = room.game;
  if (g && room.order.length) {
    if (g.control === p.id && g.phase === 'pick') g.control = room.order[0];
    if (g.buzzed === p.id) { g.buzzed = null; g.phase = 'buzz'; g.open = true; g.openedAt = Date.now(); g.windowEndsAt = room.settings.buzzSecs ? Date.now() + room.settings.buzzSecs * 1000 : null; armTimer(room); }
    if (g.final) { g.final.players = g.final.players.filter(id => id !== p.id); g.final.order = g.final.order.filter(id => id !== p.id); if (g.final.idx >= g.final.order.length && g.final.stage === 'reveal') { g.final.stage = 'done'; endGame(room, null); } }
  }
  if (p.ws) {
    send(p.ws, { t: 'left', kicked: !!kicked });
    p.ws.room = null; p.ws.pid = null;
  }
}

function attach(ws, room, p) {
  if (p.ws && p.ws !== ws) {
    send(p.ws, { t: 'left', replaced: true });
    p.ws.room = null; p.ws.pid = null;
    try { p.ws.close(); } catch (e) { /* ignore */ }
  }
  p.ws = ws; p.connected = true; p.hold = 0;
  ws.room = room; ws.pid = p.id;
}

const justStarted = () => Date.now() - BOOT < RESTORE_WINDOW_MS;

function showOn(ws, room, admin) {
  if (ws.display && ws.room && ws.room !== room) ws.room.displays.delete(ws);
  ws.room = room; ws.display = true; ws.admin = admin;
  room.displays.add(ws);
}

function onMessage(ws, m) {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'ping') return;

  if (m.t === 'create') {
    const room = newRoom();
    if (Array.isArray(m.used)) for (const id of m.used.slice(-3000)) if (typeof id === 'string' && id) room.used.add(id.slice(0, 160));
    room.custom = cleanCustom(m.custom);
    showOn(ws, room, true);
    send(ws, { t: 'created', code: room.code, token: room.adminToken });
    return pushAll(room);
  }

  if (m.t === 'watch' || m.t === 'restore') {
    const code = clean(m.code, 4).toUpperCase();
    let room = rooms.get(code), restored = false;
    if (!room && m.t === 'restore' && typeof m.blob === 'string' && m.blob.length <= BACKUP_MAX) {
      room = restoreRoom(m.blob, code, m.token, m.idle);
      restored = !!room;
    }
    if (!room) return send(ws, { t: 'error', code: 'noroom', msg: 'That game is no longer running.', wait: m.t === 'watch' && justStarted() });
    showOn(ws, room, m.token === room.adminToken);
    send(ws, { t: 'watching', code: room.code, admin: ws.admin, restored });
    return pushAll(room);
  }

  if (m.t === 'join') {
    const room = rooms.get(clean(m.code, 4).toUpperCase());
    if (!room) return send(ws, { t: 'error', code: 'noroom', msg: "Can't find that room. Check the 4-letter code on the TV.", wait: justStarted() });
    const name = clean(m.name, 12).toUpperCase();
    if (!name) return send(ws, { t: 'error', msg: 'Enter your name.' });
    let p = [...room.players.values()].find(x => x.name === name);
    if (p) {
      if (p.connected) return send(ws, { t: 'error', msg: 'Someone is already playing as ' + name + '. Pick another name.' });
      if (p.hold && Date.now() < p.hold) return send(ws, { t: 'error', msg: name + ' is still reconnecting. Try again in a few seconds, or pick another name.' });
      p.token = rid();
    } else {
      if (room.players.size >= MAX_PLAYERS + 1) return send(ws, { t: 'error', msg: 'This room is full: ' + MAX_PLAYERS + ' players and a host.' });
      p = { id: rid(6), token: rid(), name, isHost: false, connected: true, ws: null, lockedUntil: 0 };
      room.players.set(p.id, p);
    }
    attach(ws, room, p);
    send(ws, { t: 'joined', code: room.code, token: p.token, id: p.id });
    return pushAll(room);
  }

  if (m.t === 'rejoin') {
    const room = rooms.get(clean(m.code, 4).toUpperCase());
    const p = room && [...room.players.values()].find(x => x.token === m.token);
    if (!p) return send(ws, { t: 'error', code: 'noroom', msg: 'That game has ended.', wait: !room && justStarted() });
    attach(ws, room, p);
    send(ws, { t: 'joined', code: room.code, token: p.token, id: p.id });
    return pushAll(room);
  }

  const room = ws.room;
  if (!room) return;

  if (ws.display) {
    if (m.t === 'custom' && ws.admin && !room.game) { room.custom = cleanCustom(m.custom); pushAll(room); }
    return;
  }

  const p = room.players.get(ws.pid);
  if (!p) return;
  const g = room.game;

  switch (m.t) {
    case 'play':                                   // take a podium (or give it up, between games)
      if (m.on) {
        if (g) break;
        if (p.isHost) { p.isHost = false; room.hostId = null; }
        if (!room.order.includes(p.id)) { if (room.order.length >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'All ' + MAX_PLAYERS + ' podiums are taken.' }); break; } room.order.push(p.id); }
      } else if (!g) {
        const i = room.order.indexOf(p.id); if (i >= 0) room.order.splice(i, 1);
      }
      break;
    case 'host': {
      if (m.on) {
        const cur = room.hostId && room.players.get(room.hostId);
        if (cur && cur.id !== p.id && cur.connected) { send(ws, { t: 'error', msg: cur.name + ' is already the host.' }); break; }
        if (g && room.order.includes(p.id)) break;           // a contestant can't switch to hosting mid-game
        if (cur) cur.isHost = false;
        const i = room.order.indexOf(p.id); if (i >= 0) room.order.splice(i, 1);
        p.isHost = true; room.hostId = p.id;
      } else if (p.isHost && !g) { p.isHost = false; room.hostId = null; }
      break;
    }
    case 'buzz': if (!doBuzz(room, p, false)) return; break;
    case 'pick': if (g && g.control === p.id) pickClue(room, m.cat, m.row, 'player'); break;
    case 'wager':
      if (g && g.phase === 'dd') ddWager(room, p.id, m.amount);
      else if (g && g.final) finalWager(room, p.id, m.amount);
      break;
    case 'fAnswer': if (g && g.final) finalAnswer(room, p.id, m.text, !!m.lock); break;
    case 'leave': dropPlayer(room, p, false); break;
    case 'h': if (p.isHost) hostAction(room, m); break;
    default: return;
  }
  pushAll(room);
}

function onClose(ws) {
  const room = ws.room;
  if (!room) return;
  if (ws.display) { room.displays.delete(ws); return; }
  const p = room.players.get(ws.pid);
  if (p && p.ws === ws) {
    p.connected = false; p.ws = null;
    if (!room.game && !room.order.includes(p.id) && !p.isHost) room.players.delete(p.id);
    pushAll(room);
  }
}

/* ------------------------------------------------------------- websocket */

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    try { onMessage(ws, m); } catch (e) { console.error('message error', e); }
  });
  ws.on('close', () => { try { onClose(ws); } catch (e) { console.error('close error', e); } });
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignore */ }
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.touched > ROOM_IDLE_MS) { clearTimer(room); clearTimeout(room.backupTimer); clearTimeout(room.tidyTimer); rooms.delete(code); }
  }
}, 30000);

if (require.main === module) {
  server.listen(PORT, () => console.log('Friend Jeopardy server running on port ' + PORT));
  let stopping = false;
  const stop = () => {
    if (stopping) return; stopping = true;
    for (const room of rooms.values()) { try { clearTimeout(room.backupTimer); room.backupTimer = null; sendBackup(room); } catch (e) { /* keep going */ } }
    setTimeout(() => process.exit(0), 400);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { server, rooms, packRoom, unpackRoom, restoreRoom };
