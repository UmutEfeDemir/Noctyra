// =============================================================
//  renderer.js  —  Background and minimap drawing
// =============================================================

// Day/night ocean phases — r,g,b at each time point (0–1)
const _DAY_PHASES = [
    { t: 0.00, r:  0, g: 78, b: 106 }, // noon
    { t: 0.25, r: 38, g: 28, b:  12 }, // sunset
    { t: 0.50, r:  0, g:  8, b:  22 }, // midnight
    { t: 0.75, r: 18, g: 10, b:  30 }, // dawn
    { t: 1.00, r:  0, g: 78, b: 106 }, // noon again
];

function _dayColor() {
    const dt = typeof dayTime !== 'undefined' ? dayTime : 0;
    for (let i = 0; i < _DAY_PHASES.length - 1; i++) {
        const a = _DAY_PHASES[i], b = _DAY_PHASES[i + 1];
        if (dt >= a.t && dt <= b.t) {
            const f = (dt - a.t) / (b.t - a.t);
            return `rgb(${Math.round(a.r+(b.r-a.r)*f)},${Math.round(a.g+(b.g-a.g)*f)},${Math.round(a.b+(b.b-a.b)*f)})`;
        }
    }
    return '#004E6A';
}

const _isMobile = navigator.maxTouchPoints > 0 && window.innerWidth <= 768;

// Depth gradient is static — recreate only on canvas resize
let _depthGrad = null, _depthGradW = 0, _depthGradH = 0;

function drawOcean() {
    ctx.fillStyle = _dayColor();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cache the radial gradient — createRadialGradient every frame is expensive
    if (!_depthGrad || canvas.width !== _depthGradW || canvas.height !== _depthGradH) {
        _depthGradW = canvas.width;
        _depthGradH = canvas.height;
        _depthGrad  = ctx.createRadialGradient(
            canvas.width/2, canvas.height/2, 0,
            canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height) * 0.7
        );
        _depthGrad.addColorStop(0,   'rgba(0,20,40,0.28)');
        _depthGrad.addColorStop(0.6, 'rgba(0,20,40,0.08)');
        _depthGrad.addColorStop(1,   'rgba(0,20,40,0)');
    }
    ctx.fillStyle = _depthGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Far wave layer — grid 100px (was 70) cuts bezier count ~50%
    const gs = 100;
    const ox = camera.x % gs;
    const oy = camera.y % gs;
    ctx.strokeStyle = 'rgba(0,110,170,0.18)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (let x = -ox; x < canvas.width + gs; x += gs) {
        for (let y = -oy; y < canvas.height + gs; y += gs) {
            const wp = Math.sin((x + camera.x + waveT*20) * 0.022) * 3;
            ctx.moveTo(x - 14, y + wp);
            ctx.quadraticCurveTo(x, y + wp - 2, x + 14, y + wp);
        }
    }
    ctx.stroke();

    // Near wave layer — skip on mobile to save ~400 bezier calls/frame
    if (!_isMobile) {
        const gs2 = 80;
        const ox2 = (camera.x * 1.15) % gs2;
        const oy2 = (camera.y * 1.15) % gs2;
        ctx.strokeStyle = 'rgba(30,140,200,0.14)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        for (let x = -ox2; x < canvas.width + gs2; x += gs2) {
            for (let y = -oy2; y < canvas.height + gs2; y += gs2) {
                const wp = Math.cos((x + camera.x + waveT*32) * 0.016) * 4;
                const wq = Math.sin((y + camera.y + waveT*22) * 0.018) * 2;
                ctx.moveTo(x - 10, y + wp + wq);
                ctx.quadraticCurveTo(x, y + wp + wq + 1.5, x + 10, y + wp + wq);
            }
        }
        ctx.stroke();
    }

    // World border
    ctx.save();
    ctx.strokeStyle = 'rgba(255,80,0,0.45)';
    ctx.lineWidth   = 3;
    ctx.setLineDash([22, 12]);
    ctx.strokeRect(-camera.x, -camera.y, WORLD_W, WORLD_H);
    ctx.setLineDash([]);
    ctx.restore();
}

function drawMinimap() {
    const mw = mmCanvas.width;
    const mh = mmCanvas.height;
    const sx = mw / WORLD_W;
    const sy = mh / WORLD_H;

    mmCtx.clearRect(0, 0, mw, mh);
    mmCtx.fillStyle = 'rgba(0,25,50,0.9)';
    mmCtx.fillRect(0, 0, mw, mh);

    // Islands
    mmCtx.fillStyle = '#C4A850';
    for (const isl of islands) {
        mmCtx.beginPath();
        mmCtx.arc(isl.x*sx, isl.y*sy, Math.max(2, isl.r*sx), 0, Math.PI*2);
        mmCtx.fill();
    }

    // Whirlpools
    mmCtx.fillStyle = 'rgba(0,200,255,0.70)';
    for (const wp of whirlpools) {
        mmCtx.beginPath();
        mmCtx.arc(wp.x * sx, wp.y * sy, 4, 0, Math.PI * 2);
        mmCtx.fill();
    }

    // Coins (simple 2×2 dots — no per-coin draw call overhead)
    mmCtx.fillStyle = '#FFD700';
    for (const co of coins) {
        mmCtx.fillRect(co.x*sx - 1, co.y*sy - 1, 2, 2);
    }

    // Remote players
    for (const rp of remotePlayers.values()) {
        if (!rp.alive) continue;
        mmCtx.fillStyle = rp.c.accent;
        mmCtx.beginPath();
        mmCtx.arc(rp.x*sx, rp.y*sy, 3, 0, Math.PI*2);
        mmCtx.fill();
    }

    // Player
    if (player && player.alive) {
        mmCtx.fillStyle = '#00FF88';
        mmCtx.beginPath();
        mmCtx.arc(player.x*sx, player.y*sy, 4.5, 0, Math.PI*2);
        mmCtx.fill();

        // Viewport rectangle
        mmCtx.strokeStyle = 'rgba(255,255,255,0.3)';
        mmCtx.lineWidth   = 1;
        mmCtx.strokeRect(camera.x*sx, camera.y*sy, canvas.width*sx, canvas.height*sy);
    }

    mmCtx.strokeStyle = '#8B6914';
    mmCtx.lineWidth   = 1.5;
    mmCtx.strokeRect(0, 0, mw, mh);
}
