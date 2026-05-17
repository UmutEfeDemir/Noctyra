// =============================================================
//  customizer.js  —  Ship colour picker + live preview
// =============================================================

const SHIP_TYPE_OPTIONS = [
    { id: 'sandal', i18nKey: 'typeSandal' },
    { id: 'gemi',   i18nKey: 'typeGemi'   },
    { id: 'savas',  i18nKey: 'typeSavas'  },
];

const HULL_OPTIONS = [
    '#7B4500','#1C1C2E','#6B0000','#0D3B0D',
    '#3D0060','#111111','#5C3D1E','#1a3a5c'
];

const SAIL_OPTIONS = [
    '#F0DEB0','#E8E8E8','#8B1515','#2244AA',
    '#2a2a2a','#C49A3C','#1a5c1a','#8B6914'
];

const ACCENT_OPTIONS = [
    '#00FF88','#FF3333','#FF8C00','#3388FF',
    '#00DDFF','#FFDD00','#EE44EE','#FFFFFF'
];

const WAKE_OPTIONS = [
    { color:'#00FF88', wake:'0,255,136'   },
    { color:'#FF3333', wake:'255,51,51'   },
    { color:'#FF8C00', wake:'255,140,0'   },
    { color:'#3388FF', wake:'51,136,255'  },
    { color:'#00DDFF', wake:'0,221,255'   },
    { color:'#FFDD00', wake:'255,221,0'   },
    { color:'#EE44EE', wake:'238,68,238'  },
    { color:'#FFFFFF', wake:'255,255,255' },
];

// Active player ship colours — read by startGame()
let playerShipConfig = {
    shipType: 'gemi',
    hull:     HULL_OPTIONS[0],
    sail:     SAIL_OPTIONS[0],
    accent:   ACCENT_OPTIONS[0],
    wake:     WAKE_OPTIONS[0].wake,
};

// ── Show / hide / toggle ──────────────────────────────────────
const _custIsMobile = () => window.innerWidth <= 640;

function _updateShipName() {
    const el = document.getElementById('custShipName');
    if (el) {
        const key = SHIP_TYPE_OPTIONS.find(o => o.id === playerShipConfig.shipType)?.i18nKey;
        el.textContent = key ? t(key) : '';
    }
    _syncMobileCard();
}

function showCustomizer() {
    _updateShipName();
    if (typeof _updateMenuStats === 'function') _updateMenuStats();
}

function hideCustomizer() {
    // No-op: customizer is inside #overlay — hides automatically with the overlay
}

function toggleCustomizer() {
    const panel = document.getElementById('shipCustomizer');
    const btn   = document.getElementById('custToggleBtn');
    const bd    = document.getElementById('custBackdrop');
    if (panel.classList.contains('cust-open')) {
        _closeCustPanel();
    } else {
        panel.style.display = 'block';
        requestAnimationFrame(() => {
            panel.classList.add('cust-open');
            btn.classList.add('cust-open');
            bd.classList.add('cust-open');
        });
    }
}

function _closeCustPanel() {
    document.getElementById('shipCustomizer').classList.remove('cust-open');
    document.getElementById('custToggleBtn').classList.remove('cust-open');
    document.getElementById('custBackdrop').classList.remove('cust-open');
}

// Mobile lobi ship card — keeps thumb canvas + type label in sync
function _syncMobileCard() {
    const tc = document.getElementById('mobileShipThumb');
    const lb = document.getElementById('mobShipType');
    if (tc) {
        const pc = tc.getContext('2d');
        const w = tc.width, h = tc.height, cx = w/2, cy = h/2;
        pc.clearRect(0, 0, w, h);
        pc.save();
        pc.beginPath(); pc.arc(cx, cy, cx-1, 0, Math.PI*2); pc.clip();
        pc.fillStyle = '#003E5C'; pc.fillRect(0, 0, w, h);
        const c = playerShipConfig, type = c.shipType;
        const s = type === 'savas' ? 10 : type === 'sandal' ? 9 : 12;
        pc.translate(cx, cy - 2);
        if      (type === 'sandal') _previewSandal(pc, s, c);
        else if (type === 'savas')  _previewSavas(pc, s, c);
        else                         _previewGemi(pc, s, c);
        pc.restore();
        pc.beginPath(); pc.arc(cx, cy, cx-1, 0, Math.PI*2);
        pc.strokeStyle = '#8B6914'; pc.lineWidth = 1.5; pc.stroke();
    }
    if (lb) {
        const key = SHIP_TYPE_OPTIONS.find(o => o.id === playerShipConfig.shipType)?.i18nKey;
        lb.textContent = key ? t(key) : '';
    }
}

// Mini ship preview inside the toggle button
function _syncThumb() {
    const tc = document.getElementById('custThumb');
    if (!tc) return;
    const pc = tc.getContext('2d');
    const w = tc.width, h = tc.height, cx = w/2, cy = h/2;
    pc.clearRect(0, 0, w, h);
    pc.save();
    pc.beginPath(); pc.arc(cx, cy, cx-1, 0, Math.PI*2); pc.clip();
    pc.fillStyle = '#003E5C'; pc.fillRect(0, 0, w, h);
    const c = playerShipConfig, type = c.shipType;
    const s = type === 'savas' ? 7 : type === 'sandal' ? 6 : 8;
    pc.translate(cx, cy - 2);
    if      (type === 'sandal') _previewSandal(pc, s, c);
    else if (type === 'savas')  _previewSavas(pc, s, c);
    else                         _previewGemi(pc, s, c);
    pc.restore();
    pc.beginPath(); pc.arc(cx, cy, cx-1, 0, Math.PI*2);
    pc.strokeStyle = '#8B6914'; pc.lineWidth = 1.5; pc.stroke();
}

// ── Ship type selector ────────────────────────────────────────
function buildTypeSelector(containerId, options, onSelect) {
    const div = document.getElementById(containerId);
    options.forEach((opt, i) => {
        const btn = document.createElement('div');
        btn.className   = 'type-btn' + (i === 1 ? ' selected' : ''); // gemi default
        btn.textContent = t(opt.i18nKey);
        btn.onclick = () => {
            div.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            onSelect(opt.id);
            drawShipPreview();
        };
        div.appendChild(btn);
    });
}

// Rebuild type buttons with updated language (called by setLang in i18n.js)
function rebuildCustomizerLang() {
    const div = document.getElementById('typeButtons');
    const cur = playerShipConfig.shipType;
    div.innerHTML = '';
    SHIP_TYPE_OPTIONS.forEach(opt => {
        const btn = document.createElement('div');
        btn.className   = 'type-btn' + (opt.id === cur ? ' selected' : '');
        btn.textContent = t(opt.i18nKey);
        btn.onclick = () => {
            div.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            playerShipConfig.shipType = opt.id;
            _updateShipName();
            drawShipPreview();
        };
        div.appendChild(btn);
    });
}

// ── Swatch builder ────────────────────────────────────────────
function buildSwatches(containerId, options, onSelect) {
    const div = document.getElementById(containerId);
    options.forEach((opt, i) => {
        const color = typeof opt === 'string' ? opt : opt.color;
        const sw    = document.createElement('div');
        sw.className    = 'swatch' + (i === 0 ? ' selected' : '');
        sw.style.background = color;
        sw.onclick = () => {
            div.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
            sw.classList.add('selected');
            onSelect(opt);
            drawShipPreview();
        };
        div.appendChild(sw);
    });
}

// ── Preview renderer ──────────────────────────────────────────
function drawShipPreview() {
    const canvas = document.getElementById('shipPreview');
    if (!canvas) return;
    const pc = canvas.getContext('2d');
    const w  = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;

    pc.clearRect(0, 0, w, h);

    // Ocean circle clip
    pc.save();
    pc.beginPath();
    pc.arc(cx, cy, cx - 1, 0, Math.PI * 2);
    pc.clip();

    pc.fillStyle = '#003E5C';
    pc.fillRect(0, 0, w, h);

    // Waves
    pc.strokeStyle = 'rgba(0,90,150,0.4)';
    pc.lineWidth   = 1;
    pc.beginPath();
    for (let y = 15; y < h; y += 18) {
        for (let x = 5; x < w; x += 30) {
            pc.moveTo(x - 8, y);
            pc.quadraticCurveTo(x, y - 3, x + 8, y);
        }
    }
    pc.stroke();

    // Wake trail
    pc.beginPath();
    pc.moveTo(cx, cy + 10);
    pc.quadraticCurveTo(cx + 20, cy + 38, cx - 5, cy + 55);
    const wg = pc.createLinearGradient(cx, cy + 10, cx - 5, cy + 55);
    wg.addColorStop(0,    `rgba(${playerShipConfig.wake},0.95)`);
    wg.addColorStop(0.55, `rgba(${playerShipConfig.wake},0.60)`);
    wg.addColorStop(1,    `rgba(${playerShipConfig.wake},0.22)`);
    pc.strokeStyle = wg;
    pc.lineWidth   = 10;
    pc.lineCap     = 'round';
    pc.stroke();

    // Ship body
    pc.save();
    const type = playerShipConfig.shipType;
    const s    = type === 'savas' ? 14 : type === 'sandal' ? 12 : 15;
    pc.translate(cx, type === 'savas' ? cy - 6 : cy - 5);

    const c = playerShipConfig;

    if      (type === 'sandal') _previewSandal(pc, s, c);
    else if (type === 'savas')  _previewSavas(pc, s, c);
    else                         _previewGemi(pc, s, c);

    pc.restore(); // ship
    pc.restore(); // clip

    // Gold border
    pc.beginPath();
    pc.arc(cx, cy, cx - 1, 0, Math.PI * 2);
    pc.strokeStyle = '#8B6914';
    pc.lineWidth   = 2;
    pc.stroke();

    // Keep toggle thumb + lobi card in sync
    if (_custIsMobile()) _syncThumb();
    _syncMobileCard();
}

function _previewSandal(pc, s, c) { nx_drawSandalG(pc, s, c); }

function _previewGemi  (pc, s, c) { nx_drawGemiG  (pc, s, c); }
function _previewSavas (pc, s, c) { nx_drawSavasG (pc, s, c); }

// ── Init ──────────────────────────────────────────────────────
function initCustomizer() {
    buildTypeSelector('typeButtons', SHIP_TYPE_OPTIONS, id => {
        playerShipConfig.shipType = id;
        _updateShipName();
    });
    buildSwatches('hullSwatches', HULL_OPTIONS, opt => {
        playerShipConfig.hull = opt;
    });
    buildSwatches('sailSwatches', SAIL_OPTIONS, opt => {
        playerShipConfig.sail = opt;
    });
    buildSwatches('accentSwatches', ACCENT_OPTIONS, opt => {
        playerShipConfig.accent = opt;
    });
    buildSwatches('wakeSwatches', WAKE_OPTIONS, opt => {
        playerShipConfig.wake = opt.wake;
    });
    drawShipPreview();
    _updateShipName();
}

initCustomizer();
