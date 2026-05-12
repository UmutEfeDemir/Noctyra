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
const TICK_MS       = 33;   // server broadcasts batched states at ~30 Hz

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    cors:         { origin: '*' },
    pingTimeout:  20000,
    pingInterval: 10000,
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
    // Prefer the most-populated room that still has space (fills existing rooms before opening new ones)
    let bestId = null, bestCount = 0;
    for (const [id, room] of rooms) {
        if (room.players.size < MAX_ROOM_SIZE && room.players.size > bestCount) {
            bestId = id;
            bestCount = room.players.size;
        }
    }
    if (bestId) { _startTick(bestId); return bestId; }
    let code;
    do { code = _genCode(); } while (rooms.has(code));
    rooms.set(code, _makeRoom());
    _startTick(code);
    return code;
}

// Sweep zombie rooms (0 players) every 5 minutes
setInterval(() => {
    for (const [id, room] of rooms) {
        if (room.players.size === 0) _deleteRoom(id);
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
        state: _makeLimiter(30),
        kill:  _makeLimiter(5),
        coin:  _makeLimiter(15),
        join:  _makeLimiter(2),
    };

    socket.on('__ping', () => socket.emit('__pong'));

    socket.on('join', ({ name, config, shipType, x, y, roomCode }) => {
        if (!rl.join()) return;

        // Leave previous room cleanly
        if (roomId) {
            const old = rooms.get(roomId);
            if (old) {
                old.players.delete(socket.id);
                socket.to(roomId).emit('player_leave', { id: socket.id });
                if (old.players.size === 0) _deleteRoom(roomId);
                else io.to(roomId).emit('room_info', { count: old.players.size, max: MAX_ROOM_SIZE });
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
            if (r.players.size >= MAX_ROOM_SIZE) { socket.emit('room_full'); return; }
            _startTick(code);
            roomId = code;
        } else {
            roomId = findRoom();
        }

        const room = rooms.get(roomId);
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
        console.log(`[JOIN] ${name} → ${roomId} (${room.players.size}/${MAX_ROOM_SIZE})`);
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
        io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
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

        const bonus = Math.round((victim.score || 0) + 12);
        dbSaveScore(victim.name, victim.score || 0, victim.kills || 0).catch(() => {});
        room.players.delete(victimId);

        socket.emit('kill_confirmed', {
            victimName:   victim.name,
            victimMaxLen: victim.maxLen || 55,
            bonus,
        });
        io.to(roomId).emit('player_die', { id: victimId, killedBy: me?.name || '?', droppedCoins: [] });
        io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
        console.log(`[KILL] ${me?.name} killed ${victim.name}`);
    });

    socket.on('disconnect', () => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const pd = room.players.get(socket.id);
        if (pd && pd.score > 0) dbSaveScore(pd.name, pd.score, pd.kills || 0).catch(() => {});
        room.players.delete(socket.id);
        socket.to(roomId).emit('player_leave', { id: socket.id });
        if (room.players.size === 0) {
            _deleteRoom(roomId);
        } else {
            io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
        }
        console.log(`[LEAVE] ${pd?.name || socket.id} left ${roomId}`);
    });
});

server.listen(PORT, () => {
    console.log(`\n🏴‍☠️  Noctyra server running → http://localhost:${PORT}\n`);
});
