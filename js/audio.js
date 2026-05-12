// =============================================================
//  audio.js  —  Procedural sound effects (Web Audio API)
//  No audio files needed — all sounds synthesized at runtime.
// =============================================================

let _ac = null;

function _getAC() {
    if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    return _ac;
}

function playSound(type) {
    try {
        const ac = _getAC();
        const t  = ac.currentTime;
        switch (type) {
            case 'coin':  _sCoin (ac, t); break;
            case 'chest': _sChest(ac, t); break;
            case 'kill':  _sKill (ac, t); break;
            case 'die':   _sDie  (ac, t); break;
            case 'hit':   _sHit  (ac, t); break;
            case 'boost': _sBoost(ac, t); break;
        }
    } catch (_) {}
}

// ── helpers ───────────────────────────────────────────────────
function _osc(ac, t, type, freq, dur, vol) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
}

function _sweep(ac, t, type, f0, f1, dur, vol) {
    const o = _osc(ac, t, type, f0, dur, vol);
    o.frequency.linearRampToValueAtTime(f1, t + dur);
}

function _noise(ac, t, dur, cutoff, vol) {
    const len  = Math.ceil(ac.sampleRate * dur);
    const buf  = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    const lp  = ac.createBiquadFilter();
    const g   = ac.createGain();
    src.buffer = buf;
    lp.frequency.value = cutoff;
    src.connect(lp); lp.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t);
}

// ── sound definitions ─────────────────────────────────────────
function _sCoin(ac, t) {
    _sweep(ac, t, 'sine', 880, 1200, 0.11, 0.14);
}

function _sChest(ac, t) {
    _osc(ac, t,        'sine', 523.25, 0.45, 0.16);
    _osc(ac, t,        'sine', 659.25, 0.45, 0.12);
    _osc(ac, t,        'sine', 783.99, 0.45, 0.09);
    _sweep(ac, t+0.05, 'sine', 1046, 1400, 0.38, 0.07);
}

function _sKill(ac, t) {
    _sweep(ac, t,       'sawtooth', 140, 55, 0.45, 0.22);
    _osc  (ac, t+0.04,  'square',   80,  0.3, 0.14);
    _noise(ac, t,       0.35, 500, 0.16);
}

function _sDie(ac, t) {
    _sweep(ac, t,       'sine',     440, 75, 0.9, 0.20);
    _sweep(ac, t+0.1,   'sawtooth', 220, 40, 0.7, 0.10);
    _noise(ac, t,       0.55, 280, 0.13);
}

function _sHit(ac, t) {
    _sweep(ac, t, 'sawtooth', 320, 90, 0.22, 0.26);
    _noise(ac, t, 0.18, 900, 0.17);
}

// ── Sustained boost sound ─────────────────────────────────────
// Single persistent graph — only gain is adjusted, nodes never destroyed.
// This prevents clicking/glitching from repeated stop/start cycles.
let _boostGain    = null;
let _boostOscGain = null;
let _boostActive  = false;

function _ensureBoostGraph() {
    if (_boostGain) return;
    const ac = _getAC();

    const len = Math.ceil(ac.sampleRate * 2);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < len; i++) dat[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    const bp = ac.createBiquadFilter();
    bp.type            = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value         = 0.6;

    _boostGain = ac.createGain();
    _boostGain.gain.value = 0;

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 240;

    _boostOscGain = ac.createGain();
    _boostOscGain.gain.value = 0;

    src.connect(bp); bp.connect(_boostGain); _boostGain.connect(ac.destination);
    osc.connect(_boostOscGain); _boostOscGain.connect(ac.destination);

    src.start();
    osc.start();
}

function startBoostSound() {
    if (_boostActive) return;
    _boostActive = true;
    try {
        _ensureBoostGraph();
        const t = _ac.currentTime;
        _boostGain.gain.cancelScheduledValues(t);
        _boostGain.gain.setValueAtTime(_boostGain.gain.value, t);
        _boostGain.gain.linearRampToValueAtTime(0.09, t + 0.14);
        _boostOscGain.gain.cancelScheduledValues(t);
        _boostOscGain.gain.setValueAtTime(_boostOscGain.gain.value, t);
        _boostOscGain.gain.linearRampToValueAtTime(0.035, t + 0.14);
    } catch (_) {}
}

function stopBoostSound() {
    if (!_boostActive) return;
    _boostActive = false;
    try {
        if (!_boostGain) return;
        const t = _ac.currentTime;
        _boostGain.gain.cancelScheduledValues(t);
        _boostGain.gain.setValueAtTime(_boostGain.gain.value, t);
        _boostGain.gain.linearRampToValueAtTime(0, t + 0.10);
        _boostOscGain.gain.cancelScheduledValues(t);
        _boostOscGain.gain.setValueAtTime(_boostOscGain.gain.value, t);
        _boostOscGain.gain.linearRampToValueAtTime(0, t + 0.10);
    } catch (_) {}
}
