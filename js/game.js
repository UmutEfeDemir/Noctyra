// =============================================================
//  game.js  —  Canvas setup, state, loop, collision, UI, input
// =============================================================

// ── CANVAS ───────────────────────────────────────────────────
const canvas   = document.getElementById('gameCanvas');
const ctx      = canvas.getContext('2d');
const mmCanvas = document.getElementById('minimap');
const mmCtx    = mmCanvas.getContext('2d');

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resize();
window.addEventListener('resize', resize);

// ── CACHED DOM REFS ───────────────────────────────────────────
// Looked up once — avoids getElementById traversal every frame
const elScore  = document.getElementById('scoreDisplay');
const elBoost  = document.getElementById('boostFill');
const elKill   = document.getElementById('killMsg');
const elLb     = document.getElementById('lbContent');

// ── GAME STATE ───────────────────────────────────────────────
let gameState   = 'menu';
let player      = null;
let ais         = [];
let coins       = [];
let particles   = [];
let islands     = [];
let camera      = { x: 0, y: 0 };
let mouse       = { x: 400, y: 300 };
let boostActive = false;
let boostEnergy = BOOST_MAX;
let frame       = 0;
let waveT       = 0;
let animId      = null;
let gracePeriod = 0;
let aiCollTick  = 0;
let killMsgTmr  = 0;

// ── NEW SYSTEMS ───────────────────────────────────────────────
let comboCount    = 0;
let comboTimer    = 0;
let dayTime       = 0;       // 0–1, full cycle ~5 min
let _prevBoosting = false;
let highScore     = parseInt(localStorage.getItem('noctyra_hs') || '0');
const gameStats   = { kills: 0, score: 0, frames: 0, maxLen: 0 };

// Death screen state — stored so rebuildDeathScreen() can re-render on lang change
let _deathKiller    = null;
let _deathScore     = 0;
let _isNewRecord    = false;

// ── COLLISION ────────────────────────────────────────────────
function checkCollisions() {
    if (!player || !player.alive) return;
    if (gracePeriod > 0) { gracePeriod--; return; }

    // Player head vs enemy trails (self-collision disabled entirely)
    const enemyThreshSq = (player.size + 4) * (player.size + 4);

    for (let s = 0; s < ais.length; s++) {
        const sh = ais[s];
        if (!sh || !sh.alive) continue;

        const trl    = sh.trail;
        const checkN = Math.min(trl.len, 120); // cap depth — older tail rarely matters
        for (let i = 3; i < checkN; i++) {
            const p  = trl.get(i);
            const dx = player.x - p.x, dy = player.y - p.y;
            if (dx*dx + dy*dy < enemyThreshSq) {
                playerDie(sh.name);
                return;
            }
        }
    }

    // Island collision
    for (const isl of islands) {
        if (isl.hits(player)) { playerDie(null); return; }
    }

    // AI heads vs player trail (every frame)
    for (let ai = 0; ai < ais.length; ai++) {
        const ship = ais[ai];
        if (!ship || !ship.alive) continue;
        const ptrl   = player.trail;
        const checkN = Math.min(ptrl.len, 120);
        for (let i = 2; i < checkN; i++) {
            const p  = ptrl.get(i);
            const dx = ship.x - p.x, dy = ship.y - p.y;
            if (dx*dx + dy*dy < (ship.size+4)*(ship.size+4)) {
                aiDie(ai, 'player');
                break;
            }
        }
    }

    // AI-vs-AI collision: only every 4th frame + depth capped
    aiCollTick++;
    if (aiCollTick % 4 !== 0) return;

    for (let ai = 0; ai < ais.length; ai++) {
        const ship = ais[ai];
        if (!ship || !ship.alive) continue;

        for (let aj = 0; aj < ais.length; aj++) {
            if (aj === ai || !ais[aj] || !ais[aj].alive) continue;
            const otrl   = ais[aj].trail;
            const checkN = Math.min(otrl.len, 80);
            for (let i = 10; i < checkN; i++) {
                const p  = otrl.get(i);
                const dx = ship.x - p.x, dy = ship.y - p.y;
                if (dx*dx + dy*dy < (ship.size+4)*(ship.size+4)) {
                    aiDie(ai, 'ai');
                    break;
                }
            }
            if (!ship.alive) break;
        }
    }
}

function aiDie(idx, killedBy) {
    const ship = ais[idx];
    if (!ship || !ship.alive) return;
    ship.alive = false;
    spawnKillFX(ship.x, ship.y);

    const drops = Math.floor(ship.maxLen / 9);
    for (let i = 0; i < drops; i++) spawnCoin(ship);

    if (killedBy === 'player') {
        playSound('kill');
        // Combo multiplier
        comboCount++;
        comboTimer = 240;
        const mult  = comboCount >= 3 ? 3 : comboCount >= 2 ? 2 : 1;
        const bonus = Math.round((ship.score + 12) * mult);

        player.score  += bonus;
        player.maxLen  = Math.min(player.maxLen + 25, MAX_TRAIL_LEN);
        gameStats.kills++;
        gameStats.score = player.score;

        elScore.textContent = tf('score', { n: player.score });
        const msg = mult > 1
            ? tf('comboText', { n: mult }) + '  ' + tf('killMsg', { name: ship.name, bonus })
            : tf('killMsg', { name: ship.name, bonus });
        showKillMsg(msg);
        updateComboDisplay();
    }
    respawnAI(idx);
}

function rebuildDeathScreen() {
    const oc = document.getElementById('overlayContent');
    if (!oc) return;
    oc.innerHTML = `
        <div class="death-msg">${t('yourShipSank')}</div>
        ${_deathKiller ? `<div class="death-killer">${tf('killedBy', { name: _deathKiller })}</div>` : ''}
        <div class="final-score">${tf('treasure', { score: _deathScore })}</div>
        ${_isNewRecord
            ? `<div style="color:#FFD700;font-size:18px;margin-bottom:8px;text-shadow:0 0 18px rgba(255,200,0,.7)">${t('newRecord')}</div>`
            : (highScore > 0 ? `<div style="color:rgba(160,185,230,.6);font-size:13px;margin-bottom:10px">${tf('highScore', { n: highScore })}</div>` : '')}
        <input id="nameInput" type="text" maxlength="15"
               placeholder="${t('namePlaceholder')}"
               value="${_deathKiller ? '' : (player ? player.name : '')}">
        <button id="startBtn" onclick="startGame()">${t('restartBtn')}</button>
        <div id="globalLB" class="global-lb"></div>`;
}

function _renderGlobalLB(rows) {
    const el = document.getElementById('globalLB');
    if (!el || !rows || rows.length === 0) return;
    el.innerHTML =
        `<div class="glb-title">${t('globalLbTitle')}</div>` +
        rows.map((r, i) =>
            `<div class="glb-entry${r.player_name === (player?.name) ? ' glb-me' : ''}">` +
            `<span>${i + 1}. ${r.player_name}</span>` +
            `<span>${r.best_score}</span>` +
            `</div>`
        ).join('');
}

function playerDie(killedBy) {
    if (!player || !player.alive || gracePeriod > 0) return;

    player.alive = false;
    stopBoostSound();
    spawnExplosion(player.x, player.y);
    playSound('die');

    const drops = Math.floor(player.maxLen / 8);
    for (let i = 0; i < drops; i++) spawnCoin(player);

    _deathKiller   = killedBy;
    _deathScore    = player.score;
    _isNewRecord   = player.score > 0 && player.score >= highScore;
    if (_isNewRecord) {
        highScore = player.score;
        localStorage.setItem('noctyra_hs', highScore);
    }

    gameState = 'dead';
    rebuildDeathScreen();
    document.getElementById('overlay').classList.remove('hidden');
    showCustomizer();

    // Persist score to DB then refresh global leaderboard
    if (typeof dbSaveScore === 'function') {
        dbSaveScore(player.name, _deathScore, gameStats.kills).then(() => {
            return typeof dbGetLeaderboard === 'function' ? dbGetLeaderboard() : Promise.resolve([]);
        }).then(rows => _renderGlobalLB(rows)).catch(() => {});
    }
}

function playerTakeDamage(killedBy) { playerDie(killedBy); }

// ── COIN COLLECTION ──────────────────────────────────────────
function checkCoins() {
    if (!player || !player.alive) return;

    // Pre-compute player reach once (avoids recalc per coin)
    const pReach = player.size + 2;

    for (let i = coins.length - 1; i >= 0; i--) {
        const co    = coins[i];
        const thresh = pReach + co.r;
        let eaten   = false;

        // Check player
        const dpx = player.x - co.x, dpy = player.y - co.y;
        if (dpx*dpx + dpy*dpy < thresh*thresh) {
            player.eat(co.v);
            spawnCoinFX(co.x, co.y);
            playSound(co.isChest ? 'chest' : 'coin');
            elScore.textContent = tf('score', { n: player.score });
            gameStats.score = player.score;
            eaten = true;
        }

        if (!eaten) {
            // Check each AI
            for (let j = 0; j < ais.length; j++) {
                const ai = ais[j];
                if (!ai || !ai.alive) continue;
                const dx = ai.x - co.x, dy = ai.y - co.y;
                const at = ai.size + co.r + 2;
                if (dx*dx + dy*dy < at*at) {
                    ai.eat(co.v);
                    eaten = true;
                    break;
                }
            }
        }

        if (eaten) {
            coins.splice(i, 1);
            co.isChest ? setTimeout(spawnChest, 6000) : spawnCoin();
        }
    }
}

// ── UI HELPERS ────────────────────────────────────────────────
function updateComboDisplay() {
    const el = document.getElementById('comboDisplay');
    if (comboCount >= 2) {
        el.textContent = tf('comboText', { n: comboCount });
        el.style.opacity = '1';
    } else {
        el.style.opacity = '0';
    }
}

function drawGraceRing() {
    if (!player || !player.alive || gracePeriod <= 0) return;
    const sx   = player.x - camera.x;
    const sy   = player.y - camera.y;
    const blink = (gracePeriod % 28 < 14) ? 0.75 : 0.18;
    const r     = player.size * 2.6 + Math.sin(frame * 0.18) * 3;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0,220,180,${blink})`;
    ctx.lineWidth   = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

function showKillMsg(txt) {
    elKill.textContent = txt;
    elKill.style.opacity = '1';
    clearTimeout(killMsgTmr);
    killMsgTmr = setTimeout(() => elKill.style.opacity = '0', 2200);
}

function updateLB() {
    const all = [player, ...ais]
        .filter(s => s && s.alive)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

    elLb.innerHTML = all.map((s, i) => {
        const cls = s === player ? 'lb-entry lb-player' : 'lb-entry';
        return `<div class="${cls}"><span>${i+1}. ${s.name}</span><span>${s.score}</span></div>`;
    }).join('');
}

// ── MAIN LOOP ─────────────────────────────────────────────────
function loop() {
    frame++;
    waveT   += 0.005;
    dayTime  = (dayTime + 1 / 10800) % 1; // ~3-minute day/night cycle

    // Update camera
    if (player && player.alive) {
        camera.x = clamp(player.x - canvas.width  / 2, 0, WORLD_W - canvas.width);
        camera.y = clamp(player.y - canvas.height / 2, 0, WORLD_H - canvas.height);
    }

    // Background (uses dayTime for color)
    drawOcean();

    // Static world
    for (const isl of islands) isl.draw();
    for (const co  of coins)   co.draw();

    // Update game objects
    if (gameState === 'playing') {
        if (player && player.alive) {
            player.update();
            if (boostActive  && !_prevBoosting) startBoostSound();
            if (!boostActive &&  _prevBoosting) stopBoostSound();
            _prevBoosting = boostActive;
        }
        for (const ai of ais) { if (ai && ai.alive) ai.update(); }
    }

    // Draw trails then ships
    for (const sh of ais)   { if (sh && sh.alive) sh.drawTrail(); }
    if (player && player.alive) player.drawTrail();

    for (const sh of ais)   { if (sh && sh.alive) sh.draw(); }
    if (player && player.alive) { player.draw(); drawGraceRing(); }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        if (p.life <= 0) { particles.splice(i, 1); } else { p.draw(); }
    }

    // Game logic
    if (gameState === 'playing') {
        checkCollisions();
        checkCoins();

        // Combo decay
        if (comboTimer > 0) {
            comboTimer--;
            if (comboTimer === 0) { comboCount = 0; updateComboDisplay(); }
        }

        // Stats + achievements
        gameStats.frames++;
        if (player && player.alive) {
            gameStats.score  = player.score;
            gameStats.maxLen = player.maxLen;
        }
        tickAchievements(gameStats);

        if (frame % 30 === 0) updateLB();
    }

    drawMinimap();
    animId = requestAnimationFrame(loop);
}

// ── START GAME ────────────────────────────────────────────────
function startGame() {
    const name = (document.getElementById('nameInput')?.value || '').trim();
    if (!name) {
        const inp = document.getElementById('nameInput');
        if (inp) { inp.style.borderColor = '#FF4444'; inp.focus(); }
        return;
    }
    if (document.getElementById('nameInput'))
        document.getElementById('nameInput').style.borderColor = '#FFD700';
    document.getElementById('overlay').classList.add('hidden');
    hideCustomizer();

    generateWorld();

    player = new Ship(PLAYER_SPAWN_X, PLAYER_SPAWN_Y, true, 0, name, { ...playerShipConfig }, playerShipConfig.shipType);

    ais = [];
    for (let i = 0; i < AI_COUNT; i++) {
        const pos = safeAISpawn(SAFE_RADIUS);
        ais.push(new Ship(pos.x, pos.y, false, i+1, rndName()));
    }

    boostEnergy   = BOOST_MAX;
    boostActive   = false;
    frame         = 0;
    gracePeriod   = SPAWN_GRACE;
    aiCollTick    = 0;
    comboCount    = 0;
    comboTimer    = 0;
    _prevBoosting = false;
    _deathKiller  = null;
    _deathScore   = 0;
    _isNewRecord  = false;
    gameStats.kills = 0; gameStats.score = 0;
    gameStats.frames = 0; gameStats.maxLen = 0;
    gameState     = 'playing';

    resetAchievements();
    document.getElementById('comboDisplay').style.opacity = '0';

    const hsEl = document.getElementById('highScoreHUD');
    if (hsEl) hsEl.textContent = highScore > 0 ? tf('highScore', { n: highScore }) : '';

    document.getElementById('nameDisplay').textContent = name;
    elScore.textContent  = tf('score', { n: 0 });
    elLb.innerHTML       = '';
    elBoost.style.width  = '100%';

    if (animId) cancelAnimationFrame(animId);
    loop();
}

// ── INPUT ─────────────────────────────────────────────────────
canvas.addEventListener('mousemove',   e  => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown',   e  => { if (e.button === 0) boostActive = true; });
canvas.addEventListener('mouseup',     e  => { if (e.button === 0) boostActive = false; });
canvas.addEventListener('contextmenu', e  => e.preventDefault());
document.addEventListener('keydown',   e  => { if (e.code === 'Space') { e.preventDefault(); boostActive = true; } });
document.addEventListener('keyup',     e  => { if (e.code === 'Space') boostActive = false; });
window.addEventListener('blur',        () => { boostActive = false; });

// ── MENU BACKGROUND ANIMATION ────────────────────────────────
// Ghost ships that drift across the start screen
const _menuShips = [
    { x: 0.15, y: 0.28, spd: 0.00018, angle: 0.18,  sz: 22, col: '#FFD700' },
    { x: 0.70, y: 0.62, spd: 0.00012, angle: Math.PI+0.1, sz: 16, col: '#aaaaff' },
    { x: 0.40, y: 0.80, spd: 0.00015, angle: 0.08,  sz: 28, col: '#FF8800' },
    { x: 0.88, y: 0.18, spd: 0.00010, angle: Math.PI+0.25, sz: 14, col: '#88ffcc' },
];

function _drawMenuShip(x, y, sz, angle, col, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    const s = sz;
    // Simple hull silhouette
    ctx.beginPath();
    ctx.moveTo(0, -s*1.3);
    ctx.bezierCurveTo(s*0.5, -s*0.5, s*0.6, s*0.4, s*0.35, s*0.9);
    ctx.lineTo(-s*0.35, s*0.9);
    ctx.bezierCurveTo(-s*0.6, s*0.4, -s*0.5, -s*0.5, 0, -s*1.3);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    // Mast + sails
    ctx.fillStyle = col;
    ctx.fillRect(-1.5, -s*0.38, 3, s*1.0);
    ctx.beginPath();
    ctx.moveTo(-s*0.45, s*0.05); ctx.quadraticCurveTo(0, s*0.28, s*0.45, s*0.05);
    ctx.lineTo(s*0.45, s*0.6);   ctx.quadraticCurveTo(0, s*0.78, -s*0.45, s*0.6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -s*0.35); ctx.lineTo(s*0.3, s*0.03); ctx.lineTo(-s*0.3, s*0.03);
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

(function idleLoop() {
    if (gameState === 'menu') {
        frame++;
        waveT += 0.005;
        drawOcean();

        // Drifting ghost ships
        const now = Date.now();
        for (const ms of _menuShips) {
            const progress = (now * ms.spd) % 1;
            const sx = ms.angle < Math.PI
                ? progress * (canvas.width + 200) - 100
                : canvas.width - progress * (canvas.width + 200) + 100;
            const sy = ms.y * canvas.height;
            const bob = Math.sin(now * 0.001 + ms.x * 10) * 3;
            _drawMenuShip(sx, sy + bob, ms.sz, ms.angle, ms.col, 0.09);
        }

        requestAnimationFrame(idleLoop);
    }
})();
