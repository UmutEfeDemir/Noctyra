// =============================================================
//  db.js  —  NeonDB integration (module script)
//  Exposes dbSaveScore, dbSaveAchievement, dbGetLeaderboard
//  as window globals so classic scripts can call them.
// =============================================================

// ← Paste your Neon connection string here
const NEON_URL = 'YOUR_NEON_CONNECTION_STRING';

const _ready = NEON_URL && !NEON_URL.startsWith('YOUR_');

let _sql = null;

async function _getSQL() {
    if (_sql) return _sql;
    if (!_ready) return null;
    try {
        const { neon } = await import('https://esm.sh/@neondatabase/serverless@0.9.3');
        _sql = neon(NEON_URL);
    } catch (e) {
        console.warn('[DB] driver load failed:', e.message);
    }
    return _sql;
}

window.dbSaveScore = async (playerName, score, kills) => {
    const sql = await _getSQL();
    if (!sql || !playerName) return;
    try {
        await sql(
            'INSERT INTO leaderboard (player_name, score, kills) VALUES ($1, $2, $3)',
            [playerName, score, kills]
        );
    } catch (e) { console.warn('[DB] save score:', e.message); }
};

window.dbSaveAchievement = async (playerName, achId) => {
    const sql = await _getSQL();
    if (!sql || !playerName) return;
    try {
        await sql(
            'INSERT INTO achievements (player_name, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [playerName, achId]
        );
    } catch (e) { console.warn('[DB] save achievement:', e.message); }
};

window.dbGetLeaderboard = async () => {
    const sql = await _getSQL();
    if (!sql) return [];
    try {
        return await sql(
            'SELECT player_name, MAX(score) AS best_score, SUM(kills) AS total_kills ' +
            'FROM leaderboard GROUP BY player_name ORDER BY best_score DESC LIMIT 10'
        );
    } catch (e) {
        console.warn('[DB] get leaderboard:', e.message);
        return [];
    }
};
