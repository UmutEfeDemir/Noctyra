// =============================================================
//  achievements.js  —  Session achievements + toast popup
//  Uses t() from i18n.js (loaded first).
// =============================================================

const ACH_DEFS = [
    { id: 'first_kill',  icon: '⚔️'  },
    { id: 'kills_5',     icon: '🏴‍☠️' },
    { id: 'kills_10',    icon: '💀'  },
    { id: 'gold_100',    icon: '💰'  },
    { id: 'gold_500',    icon: '👑'  },
    { id: 'survive_2m',  icon: '⏱️'  },
    { id: 'big_ship',    icon: '🚢'  },
];

const _unlocked = new Set();
let   _queue    = [];
let   _timer    = 0;

// Call every frame during gameplay
function tickAchievements(stats) {
    // Check unlock conditions
    for (const def of ACH_DEFS) {
        if (_unlocked.has(def.id)) continue;
        let ok = false;
        switch (def.id) {
            case 'first_kill': ok = stats.kills  >=  1;   break;
            case 'kills_5':    ok = stats.kills  >=  5;   break;
            case 'kills_10':   ok = stats.kills  >= 10;   break;
            case 'gold_100':   ok = stats.score  >= 100;  break;
            case 'gold_500':   ok = stats.score  >= 500;  break;
            case 'survive_2m': ok = stats.frames >= 7200; break;
            case 'big_ship':   ok = stats.maxLen >= 120;  break;
        }
        if (ok) {
            _unlocked.add(def.id);
            _queue.push(def);
            // Persist to DB (player is a global from game.js)
            if (typeof dbSaveAchievement === 'function' && typeof player !== 'undefined' && player?.name) {
                dbSaveAchievement(player.name, def.id);
            }
        }
    }

    // Show one toast at a time, with gap between them
    if (_timer > 0) { _timer--; return; }
    if (_queue.length === 0) return;
    _showToast(_queue.shift());
    _timer = 210;
}

function _showToast(def) {
    const el = document.getElementById('achToast');
    if (!el) return;
    el.querySelector('.ach-icon').textContent = def.icon;
    el.querySelector('.ach-name').textContent = t('ach_' + def.id);
    el.classList.remove('ach-hidden');
    // Force reflow so transition fires
    void el.offsetWidth;
    el.classList.add('ach-show');
    setTimeout(() => {
        el.classList.remove('ach-show');
        setTimeout(() => el.classList.add('ach-hidden'), 450);
    }, 2800);
}

function resetAchievements() {
    _unlocked.clear();
    _queue = [];
    _timer = 0;
}
