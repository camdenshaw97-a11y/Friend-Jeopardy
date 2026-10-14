# Making the walkthrough video

Three steps, from the repo root. Needs Node, Python 3 with playwright (and its Chromium), numpy,
scipy (optional, speeds up the mix) and ffmpeg.

    PORT=3998 node server.js &
    python3 -m http.server 8001 &
    python3 tools/promo/make-promo.py out/      # records a scripted game: promo.webm + events.json
    python3 tools/promo/mix.py out/             # music, sounds, real-time speed: promo.mp4 + poster.jpg

Then copy `out/promo.mp4` to `promo.mp4` and `out/poster.jpg` to `promo.jpg` in the repo root.
The page that shows them is `promo.html`, served at the address in `PROMOS` in `server.js`.

`stage.html` is the backdrop the recording is framed on: the TV and the phones are the real
pages in iframes, each from its own `*.localhost` hostname so the phones don't share storage.
The captions and the timeline are in `make-promo.py`; the music and sounds are in `mix.py`.
