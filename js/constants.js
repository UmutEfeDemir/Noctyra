// ── WORLD ────────────────────────────────────────────────────
const WORLD_W        = 5000;
const WORLD_H        = 5000;
const PLAYER_SPAWN_X = WORLD_W / 2;
const PLAYER_SPAWN_Y = WORLD_H / 2;
const SAFE_RADIUS    = 750;

// ── MOVEMENT ─────────────────────────────────────────────────
const TRAIL_GAP     = 6;     // min px between trail nodes
const BASE_SPEED    = 1.6;   // same for all ship types (sandal / gemi / savas)
const BOOST_SPEED   = 3.0;
const TURN_RATE     = 0.045;
const BOOST_TURN    = 0.065;

// ── TRAIL ────────────────────────────────────────────────────
const TRAIL_INIT_LEN = 20;   // nodes seeded at spawn
const MAX_TRAIL_LEN  = 180;  // hard cap — reduced from 300 for performance

// ── BOOST ────────────────────────────────────────────────────
const BOOST_MAX      = 100;
const BOOST_DRAIN    = 0.38;
const BOOST_REGEN    = 0.14;
const MIN_BOOST_LEN  = 18;   // min trail nodes needed to boost

// ── GAME ─────────────────────────────────────────────────────
const AI_COUNT      = 10;
const COIN_TARGET   = 200;
const CHEST_TARGET  = 12;
const SPAWN_GRACE   = 120;   // invincibility frames after spawn

// ── COLORS ───────────────────────────────────────────────────
// Pirate names + rndName() live in i18n.js (supports 4 languages)

// wake is stored as "R,G,B" string — avoids string building in draw loops
const SHIP_COLORS = [
    { hull:'#7B4500', sail:'#F0DEB0', accent:'#00FF88', wake:'0,255,136'   },
    { hull:'#2a2a4a', sail:'#555580', accent:'#FF4466', wake:'255,68,102'  },
    { hull:'#4a0808', sail:'#8B1010', accent:'#FF9900', wake:'255,153,0'   },
    { hull:'#0a3a1a', sail:'#2a6a3a', accent:'#44FFaa', wake:'68,255,170'  },
    { hull:'#1a1a50', sail:'#2a2aaa', accent:'#55AAFF', wake:'85,170,255'  },
    { hull:'#4a1060', sail:'#8B2090', accent:'#FF66FF', wake:'255,102,255' },
    { hull:'#503010', sail:'#906020', accent:'#FFEE00', wake:'255,238,0'   },
    { hull:'#103040', sail:'#206080', accent:'#00EEFF', wake:'0,238,255'   },
    { hull:'#401010', sail:'#802020', accent:'#FF6644', wake:'255,102,68'  },
    { hull:'#102040', sail:'#204880', accent:'#88CCFF', wake:'136,204,255' },
    { hull:'#303000', sail:'#606000', accent:'#CCFF00', wake:'204,255,0'   },
];

// ── SERVER ────────────────────────────────────────────────────
const SERVER_URL = (window.location.protocol === 'file:')
    ? 'http://localhost:3000'
    : window.location.origin;

// ── SEEDED PRNG (Mulberry32) ──────────────────────────────────
// Used for world generation so all clients in a room see the same islands.
function _mulberry32(seed) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
let _sRndFn = _mulberry32(42);
function sRnd(a, b)       { return a + _sRndFn() * (b - a); }
function resetWorldSeed(s) { _sRndFn = _mulberry32(s); }

// ── UTILS ─────────────────────────────────────────────────────
const dist  = (x1,y1,x2,y2) => { const dx=x1-x2, dy=y1-y2; return Math.sqrt(dx*dx+dy*dy); };
const rnd   = (a,b) => a + Math.random()*(b-a);
const clamp = (v,a,b) => v<a?a:v>b?b:v;

function lerpAngle(cur, tgt, rate) {
    let d = tgt - cur;
    while (d >  Math.PI) d -= Math.PI*2;
    while (d < -Math.PI) d += Math.PI*2;
    if (Math.abs(d) < rate) return tgt;
    return cur + Math.sign(d)*rate;
}
