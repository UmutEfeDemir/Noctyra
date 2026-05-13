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

// ── Show / hide ───────────────────────────────────────────────
function showCustomizer() {
    const el = document.getElementById('shipCustomizer');
    el.style.display = 'block';
    // On narrow screens move the panel inside the overlay so it scrolls with it
    if (window.innerWidth <= 640) {
        const oc = document.getElementById('overlayContent');
        if (oc && el.parentElement !== oc) oc.appendChild(el);
    }
}

function hideCustomizer() {
    const el = document.getElementById('shipCustomizer');
    el.style.display = 'none';
    // Move back to body so it's ready for next show()
    if (el.parentElement !== document.body) document.body.appendChild(el);
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
}

function _previewSandal(pc, s, c) {
    pc.beginPath();
    pc.moveTo(0, -s*0.98);
    pc.bezierCurveTo(s*0.36, -s*0.48, s*0.44, s*0.48, s*0.24, s*0.98);
    pc.lineTo(-s*0.24, s*0.98);
    pc.bezierCurveTo(-s*0.44, s*0.48, -s*0.36, -s*0.48, 0, -s*0.98);
    pc.closePath();
    pc.fillStyle = c.hull; pc.fill();
    pc.strokeStyle = 'rgba(0,0,0,0.6)'; pc.lineWidth = 1.5; pc.stroke();

    pc.strokeStyle = '#5C3D1E'; pc.lineWidth = 2.5; pc.lineCap = 'round';
    pc.beginPath(); pc.moveTo(0, s*0.35); pc.lineTo(0, -s*0.58); pc.stroke();

    pc.beginPath();
    pc.moveTo(0, -s*0.55); pc.lineTo(s*0.46, s*0.3); pc.lineTo(0, s*0.3);
    pc.closePath(); pc.fillStyle = c.sail; pc.fill();

    for (const side of [-1, 1]) {
        pc.strokeStyle = '#6B4A20'; pc.lineWidth = 1.8; pc.lineCap = 'round';
        pc.beginPath();
        pc.moveTo(side*s*0.34, -s*0.05); pc.lineTo(side*s*0.7, s*0.56);
        pc.stroke();
    }
    pc.save();
    pc.translate(0, -s*0.58);
    pc.fillStyle = c.accent;
    pc.beginPath(); pc.moveTo(0,0); pc.lineTo(9,-3); pc.lineTo(9,3); pc.closePath(); pc.fill();
    pc.restore();
}

function _previewGemi(pc, s, c) {
    pc.beginPath();
    pc.moveTo(0, -s*1.42);
    pc.bezierCurveTo(s*0.28, -s*0.92, s*0.64, -s*0.18, s*0.6, s*0.7);
    pc.bezierCurveTo(s*0.6, s*0.94, s*0.5, s*1.04, s*0.38, s*1.04);
    pc.lineTo(-s*0.38, s*1.04);
    pc.bezierCurveTo(-s*0.5, s*1.04, -s*0.6, s*0.94, -s*0.6, s*0.7);
    pc.bezierCurveTo(-s*0.64, -s*0.18, -s*0.28, -s*0.92, 0, -s*1.42);
    pc.closePath();
    pc.fillStyle = c.hull; pc.fill();
    pc.strokeStyle = 'rgba(0,0,0,0.58)'; pc.lineWidth = 1.5; pc.stroke();

    pc.fillStyle = '#3D2000';
    pc.fillRect(-2.5, -s*0.52, 5, s*1.16);
    pc.fillRect(-s*0.58, s*0.0, s*1.16, 3);

    pc.beginPath();
    pc.moveTo(-s*0.56, s*0.02); pc.quadraticCurveTo(0, s*0.28, s*0.56, s*0.02);
    pc.lineTo(s*0.56, s*0.66); pc.quadraticCurveTo(0, s*0.86, -s*0.56, s*0.66);
    pc.closePath(); pc.fillStyle = c.sail; pc.fill();

    pc.beginPath();
    pc.moveTo(0, -s*0.48); pc.lineTo(s*0.36, 0); pc.lineTo(-s*0.36, 0);
    pc.closePath(); pc.fillStyle = c.sail; pc.fill();

    pc.font = `${s*0.6}px serif`; pc.textAlign = 'center'; pc.textBaseline = 'middle';
    pc.fillStyle = 'rgba(0,0,0,0.22)'; pc.fillText('☠', 0, s*0.35);

    pc.save();
    pc.translate(0, -s*1.35);
    pc.fillStyle = '#111'; pc.fillRect(0, -5, 16, 10);
    pc.fillStyle = c.accent; pc.font = '7px serif';
    pc.textAlign = 'center'; pc.textBaseline = 'middle'; pc.fillText('☠', 8, 0);
    pc.restore();
}

function _previewSavas(pc, s, c) {
    const w = 1.26;
    pc.beginPath();
    pc.moveTo(0, -s*1.18);
    pc.bezierCurveTo(s*w*0.5, -s*0.68, s*w*0.78, -s*0.06, s*w*0.78, s*0.6);
    pc.lineTo(s*w*0.78, s*1.08); pc.lineTo(-s*w*0.78, s*1.08); pc.lineTo(-s*w*0.78, s*0.6);
    pc.bezierCurveTo(-s*w*0.78, -s*0.06, -s*w*0.5, -s*0.68, 0, -s*1.18);
    pc.closePath();
    pc.fillStyle = c.hull; pc.fill();
    pc.strokeStyle = 'rgba(0,0,0,0.65)'; pc.lineWidth = 2; pc.stroke();

    pc.fillStyle = 'rgba(0,0,0,0.22)';
    pc.fillRect(-s*w*0.76, -s*0.1, s*w*1.52, s*0.24);
    pc.fillRect(-s*w*0.76, s*0.36, s*w*1.52, s*0.22);

    pc.fillStyle = '#3D2000';
    pc.fillRect(-2.2, -s*1.08, 4.4, s*1.48);
    pc.fillRect(-s*w*0.42, s*0.26, s*w*0.84, 3.5);
    pc.fillRect(-3, -s*0.32, 6, s*1.42);
    pc.fillRect(-s*w*0.76, -s*0.1, s*w*1.52, 4);

    pc.beginPath();
    pc.moveTo(-s*w*0.74, -s*0.08); pc.quadraticCurveTo(0, s*0.2, s*w*0.74, -s*0.08);
    pc.lineTo(s*w*0.74, s*0.56); pc.quadraticCurveTo(0, s*0.78, -s*w*0.74, s*0.56);
    pc.closePath(); pc.fillStyle = c.sail; pc.fill();

    pc.beginPath();
    pc.moveTo(0, -s*0.3); pc.lineTo(s*w*0.44, -s*0.08); pc.lineTo(-s*w*0.44, -s*0.08);
    pc.closePath(); pc.fillStyle = c.sail; pc.fill();

    pc.font = `${s*0.72}px serif`; pc.textAlign = 'center'; pc.textBaseline = 'middle';
    pc.fillStyle = 'rgba(0,0,0,0.2)'; pc.fillText('☠', 0, s*0.25);

    pc.fillStyle = '#111';
    for (const cy of [-s*0.06, s*0.14, s*0.38, s*0.57]) {
        pc.fillRect(s*w*0.77, cy, 8, 3.5);
        pc.fillRect(-s*w*0.77-8, cy, 8, 3.5);
    }

    pc.save();
    pc.translate(0, -s*1.38);
    pc.fillStyle = '#0a0a0a'; pc.fillRect(0, -7, 22, 14);
    pc.fillStyle = c.accent; pc.font = '9px serif';
    pc.textAlign = 'center'; pc.textBaseline = 'middle'; pc.fillText('☠', 11, 0);
    pc.restore();
}

// ── Init ──────────────────────────────────────────────────────
function initCustomizer() {
    buildTypeSelector('typeButtons', SHIP_TYPE_OPTIONS, id => {
        playerShipConfig.shipType = id;
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
}

initCustomizer();
