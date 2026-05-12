// =============================================================
//  world.js  —  World generation, spawning, particle helpers
// =============================================================

function generateWorld() {
    islands   = [];
    coins     = [];
    particles = [];

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

    for (let i = 0; i < COIN_TARGET;  i++) spawnCoin();
    for (let i = 0; i < CHEST_TARGET; i++) spawnChest();
}

// ── Coin / chest spawning ────────────────────────────────────
function spawnCoin(near) {
    const x = near ? clamp(near.x + rnd(-80,80), 80, WORLD_W-80) : rnd(80, WORLD_W-80);
    const y = near ? clamp(near.y + rnd(-80,80), 80, WORLD_H-80) : rnd(80, WORLD_H-80);
    coins.push(new Coin(x, y, 1));
}

function spawnChest() {
    coins.push(new Coin(rnd(100, WORLD_W-100), rnd(100, WORLD_H-100), 5));
}


// ── Particle effects ─────────────────────────────────────────
// Particle stores r,g,b as numbers — no string building per particle per frame.

function _spawnParticles(x, y, r, g, b, n, sMin, sMax, life, sz) {
    if (particles.length > 350) return;
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
    if (particles.length > 350) return;
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
