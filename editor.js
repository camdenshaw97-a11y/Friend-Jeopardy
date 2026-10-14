/* Clue editor: used on the TV page and on the host's phone.
   The host's own material is categories (a name and five clues, easiest first) and Final clues.
   It is saved on the device and sent to the server, where it is used before the built-in packs. */
(function () {
  'use strict';
  var F = window.Game;
  var KEY = 'jep.custom';
  var ROWS = ['$200 / $400', '$400 / $800', '$600 / $1,200', '$800 / $1,600', '$1,000 / $2,000'];

  function normalize(c) {
    c = c && typeof c === 'object' ? c : {};
    return { cats: Array.isArray(c.cats) ? c.cats : [], finals: Array.isArray(c.finals) ? c.finals : [] };
  }
  F.savedCustom = function () { return normalize(F.store.get(KEY, null)); };

  F.openEditor = function (opts) {
    // opts: { custom: { cats, finals }, onChange(custom), onClose() }
    var data = normalize(JSON.parse(JSON.stringify(opts.custom || {})));
    var back = document.createElement('div');
    back.className = 'ed-back';
    document.body.appendChild(back);

    function commit() { F.store.set(KEY, data); opts.onChange(data); }
    function close() {
      if (F.motionOK && F.motionOK()) { back.classList.add('out'); setTimeout(function () { back.remove(); }, 200); }
      else back.remove();
      if (opts.onClose) opts.onClose();
    }

    function showList() {
      var h = '<div class="ed"><div class="ed-top"><h2>MY CLUES</h2><button class="ed-btn" data-a="close">Done</button></div>' +
        '<p>Your own categories fill the board first; the built-in packs fill whatever is left. A game uses 12 categories ' +
        '(six per round) and one Final clue. Everything here is saved on this device and reloads next time.</p>' +
        '<h3>CATEGORIES (' + data.cats.length + ')</h3>' +
        '<div class="ed-row"><button class="ed-btn pri" data-a="addCat">+ Add a category</button>' +
        '<button class="ed-btn ghost" data-a="export"' + (data.cats.length || data.finals.length ? '' : ' disabled') + '>Save to file</button>' +
        '<button class="ed-btn ghost" data-a="import">Load from file</button></div>';
      if (!data.cats.length) h += '<div class="ed-empty">No categories yet. Each one needs a name and five clues, easiest first.</div>';
      data.cats.forEach(function (c, i) {
        h += '<div class="ed-q"><b>' + F.esc(c.name) + '<small>' + F.esc(c.clues[0].c) + '</small></b>' +
          '<button class="ed-btn" data-a="editCat" data-i="' + i + '">Edit</button>' +
          '<button class="ed-btn red" data-a="delCat" data-i="' + i + '">Delete</button></div>';
      });
      h += '<h3>FINAL CLUES (' + data.finals.length + ')</h3>' +
        '<div class="ed-row"><button class="ed-btn pri" data-a="addFinal">+ Add a Final clue</button></div>';
      if (!data.finals.length) h += '<div class="ed-empty">No Final clues yet. One is picked per game; the built-in ones are used when you have none.</div>';
      data.finals.forEach(function (f, i) {
        h += '<div class="ed-q"><b>' + F.esc(f.name) + '<small>' + F.esc(f.c) + '</small></b>' +
          '<button class="ed-btn" data-a="editFinal" data-i="' + i + '">Edit</button>' +
          '<button class="ed-btn red" data-a="delFinal" data-i="' + i + '">Delete</button></div>';
      });
      h += '<input type="file" accept=".json,application/json" style="display:none" data-file></div>';
      back.innerHTML = h;
    }

    function showCat(i) {
      var c = i == null ? { name: '', clues: [] } : data.cats[i];
      var h = '<div class="ed"><div class="ed-top"><h2>' + (i == null ? 'NEW CATEGORY' : 'EDIT CATEGORY') + '</h2></div>' +
        '<label>CATEGORY NAME</label><input data-name maxlength="40" placeholder="U.S. STATES" value="' + F.esc(c.name) + '">';
      for (var k = 0; k < 5; k++) {
        var q = c.clues[k] || { c: '', r: '' };
        h += '<div class="ed-clue"><label>CLUE ' + (k + 1) + ' <span>' + ROWS[k] + '</span></label>' +
          '<textarea data-c maxlength="220" placeholder="Written as a statement: This state’s capital is Baton Rouge">' + F.esc(q.c) + '</textarea>' +
          '<input data-r maxlength="80" placeholder="Response: Louisiana" value="' + F.esc(q.r) + '"></div>';
      }
      h += '<div class="ed-err" data-err></div><div class="ed-row"><button class="ed-btn pri" data-a="saveCat" data-i="' + (i == null ? '' : i) + '">Save category</button>' +
        '<button class="ed-btn ghost" data-a="cancel">Cancel</button></div></div>';
      back.innerHTML = h;
      back.scrollTop = 0;
    }

    function showFinal(i) {
      var f = i == null ? { name: '', c: '', r: '' } : data.finals[i];
      var h = '<div class="ed"><div class="ed-top"><h2>' + (i == null ? 'NEW FINAL CLUE' : 'EDIT FINAL CLUE') + '</h2></div>' +
        '<label>CATEGORY</label><input data-name maxlength="40" placeholder="WORLD GEOGRAPHY" value="' + F.esc(f.name) + '">' +
        '<label>CLUE</label><textarea data-c maxlength="220" placeholder="A hard one: everyone wagers before they see it">' + F.esc(f.c) + '</textarea>' +
        '<label>RESPONSE</label><input data-r maxlength="80" placeholder="Response" value="' + F.esc(f.r) + '">' +
        '<div class="ed-err" data-err></div><div class="ed-row"><button class="ed-btn pri" data-a="saveFinal" data-i="' + (i == null ? '' : i) + '">Save Final clue</button>' +
        '<button class="ed-btn ghost" data-a="cancel">Cancel</button></div></div>';
      back.innerHTML = h;
      back.scrollTop = 0;
    }

    function readCat() {
      var name = back.querySelector('[data-name]').value.trim();
      var cs = back.querySelectorAll('[data-c]'), rs = back.querySelectorAll('[data-r]');
      var clues = [];
      for (var k = 0; k < 5; k++) {
        var c = cs[k].value.trim(), r = rs[k].value.trim();
        if (c && r) clues.push({ c: c, r: r });
      }
      if (!name) return { err: 'Give the category a name.' };
      if (clues.length < 5) return { err: 'All five clues need a clue and a response.' };
      return { name: name, clues: clues };
    }

    back.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var a = b.dataset.a, i = b.dataset.i === '' || b.dataset.i == null ? null : Number(b.dataset.i);
      if (a === 'close') { close(); }
      else if (a === 'addCat') showCat(null);
      else if (a === 'editCat') showCat(i);
      else if (a === 'delCat') { if (confirm('Delete "' + data.cats[i].name + '"?')) { data.cats.splice(i, 1); commit(); showList(); } }
      else if (a === 'addFinal') showFinal(null);
      else if (a === 'editFinal') showFinal(i);
      else if (a === 'delFinal') { if (confirm('Delete this Final clue?')) { data.finals.splice(i, 1); commit(); showList(); } }
      else if (a === 'cancel') showList();
      else if (a === 'saveCat') {
        var c = readCat();
        if (c.err) { back.querySelector('[data-err]').textContent = c.err; return; }
        if (i == null) data.cats.push(c); else data.cats[i] = c;
        commit(); showList();
      } else if (a === 'saveFinal') {
        var name = back.querySelector('[data-name]').value.trim(), cl = back.querySelector('[data-c]').value.trim(), r = back.querySelector('[data-r]').value.trim();
        if (!name || !cl || !r) { back.querySelector('[data-err]').textContent = 'A Final clue needs a category, a clue and a response.'; return; }
        if (i == null) data.finals.push({ name: name, c: cl, r: r }); else data.finals[i] = { name: name, c: cl, r: r };
        commit(); showList();
      } else if (a === 'export') {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var aEl = document.createElement('a');
        aEl.href = URL.createObjectURL(blob); aEl.download = 'my-clues.json';
        document.body.appendChild(aEl); aEl.click(); aEl.remove();
      } else if (a === 'import') back.querySelector('[data-file]').click();
    });
    back.addEventListener('change', function (e) {
      var inp = e.target; if (!inp.matches('[data-file]') || !inp.files[0]) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var got = normalize(JSON.parse(rd.result));
          var n = 0;
          got.cats.forEach(function (c) { if (c && c.name && Array.isArray(c.clues) && c.clues.length === 5) { data.cats.push({ name: String(c.name), clues: c.clues.map(function (q) { return { c: String(q.c || ''), r: String(q.r || '') }; }) }); n++; } });
          got.finals.forEach(function (f) { if (f && f.name && f.c && f.r) { data.finals.push({ name: String(f.name), c: String(f.c), r: String(f.r) }); n++; } });
          commit(); showList();
          if (!n) alert('No clues found in that file.');
        } catch (err) { alert('That file could not be read.'); }
      };
      rd.readAsText(inp.files[0]);
    });

    showList();
    return { close: close };
  };
})();
