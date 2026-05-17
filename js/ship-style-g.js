// =============================================================
//  ship-style-g.js  — Noctyra Stil G ("Boyalı") gemi çizimleri
//  Radyal/linear gradyan hull & yelken, büyük animasyonlu bayrak
// =============================================================

function nx_darken(hex, amt) {
    amt = amt || 0.35;
    const h = hex.replace('#','');
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    const f = 1 - amt;
    return `rgb(${Math.round(r*f)},${Math.round(g*f)},${Math.round(b*f)})`;
}
function nx_lighten(hex, amt) {
    amt = amt || 0.30;
    const h = hex.replace('#','');
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    return `rgb(${Math.min(255,Math.round(r+(255-r)*amt))},${Math.min(255,Math.round(g+(255-g)*amt))},${Math.min(255,Math.round(b+(255-b)*amt))})`;
}

function nx_fillRadial(ctx, hull, sizeRef) {
    const grad = ctx.createRadialGradient(
        -sizeRef * 0.20, -sizeRef * 0.35, 0,
         0, 0, sizeRef * 1.4
    );
    grad.addColorStop(0,    nx_lighten(hull, 0.35));
    grad.addColorStop(0.55, hull);
    grad.addColorStop(1,    nx_darken(hull, 0.50));
    ctx.fillStyle = grad;
    ctx.fill();
}

function nx_fillSail(ctx, sail, sizeRef) {
    const grad = ctx.createLinearGradient(-sizeRef, -sizeRef * 0.6, sizeRef, sizeRef * 0.6);
    grad.addColorStop(0,   nx_lighten(sail, 0.25));
    grad.addColorStop(0.5, sail);
    grad.addColorStop(1,   nx_darken(sail, 0.40));
    ctx.fillStyle = grad;
    ctx.fill();
}

// Big animated flag — counter-rotated to stay world-up
function nx_drawBigFlag(ctx, w, h, accent, angle, frame) {
    ctx.save();
    ctx.rotate(-(angle || 0) - Math.PI/2 + Math.sin((frame || 0) * 0.12) * 0.30);

    const dark = nx_darken(accent, 0.55);

    // Pole knob
    ctx.fillStyle = '#3a2410';
    ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI*2); ctx.fill();

    // Flag body with wave
    ctx.beginPath();
    ctx.moveTo(0, -h*0.5);
    ctx.lineTo(w * 0.85, -h*0.45);
    ctx.quadraticCurveTo(w * 1.02, 0, w * 0.85, h*0.45);
    ctx.lineTo(0, h*0.5);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Wind highlight
    ctx.beginPath();
    ctx.moveTo(2, -h*0.35);
    ctx.quadraticCurveTo(w * 0.5, -h*0.15, w * 0.78, -h*0.3);
    ctx.lineTo(w * 0.78, -h*0.1);
    ctx.quadraticCurveTo(w * 0.5, h*0.05, 2, h*0.15);
    ctx.closePath();
    ctx.fillStyle = nx_lighten(accent, 0.25);
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Skull
    ctx.font = `bold ${h * 0.78}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dark;
    ctx.fillText('☠', w * 0.42, 1);

    // Trailing edge
    ctx.strokeStyle = nx_darken(accent, 0.65);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -h*0.5);
    ctx.lineTo(0, h*0.5);
    ctx.stroke();

    ctx.restore();
}

// =============================================================
//  SANDAL · Stil G
// =============================================================
function nx_drawSandalG(ctx, s, c, opts) {
    opts = opts || {};
    const angle = opts.angle || 0;
    const frame = opts.frame || 0;
    const mast = nx_darken(c.hull, 0.65);

    // Hull
    ctx.beginPath();
    ctx.moveTo(0, -s*0.98);
    ctx.bezierCurveTo(s*0.36, -s*0.48, s*0.44, s*0.48, s*0.24, s*0.98);
    ctx.lineTo(-s*0.24, s*0.98);
    ctx.bezierCurveTo(-s*0.44, s*0.48, -s*0.36, -s*0.48, 0, -s*0.98);
    ctx.closePath();
    nx_fillRadial(ctx, c.hull, s);
    ctx.strokeStyle = nx_darken(c.hull, 0.65);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // Centerline seam
    ctx.strokeStyle = nx_darken(c.hull, 0.55);
    ctx.lineWidth = 0.7;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -s*0.85); ctx.lineTo(0, s*0.85);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Inner shadow
    ctx.beginPath();
    ctx.moveTo(0, -s*0.78);
    ctx.bezierCurveTo(s*0.22, -s*0.32, s*0.28, s*0.36, s*0.12, s*0.78);
    ctx.lineTo(-s*0.12, s*0.78);
    ctx.bezierCurveTo(-s*0.28, s*0.36, -s*0.22, -s*0.32, 0, -s*0.78);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    // Seat plank
    ctx.fillStyle = nx_lighten(c.hull, 0.25);
    ctx.fillRect(-s*0.18, s*0.1, s*0.36, s*0.10);

    // Mast
    ctx.strokeStyle = mast;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, s*0.35); ctx.lineTo(0, -s*0.58);
    ctx.stroke();

    // Sail
    ctx.beginPath();
    ctx.moveTo(0, -s*0.55);
    ctx.lineTo(s*0.46, s*0.3);
    ctx.lineTo(0, s*0.3);
    ctx.closePath();
    nx_fillSail(ctx, c.sail, s);
    ctx.strokeStyle = nx_darken(c.sail, 0.35);
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Oars
    ctx.strokeStyle = '#6B4A20';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (var side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side*s*0.34, -s*0.05);
        ctx.lineTo(side*s*0.7, s*0.56);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(side*s*0.76, s*0.62, 5, 2.5, side > 0 ? 0.55 : -0.55, 0, Math.PI*2);
        ctx.fillStyle = '#6B4A20';
        ctx.fill();
    }

    // Big flag
    ctx.save();
    ctx.translate(0, -s*0.78);
    nx_drawBigFlag(ctx, s*1.1, s*0.55, c.accent, angle, frame);
    ctx.restore();
}

// =============================================================
//  GEMI (Brig) · Stil G
// =============================================================
function nx_drawGemiG(ctx, s, c, opts) {
    opts = opts || {};
    const angle = opts.angle || 0;
    const frame = opts.frame || 0;
    const mast = '#3D2000';

    // Hull
    ctx.beginPath();
    ctx.moveTo(0, -s*1.42);
    ctx.bezierCurveTo(s*0.28, -s*0.92, s*0.64, -s*0.18, s*0.6, s*0.7);
    ctx.bezierCurveTo(s*0.6, s*0.94, s*0.5, s*1.04, s*0.38, s*1.04);
    ctx.lineTo(-s*0.38, s*1.04);
    ctx.bezierCurveTo(-s*0.5, s*1.04, -s*0.6, s*0.94, -s*0.6, s*0.7);
    ctx.bezierCurveTo(-s*0.64, -s*0.18, -s*0.28, -s*0.92, 0, -s*1.42);
    ctx.closePath();
    nx_fillRadial(ctx, c.hull, s * 1.2);
    ctx.strokeStyle = nx_darken(c.hull, 0.65);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Centerline
    ctx.strokeStyle = nx_darken(c.hull, 0.55);
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(0, -s*1.30); ctx.lineTo(0, s*0.95);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Waterline highlight
    ctx.strokeStyle = nx_lighten(c.hull, 0.30);
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(-s*0.50, s*0.55); ctx.lineTo(s*0.50, s*0.55);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Bowsprit
    ctx.strokeStyle = mast;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s*0.08, -s*1.28); ctx.lineTo(s*0.3, -s*1.82);
    ctx.stroke();

    // Fore mast
    ctx.fillStyle = mast;
    ctx.fillRect(-1.8, -s*1.3, 3.6, s*0.78);
    ctx.fillRect(-s*0.32, -s*0.65, s*0.64, 2.5);

    // Main mast
    ctx.fillRect(-2.5, -s*0.52, 5, s*1.16);
    ctx.fillRect(-s*0.58, s*0.0, s*1.16, 3);

    // Mizzen mast
    ctx.fillRect(-1.5, s*0.55, 3, s*0.4);

    // Fore sail
    ctx.beginPath();
    ctx.moveTo(-s*0.3, -s*0.63);
    ctx.quadraticCurveTo(s*0.02, -s*0.5, s*0.3, -s*0.63);
    ctx.lineTo(s*0.3, -s*0.4);
    ctx.quadraticCurveTo(s*0.02, -s*0.3, -s*0.3, -s*0.4);
    ctx.closePath();
    nx_fillSail(ctx, c.sail, s);

    // Main sail
    ctx.beginPath();
    ctx.moveTo(-s*0.56, s*0.02);
    ctx.quadraticCurveTo(s*0.0, s*0.28, s*0.56, s*0.02);
    ctx.lineTo(s*0.56, s*0.66);
    ctx.quadraticCurveTo(s*0.0, s*0.86, -s*0.56, s*0.66);
    ctx.closePath();
    nx_fillSail(ctx, c.sail, s);
    ctx.strokeStyle = nx_darken(c.sail, 0.35);
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Main top sail
    ctx.beginPath();
    ctx.moveTo(0, -s*0.48); ctx.lineTo(s*0.36, s*0.0); ctx.lineTo(-s*0.36, s*0.0);
    ctx.closePath();
    nx_fillSail(ctx, c.sail, s);

    // Skull on main sail
    ctx.font = `bold ${s*0.62}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = nx_darken(c.sail, 0.60);
    ctx.fillText('☠', 0, s*0.35);

    // Rigging
    ctx.strokeStyle = 'rgba(80,55,20,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -s*1.27); ctx.lineTo(s*0.3, -s*1.8);
    ctx.moveTo(-s*0.56, s*0.02); ctx.lineTo(0, -s*1.27);
    ctx.moveTo(s*0.56, s*0.02);  ctx.lineTo(0, -s*1.27);
    ctx.stroke();

    // Cannons
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect( s*0.58, -s*0.08, 7, 3.5);
    ctx.fillRect(-s*0.58-7, -s*0.08, 7, 3.5);
    ctx.fillRect( s*0.58, s*0.28, 7, 3.5);
    ctx.fillRect(-s*0.58-7, s*0.28, 7, 3.5);

    // Big flag
    ctx.save();
    ctx.translate(0, -s*1.35);
    nx_drawBigFlag(ctx, s*1.4, s*0.7, c.accent, angle, frame);
    ctx.restore();
}

// =============================================================
//  SAVAŞ GEMİSİ (Man-of-War) · Stil G
// =============================================================
function nx_drawSavasG(ctx, s, c, opts) {
    opts = opts || {};
    const angle = opts.angle || 0;
    const frame = opts.frame || 0;
    const w = 1.26;
    const mast = '#3D2000';

    // Hull
    ctx.beginPath();
    ctx.moveTo(0, -s*1.18);
    ctx.bezierCurveTo(s*w*0.5, -s*0.68, s*w*0.78, -s*0.06, s*w*0.78, s*0.6);
    ctx.lineTo(s*w*0.78, s*1.08);
    ctx.lineTo(-s*w*0.78, s*1.08);
    ctx.lineTo(-s*w*0.78, s*0.6);
    ctx.bezierCurveTo(-s*w*0.78, -s*0.06, -s*w*0.5, -s*0.68, 0, -s*1.18);
    ctx.closePath();
    nx_fillRadial(ctx, c.hull, s * w * 1.2);
    ctx.strokeStyle = nx_darken(c.hull, 0.65);
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Centerline
    ctx.strokeStyle = nx_darken(c.hull, 0.50);
    ctx.lineWidth = 0.9;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, -s*1.0); ctx.lineTo(0, s*1.0);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Gun deck stripes
    ctx.fillStyle = nx_darken(c.hull, 0.55);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(-s*w*0.76, -s*0.1, s*w*1.52, s*0.24);
    ctx.fillRect(-s*w*0.76, s*0.36, s*w*1.52, s*0.22);
    ctx.globalAlpha = 1;

    // Stern castle
    ctx.fillStyle = nx_lighten(c.hull, 0.18);
    ctx.globalAlpha = 0.5;
    ctx.fillRect(-s*w*0.76, s*0.75, s*w*1.52, s*0.33);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(160,120,50,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-s*w*0.76, s*0.75, s*w*1.52, s*0.33);

    // Bowsprit
    ctx.strokeStyle = mast;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s*0.1, -s*1.04); ctx.lineTo(s*0.4, -s*1.68);
    ctx.stroke();

    // Masts
    ctx.fillStyle = mast;
    ctx.fillRect(-2.2, -s*1.08, 4.4, s*1.48);
    ctx.fillRect(-s*w*0.42, s*0.26, s*w*0.84, 3.5);
    ctx.fillRect(-3, -s*0.32, 6, s*1.42);
    ctx.fillRect(-s*w*0.76, -s*0.1, s*w*1.52, 4);
    ctx.fillRect(-2, s*0.5, 4, s*0.56);
    ctx.fillRect(-s*w*0.32, s*0.6, s*w*0.64, 3);

    // Fore sail
    ctx.beginPath();
    ctx.moveTo(-s*w*0.4, s*0.28);
    ctx.quadraticCurveTo(s*0.02, s*0.42, s*w*0.4, s*0.28);
    ctx.lineTo(s*w*0.4, s*0.6);
    ctx.quadraticCurveTo(s*0.02, s*0.74, -s*w*0.4, s*0.6);
    ctx.closePath();
    nx_fillSail(ctx, c.sail, s);

    // Main sail
    ctx.beginPath();
    ctx.moveTo(-s*w*0.74, -s*0.08);
    ctx.quadraticCurveTo(s*0.02, s*0.2, s*w*0.74, -s*0.08);
    ctx.lineTo(s*w*0.74, s*0.56);
    ctx.quadraticCurveTo(s*0.02, s*0.78, -s*w*0.74, s*0.56);
    ctx.closePath();
    nx_fillSail(ctx, c.sail, s);
    ctx.strokeStyle = nx_darken(c.sail, 0.35);
    ctx.lineWidth = 0.9;
    ctx.stroke();

    // Top sails
    ctx.beginPath();
    ctx.moveTo(0, -s*0.3); ctx.lineTo(s*w*0.44, -s*0.08); ctx.lineTo(-s*w*0.44, -s*0.08);
    ctx.closePath();
    nx_fillSail(ctx, c.sail, s);

    ctx.beginPath();
    ctx.moveTo(0, -s*1.06); ctx.lineTo(s*w*0.28, s*0.26); ctx.lineTo(-s*w*0.28, s*0.26);
    ctx.closePath();
    nx_fillSail(ctx, c.sail, s);

    // Skull on main sail
    ctx.font = `bold ${s*0.72}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = nx_darken(c.sail, 0.60);
    ctx.fillText('☠', 0, s*0.25);

    // Cannons (4 per side)
    ctx.fillStyle = '#111';
    var decks = [-s*0.06, s*0.14, s*0.38, s*0.57];
    for (var i = 0; i < decks.length; i++) {
        var cy = decks[i];
        ctx.fillRect( s*w*0.77, cy, 9, 4);
        ctx.fillRect(-s*w*0.77-9, cy, 9, 4);
    }

    // Stern lanterns
    ctx.fillStyle = nx_lighten(c.accent, 0.25);
    ctx.shadowColor = c.accent;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(-s*w*0.55, s*0.95, 2.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( s*w*0.55, s*0.95, 2.2, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Rigging
    ctx.strokeStyle = 'rgba(80,55,20,0.4)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(0, -s*1.05); ctx.lineTo(s*0.4, -s*1.65);
    ctx.moveTo(-s*w*0.74, -s*0.08); ctx.lineTo(0, -s*0.3);
    ctx.moveTo(s*w*0.74, -s*0.08);  ctx.lineTo(0, -s*0.3);
    ctx.stroke();

    // Big flag
    ctx.save();
    ctx.translate(0, -s*1.38);
    nx_drawBigFlag(ctx, s*1.7, s*0.85, c.accent, angle, frame);
    ctx.restore();
}

if (typeof window !== 'undefined') {
    window.nx_drawSandalG = nx_drawSandalG;
    window.nx_drawGemiG   = nx_drawGemiG;
    window.nx_drawSavasG  = nx_drawSavasG;
}
