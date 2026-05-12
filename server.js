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

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

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

// ── Rooms ─────────────────────────────────────────────────────
// rooms: Map<roomId, { players: Map<socketId, data>, seed: number }>
const rooms = new Map();

function findRoom() {
    for (const [id, room] of rooms) {
        if (room.players.size < MAX_ROOM_SIZE) return id;
    }
    const id   = 'r' + Date.now().toString(36);
    const seed = Math.floor(Math.random() * 0xFFFFFF);
    rooms.set(id, { players: new Map(), seed });
    return id;
}

// ── Socket.io ─────────────────────────────────────────────────
io.on('connection', socket => {
    let roomId = null;

    socket.on('join', ({ name, config, shipType, x, y }) => {
        // Leave previous room cleanly
        if (roomId) {
            const old = rooms.get(roomId);
            if (old) {
                old.players.delete(socket.id);
                socket.to(roomId).emit('player_leave', { id: socket.id });
                if (old.players.size === 0) rooms.delete(roomId);
                else io.to(roomId).emit('room_info', { count: old.players.size, max: MAX_ROOM_SIZE });
            }
            socket.leave(roomId);
        }

        roomId     = findRoom();
        const room = rooms.get(roomId);
        const pData = {
            id: socket.id, name, config, shipType,
            x: x || 2500, y: y || 2500,
            angle: 0, size: 13, score: 0, maxLen: 55, kills: 0,
        };
        room.players.set(socket.id, pData);
        socket.join(roomId);

        const others = [...room.players.values()].filter(p => p.id !== socket.id);
        socket.emit('room_joined', { roomId, seed: room.seed, players: others });
        socket.to(roomId).emit('player_join', pData);
        io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });

        console.log(`[JOIN] ${name} → ${roomId} (${room.players.size}/${MAX_ROOM_SIZE})`);
    });

    socket.on('state', data => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const pd = room.players.get(socket.id);
        if (pd) Object.assign(pd, { x: data.x, y: data.y, angle: data.angle, size: data.size, score: data.score, maxLen: data.maxLen });
        socket.to(roomId).emit('player_state', { id: socket.id, ...data });
    });

    socket.on('coin_take', ({ id }) => {
        if (!roomId) return;
        socket.to(roomId).emit('coin_take', { id });
    });

    socket.on('coin_add', ({ id, x, y, v }) => {
        if (!roomId) return;
        socket.to(roomId).emit('coin_add', { id, x, y, v });
    });

    // Player self-reports death — save score to DB
    socket.on('die', ({ killedBy, droppedCoins }) => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const pd = room.players.get(socket.id);
        if (pd) dbSaveScore(pd.name, pd.score || 0, pd.kills || 0).catch(() => {});
        room.players.delete(socket.id);
        socket.to(roomId).emit('player_die', { id: socket.id, killedBy, droppedCoins: droppedCoins || [] });
        io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
        console.log(`[DIE] ${pd?.name || socket.id} killed by ${killedBy || 'island'}`);
    });

    socket.on('kill', ({ victimId }) => {
        if (!roomId) return;
        const room   = rooms.get(roomId);
        if (!room) return;
        const victim = room.players.get(victimId);
        const me     = room.players.get(socket.id);
        if (!victim) return;

        // Track kills for DB
        if (me) me.kills = (me.kills || 0) + 1;

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
            rooms.delete(roomId);
        } else {
            io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
        }
        console.log(`[LEAVE] ${pd?.name || socket.id} left ${roomId}`);
    });
});

server.listen(PORT, () => {
    console.log(`\n🏴‍☠️  Noctyra server running → http://localhost:${PORT}\n`);
});
