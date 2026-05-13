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
const elScore = document.getElementById('scoreDisplay');
const elBoost = document.getElementById('boostFill');
const elKill  = document.getElementById('killMsg');

// ── GAME STATE ───────────────────────────────────────────────
let gameState     = 'menu';
let player        = null;
let remotePlayers = new Map();   // socketId → RemotePlayer
let socket        = null;
let coins         = [];
let particles     = [];
let islands       = [];
let _coinId       = 0;           // global coin ID counter (reset by generateWorld)

// ── SCREEN SHAKE ──────────────────────────────────────────────
let _shakeAmt = 0, _shakeFrames = 0;
function screenShake(amt, frames) {
    _shakeAmt    = Math.max(_shakeAmt, amt);
    _shakeFrames = Math.max(_shakeFrames, frames);
}

// ── KILL FEED ─────────────────────────────────────────────────
const _killFeed = [];
function addToFeed(killer, victim) {
    _killFeed.unshift({ killer, victim, timer: 280 });
    if (_killFeed.length > 6) _killFeed.pop();
}

// ── MOBILE TOUCH ─────────────────────────────────────────────
let _touchId = null;
let camera        = { x: 0, y: 0 };
let mouse         = { x: 400, y: 300 };
let boostActive   = false;
let boostEnergy   = BOOST_MAX;
let frame         = 0;
let waveT         = 0;
let animId        = null;
let gracePeriod   = 0;
let killMsgTmr        = 0;
let _winnerToastTimer = 0;
let _connectError     = false;
let _connectTimeout   = null;
let _connectStartTime = 0;
let _ping             = 0;
let _currentRoomCode  = '';

// Delta time — set each frame so all modules can read it as a global
let _dt           = 1;
let _lastTs       = 0;
let _stateEmitAcc = 0;

// Mobile: emit at 20 Hz instead of 50 Hz to save CPU + bandwidth
// _isMobile is declared in renderer.js (loads before game.js)
const _EMIT_THRESH   = _isMobile ? 3 : 1.2;

// ── SYSTEMS ───────────────────────────────────────────────────
let comboCount    = 0;
let comboTimer    = 0;
let dayTime       = 0;
let _prevBoosting = false;
let highScore     = parseInt(localStorage.getItem('noctyra_hs') || '0');
const gameStats   = { kills: 0, score: 0, frames: 0, maxLen: 0, maxCombo: 0 };

// Death screen state
let _deathKiller = null;
let _deathScore  = 0;
let _isNewRecord = false;

// ── SOCKET SETUP ──────────────────────────────────────────────
const _leaveTimers = new Map(); // socketId → timeout handle

function _cancelLeaveTimer(id) {
    const t = _leaveTimers.get(id);
    if (t !== undefined) { clearTimeout(t); _leaveTimers.delete(id); }
}

function initSocket() {
    socket = io(SERVER_URL, {
        transports:              ['websocket', 'polling'],
        reconnectionDelay:       1000,
        reconnectionDelayMax:    3000,
        reconnectionAttempts:    25,
    });

    setInterval(() => {
        if (socket && socket.connected) {
            const t0 = Date.now();
            socket.emit('__ping');
            socket.once('__pong', () => {
                _ping = Date.now() - t0;
                const el = document.getElementById('pingDisplay');
                if (el) {
                    el.textContent = _ping + ' ms';
                    el.style.color = _ping < 150 ? '#44FF88' : _ping < 250 ? '#FFD700' : '#FF6644';
                }
            });
        }
    }, 2000);

    socket.on('room_joined', ({ seed, players, code }) => {
        if (_connectTimeout) { clearTimeout(_connectTimeout); _connectTimeout = null; }
        _connectError    = false;
        _currentRoomCode = code || '';
        _updateRoomCodeHUD();
        _coinId = 0;             // must be reset BEFORE generateWorld() assigns IDs
        resetWorldSeed(seed);
        generateWorld();
        // Each client gets a unique large offset for replacement coin IDs so
        // concurrent collections by different players never produce the same ID.
        _coinId = (COIN_TARGET + CHEST_TARGET) + Math.floor(Math.random() * 0x3FFFFFFF);

        // Cancel any pending removal timers and clear old remote players
        _leaveTimers.forEach(t => clearTimeout(t));
        _leaveTimers.clear();
        remotePlayers.clear();

        // Use actual positions from server so RemotePlayers start in the right place
        for (const p of players) {
            remotePlayers.set(p.id, new RemotePlayer(p.id, p.name, p.config, p.shipType, p.x, p.y));
        }

        gameState   = 'playing';
        gracePeriod = SPAWN_GRACE;
        _updateRoomHUD();
        updateRoomLB();
        _setMobileBoost(true);
    });

    socket.on('player_join', p => {
        // Cancel any death-removal timer for this id (player restarted quickly)
        _cancelLeaveTimer(p.id);
        // Use actual spawn position from server data
        remotePlayers.set(p.id, new RemotePlayer(p.id, p.name, p.config, p.shipType, p.x, p.y));
        _updateRoomHUD();
        updateRoomLB();
    });

    // Batched state update — server sends all dirty players at once every 50 ms
    socket.on('states_batch', batch => {
        for (const data of batch) {
            if (data.id === socket.id) continue;
            const rp = remotePlayers.get(data.id);
            if (rp && rp.alive) rp.applyState(data);
        }
    });

    socket.on('player_die', ({ id, killedBy, droppedCoins }) => {
        // If it's us who died
        if (id === socket.id) {
            playerDie(killedBy);
            return;
        }
        const rp = remotePlayers.get(id);
        if (rp) {
            if (rp.alive) {
                rp.alive = false;
                spawnExplosion(rp.x, rp.y);
                if (killedBy && killedBy !== player?.name) addToFeed(killedBy, rp.name);
                const t = setTimeout(() => { remotePlayers.delete(id); _leaveTimers.delete(id); }, 4000);
                _leaveTimers.set(id, t);
            }
            // Add synced drop coins (even on 2nd player_die event carrying the actual drops)
            if (droppedCoins && droppedCoins.length > 0) {
                for (const c of droppedCoins) {
                    if (!coins.some(co => co.id === c.id)) {
                        coins.push(new Coin(c.id, c.x, c.y, c.v));
                    }
                }
            }
        }
        _updateRoomHUD();
        updateRoomLB();
    });

    socket.on('player_leave', ({ id }) => {
        _cancelLeaveTimer(id);
        remotePlayers.delete(id);
        _updateRoomHUD();
        updateRoomLB();
    });

    // Coin sync — collector tells others which coin vanished + where the replacement is
    socket.on('coin_take', ({ id }) => {
        const i = coins.findIndex(c => c.id === id);
        if (i !== -1) coins.splice(i, 1);
    });

    socket.on('coin_add', ({ id, x, y, v }) => {
        if (!coins.some(c => c.id === id)) coins.push(new Coin(id, x, y, v));
    });

    socket.on('kill_confirmed', ({ victimName, victimMaxLen, bonus }) => {
        playSound('kill');
        screenShake(6, 18);
        addToFeed(player?.name || '?', victimName);
        comboCount++;
        comboTimer = 240;
        if (comboCount > gameStats.maxCombo) gameStats.maxCombo = comboCount;
        const mult       = comboCount >= 3 ? 3 : comboCount >= 2 ? 2 : 1;
        const finalBonus = Math.round(bonus * mult);

        player.score  += finalBonus;
        player.maxLen  = Math.min(player.maxLen + 10, MAX_TRAIL_LEN);
        gameStats.kills++;
        gameStats.score = player.score;
        elScore.textContent = tf('score', { n: player.score });

        const msg = mult > 1
            ? tf('comboText', { n: mult }) + '  ' + tf('killMsg', { name: victimName, bonus: finalBonus })
            : tf('killMsg', { name: victimName, bonus: finalBonus });
        showKillMsg(msg);
        updateComboDisplay();
    });

    socket.on('room_info', data => {
        _updateRoomHUD();
        if (data && data.count === 1 && player && player.alive && gameState === 'playing') {
            _winnerToastTimer = 300;
        }
    });

    socket.on('room_full', () => {
        if (_connectTimeout) { clearTimeout(_connectTimeout); _connectTimeout = null; }
        gameState = 'dead';
        const oc = document.getElementById('overlayContent');
        if (oc) {
            const savedName = player?.name || '';
            oc.innerHTML = `
                <div style="color:#FF6644;font-size:22px;margin-bottom:14px;">⚠️ Oda Dolu</div>
                <div style="color:rgba(200,200,200,0.72);font-size:13px;margin-bottom:24px;line-height:1.9">
                    Bu oda doldu. Başka bir kod dene.
                </div>
                <input id="nameInput" type="text" maxlength="15"
                       placeholder="${t('namePlaceholder')}" value="${savedName}">
                <input id="roomCodeInput" type="text" maxlength="4"
                       placeholder="${t('roomCodePlaceholder')}">
                <button id="startBtn" onclick="startGame()">${t('restartBtn')}</button>
            `;
        }
        document.getElementById('overlay').classList.remove('hidden');
        showCustomizer();
    });

    socket.on('connect_error', () => {
        _connectError = true;
        console.warn('[Socket] Sunucuya bağlanılamadı:', SERVER_URL);
    });

    socket.on('disconnect', () => {
        console.warn('[Socket] Sunucu bağlantısı kesildi, yeniden bağlanılıyor...');
    });

    socket.io.on('reconnect', () => {
        if ((gameState === 'playing' || gameState === 'connecting') && player) {
            socket.emit('join', {
                name:     player.name,
                config:   { ...playerShipConfig },
                shipType: playerShipConfig.shipType,
                x:        player.x,
                y:        player.y,
                roomCode: _currentRoomCode,   // rejoin same room after disconnect
            });
        }
    });
}

// ── COLLISION ────────────────────────────────────────────────
function checkCollisions() {
    if (!player || !player.alive) return;
    if (gracePeriod > 0) { gracePeriod = Math.max(0, gracePeriod - _dt); return; }

    // ── KILL CHECK runs first ────────────────────────────────────
    // If B's head enters A's trail AND A's head happens to be near B's trail,
    // running kills first ensures A wins — B is marked dead, skipped in death check.
    const ptrl = player.trail;
    const _killThresh = 700 * 700;
    for (const [id, rp] of remotePlayers) {
        if (!rp.alive) continue;
        // Spatial cull: skip players whose center is too far to possibly hit our trail
        const _sdx = rp.x - player.x, _sdy = rp.y - player.y;
        if (_sdx * _sdx + _sdy * _sdy > _killThresh) continue;
        const checkN = Math.min(ptrl.len, 60);
        for (let i = 2; i < checkN; i++) {
            const p  = ptrl.get(i);
            const dx = rp.x - p.x, dy = rp.y - p.y;
            if (dx * dx + dy * dy < (rp.size + 4) * (rp.size + 4)) {
                rp.alive = false;
                spawnKillFX(rp.x, rp.y);
                if (socket) socket.emit('kill', { victimId: id });
                break;
            }
        }
    }

    // ── DEATH CHECK: player head vs remote trails ────────────────
    // Skip remotes that were just killed above — their trail is no longer lethal.
    const threshSq = (player.size + 4) * (player.size + 4);
    for (const rp of remotePlayers.values()) {
        if (!rp.alive) continue;
        // Spatial cull
        const _sdx = rp.x - player.x, _sdy = rp.y - player.y;
        if (_sdx * _sdx + _sdy * _sdy > _killThresh) continue;
        const checkN = Math.min(rp.trail.len, 60);
        for (let i = 2; i < checkN; i++) {
            const p  = rp.trail.get(i);
            const dx = player.x - p.x, dy = player.y - p.y;
            if (dx * dx + dy * dy < threshSq) {
                playerDie(rp.name);   // playerDie() handles socket.emit('die')
                return;
            }
        }
    }

    // ── ISLAND collision ─────────────────────────────────────────
    for (const isl of islands) {
        if (isl.hits(player)) {
            playerDie(null);          // playerDie() handles socket.emit('die')
            return;
        }
    }
}

// ── DEATH ─────────────────────────────────────────────────────
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
               value="${player ? player.name : ''}">
        <input id="roomCodeInput" type="text" maxlength="4"
               placeholder="${t('roomCodePlaceholder')}"
               value="${_currentRoomCode}">
        <button id="startBtn" onclick="startGame()">${t('restartBtn')}</button>
`;
}


function playerDie(killedBy) {
    if (!player || !player.alive || gracePeriod > 0) return;

    player.alive = false;
    stopBoostSound();
    spawnExplosion(player.x, player.y);
    playSound('die');

    // Spawn drops locally and broadcast so others can collect them
    const drops = Math.floor(player.maxLen / 8);
    const droppedCoins = [];
    for (let i = 0; i < drops; i++) {
        const c = spawnCoin(player);
        droppedCoins.push({ id: c.id, x: c.x, y: c.y, v: c.v });
    }
    if (socket) socket.emit('die', { killedBy, droppedCoins });

    _deathKiller = killedBy;
    _deathScore  = player.score;
    _isNewRecord = player.score > 0 && player.score >= highScore;
    if (_isNewRecord) {
        highScore = player.score;
        localStorage.setItem('noctyra_hs', highScore);
    }

    screenShake(10, 30);
    gameState = 'spectating';
    _setMobileBoost(false);
    setTimeout(() => {
        if (gameState !== 'spectating') return;
        gameState = 'dead';
        rebuildDeathScreen();
        document.getElementById('overlay').classList.remove('hidden');
        showCustomizer();
    }, 3000);
}

// ── COIN COLLECTION ──────────────────────────────────────────
function checkCoins() {
    if (!player || !player.alive) return;
    const pReach = player.size + 2;

    for (let i = coins.length - 1; i >= 0; i--) {
        const co     = coins[i];
        const thresh = pReach + co.r;
        const dpx    = player.x - co.x, dpy = player.y - co.y;

        if (dpx * dpx + dpy * dpy < thresh * thresh) {
            player.eat(co.v);
            spawnCoinFX(co.x, co.y);
            playSound(co.isChest ? 'chest' : 'coin');
            elScore.textContent = tf('score', { n: player.score });
            gameStats.score     = player.score;
            coins.splice(i, 1);
            if (socket) socket.emit('coin_take', { id: co.id });

            if (co.isChest) {
                setTimeout(() => {
                    const nc = spawnChest();
                    if (socket) socket.emit('coin_add', { id: nc.id, x: nc.x, y: nc.y, v: nc.v });
                }, 6000);
            } else {
                const nc = spawnCoin();
                if (socket) socket.emit('coin_add', { id: nc.id, x: nc.x, y: nc.y, v: nc.v });
            }
        }
    }
}

// ── UI HELPERS ────────────────────────────────────────────────
function _updateRoomHUD() {
    const el = document.getElementById('roomInfo');
    if (el) el.textContent = `${remotePlayers.size + (player && player.alive ? 1 : 0)}/10 oyuncu`;
}

function _updateRoomCodeHUD() {
    const el = document.getElementById('roomCodeHUD');
    if (!el) return;
    if (_currentRoomCode) {
        el.textContent = '🔗 ' + _currentRoomCode;
        el.style.display = 'block';
        // Update browser URL bar so sharing the tab URL auto-joins the room
        history.replaceState(null, '', '?room=' + _currentRoomCode);
    } else {
        el.style.display = 'none';
    }
}

// Copy the invite link (full URL with ?room=) to clipboard.
// Falls back through: Web Share API → navigator.clipboard → execCommand
function copyRoomCode() {
    if (!_currentRoomCode) return;
    const url = location.origin + location.pathname + '?room=' + _currentRoomCode;

    const execFallback = () => {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand('copy'); showKillMsg(t('roomCodeCopied')); } catch (_) {}
        document.body.removeChild(ta);
    };

    const clipboardCopy = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url)
                .then(() => showKillMsg(t('roomCodeCopied')))
                .catch(execFallback);
        } else {
            execFallback();
        }
    };

    if (navigator.share) {
        navigator.share({ title: 'NOCTYRA — Oda ' + _currentRoomCode, url })
            .catch(clipboardCopy);
    } else {
        clipboardCopy();
    }
}

function updateRoomLB() {
    const el = document.getElementById('roomLB');
    if (!el || (gameState !== 'playing' && gameState !== 'spectating')) { if (el) el.innerHTML = ''; return; }

    const entries = [];
    if (player && player.alive) entries.push({ name: player.name, score: player.score, isMe: true });
    for (const rp of remotePlayers.values()) {
        if (rp.alive) entries.push({ name: rp.name, score: rp.score, isMe: false });
    }
    entries.sort((a, b) => b.score - a.score);

    el.innerHTML = entries.slice(0, 8).map((e, i) =>
        `<div class="rlb-entry${e.isMe ? ' rlb-me' : ''}">` +
        `<span class="rlb-rank">${i + 1}</span>` +
        `<span class="rlb-name">${e.name}</span>` +
        `<span class="rlb-score">${e.score}</span>` +
        `</div>`
    ).join('');
}

function updateComboDisplay() {
    const el = document.getElementById('comboDisplay');
    if (comboCount >= 2) {
        el.textContent   = tf('comboText', { n: comboCount });
        el.style.opacity = '1';
    } else {
        el.style.opacity = '0';
    }
}

function drawGraceRing() {
    if (!player || !player.alive || gracePeriod <= 0) return;
    const sx    = player.x - camera.x;
    const sy    = player.y - camera.y;
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
    elKill.textContent   = txt;
    elKill.style.opacity = '1';
    clearTimeout(killMsgTmr);
    killMsgTmr = setTimeout(() => elKill.style.opacity = '0', 2200);
}

function _setMobileBoost(visible) {
    const isTouch = navigator.maxTouchPoints > 0;
    const btn = document.getElementById('mobileBoostBtn');
    const joy = document.getElementById('joystick');
    if (btn) btn.style.display = (visible && isTouch) ? 'flex' : 'none';
    if (joy) joy.style.display = (visible && isTouch) ? 'block' : 'none';
    if (!visible) { _joy.active = false; _joy.dx = 0; _joy.dy = 0; }
}

function _showConnectError() {
    if (gameState !== 'connecting') return;
    gameState     = 'dead';
    _connectError = false;
    const oc = document.getElementById('overlayContent');
    if (oc) {
        const savedName = player?.name || '';
        oc.innerHTML = `
            <div style="color:#FF6644;font-size:22px;margin-bottom:14px;">⚠️ Sunucuya bağlanılamadı</div>
            <div style="color:rgba(200,200,200,0.72);font-size:13px;margin-bottom:24px;line-height:1.9">
                Sunucu geçici olarak kullanılamıyor.<br>Birkaç saniye bekleyip tekrar dene.
            </div>
            <input id="nameInput" type="text" maxlength="15"
                   placeholder="${t('namePlaceholder')}" value="${savedName}">
            <input id="roomCodeInput" type="text" maxlength="4"
                   placeholder="${t('roomCodePlaceholder')}">
            <button id="startBtn" onclick="startGame()">TEKRAR DENE</button>
        `;
    }
    document.getElementById('overlay').classList.remove('hidden');
    showCustomizer();
}

function drawKillFeed() {
    if (_killFeed.length === 0) return;
    for (let i = _killFeed.length - 1; i >= 0; i--) {
        _killFeed[i].timer -= _dt;
        if (_killFeed[i].timer <= 0) _killFeed.splice(i, 1);
    }
    if (_killFeed.length === 0) return;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.font      = 'bold 13px Georgia';
    let y = canvas.height - 80;
    for (let i = _killFeed.length - 1; i >= 0; i--) {
        const e = _killFeed[i];
        const a = Math.min(1, e.timer / 40);
        ctx.globalAlpha = a;
        const txt = `${e.killer} ⚔ ${e.victim}`;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(txt, 21, y + 1);
        ctx.fillStyle = '#FFD700';
        ctx.fillText(txt, 20, y);
        y -= 22;
    }
    ctx.restore();
}

// ── MAIN LOOP ─────────────────────────────────────────────────
function loop(ts) {
    // Delta time: how many 60fps-frames worth of time passed since last loop call.
    // Clamped so a tab coming back from background doesn't cause a huge jump.
    const raw = (_lastTs > 0 && ts > 0) ? (ts - _lastTs) / (1000 / 60) : 1;
    _dt   = Math.min(Math.max(raw, 0.1), 3);
    _lastTs = ts || 0;

    frame++;
    waveT   += 0.005 * _dt;
    dayTime  = (dayTime + _dt / 10800) % 1;

    if (player && player.alive) {
        camera.x = clamp(player.x - canvas.width  / 2, 0, WORLD_W - canvas.width);
        camera.y = clamp(player.y - canvas.height / 2, 0, WORLD_H - canvas.height);
    }

    const _shaking = _shakeFrames > 0;
    if (_shaking) {
        ctx.save();
        ctx.translate((Math.random() - 0.5) * _shakeAmt * 2, (Math.random() - 0.5) * _shakeAmt * 2);
        _shakeAmt    *= Math.pow(0.85, _dt);
        _shakeFrames -= _dt;
    }

    drawOcean();

    for (const isl of islands) isl.draw();
    for (const co  of coins)   co.draw();

    if (gameState === 'playing' || gameState === 'connecting') {
        if (player && player.alive) {
            // Joystick steering: override mouse direction when joystick is active
            if (_joy.active && (_joy.dx * _joy.dx + _joy.dy * _joy.dy) > 36) {
                const sx = player.x - camera.x;
                const sy = player.y - camera.y;
                mouse.x  = sx + _joy.dx * 9999;
                mouse.y  = sy + _joy.dy * 9999;
            }
            player.update();
            if (boostActive  && !_prevBoosting) startBoostSound();
            if (!boostActive &&  _prevBoosting) stopBoostSound();
            _prevBoosting = boostActive;

            // 50 Hz on desktop, 20 Hz on mobile (saves CPU + bandwidth)
            _stateEmitAcc += _dt;
            if (_stateEmitAcc >= _EMIT_THRESH && socket) {
                _stateEmitAcc -= _EMIT_THRESH;
                socket.emit('state', {
                    x:        Math.round(player.x * 10) / 10,
                    y:        Math.round(player.y * 10) / 10,
                    angle:    Math.round(player.angle * 1000) / 1000,
                    size:     Math.round(player.size * 10) / 10,
                    score:    player.score,
                    maxLen:   player.maxLen,
                    boosting: player.boosting,
                });
            }
        }
    }

    // Interpolate remote player positions toward their latest received state
    for (const rp of remotePlayers.values()) { if (rp.alive) rp.update(); }

    // Draw remote trails + ships
    for (const rp of remotePlayers.values()) { if (rp.alive) rp.drawTrail(); }
    if (player && player.alive) player.drawTrail();

    for (const rp of remotePlayers.values()) { if (rp.alive) rp.draw(); }
    if (player && player.alive) { player.draw(); drawGraceRing(); }

    // Connecting overlay
    if (gameState === 'connecting') {
        ctx.save();
        ctx.textAlign = 'center';
        if (_connectError) {
            ctx.font      = 'bold 20px Georgia';
            ctx.fillStyle = '#FF9966';
            ctx.fillText('Sunucuya bağlanılamadı — yeniden deneniyor...', canvas.width / 2, canvas.height / 2);
            ctx.font      = '14px Georgia';
            ctx.fillStyle = 'rgba(255,210,160,0.65)';
            ctx.fillText('Railway sunucusu uyanıyor olabilir, lütfen bekleyin (40s)', canvas.width / 2, canvas.height / 2 + 28);
        } else {
            const dots = '.'.repeat((Math.floor(frame / 20) % 4));
            ctx.font      = 'bold 22px Georgia';
            ctx.fillStyle = 'rgba(255,255,255,0.70)';
            ctx.fillText('Sunucuya bağlanıyor' + dots, canvas.width / 2, canvas.height / 2);
            if (Date.now() - _connectStartTime > 8000) {
                ctx.font      = '14px Georgia';
                ctx.fillStyle = 'rgba(255,210,160,0.70)';
                ctx.fillText('Sunucu uyanıyor olabilir, lütfen bekleyin...', canvas.width / 2, canvas.height / 2 + 32);
            }
        }
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        if (p.life <= 0) particles.splice(i, 1); else p.draw();
    }

    if (_shaking) ctx.restore();

    if (gameState === 'playing') {
        checkCollisions();
        checkCoins();

        if (comboTimer > 0) {
            comboTimer -= _dt;
            if (comboTimer <= 0) { comboTimer = 0; comboCount = 0; updateComboDisplay(); }
        }

        gameStats.frames += _dt;
        if (player && player.alive) {
            if (player.score !== gameStats.score) {
                elScore.textContent = tf('score', { n: player.score });
                gameStats.score = player.score;
                updateRoomLB();   // keep both displays in sync on every score change
            }
            gameStats.maxLen = player.maxLen;
        }
        tickAchievements(gameStats);

        if (frame % 90 === 0) updateRoomLB();   // periodic refresh for remote player scores
    }

    if (gameState === 'spectating' && frame % 60 === 0) updateRoomLB();

    // Spectating overlay
    if (gameState === 'spectating') {
        ctx.save();
        ctx.fillStyle = 'rgba(220,220,255,0.55)';
        ctx.font      = 'bold 20px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(t('spectating'), canvas.width / 2, canvas.height / 2 + 60);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    // Winner toast
    if (_winnerToastTimer > 0) {
        _winnerToastTimer -= _dt;
        const _wa = Math.min(1, _winnerToastTimer / 40);
        ctx.save();
        ctx.globalAlpha = _wa;
        ctx.fillStyle   = 'rgba(0,0,0,0.65)';
        ctx.fillRect(canvas.width / 2 - 185, canvas.height / 2 - 40, 370, 66);
        ctx.fillStyle = '#FFD700';
        ctx.font      = 'bold 28px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(t('winner'), canvas.width / 2, canvas.height / 2 + 4);
        ctx.textAlign = 'left';
        ctx.restore();
    }

    drawKillFeed();
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

    // Random spawn — avoids all players piling on the same point
    const spawnX = rnd(400, WORLD_W - 400);
    const spawnY = rnd(400, WORLD_H - 400);
    player = new Ship(spawnX, spawnY, true, 0, name, { ...playerShipConfig }, playerShipConfig.shipType);

    boostEnergy   = BOOST_MAX;
    boostActive   = false;
    frame         = 0;
    gracePeriod   = SPAWN_GRACE;
    comboCount    = 0;
    comboTimer    = 0;
    _prevBoosting = false;
    _deathKiller  = null;
    _deathScore   = 0;
    _isNewRecord  = false;
    gameStats.kills = 0; gameStats.score  = 0;
    gameStats.frames = 0; gameStats.maxLen = 0; gameStats.maxCombo = 0;
    gameState     = 'connecting';  // → 'playing' after room_joined
    _connectError     = false;
    _connectStartTime = Date.now();
    if (_connectTimeout) clearTimeout(_connectTimeout);
    _connectTimeout = setTimeout(_showConnectError, 40000);

    resetAchievements();
    remotePlayers.clear();
    document.getElementById('comboDisplay').style.opacity = '0';

    const hsEl = document.getElementById('highScoreHUD');
    if (hsEl) hsEl.textContent = highScore > 0 ? tf('highScore', { n: highScore }) : '';

    document.getElementById('nameDisplay').textContent = name;
    elScore.textContent = tf('score', { n: 0 });
    elBoost.style.width = '100%';
    _updateRoomHUD();

    if (animId) cancelAnimationFrame(animId);
    _lastTs = 0; _stateEmitAcc = 0;
    animId = requestAnimationFrame(loop);

    // Connect / join room — include actual spawn position so server can relay it
    const config   = { ...playerShipConfig };
    const shipType = playerShipConfig.shipType;
    const roomCode = (document.getElementById('roomCodeInput')?.value || '').trim().toUpperCase();
    // Sync URL with the intent: if joining a specific room keep it, otherwise clear
    if (!roomCode) history.replaceState(null, '', location.pathname);
    if (!socket) {
        initSocket();
        socket.once('connect', () => socket.emit('join', { name, config, shipType, x: spawnX, y: spawnY, roomCode }));
    } else {
        socket.emit('join', { name, config, shipType, x: spawnX, y: spawnY, roomCode });
    }
}

// ── INPUT ─────────────────────────────────────────────────────
canvas.addEventListener('mousemove',   e  => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown',   e  => { if (e.button === 0) boostActive = true; });
canvas.addEventListener('mouseup',     e  => { if (e.button === 0) boostActive = false; });
canvas.addEventListener('contextmenu', e  => e.preventDefault());
document.addEventListener('keydown',   e  => { if (e.code === 'Space') { e.preventDefault(); boostActive = true; } });
document.addEventListener('keyup',     e  => { if (e.code === 'Space') boostActive = false; });
window.addEventListener('blur',        () => { boostActive = false; });

// ── TOUCH (mobile) ────────────────────────────────────────────
// Dead zone: don't update direction if finger is within 55px of the ship's
// screen position — prevents erratic steering when touching near the ship centre.
function _applyTouch(cx, cy) {
    if (player && player.alive) {
        const sx = player.x - camera.x;
        const sy = player.y - camera.y;
        const dx = cx - sx, dy = cy - sy;
        if (dx * dx + dy * dy > 55 * 55) { mouse.x = cx; mouse.y = cy; }
    } else {
        mouse.x = cx; mouse.y = cy;
    }
}

canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    _touchId = touch.identifier;
    _applyTouch(touch.clientX, touch.clientY);
    // Boost is controlled by mobileBoostBtn, not by canvas touch
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
        if (touch.identifier === _touchId) _applyTouch(touch.clientX, touch.clientY);
    }
}, { passive: false });

canvas.addEventListener('touchend', e => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
        if (touch.identifier === _touchId) _touchId = null;
    }
}, { passive: false });

// Boost button — separate from canvas so one finger steers, other boosts
const _mbb = document.getElementById('mobileBoostBtn');
if (_mbb) {
    _mbb.addEventListener('touchstart', e => { e.preventDefault(); boostActive = true;  }, { passive: false });
    _mbb.addEventListener('touchend',   e => { e.preventDefault(); boostActive = false; }, { passive: false });
    _mbb.addEventListener('touchcancel',e => { e.preventDefault(); boostActive = false; }, { passive: false });
}

// ── VIRTUAL JOYSTICK ──────────────────────────────────────────
const _joy     = { active: false, id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
const _JOY_R   = 44;
const _joyEl   = document.getElementById('joystick');
const _joyKnob = document.getElementById('joystickKnob');

function _joyApply(t) {
    let dx = t.clientX - _joy.cx, dy = t.clientY - _joy.cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > _JOY_R) { dx = dx / len * _JOY_R; dy = dy / len * _JOY_R; }
    _joy.dx = dx; _joy.dy = dy;
    if (_joyKnob) _joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

if (_joyEl) {
    _joyEl.addEventListener('touchstart', e => {
        e.preventDefault();
        if (_joy.active) return;
        const t     = e.changedTouches[0];
        _joy.active = true; _joy.id = t.identifier;
        _joy.cx     = t.clientX; _joy.cy = t.clientY;
        _joy.dx     = 0;   _joy.dy = 0;
        if (_joyKnob) _joyKnob.style.transform = 'translate(-50%, -50%)';
    }, { passive: false });
}

window.addEventListener('touchmove', e => {
    if (!_joy.active) return;
    for (const t of e.changedTouches) {
        if (t.identifier === _joy.id) { _joyApply(t); break; }
    }
}, { passive: true });

function _joyRelease(e) {
    for (const t of e.changedTouches) {
        if (_joy.active && t.identifier === _joy.id) {
            _joy.active = false; _joy.id = null; _joy.dx = 0; _joy.dy = 0;
            if (_joyKnob) _joyKnob.style.transform = 'translate(-50%, -50%)';
            break;
        }
    }
}
window.addEventListener('touchend',    _joyRelease, { passive: true });
window.addEventListener('touchcancel', _joyRelease, { passive: true });

// ── MENU BACKGROUND ANIMATION ────────────────────────────────
const _menuShips = [
    { x: 0.15, y: 0.28, spd: 0.00018, angle: 0.18,          sz: 22, col: '#FFD700' },
    { x: 0.70, y: 0.62, spd: 0.00012, angle: Math.PI + 0.1, sz: 16, col: '#aaaaff' },
    { x: 0.40, y: 0.80, spd: 0.00015, angle: 0.08,          sz: 28, col: '#FF8800' },
    { x: 0.88, y: 0.18, spd: 0.00010, angle: Math.PI + 0.25,sz: 14, col: '#88ffcc' },
];

function _drawMenuShip(x, y, sz, angle, col, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    const s = sz;
    ctx.beginPath();
    ctx.moveTo(0, -s * 1.3);
    ctx.bezierCurveTo(s * 0.5, -s * 0.5, s * 0.6, s * 0.4, s * 0.35, s * 0.9);
    ctx.lineTo(-s * 0.35, s * 0.9);
    ctx.bezierCurveTo(-s * 0.6, s * 0.4, -s * 0.5, -s * 0.5, 0, -s * 1.3);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.fillRect(-1.5, -s * 0.38, 3, s * 1.0);
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, s * 0.05); ctx.quadraticCurveTo(0, s * 0.28, s * 0.45, s * 0.05);
    ctx.lineTo(s * 0.45, s * 0.6);   ctx.quadraticCurveTo(0, s * 0.78, -s * 0.45, s * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.35); ctx.lineTo(s * 0.3, s * 0.03); ctx.lineTo(-s * 0.3, s * 0.03);
    ctx.closePath(); ctx.fill();
    ctx.restore();
}

(function idleLoop(ts) {
    if (gameState === 'menu') {
        const idleDt = (_lastTs > 0 && ts > 0) ? Math.min((ts - _lastTs) / (1000/60), 3) : 1;
        _lastTs = ts || 0;
        frame++;
        waveT += 0.005 * idleDt;
        drawOcean();
        const now = Date.now();
        for (const ms of _menuShips) {
            const progress = (now * ms.spd) % 1;
            const sx = ms.angle < Math.PI
                ? progress * (canvas.width + 200) - 100
                : canvas.width - progress * (canvas.width + 200) + 100;
            const sy  = ms.y * canvas.height;
            const bob = Math.sin(now * 0.001 + ms.x * 10) * 3;
            _drawMenuShip(sx, sy + bob, ms.sz, ms.angle, ms.col, 0.09);
        }
        requestAnimationFrame(idleLoop);
    }
})(performance.now());

// ── URL ?room= parameter → auto-fill room code input ─────────
(function() {
    const param = new URLSearchParams(location.search).get('room');
    if (!param) return;
    const clean = param.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (clean.length !== 4) return;
    const inp = document.getElementById('roomCodeInput');
    if (inp) inp.value = clean;
})();
