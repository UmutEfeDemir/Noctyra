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

// Serve all game files statically
app.use(express.static(path.join(__dirname)));

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

io.on('connection', socket => {
    let roomId = null;

    socket.on('join', ({ name, config, shipType }) => {
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
            x: 2500, y: 2500, angle: 0, size: 13, score: 0, maxLen: 55,
        };
        room.players.set(socket.id, pData);
        socket.join(roomId);

        // Send existing players + room seed to newcomer
        const others = [...room.players.values()].filter(p => p.id !== socket.id);
        socket.emit('room_joined', { roomId, seed: room.seed, players: others });

        // Tell everyone else
        socket.to(roomId).emit('player_join', pData);
        io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });

        console.log(`[JOIN] ${name} → ${roomId} (${room.players.size}/${MAX_ROOM_SIZE})`);
    });

    // Player state broadcast (position, angle, size, score…)
    socket.on('state', data => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const pd = room.players.get(socket.id);
        if (pd) Object.assign(pd, { x: data.x, y: data.y, angle: data.angle, size: data.size, score: data.score, maxLen: data.maxLen });
        socket.to(roomId).emit('player_state', { id: socket.id, ...data });
    });

    // Player self-reports death (hit island or another player's trail)
    socket.on('die', ({ killedBy }) => {
        if (!roomId) return;
        socket.to(roomId).emit('player_die', { id: socket.id, killedBy });
        console.log(`[DIE] ${socket.id} killed by ${killedBy}`);
    });

    // Player reports that a remote player ran into their trail
    socket.on('kill', ({ victimId }) => {
        if (!roomId) return;
        const room   = rooms.get(roomId);
        if (!room) return;
        const victim = room.players.get(victimId);
        const me     = room.players.get(socket.id);
        if (!victim) return;

        const bonus = Math.round((victim.score || 0) + 12);

        // Reward killer
        socket.emit('kill_confirmed', {
            victimName:   victim.name,
            victimMaxLen: victim.maxLen || 55,
            bonus,
        });

        // Tell everyone victim died
        io.to(roomId).emit('player_die', { id: victimId, killedBy: me?.name || '?' });
        console.log(`[KILL] ${me?.name} killed ${victim.name}`);
    });

    socket.on('disconnect', () => {
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const name = room.players.get(socket.id)?.name || socket.id;
        room.players.delete(socket.id);
        socket.to(roomId).emit('player_leave', { id: socket.id });
        if (room.players.size === 0) {
            rooms.delete(roomId);
        } else {
            io.to(roomId).emit('room_info', { count: room.players.size, max: MAX_ROOM_SIZE });
        }
        console.log(`[LEAVE] ${name} left ${roomId}`);
    });
});

server.listen(PORT, () => {
    console.log(`\n🏴‍☠️  Noctyra server running → http://localhost:${PORT}\n`);
});
