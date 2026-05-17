// =============================================================
//  server.js  —  Noctyra multiplayer server
//  Node.js + Express (static files) + Socket.io (real-time)
//  Run: node server.js
// =============================================================

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');

const PORT          = process.env.PORT || 3000;
const MAX_ROOM_SIZE = 10;
const TICK_MS       = 20;   // server broadcasts batched states at 50 Hz

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    cors:         { origin: '*' },
    pingTimeout:  8000,
    pingInterval: 5000,
    transports:   ['websocket', 'polling'],
});

app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// ── NeonDB ────────────────────────────────────────────────────
const _NEON_URL  = 'https://api.c-7.us-east-1.aws.neon.tech/sql';
const _NEON_CONN = process.env.NEON_CONN ||
    'postgresql://neondb_owner:npg_sadW2pJhfQw8@ep-wild-waterfall-app28mo3-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function _dbQuery(sql, params = []) {
    try {
        const res = await fetch(_NEON_URL, {
            method: 'POST',
            headers: { 'Neon-Connection-String': _NEON_CONN },
            body: JSON.stringify({ query: sql, params }),
        });
        if (!res.ok) return [];
        return (await res.json()).rows ?? [];
    } catch { return []; }
}

async function dbSaveScore(name, score, kills) {
    if (!name || score <= 0) return;
    await _dbQuery(
        'INSERT INTO leaderboard (player_name, score, kills) VALUES ($1, $2, $3)',
        [name, score, kills]
    );
}

async function dbSaveAchievement(name, achId) {
    if (!name || !achId) return;
    await _dbQuery(
        'INSERT INTO achievements (player_name, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [name, achId]
    );
}

// ── REST API ──────────────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
    const rows = await _dbQuery(
        'SELECT player_name, MAX(score) AS best_score, SUM(kills) AS total_kills ' +
        'FROM leaderboard GROUP BY player_name ORDER BY best_score DESC LIMIT 10'
    );
    res.json(rows);
});

app.post('/api/achievement', async (req, res) => {
    const { name, achId } = req.body || {};
    await dbSaveAchievement(name, achId);
    res.json({ ok: true });
});

app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((s, r) => s + r.players.size, 0) });
});

// ── Bot system ────────────────────────────────────────────────
const BOUNTY_SCORE    = 300;
const BOT_FILL_TARGET = 6;   // oda bu kadar toplam oyuncuya (gerçek + bot) kadar dolar
const BOT_SPEED       = 1.78;
const BOT_BOOST_SPEED = 3.1;
const BOT_TURN        = 0.094;
const BOT_CHASE_R     = 1400;
const BOT_NAMES = ['Elif','MrAtalay','Crashnn','Echo','Noir','Lycidas','Napolyon','Nico'];
const BOT_CONFIGS  = [
    { hull:'#1C1C2E', sail:'#555580', accent:'#FF4466', wake:'255,68,102'   },
    { hull:'#1a3a5c', sail:'#2a5a8c', accent:'#00EEFF', wake:'0,238,255'   },
    { hull:'#3D0060', sail:'#7A10A0', accent:'#EE44EE', wake:'238,68,238'  },
    { hull:'#111111', sail:'#333333', accent:'#FFD700', wake:'255,215,0'   },
    { hull:'#1a2a10', sail:'#3a6020', accent:'#88FF44', wake:'136,255,68'  },
    { hull:'#3a1010', sail:'#802020', accent:'#FF8800', wake:'255,136,0'   },
];
const BOT_TYPES    = ['sandal','gemi','gemi','savas'];

function _uniqueBotName(room) {
    const used = new Set([...room.players.values()].map(p => p.name));
    const avail = BOT_NAMES.filter(n => !used.has(n));
    const pool  = avail.length > 0 ? avail : BOT_NAMES;
    return pool[Math.floor(Math.random() * pool.length)];
}

function _makeBotData(room) {
    const id  = 'BOT_' + Math.random().toString(36).slice(2, 9).toUpperCase();
    const cfg = BOT_CONFIGS[Math.floor(Math.random() * BOT_CONFIGS.length)];
    const sz  = 14 + Math.floor(Math.random() * 6);   // bots start slightly bigger
    return {
        id, isBot: true,
        name:     _uniqueBotName(room),
        config:   cfg,
        shipType: BOT_TYPES[Math.floor(Math.random() * BOT_TYPES.length)],
        x: 400 + Math.random() * 4200,
        y: 400 + Math.random() * 4200,
        angle:    Math.random() * Math.PI * 2,
        score: Math.floor(Math.random() * 40),
        size: _botSizeFromScore(Math.floor(Math.random() * 40)),
        maxLen: 55 + sz * 2, kills: 0,
        boosting: false, _dirty: true,
        _wpX: 2500, _wpY: 2500,
        _boostTick: 0,
    };
}

function _botSizeFromScore(score) {
    return 13 + Math.sqrt(Math.max(0, score)) * 1.2;
}

function _updateBotAI(bot, room) {
    bot._boostTick = (bot._boostTick || 0) + 1;

    // Gradual score growth (simulates coin eating) — every 90 ticks ≈ 4.5 s
    if (bot._boostTick % 90 === 0) {
        bot.score   = Math.min(900, (bot.score || 0) + 3);
        bot.size    = _botSizeFromScore(bot.score);
        bot.maxLen  = Math.min(700, 55 + bot.score * 0.55);
        bot._dirty  = true;
    }

    // Find nearest real player within chase radius
    let target = null;
    let bestD2 = BOT_CHASE_R * BOT_CHASE_R;
    for (const pd of room.players.values()) {
        if (pd.isBot) continue;
        const dx = pd.x - bot.x, dy = pd.y - bot.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; target = pd; }
    }

    let tx, ty, boosting = false;

    if (target) {
        const dist = Math.sqrt(bestD2);

        if (dist < 160) {
            // ORBIT: tightly circle the target, always boosting to cut trail
            bot._orbitSide = bot._orbitSide || (Math.random() < 0.5 ? 1 : -1);
            if (bot._boostTick % 90 === 0) bot._orbitSide *= -1;
            const perpAngle = target.angle + (Math.PI / 2) * bot._orbitSide;
            tx = target.x + Math.cos(perpAngle) * 85;
            ty = target.y + Math.sin(perpAngle) * 85;
            boosting = true; // always boost in close combat
        } else if (dist < 500) {
            // INTERCEPT: lead target aggressively, always boost
            bot._orbitSide = null;
            const lead = Math.min(dist * 0.5, 260);
            tx = target.x + Math.cos(target.angle) * lead;
            ty = target.y + Math.sin(target.angle) * lead;
            boosting = true;
        } else {
            // APPROACH: head straight for target, occasional boost
            bot._orbitSide = null;
            const lead = Math.min(dist * 0.3, 180);
            tx = target.x + Math.cos(target.angle) * lead;
            ty = target.y + Math.sin(target.angle) * lead;
            boosting = bot._boostTick % 60 < 20;
        }
    } else {
        // WANDER: random waypoint
        bot._orbitSide = null;
        tx = bot._wpX; ty = bot._wpY;
        const dx = tx - bot.x, dy = ty - bot.y;
        if (dx * dx + dy * dy < 100 * 100) {
            bot._wpX = 300 + Math.random() * 4400;
            bot._wpY = 300 + Math.random() * 4400;
            tx = bot._wpX; ty = bot._wpY;
        }
    }

    // Turn toward target
    const ta = Math.atan2(ty - bot.y, tx - bot.x);
    let da = ta - bot.angle;
    while (da >  Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    bot.angle += Math.sign(da) * Math.min(Math.abs(da), BOT_TURN);

    const spd = boosting ? BOT_BOOST_SPEED : BOT_SPEED;
    bot.boosting = boosting;
    bot.x = Math.max(80, Math.min(4920, bot.x + Math.cos(bot.angle) * spd));
    bot.y = Math.max(80, Math.min(4920, bot.y + Math.sin(bot.angle) * spd));
    bot._dirty = true;
}

function _spawnBot(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const bot = _makeBotData(room);
    room.players.set(bot.id, bot);
    io.to(roomId).emit('player_join', bot);
}

function _realCount(room) {
    let n = 0;
    for (const pd of room.players.values()) { if (!pd.isBot) n++; }
    return n;
}
function _botCount(room) {
    let n = 0;
    for (const pd of room.players.values()) { if (pd.isBot) n++; }
    return n;
}

function _maintainBots(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const real = _realCount(room);

    if (real === 0) {
        // Gerçek oyuncu kalmadı — tüm botları temizle
        for (const [id, pd] of room.players) {
            if (pd.isBot) {
                room.players.delete(id);
                io.to(roomId).emit('player_leave', { id });
            }
        }
        return;
    }

    // Hedef: toplam (gerçek + bot) = BOT_FILL_TARGET
    // Gerçek oyuncu BOT_FILL_TARGET'e ulaşırsa bot kalmaz
    const want = Math.max(0, Math.min(BOT_FILL_TARGET - real, MAX_ROOM_SIZE - real));
    const have = _botCount(room);

    if (have > want) {
        // Fazla botları çıkar
        let toKick = have - want;
        for (const [id, pd] of room.players) {
            if (toKick <= 0) break;
            if (pd.isBot) {
                room.players.delete(id);
                io.to(roomId).emit('player_leave', { id });
                toKick--;
            }
        }
        io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
    } else if (have < want) {
        // Eksik botları ekle
        for (let i = 0; i < want - have; i++) _spawnBot(roomId);
    }
}

// ── Rooms ─────────────────────────────────────────────────────
// rooms: Map<roomId, { players: Map<socketId, data>, seed: number, _tick: Timeout|null }>
const rooms = new Map();

function _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
}

function _makeRoom() {
    return { players: new Map(), seed: Math.floor(Math.random() * 0xFFFFFF), _tick: null };
}

// Start the 50 ms broadcast tick for a room (idempotent).
// Each tick collects all dirty player states and sends ONE batched event.
// This replaces per-state re-broadcast: 10 players × 30/s × 9 recipients = 2 700 ev/s
// → now: 20 batch events/s to 10 clients = 200 ev/s  (13.5× reduction)
function _startTick(roomId) {
    const room = rooms.get(roomId);
    if (!room || room._tick) return;
    room._tick = setInterval(() => {
        const r = rooms.get(roomId);
        if (!r) { clearInterval(room._tick); return; }
        const batch = [];
        for (const pd of r.players.values()) {
            if (pd.isBot) _updateBotAI(pd, r);
            if (pd._dirty) {
                batch.push({
                    id: pd.id, x: pd.x, y: pd.y,
                    angle: pd.angle, size: pd.size,
                    score: pd.score, maxLen: pd.maxLen,
                    boosting: pd.boosting,
                });
                pd._dirty = false;
            }
        }
        if (batch.length > 0) io.to(roomId).emit('states_batch', batch);
    }, TICK_MS);
}

function _deleteRoom(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room._tick) { clearInterval(room._tick); room._tick = null; }
    rooms.delete(roomId);
}

function findRoom() {
    // Count only real (non-bot) players for capacity — bots don't fill the room
    let bestId = null, bestCount = 0;
    for (const [id, room] of rooms) {
        const real = _realCount(room);
        if (real < MAX_ROOM_SIZE && real > bestCount) {
            bestId = id; bestCount = real;
        }
    }
    if (bestId) { _startTick(bestId); return bestId; }
    let code;
    do { code = _genCode(); } while (rooms.has(code));
    rooms.set(code, _makeRoom());
    _startTick(code);
    return code;
}

// Sweep zombie rooms (0 real players) every 5 minutes
setInterval(() => {
    for (const [id, room] of rooms) {
        if (_realCount(room) === 0) _deleteRoom(id);
    }
}, 5 * 60 * 1000);

// ── Rate limiter ──────────────────────────────────────────────
function _makeLimiter(maxPerSec) {
    let count = 0, windowEnd = 0;
    return () => {
        const now = Date.now();
        if (now >= windowEnd) { count = 0; windowEnd = now + 1000; }
        return ++count <= maxPerSec;
    };
}

// ── Socket.io ─────────────────────────────────────────────────
io.on('connection', socket => {
    let roomId = null;
    const rl = {
        state: _makeLimiter(60),
        kill:  _makeLimiter(5),
        coin:  _makeLimiter(15),
        join:  _makeLimiter(2),
    };

    socket.on('__ping', () => socket.emit('__pong'));

    socket.on('join', ({ name, config, shipType, x, y, roomCode }) => {
        if (!rl.join()) return;

        // Leave previous room cleanly
        if (roomId) {
            const old    = rooms.get(roomId);
            const oldRId = roomId;
            if (old) {
                // Only broadcast player_leave if the player was still in the room.
                // If killed by another player, player_die was already sent and the
                // player removed. Emitting player_leave again races with player_join
                // on clients and can delete the freshly-respawned remote player.
                const wasPresent = old.players.has(socket.id);
                old.players.delete(socket.id);
                if (wasPresent) socket.to(oldRId).emit('player_leave', { id: socket.id });
                const realOld = _realCount(old);
                if (realOld === 0) {
                    _deleteRoom(oldRId);
                } else {
                    io.to(oldRId).emit('room_info', { count: old.players.size, max: MAX_ROOM_SIZE });
                    setTimeout(() => _maintainBots(oldRId), 1500);
                }
            }
            socket.leave(roomId);
        }

        // Private room code: 4 alphanumeric chars
        const code = (typeof roomCode === 'string')
            ? roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
            : '';

        if (code.length === 4) {
            if (!rooms.has(code)) rooms.set(code, _makeRoom());
            const r = rooms.get(code);
            if (_realCount(r) >= MAX_ROOM_SIZE) { socket.emit('room_full'); return; }
            _startTick(code);
            roomId = code;
        } else {
            roomId = findRoom();
        }

        const room = rooms.get(roomId);

        // Evict any ghost sockets (disconnected but not yet timed out) from the room
        for (const [sid, pd] of room.players) {
            if (!pd.isBot && sid !== socket.id && !io.sockets.sockets.get(sid)) {
                room.players.delete(sid);
                socket.to(roomId).emit('player_leave', { id: sid });
            }
        }

        const pData = {
            id: socket.id, name, config, shipType,
            x: x || 2500, y: y || 2500,
            angle: 0, size: 13, score: 0, maxLen: 55, kills: 0,
            boosting: false, _dirty: false,
        };
        room.players.set(socket.id, pData);
        socket.join(roomId);

        const others = [...room.players.values()].filter(p => p.id !== socket.id);
        socket.emit('room_joined', { roomId, seed: room.seed, players: others, code: roomId });
        socket.to(roomId).emit('player_join', pData);
        io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
        // Maintain bot count after player joins (bots added/removed in background)
        setTimeout(() => _maintainBots(roomId), 800);
        console.log(`[JOIN] ${name} → ${roomId} (${real}/${MAX_ROOM_SIZE})`);

    });

    // State update: just store latest data + mark dirty.
    // The room tick broadcasts all dirty states in one batch every 50 ms.
    socket.on('state', data => {
        if (!rl.state() || !roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const pd = room.players.get(socket.id);
        if (pd) {
            pd.x = data.x; pd.y = data.y; pd.angle = data.angle;
            pd.size = data.size; pd.score = data.score;
            pd.maxLen = data.maxLen; pd.boosting = data.boosting;
            pd._dirty = true;
        }
    });

    socket.on('coin_take', ({ id }) => {
        if (!rl.coin() || !roomId) return;
        socket.to(roomId).emit('coin_take', { id });
    });

    socket.on('coin_add', ({ id, x, y, v }) => {
        if (!rl.coin() || !roomId) return;
        socket.to(roomId).emit('coin_add', { id, x, y, v });
    });

    socket.on('die', ({ killedBy, droppedCoins }) => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const pd = room.players.get(socket.id);
        // Already removed by a kill event — ignore duplicate die
        if (!pd) return;
        dbSaveScore(pd.name, pd.score || 0, pd.kills || 0).catch(() => {});
        room.players.delete(socket.id);
        socket.to(roomId).emit('player_die', { id: socket.id, killedBy, droppedCoins: droppedCoins || [] });
        const realAfterDie = _realCount(room);
        io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
        if (realAfterDie === 0) {
            _deleteRoom(roomId);
        } else {
            setTimeout(() => _maintainBots(roomId), 2000);
        }
        console.log(`[DIE] ${pd.name} killed by ${killedBy || 'island'}`);
    });

    socket.on('kill', ({ victimId }) => {
        if (!rl.kill() || !roomId) return;
        const room   = rooms.get(roomId);
        if (!room) return;
        const victim = room.players.get(victimId);
        const me     = room.players.get(socket.id);
        // victim must exist AND killer must still be alive in this room
        // (prevents B's delayed kill(A) from landing after A already killed B)
        if (!victim || !me) return;

        me.kills = (me.kills || 0) + 1;

        const isBounty   = (victim.score || 0) >= BOUNTY_SCORE;
        const bountyMult = isBounty ? 1.5 : 1;
        const bonus      = Math.round(((victim.score || 0) + 12) * bountyMult);

        if (!victim.isBot) dbSaveScore(victim.name, victim.score || 0, victim.kills || 0).catch(() => {});
        room.players.delete(victimId);

        socket.emit('kill_confirmed', {
            victimName:   victim.name,
            victimMaxLen: victim.maxLen || 55,
            bonus, isBounty,
        });
        io.to(roomId).emit('player_die', { id: victimId, killedBy: me?.name || '?', droppedCoins: [] });
        io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });

        // Bot respawn after 3 s
        if (victim.isBot) setTimeout(() => _maintainBots(roomId), 3000);

        console.log(`[KILL] ${me?.name} killed ${victim.name}${isBounty ? ' 💰 BOUNTY' : ''}`);
    });

    socket.on('disconnect', () => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const pd = room.players.get(socket.id);
        if (pd && pd.score > 0) dbSaveScore(pd.name, pd.score, pd.kills || 0).catch(() => {});
        room.players.delete(socket.id);
        socket.to(roomId).emit('player_leave', { id: socket.id });
        const realAfter = _realCount(room);
        if (realAfter === 0) {
            _deleteRoom(roomId);
        } else {
            io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
            setTimeout(() => _maintainBots(roomId), 1500);
        }
        console.log(`[LEAVE] ${pd?.name || socket.id} left ${roomId}`);
    });
});

server.listen(PORT, () => {
    console.log(`\n🏴‍☠️  Noctyra server running → http://localhost:${PORT}\n`);
});
