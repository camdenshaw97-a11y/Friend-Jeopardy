"""
Records the walkthrough video: a real game played on the real pages, framed on a stage with
captions. Needs the game server on port 3998 and this folder served on port 8001:

    PORT=3998 node server.js &
    python3 -m http.server 8001 &        # from the repo root
    python3 tools/promo/make-promo.py

Produces promo.webm (silent) and events.json (when things happened, for the sound mix), in the
output folder given as the first argument. Then run mix.py to add the music and sounds.

Each screen is loaded from a different *.localhost hostname so the phones don't share one
browser's storage (every phone keeps its own seat).
"""
import json, os, sys, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(OUT, exist_ok=True)
GAME = 'localhost:3998'
SITE = 'friend-jeopardy.onrender.com'      # what the TV shows people as the address to type
STAGE = 'http://localhost:8001/tools/promo/stage.html'   # http.server run from the repo root, so the font is at /anton.woff2
events = []
T0 = None
def now(): return time.time() - T0
def mark(name): events.append({'t': round(now(), 2), 'e': name}); print('%6.2f  %s' % (now(), name))
# Screens that aren't on the stage at the moment can't take a real click (the stage lets pointer
# events through to the backdrop), so the host's and players' taps are made in page script.
def jclick(frame, sel, text=None):
    frame.evaluate("""([s, t]) => { const list = [...document.querySelectorAll(s)]; const e = t ? list.find(x => x.textContent.trim().startsWith(t)) : list[0];
        if (!e) throw new Error('no ' + s + (t ? ' ' + t : '')); e.click(); }""", [sel, text])
def until(t):
    d = T0 + t - time.time()
    if d > 0: time.sleep(d)
    else: print('   (running %.1fs late at %s)' % (-d, t))

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--host-resolver-rules=MAP *.localhost 127.0.0.1'])
    rec = b.new_context(viewport={'width': 1920, 'height': 1080}, record_video_dir=OUT, record_video_size={'width': 1920, 'height': 1080})
    stage = rec.new_page()
    stage.goto(STAGE)
    stage.wait_for_timeout(300)
    T0 = time.time()
    mark('start')

    # --- the TV creates the room while the title card is up
    tvf = stage.frame_locator('#tvf')
    stage.evaluate("document.getElementById('tvf').src = 'http://tv.%s/tv'" % GAME)
    tvf.locator('#btnCreate').wait_for()
    tvfr = stage.query_selector('#tvf').content_frame()
    tvfr.wait_for_load_state('load')
    stage.wait_for_timeout(300)
    # a known Final clue, so the typed answer in the video matches it (the host's own clues are used first)
    tvfr.evaluate("localStorage.setItem('jep.custom', JSON.stringify({ cats: [], finals: [{ name: 'FAMOUS LANDMARKS', c: 'This Paris tower opened in 1889 and is named for the engineer whose company built it', r: 'The Eiffel Tower' }] }))")
    jclick(tvfr, '#btnCreate')
    tvf.locator('#lobby.on').wait_for()
    # the address people type should be the real site, not this recording box
    tvfr.evaluate("""(site) => { const fix = () => { const n = document.getElementById('joinUrl'); if (n && n.textContent !== site) n.textContent = site; };
        new MutationObserver(fix).observe(document.body, { subtree: true, childList: true, characterData: true }); fix(); }""", SITE)
    code = tvfr.evaluate("document.getElementById('codeBig').textContent.replace(/\\s/g, '')")
    print('room', code)

    # the phones in the frame, plus two hidden players driven from another context
    stage.evaluate("c => { document.getElementById('pf').src = 'http://tessa.%s/?code=' + c; document.getElementById('hf').src = 'http://host.%s/?code=' + c; }" % (GAME, GAME), code)
    pf = stage.frame_locator('#pf'); hf = stage.frame_locator('#hf')
    hidden = b.new_context(viewport={'width': 390, 'height': 780}, is_mobile=True, has_touch=True)
    def hidden_phone(name):
        pg = hidden.new_page(); pg.goto('http://%s.%s/?code=%s' % (name.lower(), GAME, code)); pg.fill('#name', name); pg.click('#playBtn'); pg.wait_for_selector('#lobby.on'); pg.click('[data-a=play]'); return pg
    hf.locator('#name').wait_for(); pf.locator('#name').wait_for()
    hfr = stage.query_selector('#hf').content_frame(); hfr.wait_for_load_state('load')
    pfr = stage.query_selector('#pf').content_frame(); pfr.wait_for_load_state('load')
    stage.wait_for_timeout(300)
    hf.locator('#name').fill('NORA'); jclick(hfr, '#playBtn'); hf.locator('[data-a=behost]').wait_for(); jclick(hfr, '[data-a=behost]')

    until(5.5)
    stage.evaluate("stage.title(false)")
    stage.evaluate("stage.show(['tv', 'phone'], 'left')")
    stage.evaluate("stage.cap('SCAN THE CODE. TYPE YOUR NAME.', 'Or go to the site and enter the four letters on the TV.')")
    until(7)
    pf.locator('#name').click(); pf.locator('#name').type('TESSA', delay=90)
    until(9)
    jclick(pfr, '#playBtn'); pf.locator('[data-a=play]').wait_for(); jclick(pfr, '[data-a=play]')
    mark('join')
    until(10.5)
    maya = hidden_phone('MAYA'); drew = hidden_phone('DREW')
    stage.evaluate("stage.cap('UP TO EIGHT PLAYERS.', 'Everyone gets a podium and a buzzer.')")

    until(14)
    stage.evaluate("stage.show(['tv', 'hphone'], 'right')")
    stage.evaluate("stage.cap('ONE PHONE <em>HOSTS</em>.', 'It reads the clues out loud and judges the answers.')")
    until(16.5)
    jclick(hfr, '[data-a=start]')
    mark('start-game')
    until(18)
    stage.evaluate("stage.show(['tv'])")
    stage.evaluate("stage.cap('SIX CATEGORIES. THIRTY CLUES.', 'Round one is $200 to $1,000. Round two doubles it.')")
    # make sure Tessa has the board
    jclick(hfr, '[data-a=menu]'); hfr.locator('[data-a=control]').first.wait_for(); jclick(hfr, '[data-a=control]', 'TESSA')

    until(23)
    stage.evaluate("stage.show(['tv', 'phone'], 'left')")
    stage.evaluate("stage.cap('PICK A CLUE…', 'Whoever has the board chooses from their phone.')")
    until(24.5)
    jclick(pfr, '[data-a=pick][data-cat="1"][data-row="2"]')
    mark('pick')
    until(26.5)
    stage.evaluate("stage.show(['tv', 'hphone'], 'right')")
    stage.evaluate("stage.cap('THE HOST READS IT OUT LOUD…', 'Nobody can buzz yet.')")
    until(30)
    jclick(hfr, '[data-a=open]'); mark('open')
    stage.evaluate("stage.cap('…THEN OPENS THE <em>BUZZERS</em>.', 'Buzz early and you’re locked out for a quarter second.')")
    until(31.2)
    stage.evaluate("stage.show(['tv', 'phone'], 'left')")
    until(32)
    pf.locator('#buzzBtn').click(); mark('buzz')
    stage.evaluate("stage.cap('FIRST TO BUZZ ANSWERS.', 'Say it as a question. The host decides.')")
    until(35)
    jclick(hfr, '[data-a=right]'); mark('right')
    stage.evaluate("stage.cap('<em>RIGHT:</em> YOU EARN IT, AND THE BOARD IS YOURS.', '')")

    # a wrong answer: Maya buzzes and misses, then Drew gets it
    until(38)
    jclick(pfr, '[data-a=pick][data-cat="3"][data-row="1"]')
    until(40)
    jclick(hfr, '[data-a=open]')
    until(40.8)
    maya.click('#buzzBtn'); mark('buzz')
    until(42.3)
    jclick(hfr, '[data-a=wrong]'); mark('wrong')
    stage.evaluate("stage.cap('<em>WRONG</em> COSTS YOU…', '…and the buzzers reopen for everyone else.')")
    until(44)
    drew.click('#buzzBtn'); mark('buzz')
    until(45.5)
    jclick(hfr, '[data-a=right]'); mark('right')

    # daily double: hand the board back to Tessa and find it
    until(47.5)
    jclick(hfr, '[data-a=menu]'); hfr.locator('[data-a=control]').first.wait_for(); jclick(hfr, '[data-a=control]', 'TESSA')
    dd = hfr.evaluate("(() => { const b = document.querySelector('.pcat .vals button.dd'); return b ? [b.dataset.cat, b.dataset.row] : null; })()")
    print('dd at', dd)
    until(48.5)
    jclick(pfr, '[data-a=pick][data-cat="%s"][data-row="%s"]' % (dd[0], dd[1])); mark('dd')
    stage.evaluate("stage.cap('<em>DAILY DOUBLE.</em>', 'Only you can answer. Name your wager first.')")
    until(51.5)
    pf.locator('#wagerIn').click(); pf.locator('#wagerIn').type('1000', delay=120)
    until(53.2)
    jclick(pfr, '[data-a=wager]'); mark('wager')
    until(55.5)
    jclick(hfr, '[data-a=right]'); mark('right')
    stage.evaluate("stage.cap('BET IT ALL IF YOU DARE.', '')")

    # on to round two, then Final
    until(58)
    hfr.evaluate("window.confirm = () => true")
    jclick(hfr, '[data-a=menu]'); hfr.locator('[data-a=endRound]').wait_for(); jclick(hfr, '[data-a=endRound]'); mark('round2')
    stage.evaluate("stage.show(['tv'])")
    stage.evaluate("stage.cap('ROUND TWO: <em>EVERYTHING DOUBLES</em>.', '$400 to $2,000, and two Daily Doubles hiding on the board.')")
    until(63)
    jclick(hfr, '[data-a=menu]'); hfr.locator('[data-a=endRound]').wait_for(); jclick(hfr, '[data-a=endRound]'); mark('final')
    stage.evaluate("stage.show(['tv', 'phone'], 'left')")
    stage.evaluate("stage.cap('<em>FINAL.</em> WAGER BLIND…', 'You see the category, not the clue. Anything up to everything you have.')")
    until(67)
    pf.locator('#wagerIn').click(); pf.locator('#wagerIn').type('1500', delay=120)
    until(69)
    jclick(pfr, '[data-a=wager]'); mark('wager')
    # Drew wagers too (he has money); Maya is out
    try: drew.fill('#wagerIn', '200'); drew.click('[data-a=wager]')
    except Exception as e: print('drew wager', e)
    until(70.5)
    jclick(hfr, '[data-a=fClue]'); mark('final-clue')
    stage.evaluate("stage.cap('…THEN <em>WRITE IT DOWN</em>.', 'Thirty seconds on the clock, with the music.')")
    until(74)
    pf.locator('#fIn').click(); pf.locator('#fIn').type('What is the Eiffel Tower', delay=70)
    until(77.5)
    jclick(pfr, '[data-a=flock]'); mark('lock')
    try: drew.fill('#fIn', 'What is Big Ben'); drew.click('[data-a=flock]')
    except Exception as e: print('drew answer', e)
    until(79.5)
    stage.evaluate("stage.cap('THE REVEAL, LOWEST SCORE FIRST.', 'Answer, then wager, one player at a time.')")
    # reveal everyone: Drew (lower) wrong, Tessa right
    n = hfr.evaluate("document.querySelectorAll('[data-key=forder] .frow').length")
    t = 81.5
    for i in range(n):
        until(t); jclick(hfr, '[data-a=fNext]'); mark('f-show')
        until(t + 1.8)
        who = hfr.evaluate("document.querySelector('[data-key=forder] .frow.cur span').textContent")
        if who.startswith('TESSA'): jclick(hfr, '[data-a=fRight]'); mark('f-right')
        else: jclick(hfr, '[data-a=fWrong]'); mark('f-wrong')
        until(t + 3.6); jclick(hfr, '[data-a=fNext]')
        t += 4.4
    mark('win')
    stage.evaluate("stage.show(['tv'])")
    stage.evaluate("stage.cap('TONIGHT’S <em>CHAMPION</em>.', 'Plus awards for the sharpest, the fastest, and the biggest bet.')")
    until(t + 5)
    stage.evaluate("stage.title(true, 'GAME NIGHT, ANYONE?', 'A TV, everybody’s phone, and one person to host.', '%s')" % SITE)
    stage.evaluate("stage.cap(null); stage.show([])")
    mark('end-card')
    until(t + 11)
    mark('end')
    json.dump(events, open(os.path.join(OUT, 'events.json'), 'w'), indent=1)
    rec.close(); hidden.close()
    vid = [f for f in os.listdir(OUT) if f.endswith('.webm')]
    for f in vid: os.replace(os.path.join(OUT, f), os.path.join(OUT, 'promo.webm'))
    b.close()
    print('done: promo.webm, events.json')
