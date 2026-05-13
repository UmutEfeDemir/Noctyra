// =============================================================
//  world.js  —  World generation, spawning, particle helpers
// =============================================================

function generateWorld() {
    islands   = [];
    coins     = [];
    particles = [];
    _coinId   = 0;   // reset coin ID counter — declared in game.js

    // Islands — seeded so all clients in same room see identical layout
    for (let i = 0; i < 14; i++) {
        let x, y, tries = 0;
        do {
            x = sRnd(200, WORLD_W - 200);
            y = sRnd(200, WORLD_H - 200);
            tries++;
        } while (dist(x, y, PLAYER_SPAWN_X, PLAYER_SPAWN_Y) < SAFE_RADIUS && tries < 30);
        islands.push(new Island(x, y, sRnd(28, 95)));
    }

    // Coins + chests — seeded so all clients see the same initial positions
    for (let i = 0; i < COIN_TARGET;  i++) _spawnCoinSeeded();
    for (let i = 0; i < CHEST_TARGET; i++) _spawnChestSeeded();
}

// ── Coin / chest spawning ────────────────────────────────────
function _onIsland(x, y, pad) {
    return islands.some(isl => dist(x, y, isl.x, isl.y) < isl.r + pad);
}

// Seeded versions — used only during generateWorld() for consistent layout.
// Retry loop uses sRnd so all clients consume the same PRNG sequence.
function _spawnCoinSeeded() {
    let x, y, tries = 0;
    do { x = sRnd(80, WORLD_W - 80); y = sRnd(80, WORLD_H - 80); }
    while (++tries < 10 && _onIsland(x, y, 18));
    const c = new Coin(_coinId++, x, y, 1);
    coins.push(c);
    return c;
}
function _spawnChestSeeded() {
    let x, y, tries = 0;
    do { x = sRnd(100, WORLD_W - 100); y = sRnd(100, WORLD_H - 100); }
    while (++tries < 10 && _onIsland(x, y, 24));
    const c = new Coin(_coinId++, x, y, 5);
    coins.push(c);
    return c;
}

// Random versions — used for replacements/drops; return the coin for network broadcast
function spawnCoin(near) {
    let x, y, tries = 0;
    do {
        x = near ? clamp(near.x + rnd(-120, 120), 80, WORLD_W - 80) : rnd(80, WORLD_W - 80);
        y = near ? clamp(near.y + rnd(-120, 120), 80, WORLD_H - 80) : rnd(80, WORLD_H - 80);
    } while (++tries < 12 && _onIsland(x, y, 18));
    const c = new Coin(_coinId++, x, y, 1);
    coins.push(c);
    return c;
}

function spawnChest() {
    let x, y, tries = 0;
    do { x = rnd(100, WORLD_W - 100); y = rnd(100, WORLD_H - 100); }
    while (++tries < 12 && _onIsland(x, y, 24));
    const c = new Coin(_coinId++, x, y, 5);
    coins.push(c);
    return c;
}


// ── Particle effects ─────────────────────────────────────────
const _isMobileWorld = navigator.maxTouchPoints > 0 && window.innerWidth <= 768;
const _PART_MAX      = _isMobileWorld ? 120 : 350;

function _spawnParticles(x, y, r, g, b, n, sMin, sMax, life, sz) {
    if (particles.length > _PART_MAX) return;
    for (let i = 0; i < n; i++) {
        const a  = Math.random() * Math.PI * 2;
        const sp = rnd(sMin, sMax);
        particles.push(new Particle(
            x, y,
            Math.cos(a)*sp, Math.sin(a)*sp,
            r, g, b,
            life + Math.random()*20,
            sz + Math.random()*sz
        ));
    }
}

function spawnExplosion(x, y) {
    _spawnParticles(x, y, 255,130,  0, 20, 1, 5, 45, 3);
    _spawnParticles(x, y, 255, 50, 50,  8, 2, 6, 30, 2);
}

function spawnKillFX(x, y) {
    _spawnParticles(x, y, 255, 80, 80, 16, 2, 6, 50, 4);
}

function spawnCoinFX(x, y) {
    _spawnParticles(x, y, 255,215,  0,  8, 1, 3, 25, 2);
}

function spawnSteam(ship) {
    if (particles.length > _PART_MAX) return;
    const ba = ship.angle + Math.PI;
    const sp = rnd(1.5, 4);
    particles.push(new Particle(
        ship.x, ship.y,
        Math.cos(ba)*sp + rnd(-.5,.5),
        Math.sin(ba)*sp + rnd(-.5,.5),
        100, 200, 255,
        18 + Math.random()*15, 2
    ));
}

// Foam/wake bubble spawned at ship's trail head — tiny white-blue drops
function spawnWakeDrop(ship) {
    if (particles.length > _PART_MAX) return;
    const ba  = ship.angle + Math.PI;
    const s   = ship.size;
    // Slightly off-center perpendicular spread so bubbles don't all stack
    const perp = ship.angle + Math.PI / 2;
    const spread = (Math.random() - 0.5) * s * 0.7;
    const sp  = rnd(0.2, 0.9);
    particles.push(new Particle(
        ship.x + Math.cos(ba) * s * 0.6 + Math.cos(perp) * spread,
        ship.y + Math.sin(ba) * s * 0.6 + Math.sin(perp) * spread,
        Math.cos(ba) * sp + rnd(-0.25, 0.25),
        Math.sin(ba) * sp + rnd(-0.25, 0.25),
        210, 240, 255,
        8 + Math.random() * 10,
        1 + Math.random() * 1.2
    ));
}
