/* Shared by the TV page and the phone page. */
(function () {
  'use strict';
  var F = window.Game = {};

  // Change this to rename the game everywhere.
  F.TITLE = 'FRIEND JEOPARDY';
  // Shown small on the start screens. Goes up with every change; CHANGELOG.md says what each one was.
  F.VERSION = '1.1';
  // Shown in the TV lobby while lobby.mp3 is playing (if you add one). Leave empty for no credit line.
  F.MUSIC_CREDIT = '';

  F.$ = function (sel, root) { return (root || document).querySelector(sel); };
  F.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  // $1,200 and -$400
  F.money = function (n) { n = Number(n) || 0; return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US'); };

  F.store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } }
  };

  /* ---- live connection with automatic reconnect ---- */
  F.connect = function (opts) {
    var ws = null, timer = null, tries = 0, stopped = false;
    var myBuild = document.documentElement.getAttribute('data-build');
    function freshCheck() {
      if (!myBuild || !window.fetch) return;
      fetch('/version', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (v) {
        if (!/^[0-9a-f]{12}$/.test(v) || v === myBuild) return;
        var last = Number(F.store.get('jep.reloadAt', 0));
        if (Date.now() - last < 30000) return;
        F.store.set('jep.reloadAt', Date.now());
        try { sessionStorage.setItem('jep.auto', '1'); } catch (e) { /* private mode */ }
        location.reload();
      }).catch(function () { /* offline: try again next time */ });
    }
    function open() {
      timer = null;
      if (stopped) return;
      try {
        ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
      } catch (e) { return retry(); }
      var mine = ws;
      mine.onopen = function () {
        tries = 0;
        freshCheck();
        if (opts.onStatus) opts.onStatus(true);
        var h = opts.hello && opts.hello();
        if (h) mine.send(JSON.stringify(h));
      };
      mine.onmessage = function (e) {
        var m; try { m = JSON.parse(e.data); } catch (err) { return; }
        opts.onMessage(m);
      };
      mine.onclose = function () {
        if (ws !== mine) return;
        if (opts.onStatus) opts.onStatus(false);
        retry();
      };
      mine.onerror = function () { try { mine.close(); } catch (e) { /* ignore */ } };
    }
    function retry() {
      if (stopped || timer) return;
      timer = setTimeout(open, Math.min(4000, 300 + 500 * tries++));
    }
    var api = {
      send: function (m) {
        if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; }
        return false;
      },
      stop: function () { stopped = true; if (timer) clearTimeout(timer); try { ws.close(); } catch (e) { /* ignore */ } }
    };
    open();
    setInterval(function () { api.send({ t: 'ping' }); }, 20000);
    setInterval(function () { try { fetch('/health').catch(function () {}); freshCheck(); } catch (e) { /* ignore */ } }, 4 * 60 * 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !stopped && (!ws || ws.readyState > 1)) {
        if (timer) { clearTimeout(timer); timer = null; }
        tries = 0; open();
      }
    });
    return api;
  };

  /* ---- keep the screen awake while the game is open ---- */
  F.stayAwake = function () {
    var lock = null;
    function ask() {
      if (!navigator.wakeLock || document.hidden) return;
      navigator.wakeLock.request('screen').then(function (l) { lock = l; }).catch(function () {});
    }
    ask();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) ask(); });
    document.addEventListener('click', function once() { if (!lock) ask(); }, { passive: true });
  };

  /* ---- shrink text until it fits on one line ---- */
  F.fit = function (el, min) {
    el.style.fontSize = '';
    var size = parseFloat(getComputedStyle(el).fontSize);
    var floor = min || size * 0.45;
    var guard = 0;
    while (el.scrollWidth > el.clientWidth + 1 && size > floor && guard++ < 60) {
      size -= Math.max(1, size * 0.05);
      el.style.fontSize = size + 'px';
    }
  };
  /* ---- shrink a block of text until it fits its box, height included ---- */
  F.fitBox = function (el, min) {
    el.style.fontSize = '';
    var size = parseFloat(getComputedStyle(el).fontSize);
    var floor = min || size * 0.4;
    var guard = 0;
    while ((el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) && size > floor && guard++ < 60) {
      size -= Math.max(1, size * 0.06);
      el.style.fontSize = size + 'px';
    }
  };

  /* ---- motion helpers ---- */
  var calm = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  F.motionOK = function () { return !(calm && calm.matches); };
  F.anim = function (el, frames, opts) {
    if (!el || !el.animate || !F.motionOK()) return null;
    try { return el.animate(frames, opts); } catch (e) { return null; }
  };
  F.bump = function (el, scale) {
    return F.anim(el, [{ transform: 'scale(1)' }, { transform: 'scale(' + (scale || 1.2) + ')', offset: 0.4 }, { transform: 'scale(1)' }],
      { duration: 380, easing: 'cubic-bezier(.3, 1.3, .5, 1)' });
  };
  F.shake = function (el) {
    return F.anim(el, [0, -6, 12, -18, 18, -14, 12, -8, 4, 0].map(function (x) { return { transform: 'translateX(' + x + 'px)' }; }), { duration: 480, easing: 'ease-out' });
  };

  /* ---- redraw a block of HTML without throwing away what is already on screen ----
     data-key="..." (or an id) marks an element as "the same one" between redraws.
     data-live means "leave my contents alone": a script is animating them. */
  function keyOf(n) { return n.nodeType === 1 ? (n.getAttribute('data-key') || n.id || null) : null; }
  function morphKids(from, to) {
    var want = {}, cur = from.firstChild, next = to.firstChild, n, k, hit, c, clear;
    function id(x) { var kk = keyOf(x); return kk ? x.nodeName + '|' + kk : null; }
    function drop(x) { if (x === cur) cur = cur.nextSibling; from.removeChild(x); }
    for (n = to.firstChild; n; n = n.nextSibling) if (id(n)) want[id(n)] = 1;
    while (next) {
      n = next; next = next.nextSibling;
      while (cur && id(cur) && !want[id(cur)]) drop(cur);
      k = id(n); hit = null;
      for (c = cur; c; c = c.nextSibling) if (k ? id(c) === k : (!id(c) && c.nodeName === n.nodeName)) { hit = c; break; }
      if (hit && hit !== cur) {
        clear = true;
        for (c = cur; c !== hit; c = c.nextSibling) if (id(c) && want[id(c)]) { clear = false; break; }
        if (clear) while (cur !== hit) drop(cur);
      }
      if (hit) {
        if (hit === cur) cur = cur.nextSibling; else from.insertBefore(hit, cur);
        morphNode(hit, n);
      } else from.insertBefore(n, cur);
    }
    while (cur) drop(cur);
  }
  function morphNode(a, b) {
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    var i, at, name;
    for (i = a.attributes.length - 1; i >= 0; i--) {
      name = a.attributes[i].name;
      if (!b.hasAttribute(name) && name.indexOf('data-fx-') !== 0) a.removeAttribute(name);
    }
    for (i = 0; i < b.attributes.length; i++) {
      at = b.attributes[i];
      if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    }
    if (a.nodeName === 'INPUT' || a.nodeName === 'TEXTAREA') {
      if (document.activeElement !== a) { var v = b.getAttribute('value') || ''; if (a.value !== v) a.value = v; }
      return;
    }
    if (a.nodeName === 'SELECT' && a.options.length === b.options.length) {
      var same = true;
      for (i = 0; i < a.options.length; i++) if (a.options[i].value !== b.options[i].value || a.options[i].text !== b.options[i].text) same = false;
      if (same) return;
    }
    if (a.hasAttribute('data-live')) return;
    morphKids(a, b);
  }
  F.morph = function (root, html) {
    var t = document.createElement('template');
    t.innerHTML = html;
    morphKids(root, t.content);
  };

  /* ---- count a number up or down (money values keep their $ and commas) ---- */
  F.countTo = function (el, to, ms, fmt) {
    fmt = fmt || F.money;
    var from = el._n == null ? to : el._n;
    el._n = to;
    if (el._raf) cancelAnimationFrame(el._raf);
    if (from === to || !ms || !F.motionOK()) { el.textContent = fmt(to); return; }
    var t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / ms);
      el.textContent = fmt(Math.round(from + (to - from) * k));
      if (k < 1) el._raf = requestAnimationFrame(step);
    })(t0);
  };

  /* Buttons stay pressed for a beat even on a quick tap, so every tap is felt. */
  F.pressFx = function () {
    var held = null, t0 = 0;
    function release() {
      var b = held; held = null;
      if (b) setTimeout(function () { b.removeAttribute('data-fx-press'); }, Math.max(0, 110 - (performance.now() - t0)));
    }
    document.addEventListener('pointerdown', function (e) {
      var b = e.target.closest ? e.target.closest('button, a.tvbtn, a.link') : null;
      if (!b || b.disabled) return;
      if (held && held !== b) held.removeAttribute('data-fx-press');
      held = b; t0 = performance.now();
      b.setAttribute('data-fx-press', '');
    }, { passive: true });
    ['pointerup', 'pointercancel', 'blur'].forEach(function (ev) { addEventListener(ev, release, { passive: true }); });
    document.addEventListener('touchstart', function () {}, { passive: true });
  };

  /* ---- sound effects, synthesized so there are no audio files to load ---- */
  F.sfx = (function () {
    var ctx = null, muted = false, master = null;
    function ac() {
      if (!ctx) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (C) { ctx = new C(); master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination); }
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(o) {
      var c = ac(); if (!c || muted) return;
      var t = c.currentTime + (o.t || 0), d = o.d || 0.3;
      var osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.g || 0.3, t + 0.012);
      if (o.hold) g.gain.setValueAtTime(o.g || 0.3, t + d - 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + d + 0.05);
    }
    function bell(f, t, g) {
      tone({ f: f, t: t, d: 1.2, g: g }); tone({ f: f * 2, t: t, d: 0.7, g: g * 0.4 }); tone({ f: f * 3.01, t: t, d: 0.4, g: g * 0.2 });
    }
    function buzzer(t, d) {
      tone({ f: 138, type: 'sawtooth', t: t, d: d, g: 0.35, hold: true });
      tone({ f: 146, type: 'square', t: t, d: d, g: 0.2, hold: true });
      tone({ f: 92, type: 'sawtooth', t: t, d: d, g: 0.3, hold: true });
    }
    return {
      unlock: ac,
      ctx: ac,
      out: function () { ac(); return master; },
      mute: function (v) { muted = v; if (master) master.gain.setTargetAtTime(v ? 0 : 1, ctx.currentTime, 0.03); },
      isMuted: function () { return muted; },
      ding: function () { bell(1318.5, 0, 0.3); },                                                   // a buzz-in
      right: function () { [784, 1047, 1319].forEach(function (f, i) { tone({ f: f, type: 'triangle', t: i * 0.09, d: 0.35, g: 0.22 }); }); },
      wrong: function () { buzzer(0, 0.55); },
      timeUp: function () { buzzer(0, 0.5); buzzer(0.6, 0.7); },
      early: function () { tone({ f: 330, type: 'square', d: 0.12, g: 0.12 }); },
      tick: function () { tone({ f: 1000, type: 'square', d: 0.04, g: 0.1 }); },
      lock: function () { tone({ f: 660, type: 'triangle', d: 0.09, g: 0.18 }); },
      join: function () { tone({ f: 660, d: 0.09, g: 0.14 }); tone({ f: 990, t: 0.08, d: 0.2, g: 0.14 }); },
      fill: function (i) { tone({ f: 440 + i * 35, type: 'triangle', d: 0.07, g: 0.1 }); },          // the board filling in, one tile at a time
      pick: function () { tone({ f: 523, type: 'triangle', d: 0.1, g: 0.14 }); tone({ f: 784, type: 'triangle', t: 0.07, d: 0.22, g: 0.14 }); },
      dd: function () {                                                                              // the Daily Double sting
        [392, 523, 659, 784].forEach(function (f, i) { tone({ f: f, type: 'sawtooth', t: i * 0.08, d: 0.2, g: 0.12 }); });
        [523, 659, 784, 1047].forEach(function (f) { tone({ f: f, type: 'sawtooth', t: 0.34, d: 1.3, g: 0.08, hold: true }); });
        bell(2093, 0.36, 0.22);
      },
      round: function () {
        [392, 523, 659].forEach(function (f, i) { tone({ f: f, type: 'triangle', t: i * 0.1, d: 0.16, g: 0.2 }); });
        bell(1047, 0.32, 0.26);
      },
      win: function () {
        [523, 523, 523, 659, 784, 659, 784, 1047].forEach(function (f, i) { tone({ f: f, type: 'triangle', t: i * 0.15, d: i === 7 ? 1.2 : 0.22, g: 0.28 }); });
        [262, 330, 392].forEach(function (f) { tone({ f: f, type: 'sawtooth', t: 1.05, d: 1.2, g: 0.08 }); });
      },
      lose: function () { [392, 370, 349, 330].forEach(function (f, i) { tone({ f: f, type: 'triangle', t: i * 0.25, d: i === 3 ? 0.9 : 0.3, g: 0.24 }); }); },
      whoosh: function () { tone({ f: 220, f2: 880, type: 'sine', d: 0.45, g: 0.08 }); }
    };
  })();

  /* ---- music ----
     Two things can play. The lobby loop plays a recording named lobby.mp3 if you add one to the
     site (nothing plays otherwise). The Final "thinking" music is an original 30-second tune
     synthesized below, unless a recording named think.mp3 is on the site, in which case that
     plays instead. Both run through the same volume as the sound effects. */
  F.music = (function () {
    var TARGET = 0.07;
    function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
    function voice(c, dest, m, t, d, g, type, cut) {
      var o = c.createOscillator(), f = c.createBiquadFilter(), gn = c.createGain();
      o.type = type || 'triangle'; o.frequency.setValueAtTime(hz(m), t);
      f.type = 'lowpass'; f.frequency.setValueAtTime(cut || 2400, t); f.frequency.exponentialRampToValueAtTime(Math.max(300, (cut || 2400) * 0.4), t + d);
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.02);
      gn.gain.exponentialRampToValueAtTime(g * 0.5, t + d * 0.6); gn.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(f); f.connect(gn); gn.connect(dest); o.start(t); o.stop(t + d + 0.05);
    }
    // An original waltz in F major: 24 bars in 30 seconds, a walking bass, a soft chord on beats two
    // and three, and a singing melody that climbs and settles. It ends on a held chord as time runs out.
    var BEAT = 30 / 72;
    var BARS = [[53, 65, 69, 72], [53, 65, 69, 72], [55, 65, 70, 74], [55, 65, 70, 74], [48, 64, 67, 72], [48, 64, 67, 72], [53, 65, 69, 72], [53, 65, 69, 72],
      [50, 65, 69, 74], [50, 65, 69, 74], [55, 65, 70, 74], [55, 65, 70, 74], [48, 64, 67, 72], [48, 64, 67, 72], [53, 65, 69, 72], [53, 65, 69, 72],
      [53, 65, 69, 72], [57, 65, 69, 72], [58, 65, 70, 74], [58, 65, 70, 74], [48, 64, 67, 72], [48, 64, 67, 72], [53, 65, 69, 72], [53, 65, 69, 72]];
    var MEL = [[77, 3], [76, 1], [74, 1], [72, 1], [74, 3], [72, 1], [70, 1], [69, 1], [67, 3], [69, 1], [70, 1], [72, 1], [69, 3], [77, 3],
      [81, 3], [79, 1], [77, 1], [76, 1], [77, 3], [76, 1], [74, 1], [72, 1], [71, 3], [72, 1], [74, 1], [76, 1], [77, 3], [77, 3],
      [84, 2], [82, 1], [81, 2], [79, 1], [77, 2], [76, 1], [74, 3], [72, 2], [74, 1], [76, 2], [77, 1], [79, 3], [77, 3]];
    function thinkAt(c, dest, t0) {
      var t = t0, i, b, k;
      for (i = 0; i < BARS.length; i++) {
        b = BARS[i]; t = t0 + i * 3 * BEAT;
        voice(c, dest, b[0], t, BEAT * 0.95, 0.16, 'sawtooth', 900);
        for (k = 1; k < 3; k++) { voice(c, dest, b[1], t + k * BEAT, BEAT * 0.8, 0.045, 'triangle', 1800); voice(c, dest, b[2], t + k * BEAT, BEAT * 0.8, 0.045, 'triangle', 1800); voice(c, dest, b[3], t + k * BEAT, BEAT * 0.8, 0.04, 'triangle', 1800); }
      }
      t = t0;
      for (i = 0; i < MEL.length; i++) {
        voice(c, dest, MEL[i][0], t, MEL[i][1] * BEAT * 0.92, 0.13, 'sine', 3000);
        voice(c, dest, MEL[i][0] + 12, t, MEL[i][1] * BEAT * 0.5, 0.025, 'triangle', 3000);
        t += MEL[i][1] * BEAT;
      }
      // the last chord holds under the final seconds
      var end = t0 + BARS.length * 3 * BEAT;
      [41, 53, 57, 60, 65, 69].forEach(function (m) { voice(c, dest, m, end - BEAT * 0.5, 3, 0.07, m < 50 ? 'sawtooth' : 'triangle', 1500); });
    }

    var FILES = { loop: '/lobby.mp3', think: '/think.mp3' }, rec = {}, state = {};
    function edges(buf) {
      var d = buf.getChannelData(0), n = d.length, a = 0, b = n - 1, quiet = 0.004;
      while (a < n && Math.abs(d[a]) < quiet) a++;
      while (b > a && Math.abs(d[b]) < quiet) b--;
      if (b - a < buf.sampleRate) return { from: 0, to: buf.duration };
      return { from: Math.max(0, a / buf.sampleRate - 0.02), to: Math.min(buf.duration, b / buf.sampleRate + 0.3) };
    }
    function level(buf, e) {
      var d = buf.getChannelData(0), i0 = Math.floor(e.from * buf.sampleRate), n = Math.min(d.length, Math.floor(e.to * buf.sampleRate), i0 + buf.sampleRate * 120), sum = 0, count = 0;
      for (var i = i0; i < n; i += 7) { sum += d[i] * d[i]; count++; }
      var rms = Math.sqrt(sum / Math.max(1, count));
      return rms > 0.0005 ? Math.max(0.05, Math.min(1.5, TARGET / rms)) : 1;
    }
    function load(kind, then) {
      if (state[kind]) { if (state[kind] === 'ready' && then) then(); return; }
      var c = F.sfx.ctx(); if (!c || !window.fetch) return;
      state[kind] = 'loading';
      fetch(FILES[kind]).then(function (r) { if (!r.ok) throw new Error('none'); return r.arrayBuffer(); })
        .then(function (ab) { return new Promise(function (res, rej) { c.decodeAudioData(ab, res, rej); }); })
        .then(function (buf) { var e = edges(buf); rec[kind] = { buf: buf, gain: level(buf, e), from: e.from, to: e.to }; state[kind] = 'ready'; if (then) then(); })
        .catch(function () { state[kind] = 'none'; });
    }

    var want = false, scene = null, bus = null, src = null, playing = false, thinkBus = null;
    function start() {
      var c = F.sfx.ctx(); if (!c || playing || !rec.loop) return;
      playing = true;
      bus = c.createGain(); bus.gain.setValueAtTime(0.0001, c.currentTime); bus.connect(F.sfx.out());
      src = c.createBufferSource(); src.buffer = rec.loop.buf; src.loop = true;
      src.loopStart = rec.loop.from; src.loopEnd = rec.loop.to;
      src.connect(bus); src.start(0, rec.loop.from);
      bus.gain.exponentialRampToValueAtTime(rec.loop.gain, c.currentTime + 0.9);
      if (api.onChange) api.onChange('recording');
    }
    function stop() {
      if (!playing) return;
      playing = false;
      if (api.onChange) api.onChange(null);
      var c = F.sfx.ctx(), old = bus, oldSrc = src; bus = null; src = null;
      if (!c || !old) return;
      old.gain.cancelScheduledValues(c.currentTime); old.gain.setTargetAtTime(0.0001, c.currentTime, 0.12);
      setTimeout(function () { try { if (oldSrc) oldSrc.stop(); old.disconnect(); } catch (e) { /* already gone */ } }, 700);
    }
    function sync() { if (want && scene === 'lobby') { if (rec.loop) start(); else load('loop', sync); } else stop(); }
    var api = {
      isOn: function () { return want; },
      hasLoop: function () { return !!rec.loop; },
      set: function (on) { want = !!on; sync(); },
      scene: function (name) { scene = name || null; sync(); },
      // The Final countdown music: 30 seconds, started together with the clock.
      think: function () {
        api.stopThink();
        var c = F.sfx.ctx(); if (!c) return;
        var g = c.createGain(); g.connect(F.sfx.out()); thinkBus = g;
        if (rec.think) {
          g.gain.value = rec.think.gain;
          var s = c.createBufferSource(); s.buffer = rec.think.buf; s.connect(g); s.start(0, rec.think.from);
          thinkBus._src = s;
        } else {
          g.gain.value = 0.9;
          thinkAt(c, g, c.currentTime + 0.05);
          load('think');
        }
      },
      stopThink: function () {
        var c = F.sfx.ctx(), g = thinkBus; thinkBus = null;
        if (!c || !g) return;
        g.gain.setTargetAtTime(0.0001, c.currentTime, 0.15);
        setTimeout(function () { try { if (g._src) g._src.stop(); g.disconnect(); } catch (e) { /* already gone */ } }, 800);
      },
      preload: function () { load('loop'); load('think'); }
    };
    return api;
  })();
})();
