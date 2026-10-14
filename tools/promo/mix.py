"""
Turns the silent recording into the finished video: speeds the recording back up to real time
(a screen recording runs a little slow), lays an original music bed under it, drops the game's
sounds in at the moments they happened (from events.json), and saves promo.mp4 and poster.jpg.

    python3 tools/promo/mix.py <folder with promo.webm and events.json>

Everything is synthesized here, so there is nothing to license.
"""
import json, os, subprocess, sys, math
import numpy as np

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
SR = 44100
ev = json.load(open(os.path.join(OUT, 'events.json')))
END = [e['t'] for e in ev if e['e'] == 'end'][0]
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', os.path.join(OUT, 'promo.webm')]).decode().strip())
factor = END / dur
print('recording %.1fs for a %.1fs timeline: speed x%.3f' % (dur, END, 1 / factor))

N = int(SR * (END + 0.5))
mix = np.zeros(N)
t_all = np.arange(N) / SR

def add(at, sig, gain=1.0):
    i = int(at * SR)
    if i >= N: return
    seg = sig[:N - i]
    mix[i:i + len(seg)] += seg * gain

def env(n, a=0.005, d=0.1, s=0.6, r=0.1, hold=0.0):
    t = np.arange(n) / SR
    total = n / SR
    e = np.ones(n) * s
    ai = min(n, int(a * SR)); di = min(max(0, n - ai), int(d * SR)); ri = min(n, int(r * SR))
    if ai: e[:ai] = np.linspace(0, 1, ai)
    if di: e[ai:ai + di] = np.linspace(1, s, di)
    if ri: e[n - ri:] *= np.linspace(1, 0, ri)
    return e

def tone(f, d, type='sine', g=0.3, a=0.005, dec=0.1, s=0.6, r=0.1, f2=None):
    n = int(d * SR); t = np.arange(n) / SR
    if f2: f_t = f * (f2 / f) ** (t / d); ph = 2 * np.pi * np.cumsum(f_t) / SR
    else: ph = 2 * np.pi * f * t
    if type == 'sine': w = np.sin(ph)
    elif type == 'square': w = np.sign(np.sin(ph))
    elif type == 'saw': w = 2 * ((ph / (2 * np.pi)) % 1) - 1
    elif type == 'tri': w = 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1) - 1) - 1
    return w * env(n, a, dec, s, r) * g

def lowpass(x, cutoff):
    # a one-pole filter, run as a recurrence (scipy's lfilter when available, a plain loop otherwise)
    rc = 1 / (2 * np.pi * cutoff); a = (1 / SR) / (rc + 1 / SR)
    try:
        from scipy.signal import lfilter
        return lfilter([a], [1, -(1 - a)], x)
    except ImportError:
        y = np.zeros_like(x); acc = 0.0
        for i in range(len(x)):
            acc += a * (x[i] - acc); y[i] = acc
        return y

def noise(d, g=0.3, dec=0.05):
    n = int(d * SR)
    return np.random.uniform(-1, 1, n) * np.exp(-np.arange(n) / SR / dec) * g

# ---- sounds, matching the game's own ----
def bell(f, g=0.3):
    out = np.zeros(int(1.25 * SR))
    add_local(out, 0, tone(f, 1.2, 'sine', g, 0.003, 0.3, 0.3, 0.6)); add_local(out, 0, tone(f * 2, 0.7, 'sine', g * 0.4, 0.003, 0.2, 0.2, 0.4)); add_local(out, 0, tone(f * 3.01, 0.4, 'sine', g * 0.2))
    return out
def ding(): return bell(1318.5, 0.35)
def right():
    out = np.zeros(int(0.7 * SR))
    for i, f in enumerate([784, 1047, 1319]): add_local(out, i * 0.09, tone(f, 0.35, 'tri', 0.25, 0.005, 0.1, 0.5, 0.15))
    return out
def buzzer(d=0.6):
    n = int(d * SR)
    w = tone(138, d, 'saw', 0.35, 0.01, 0.05, 1, 0.08) + tone(146, d, 'square', 0.18, 0.01, 0.05, 1, 0.08) + tone(92, d, 'saw', 0.3, 0.01, 0.05, 1, 0.08)
    return lowpass(w, 1800)
def sting():
    out = np.zeros(int(2.2 * SR))
    for i, f in enumerate([392, 523, 659, 784]): add_local(out, i * 0.08, tone(f, 0.2, 'saw', 0.12))
    for f in [523, 659, 784, 1047]: add_local(out, 0.34, tone(f, 1.4, 'saw', 0.07, 0.01, 0.2, 0.8, 0.5))
    add_local(out, 0.36, bell(2093, 0.22))
    return lowpass(out, 5000)
def lock(): return tone(660, 0.09, 'tri', 0.2)
def pick(): return np.concatenate([tone(523, 0.1, 'tri', 0.14), tone(784, 0.22, 'tri', 0.14)])
def round_sting():
    out = np.zeros(int(1.8 * SR))
    for i, f in enumerate([392, 523, 659]): add_local(out, i * 0.1, tone(f, 0.16, 'tri', 0.2))
    add_local(out, 0.32, bell(1047, 0.26))
    return out
def fanfare():
    out = np.zeros(int(3.0 * SR))
    for i, f in enumerate([523, 523, 523, 659, 784, 659, 784, 1047]): add_local(out, i * 0.15, tone(f, 1.2 if i == 7 else 0.22, 'tri', 0.28, 0.005, 0.1, 0.6, 0.15))
    for f in [262, 330, 392]: add_local(out, 1.05, tone(f, 1.2, 'saw', 0.07, 0.01, 0.2, 0.7, 0.5))
    return out
def fill_ticks():
    out = np.zeros(int(2.0 * SR))
    for i in range(5): add_local(out, 0.06 + i * 0.032 * 6, tone(440 + i * 35, 0.07, 'tri', 0.1))
    for i in range(6): add_local(out, 1.2 + i * 0.09, tone(523, 0.1, 'tri', 0.08))
    return out
def add_local(buf, at, sig):
    i = int(at * SR)
    if i >= len(buf): return
    seg = sig[:len(buf) - i]
    if len(seg) > 0: buf[i:i + len(seg)] += seg

# ---- the music bed: an original upbeat game-show vamp, 128 bpm ----
BPM = 128; BEAT = 60 / BPM
def midi(m): return 440 * 2 ** ((m - 69) / 12)
# bars of [bass root, chord notes]; a bright I–vi–IV–V with a turnaround, in C
BARS = [[48, [60, 64, 67]], [45, [57, 60, 64]], [53, [53, 57, 60]], [55, [55, 59, 62]],
        [48, [60, 64, 67]], [52, [52, 55, 59]], [53, [53, 57, 60]], [55, [55, 59, 62, 65]]]
MEL = [[72, 1], [74, 1], [76, 2], [72, 1], [79, 1], [76, 2], [77, 1], [76, 1], [74, 1], [72, 1], [74, 2], [71, 2],
       [72, 1], [74, 1], [76, 2], [81, 1], [79, 1], [76, 2], [77, 1], [79, 1], [77, 1], [76, 1], [74, 2], [72, 2]]
def kick():
    n = int(0.25 * SR); t = np.arange(n) / SR
    f = 150 * np.exp(-t * 30) + 45
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14) * 0.9
def hat(open_=False):
    return noise(0.25 if open_ else 0.05, 0.18 if open_ else 0.14, 0.08 if open_ else 0.02)
def snare():
    n = int(0.18 * SR); t = np.arange(n) / SR
    return (np.random.uniform(-1, 1, n) * np.exp(-t * 22) * 0.35 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.3)
def bed(seconds):
    n = int(seconds * SR); out = np.zeros(n)
    bar_len = 4 * BEAT; bars = int(seconds / bar_len) + 1
    for b in range(bars):
        t0 = b * bar_len; root, chord = BARS[b % len(BARS)]
        section = (b // 8) % 3                       # the arrangement builds: bass+drums, then chords, then melody too
        for k in range(4):
            add_local(out, t0 + k * BEAT, kick())
            add_local(out, t0 + k * BEAT + BEAT / 2, hat(k == 3))
            add_local(out, t0 + k * BEAT, hat())
            if k in (1, 3): add_local(out, t0 + k * BEAT, snare())
        # bass: root, octave, fifth pattern in eighths
        patt = [0, 12, 7, 12, 0, 12, 10, 12]
        for k, iv in enumerate(patt):
            add_local(out, t0 + k * BEAT / 2, lowpass(tone(midi(root + iv), BEAT / 2 * 0.9, 'saw', 0.22, 0.005, 0.05, 0.6, 0.05), 900))
        if section >= 1:
            for k in (1, 2.5, 3):                      # chord stabs on the and-of-twos
                for m in chord: add_local(out, t0 + k * BEAT, lowpass(tone(midi(m + 12), BEAT * 0.35, 'saw', 0.05, 0.005, 0.08, 0.5, 0.06), 3000))
    if True:
        # melody rides over the whole thing from the second pass on, then rests on the last bars
        t = 8 * bar_len
        i = 0
        while t < seconds - 2:
            m, d = MEL[i % len(MEL)]; i += 1
            if (int(t / bar_len) // 8) % 3 == 0: t += d * BEAT; continue
            add_local(out, t, tone(midi(m), d * BEAT * 0.9, 'square', 0.055, 0.01, 0.1, 0.6, 0.08) + tone(midi(m + 12), d * BEAT * 0.9, 'sine', 0.03, 0.01, 0.1, 0.6, 0.08))
            t += d * BEAT
    return out

print('rendering the music bed…')
music = bed(END + 0.5)
music = lowpass(music, 9000)
# sit the music under the captions: quiet at the start, full in the middle, a dip during the Final clue, out at the end
g = np.ones(N) * 0.55
def ramp(a, b, from_, to):
    i0, i1 = int(a * SR), int(b * SR)
    g[i0:i1] = np.linspace(from_, to, i1 - i0)
    g[i1:] = to
ramp(0, 2, 0.0, 0.5)
fc = [e['t'] for e in ev if e['e'] == 'final-clue']
if fc:
    ramp(fc[0] - 0.5, fc[0] + 0.5, 0.5, 0.22)
    fs = [e['t'] for e in ev if e['e'] == 'f-show']
    if fs: ramp(fs[0] - 0.5, fs[0] + 0.5, 0.22, 0.5)
ramp(END - 2.5, END - 0.2, 0.5, 0.0)
mix += music[:N] * g

# the Final "thinking" music: the game's own waltz, played between the clue and the reveal
if fc:
    fs = [e['t'] for e in ev if e['e'] == 'f-show']
    stop = fs[0] - 0.4 if fs else fc[0] + 10
    W_BEAT = 30 / 72
    W_BARS = [[53, 65, 69, 72], [53, 65, 69, 72], [55, 65, 70, 74], [55, 65, 70, 74], [48, 64, 67, 72], [48, 64, 67, 72], [53, 65, 69, 72], [53, 65, 69, 72]]
    W_MEL = [[77, 3], [76, 1], [74, 1], [72, 1], [74, 3], [72, 1], [70, 1], [69, 1], [67, 3], [69, 1], [70, 1], [72, 1], [69, 3], [77, 3]]
    w = np.zeros(int((stop - fc[0] + 1) * SR))
    for i in range(int((stop - fc[0]) / (3 * W_BEAT)) + 1):
        b = W_BARS[i % len(W_BARS)]; t0 = i * 3 * W_BEAT
        add_local(w, t0, lowpass(tone(midi(b[0]), W_BEAT * 0.95, 'saw', 0.16, 0.01, 0.1, 0.5, 0.1), 900))
        for k in (1, 2):
            for m in b[1:]: add_local(w, t0 + k * W_BEAT, lowpass(tone(midi(m), W_BEAT * 0.8, 'tri', 0.045, 0.01, 0.1, 0.5, 0.1), 1800))
    t = 0; i = 0
    while t < stop - fc[0] - 1:
        m, d = W_MEL[i % len(W_MEL)]; i += 1
        add_local(w, t, tone(midi(m), d * W_BEAT * 0.92, 'sine', 0.13, 0.01, 0.1, 0.6, 0.1))
        t += d * W_BEAT
    fade = np.ones(len(w)); fi = int(0.6 * SR); fade[-fi:] = np.linspace(1, 0, fi)
    add(fc[0] + 0.3, w * fade, 0.9)

# the game's sounds, where they happened
for e in ev:
    k, t = e['e'], e['t']
    if k == 'buzz': add(t, ding())
    elif k == 'right': add(t + 0.1, right())
    elif k == 'wrong': add(t + 0.1, buzzer(0.6))
    elif k == 'dd': add(t + 0.9, sting())
    elif k in ('wager', 'lock'): add(t, lock())
    elif k in ('pick', 'f-show'): add(t + (0.1 if k == 'pick' else 0.4), pick())
    elif k == 'f-right': add(t + 1.0, right())
    elif k == 'f-wrong': add(t + 1.0, buzzer(0.6))
    elif k == 'start-game': add(t + 1.6, fill_ticks()); add(t + 0.2, round_sting())
    elif k in ('round2', 'final'): add(t + 0.2, round_sting())
    elif k == 'win': add(t + 1.5, fanfare())
    elif k == 'open': add(t, tone(1000, 0.05, 'square', 0.08))

# normalise and write
peak = np.max(np.abs(mix)); mix = mix / peak * 0.9
wav = os.path.join(OUT, 'mix.wav')
import wave
with wave.open(wav, 'wb') as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((mix * 32767).astype(np.int16).tobytes())

print('encoding…')
mp4 = os.path.join(OUT, 'promo.mp4')
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(OUT, 'promo.webm'), '-i', wav,
    '-filter_complex', '[0:v]setpts=PTS*%.5f,fps=30,format=yuv420p[v]' % factor,
    '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-t', str(END), mp4])
subprocess.check_call(['ffmpeg', '-v', 'error', '-y', '-ss', '2.6', '-i', mp4, '-frames:v', '1', '-vf', 'scale=1280:720', '-q:v', '3', os.path.join(OUT, 'poster.jpg')])
print('done:', mp4, os.path.getsize(mp4) // 1024, 'KB')
