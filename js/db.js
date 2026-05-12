// =============================================================
//  db.js  —  NeonDB  (direct fetch, no npm package needed)
//  CORS is open on Neon's HTTP SQL API — works from browser.
//  Exposes dbSaveScore / dbSaveAchievement / dbGetLeaderboard
//  as window globals for classic scripts to call.
// =============================================================

const _NEON_URL  = 'https://api.c-7.us-east-1.aws.neon.tech/sql';
const _NEON_CONN = 'postgresql://neondb_owner:npg_sadW2pJhfQw8@ep-wild-waterfall-app28mo3-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function _query(sql, params = []) {
    const res = await fetch(_NEON_URL, {
        method: 'POST',
        headers: {
            'Neon-Connection-String': _NEON_CONN,
        },
        body: JSON.stringify({ query: sql, params }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.rows ?? [];
}

window.dbSaveScore = async (playerName, score, kills) => {
    if (!playerName) return;
    try {
        await _query(
            'INSERT INTO leaderboard (player_name, score, kills) VALUES ($1, $2, $3)',
            [playerName, score, kills]
        );
    } catch (e) { console.warn('[DB] save score:', e.message); }
};

window.dbSaveAchievement = async (playerName, achId) => {
    if (!playerName) return;
    try {
        await _query(
            'INSERT INTO achievements (player_name, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [playerName, achId]
        );
    } catch (e) { console.warn('[DB] save achievement:', e.message); }
};

window.dbGetLeaderboard = async () => {
    try {
        return await _query(
            'SELECT player_name, MAX(score) AS best_score, SUM(kills) AS total_kills ' +
            'FROM leaderboard GROUP BY player_name ORDER BY best_score DESC LIMIT 10'
        );
    } catch (e) {
        console.warn('[DB] get leaderboard:', e.message);
        return [];
    }
};
