// =============================================================
//  entities.js  —  Trail, Ship, Coin, Island, Particle
//  All classes reference globals (ctx, camera, frame, etc.)
//  defined in game.js — safe because methods run at call-time.
// =============================================================

// ── TRAIL (circular buffer, zero-allocation) ─────────────────
// Pre-allocates MAX_TRAIL_LEN objects once; mutates them in place.
// Index 0 = newest (head), index len-1 = oldest (tail).
class Trail {
    constructor() {
        this._buf   = Array.from({ length: MAX_TRAIL_LEN }, () => ({ x:0, y:0 }));
        this._start = 0;   // index of oldest element in _buf
        this.len    = 0;   // currently used nodes
    }

    // Return node at logical index i (0=newest, len-1=oldest)
    get(i) {
        return this._buf[(this._start + this.len - 1 - i) % MAX_TRAIL_LEN];
    }

    // Add new head point; trim buffer to maxLen.
    // Skips if the ship hasn't moved TRAIL_GAP pixels since last node.
    push(x, y, maxLen) {
        if (this.len > 0) {
            const h = this.get(0);
            const dx = x - h.x, dy = y - h.y;
            if (dx*dx + dy*dy < TRAIL_GAP * TRAIL_GAP) return;
        }

        // Write new head at (start + len) % MAX
        const wi = (this._start + this.len) % MAX_TRAIL_LEN;
        this._buf[wi].x = x;
        this._buf[wi].y = y;

        if (this.len < MAX_TRAIL_LEN) {
            this.len++;
        } else {
            // Buffer full — oldest is implicitly overwritten; advance start
            this._start = (this._start + 1) % MAX_TRAIL_LEN;
        }

        // Trim to ship's current maxLen
        const cap = Math.min(maxLen, MAX_TRAIL_LEN);
        while (this.len > cap) {
            this._start = (this._start + 1) % MAX_TRAIL_LEN;
            this.len--;
        }
    }

    // Keep only the k most-recent nodes (trim oldest).
    trimToNewest(k) {
        if (k >= this.len) return;
        const drop    = this.len - k;
        this._start   = (this._start + drop) % MAX_TRAIL_LEN;
        this.len      = k;
    }

    // Seed initial nodes going backward from (x,y) along angle.
    seed(x, y, angle, count) {
        for (let i = count - 1; i >= 0; i--) {
            const sx = x - Math.cos(angle) * i * TRAIL_GAP * 1.6;
            const sy = y - Math.sin(angle) * i * TRAIL_GAP * 1.6;
            const wi = (this._start + this.len) % MAX_TRAIL_LEN;
            this._buf[wi].x = sx;
            this._buf[wi].y = sy;
            if (this.len < MAX_TRAIL_LEN) {
                this.len++;
            } else {
                this._start = (this._start + 1) % MAX_TRAIL_LEN;
            }
        }
    }
}

// ── SHIP ─────────────────────────────────────────────────────
class Ship {
    constructor(x, y, isPlayer, colorIdx, name, customColors = null, shipType = null) {
        this.x        = x;
        this.y        = y;
        this.angle    = Math.random() * Math.PI * 2;
        this.isPlayer = isPlayer;
        this.ci       = colorIdx % SHIP_COLORS.length;
        this.c        = customColors !== null ? customColors : SHIP_COLORS[this.ci];
        this.name     = name;
        this.shipType = shipType || (['sandal','gemi','gemi','savas'])[Math.floor(Math.random()*4)];
        this.score    = 0;
        this.alive    = true;
        this.boosting = false;
        this.maxLen   = 55;
        this.size     = 13;

        // Pre-compute gradient color strings once (avoids per-frame string building)
        this._wakeHi  = `rgba(${this.c.wake},0.95)`;
        this._wakeMid = `rgba(${this.c.wake},0.70)`;
        this._wakeLo  = `rgba(${this.c.wake},0.22)`;

        this.trail = new Trail();
        this.trail.seed(x, y, this.angle, TRAIL_INIT_LEN);

        // AI state
        this.aiTick          = 0;
        this.aiWander        = Math.random() * Math.PI * 2;
        this.aiCoinTarget    = null;
        this._wasBoostingLast = false;
    }

    eat(v) {
        const trailGrow = v > 1 ? 25 : 5;
        const scoreGain = v > 1 ? 5  : 2;
        this.maxLen = Math.min(this.maxLen + trailGrow, MAX_TRAIL_LEN);
        this.score += scoreGain;
        // size is recalculated every frame in update() — no need to set it here
    }

    // ── update ──────────────────────────────────────────────
    update() {
        if (!this.alive) return;
        const dt  = typeof _dt !== 'undefined' ? _dt : 1;

        const spd = this.boosting ? BOOST_SPEED : BASE_SPEED;
        const tr  = (this.boosting ? BOOST_TURN  : TURN_RATE) * dt;

        if (this.isPlayer) {
            // Turn toward mouse (world coords)
            const wx = mouse.x + camera.x;
            const wy = mouse.y + camera.y;
            this.angle = lerpAngle(this.angle, Math.atan2(wy - this.y, wx - this.x), tr);

            // Sync ship size to current score every frame (catches all score sources: coins, kills, boost)
            this.size = Math.max(13, 13 + Math.min(this.score, 500) * 0.03);

            // Boost
            this.boosting = boostActive && boostEnergy > 5 && this.maxLen > MIN_BOOST_LEN;
            if (this.boosting) {
                // Deduct 5 gold the moment boost activates (once per press, not per frame)
                if (!this._wasBoostingLast) {
                    this.score = Math.max(0, this.score - 5);
                }

                boostEnergy = Math.max(0, boostEnergy - BOOST_DRAIN * dt);
                if (boostEnergy === 0) this.boosting = false;
                this._boostAcc = (this._boostAcc || 0) + dt;
                if (this._boostAcc >= 4 && this.maxLen > MIN_BOOST_LEN) {
                    this.maxLen--;
                    this._boostAcc -= 4;
                    spawnSteam(this);
                }
            } else {
                boostEnergy = Math.min(BOOST_MAX, boostEnergy + BOOST_REGEN * dt);
                this._boostAcc = 0;
            }
            this._wasBoostingLast = this.boosting;
            document.getElementById('boostFill').style.width = boostEnergy + '%';

        } else {
            this._aiUpdate(dt);
        }

        this.x += Math.cos(this.angle) * spd * dt;
        this.y += Math.sin(this.angle) * spd * dt;

        // Soft boundary push
        const M = 80;
        if (this.x < M)           this.angle = lerpAngle(this.angle, 0,           0.1 * dt);
        if (this.x > WORLD_W - M) this.angle = lerpAngle(this.angle, Math.PI,     0.1 * dt);
        if (this.y < M)           this.angle = lerpAngle(this.angle, Math.PI/2,   0.1 * dt);
        if (this.y > WORLD_H - M) this.angle = lerpAngle(this.angle, -Math.PI/2,  0.1 * dt);

        this.x = clamp(this.x, 20, WORLD_W - 20);
        this.y = clamp(this.y, 20, WORLD_H - 20);

        this.trail.push(this.x, this.y, this.maxLen);
    }

    _aiUpdate(dt = 1) {
        this.aiTick -= dt;
        if (this.aiTick <= 0) {
            // Find nearest coin — use squared distance (avoids Math.sqrt per coin)
            let best = null, bdSq = 700 * 700;
            for (let i = 0; i < coins.length; i++) {
                const co  = coins[i];
                const dx  = co.x - this.x, dy = co.y - this.y;
                const dsq = dx*dx + dy*dy;
                if (dsq < bdSq) { bdSq = dsq; best = co; }
            }
            this.aiCoinTarget = best;
            this.aiWander    += rnd(-0.8, 0.8);
            this.aiTick       = 30 + Math.random() * 60;
        }

        if (this.aiCoinTarget) {
            const ta = Math.atan2(this.aiCoinTarget.y - this.y, this.aiCoinTarget.x - this.x);
            this.angle = lerpAngle(this.angle, ta, 0.055 * dt);
            const dx = this.aiCoinTarget.x - this.x, dy = this.aiCoinTarget.y - this.y;
            if (dx*dx + dy*dy < 30*30) this.aiCoinTarget = null;
        } else {
            this.angle = lerpAngle(this.angle, this.angle + this.aiWander * 0.08, 0.03 * dt);
        }

        this.boosting = Math.random() < 0.04 && this.maxLen > MIN_BOOST_LEN + 12;
        if (this.boosting && this.maxLen > MIN_BOOST_LEN) {
            this._boostAcc = (this._boostAcc || 0) + dt;
            if (this._boostAcc >= 4) { this.maxLen--; this._boostAcc -= 4; }
        }
    }

    // ── drawTrail ────────────────────────────────────────────
    drawTrail() {
        const t = this.trail;
        if (t.len < 2) return;

        const head = t.get(0);
        const tail = t.get(t.len - 1);
        const hx = head.x - camera.x, hy = head.y - camera.y;
        const tx = tail.x - camera.x, ty = tail.y - camera.y;

        // Off-screen culling: skip if head AND tail are outside the same edge
        const pad = 160;
        const cw  = canvas.width, ch = canvas.height;
        if (hx < -pad && tx < -pad) return;
        if (hx > cw+pad && tx > cw+pad) return;
        if (hy < -pad && ty < -pad) return;
        if (hy > ch+pad && ty > ch+pad) return;

        ctx.save();

        // Stride rendering: for long trails skip every other node.
        // 9px gap × stride 2 = 18px between drawn points — still visually smooth.
        const stride = t.len > 130 ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(hx, hy);
        for (let i = stride; i < t.len; i += stride) {
            const p = t.get(i);
            ctx.lineTo(p.x - camera.x, p.y - camera.y);
        }
        if (stride > 1) ctx.lineTo(tx, ty); // ensure path reaches real tail

        const grad = ctx.createLinearGradient(hx, hy, tx, ty);
        grad.addColorStop(0,    this._wakeHi);
        grad.addColorStop(0.55, this._wakeMid);
        grad.addColorStop(1,    this._wakeLo);

        ctx.strokeStyle = grad;
        ctx.lineWidth   = 13;
        ctx.lineCap     = 'round';
        ctx.lineJoin    = 'round';
        ctx.stroke();

        // Highlight only for nearby ships (skip for distant ones)
        const distSq = (hx - cw*0.5)**2 + (hy - ch*0.5)**2;
        if (distSq < 550*550) {
            const hLen = Math.min(20, t.len);
            if (hLen > 2) {
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                for (let i = 1; i < hLen; i++) {
                    const p = t.get(i);
                    ctx.lineTo(p.x - camera.x, p.y - camera.y);
                }
                ctx.strokeStyle = 'rgba(255,255,220,0.18)';
                ctx.lineWidth   = 4;
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    // ── draw (ship body) ─────────────────────────────────────
    draw() {
        if (!this.alive) return;
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        if (sx < -160 || sx > canvas.width+160 || sy < -160 || sy > canvas.height+160) return;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle + Math.PI/2);

        const s = this.size;
        const c = this.c;

        if      (this.shipType === 'sandal') this._drawSandal(s, c);
        else if (this.shipType === 'savas')  this._drawSavasGemisi(s, c);
        else                                  this._drawGemi(s, c);

        ctx.restore();

        // Name tag
        const nameY = sy - s * (this.shipType === 'savas' ? 3.2 : 2.6);
        ctx.save();
        ctx.font         = `bold ${this.isPlayer ? 14 : 11}px Georgia`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 3;
        ctx.fillStyle    = this.isPlayer ? '#00FF88' : c.accent;
        const dsq        = (sx - canvas.width/2)**2 + (sy - canvas.height/2)**2;
        if (this.isPlayer || dsq < 450*450) {
            ctx.strokeText(this.name, sx, nameY);
            ctx.fillText  (this.name, sx, nameY);
        }
        ctx.restore();
    }

    // ── Sandal (small rowing boat) ────────────────────────────
    _drawSandal(s, c) {
        // Narrow hull
        ctx.beginPath();
        ctx.moveTo(0, -s*0.98);
        ctx.bezierCurveTo(s*0.36, -s*0.48, s*0.44, s*0.48, s*0.24, s*0.98);
        ctx.lineTo(-s*0.24, s*0.98);
        ctx.bezierCurveTo(-s*0.44, s*0.48, -s*0.36, -s*0.48, 0, -s*0.98);
        ctx.closePath();
        ctx.fillStyle   = c.hull;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Interior shadow
        ctx.beginPath();
        ctx.moveTo(0, -s*0.78);
        ctx.bezierCurveTo(s*0.22, -s*0.32, s*0.28, s*0.36, s*0.12, s*0.78);
        ctx.lineTo(-s*0.12, s*0.78);
        ctx.bezierCurveTo(-s*0.28, s*0.36, -s*0.22, -s*0.32, 0, -s*0.78);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();

        // Seat plank
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(-s*0.18, s*0.1, s*0.36, s*0.12);

        // Mast
        ctx.strokeStyle = '#5C3D1E';
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(0, s*0.35); ctx.lineTo(0, -s*0.58);
        ctx.stroke();

        // Lateen (triangular) sail
        ctx.beginPath();
        ctx.moveTo(0, -s*0.55);
        ctx.lineTo(s*0.46, s*0.3);
        ctx.lineTo(0, s*0.3);
        ctx.closePath();
        ctx.fillStyle   = c.sail;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth   = 0.8;
        ctx.stroke();

        // Oars
        ctx.strokeStyle = '#6B4A20';
        ctx.lineWidth   = 2;
        ctx.lineCap     = 'round';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side*s*0.34, -s*0.05);
            ctx.lineTo(side*s*0.7, s*0.56);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(side*s*0.76, s*0.62, 5, 2.5, side > 0 ? 0.55 : -0.55, 0, Math.PI*2);
            ctx.fillStyle = '#6B4A20';
            ctx.fill();
        }

        // Small flag (pennant)
        ctx.save();
        ctx.translate(0, -s*0.58);
        ctx.fillStyle = c.accent;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(10, -3); ctx.lineTo(10, 3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    }

    // ── Gemi (brigantine sailing ship) ────────────────────────
    _drawGemi(s, c) {
        // Streamlined hull — pointed bow, wider stern
        ctx.beginPath();
        ctx.moveTo(0, -s*1.42);
        ctx.bezierCurveTo(s*0.28, -s*0.92, s*0.64, -s*0.18, s*0.6, s*0.7);
        ctx.bezierCurveTo(s*0.6, s*0.94, s*0.5, s*1.04, s*0.38, s*1.04);
        ctx.lineTo(-s*0.38, s*1.04);
        ctx.bezierCurveTo(-s*0.5, s*1.04, -s*0.6, s*0.94, -s*0.6, s*0.7);
        ctx.bezierCurveTo(-s*0.64, -s*0.18, -s*0.28, -s*0.92, 0, -s*1.42);
        ctx.closePath();
        ctx.fillStyle   = c.hull;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.58)';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        // Waterline stripe
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(-s*0.54, s*0.52); ctx.lineTo(s*0.54, s*0.52);
        ctx.stroke();

        // Bowsprit
        ctx.strokeStyle = '#3D2000';
        ctx.lineWidth   = 2.5;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(s*0.08, -s*1.28); ctx.lineTo(s*0.3, -s*1.82);
        ctx.stroke();

        // Fore mast (near bow)
        ctx.fillStyle = '#3D2000';
        ctx.fillRect(-1.8, -s*1.3, 3.6, s*0.78);
        ctx.fillRect(-s*0.32, -s*0.65, s*0.64, 2.5);

        // Main mast
        ctx.fillRect(-2.5, -s*0.52, 5, s*1.16);
        ctx.fillRect(-s*0.58, s*0.0, s*1.16, 3);   // cross arm

        // Mizzen mast (short, near stern)
        ctx.fillRect(-1.5, s*0.55, 3, s*0.4);

        // Fore sail
        ctx.beginPath();
        ctx.moveTo(-s*0.3, -s*0.63);
        ctx.quadraticCurveTo(s*0.02, -s*0.5, s*0.3, -s*0.63);
        ctx.lineTo(s*0.3, -s*0.4);
        ctx.quadraticCurveTo(s*0.02, -s*0.3, -s*0.3, -s*0.4);
        ctx.closePath();
        ctx.fillStyle = c.sail; ctx.fill();

        // Main sail
        ctx.beginPath();
        ctx.moveTo(-s*0.56, s*0.02);
        ctx.quadraticCurveTo(s*0.0, s*0.28, s*0.56, s*0.02);
        ctx.lineTo(s*0.56, s*0.66);
        ctx.quadraticCurveTo(s*0.0, s*0.86, -s*0.56, s*0.66);
        ctx.closePath();
        ctx.fillStyle   = c.sail; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth   = 0.8; ctx.stroke();

        // Main top sail
        ctx.beginPath();
        ctx.moveTo(0, -s*0.48); ctx.lineTo(s*0.36, s*0.0); ctx.lineTo(-s*0.36, s*0.0);
        ctx.closePath();
        ctx.fillStyle = c.sail; ctx.fill();

        // Skull on main sail
        ctx.font = `${s*0.62}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillText('☠', 0, s*0.35);

        // Rigging
        ctx.strokeStyle = 'rgba(80,55,20,0.45)';
        ctx.lineWidth   = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -s*1.27); ctx.lineTo(s*0.3, -s*1.8);
        ctx.moveTo(-s*0.56, s*0.02); ctx.lineTo(0, -s*1.27);
        ctx.moveTo(s*0.56, s*0.02);  ctx.lineTo(0, -s*1.27);
        ctx.stroke();

        // Cannons (2 per side)
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect( s*0.58, -s*0.08, 7, 3.5);
        ctx.fillRect(-s*0.58-7, -s*0.08, 7, 3.5);
        ctx.fillRect( s*0.58, s*0.28, 7, 3.5);
        ctx.fillRect(-s*0.58-7, s*0.28, 7, 3.5);

        // Flag
        ctx.save();
        ctx.translate(0, -s*1.35);
        ctx.rotate(-this.angle - Math.PI/2 + Math.sin(frame * 0.12) * 0.35);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, -5, 16, 10);
        ctx.fillStyle    = c.accent;
        ctx.font         = '7px serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☠', 8, 0);
        ctx.restore();
    }

    // ── Savaş Gemisi (man-of-war) ─────────────────────────────
    _drawSavasGemisi(s, c) {
        const w = 1.26; // width multiplier — wider than gemi

        // Wide imposing hull
        ctx.beginPath();
        ctx.moveTo(0, -s*1.18);
        ctx.bezierCurveTo(s*w*0.5, -s*0.68, s*w*0.78, -s*0.06, s*w*0.78, s*0.6);
        ctx.lineTo(s*w*0.78, s*1.08);
        ctx.lineTo(-s*w*0.78, s*1.08);
        ctx.lineTo(-s*w*0.78, s*0.6);
        ctx.bezierCurveTo(-s*w*0.78, -s*0.06, -s*w*0.5, -s*0.68, 0, -s*1.18);
        ctx.closePath();
        ctx.fillStyle   = c.hull;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth   = 2;
        ctx.stroke();

        // Gun deck stripes (dark bands)
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(-s*w*0.76, -s*0.1, s*w*1.52, s*0.24);
        ctx.fillRect(-s*w*0.76, s*0.36, s*w*1.52, s*0.22);

        // Stern castle
        ctx.fillStyle   = 'rgba(255,255,255,0.05)';
        ctx.fillRect(-s*w*0.76, s*0.75, s*w*1.52, s*0.33);
        ctx.strokeStyle = 'rgba(160,120,50,0.35)';
        ctx.lineWidth   = 1;
        ctx.strokeRect(-s*w*0.76, s*0.75, s*w*1.52, s*0.33);

        // Bowsprit (thick)
        ctx.strokeStyle = '#3D2000';
        ctx.lineWidth   = 3.5;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(s*0.1, -s*1.04); ctx.lineTo(s*0.4, -s*1.68);
        ctx.stroke();

        // Fore mast
        ctx.fillStyle = '#3D2000';
        ctx.fillRect(-2.2, -s*1.08, 4.4, s*1.48);
        ctx.fillRect(-s*w*0.42, s*0.26, s*w*0.84, 3.5);

        // Main mast (tallest)
        ctx.fillRect(-3, -s*0.32, 6, s*1.42);
        ctx.fillRect(-s*w*0.76, -s*0.1, s*w*1.52, 4);

        // Mizzen mast
        ctx.fillRect(-2, s*0.5, 4, s*0.56);
        ctx.fillRect(-s*w*0.32, s*0.6, s*w*0.64, 3);

        // Fore sail
        ctx.beginPath();
        ctx.moveTo(-s*w*0.4, s*0.28);
        ctx.quadraticCurveTo(s*0.02, s*0.42, s*w*0.4, s*0.28);
        ctx.lineTo(s*w*0.4, s*0.6);
        ctx.quadraticCurveTo(s*0.02, s*0.74, -s*w*0.4, s*0.6);
        ctx.closePath();
        ctx.fillStyle = c.sail; ctx.fill();

        // Main sail (wide)
        ctx.beginPath();
        ctx.moveTo(-s*w*0.74, -s*0.08);
        ctx.quadraticCurveTo(s*0.02, s*0.2, s*w*0.74, -s*0.08);
        ctx.lineTo(s*w*0.74, s*0.56);
        ctx.quadraticCurveTo(s*0.02, s*0.78, -s*w*0.74, s*0.56);
        ctx.closePath();
        ctx.fillStyle   = c.sail; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth   = 1; ctx.stroke();

        // Main top sail
        ctx.beginPath();
        ctx.moveTo(0, -s*0.3); ctx.lineTo(s*w*0.44, -s*0.08); ctx.lineTo(-s*w*0.44, -s*0.08);
        ctx.closePath();
        ctx.fillStyle = c.sail; ctx.fill();

        // Fore top sail
        ctx.beginPath();
        ctx.moveTo(0, -s*1.06); ctx.lineTo(s*w*0.28, s*0.26); ctx.lineTo(-s*w*0.28, s*0.26);
        ctx.closePath();
        ctx.fillStyle   = c.sail;
        ctx.globalAlpha = 0.82; ctx.fill(); ctx.globalAlpha = 1;

        // Skull on main sail
        ctx.font = `${s*0.72}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillText('☠', 0, s*0.25);

        // Cannons (4 per side, two decks)
        ctx.fillStyle = '#111';
        for (const cy of [-s*0.06, s*0.14, s*0.38, s*0.57]) {
            ctx.fillRect( s*w*0.77, cy, 9, 4);
            ctx.fillRect(-s*w*0.77-9, cy, 9, 4);
        }

        // Rigging
        ctx.strokeStyle = 'rgba(80,55,20,0.4)';
        ctx.lineWidth   = 0.9;
        ctx.beginPath();
        ctx.moveTo(0, -s*1.05); ctx.lineTo(s*0.4, -s*1.65);
        ctx.moveTo(-s*w*0.74, -s*0.08); ctx.lineTo(0, -s*0.3);
        ctx.moveTo(s*w*0.74, -s*0.08);  ctx.lineTo(0, -s*0.3);
        ctx.stroke();

        // Large flag
        ctx.save();
        ctx.translate(0, -s*1.38);
        ctx.rotate(-this.angle - Math.PI/2 + Math.sin(frame * 0.12) * 0.28);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, -7, 22, 14);
        ctx.fillStyle    = c.accent;
        ctx.font         = '9px serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('☠', 11, 0);
        ctx.restore();
    }
}

// ── COIN ─────────────────────────────────────────────────────
class Coin {
    constructor(id, x, y, v) {
        this.id      = id;
        this.x       = x;
        this.y       = y;
        this.v       = v || 1;
        this.r       = v > 1 ? 18 : 11;
        this.bob     = Math.random() * Math.PI * 2;
        this.rot     = Math.random() * Math.PI * 2;
        this.isChest = v > 1;
    }

    draw() {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        if (sx < -25 || sx > canvas.width+25 || sy < -25 || sy > canvas.height+25) return;

        const bob = Math.sin(frame * .05 + this.bob) * 2.5;
        ctx.save();
        ctx.translate(sx, sy + bob);

        const dt = typeof _dt !== 'undefined' ? _dt : 1;
        if (this.isChest) {
            const g = ctx.createRadialGradient(0,0,2,0,0,22);
            g.addColorStop(0, 'rgba(255,200,0,0.5)');
            g.addColorStop(1, 'rgba(255,200,0,0)');
            ctx.fillStyle = g;
            ctx.fillRect(-22,-22,44,44);

            ctx.fillStyle = '#5C3A00'; ctx.fillRect(-11,-7,22,14);
            ctx.fillStyle = '#7B4F00';
            ctx.beginPath(); ctx.ellipse(0,-7,11,6,0,Math.PI,0); ctx.fill();
            ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 1.5;
            ctx.strokeRect(-11,-7,22,14);
            ctx.beginPath(); ctx.moveTo(-11,0); ctx.lineTo(11,0); ctx.stroke();
            ctx.fillStyle = '#FFD700';
            ctx.beginPath(); ctx.arc(0,0,3.5,0,Math.PI*2); ctx.fill();
        } else {
            this.rot += 0.025 * dt;
            ctx.rotate(this.rot);
            // Glow ring — cheap alternative to shadowBlur (which is very expensive)
            ctx.fillStyle = 'rgba(255,215,0,0.22)';
            ctx.beginPath(); ctx.arc(0, 0, this.r + 4, 0, Math.PI*2); ctx.fill();
            // Coin body
            ctx.fillStyle = '#FFD700';
            ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#B8860B';
            ctx.beginPath(); ctx.arc(0, 0, this.r - 2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle    = '#FFD700';
            ctx.font         = `${this.r+1}px serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('☠', 0, 0.5);
        }
        ctx.restore();
    }
}

// ── ISLAND ───────────────────────────────────────────────────
class Island {
    constructor(x, y, r) {
        this.x = x; this.y = y; this.r = r;
        const n = 7 + Math.floor(Math.random() * 5);
        this.verts = Array.from({ length: n }, (_, i) => {
            const a  = (i / n) * Math.PI * 2;
            const vr = r * (0.65 + Math.random() * 0.7);
            return { x: Math.cos(a)*vr, y: Math.sin(a)*vr };
        });
    }

    draw() {
        const sx = this.x - camera.x, sy = this.y - camera.y;
        if (sx < -this.r-60 || sx > canvas.width+this.r+60) return;
        if (sy < -this.r-60 || sy > canvas.height+this.r+60) return;

        ctx.save(); ctx.translate(sx, sy);

        // Shadow
        ctx.beginPath();
        this.verts.forEach((v,i) => i===0 ? ctx.moveTo(v.x,v.y+6) : ctx.lineTo(v.x,v.y+6));
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();

        // Sand
        ctx.beginPath();
        this.verts.forEach((v,i) => i===0 ? ctx.moveTo(v.x,v.y) : ctx.lineTo(v.x,v.y));
        ctx.closePath();
        const grad = ctx.createRadialGradient(0,0,0,0,0,this.r);
        grad.addColorStop(0,   '#F5E888');
        grad.addColorStop(0.6, '#D4B860');
        grad.addColorStop(1,   '#B89A50');
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = 'rgba(160,120,40,.8)'; ctx.lineWidth = 2; ctx.stroke();

        // Palm tree
        if (this.r > 38) {
            ctx.fillStyle = '#4a2800'; ctx.fillRect(-2.5, -this.r*.45, 5, this.r*.45);
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * Math.PI * 2 + frame * .012;
                ctx.beginPath();
                ctx.moveTo(0, -this.r*.42);
                ctx.quadraticCurveTo(Math.cos(a)*22, -this.r*.42+Math.sin(a)*10, Math.cos(a)*32, -this.r*.42+16);
                ctx.strokeStyle = '#2a7a2a'; ctx.lineWidth = 4.5; ctx.lineCap = 'round'; ctx.stroke();
            }
        }
        ctx.restore();
    }

    hits(ship) {
        return dist(ship.x, ship.y, this.x, this.y) < this.r + ship.size - 4;
    }
}

// ── REMOTE PLAYER ────────────────────────────────────────────
// Extends Ship so all draw methods (_drawGemi, _drawSandal, etc.)
// are properly inherited as instance methods via super().
class RemotePlayer extends Ship {
    constructor(id, name, config, shipType, initX, initY) {
        const ci = Math.floor(Math.random() * SHIP_COLORS.length);
        const sx = initX ?? PLAYER_SPAWN_X;
        const sy = initY ?? PLAYER_SPAWN_Y;
        super(sx, sy, false, ci, name, (config && config.hull) ? config : null, shipType || 'gemi');
        this.id   = id;
        this._buf = [];   // [{ms, x, y, angle, size, score, maxLen, boosting}]
        this.trail.trimToNewest(0);
    }

    applyState(data) {
        const now = performance.now();
        const { x, y, angle, size, score, maxLen, boosting } = data;

        // Large teleport — flush buffer and snap visual position
        if (this._buf.length > 0) {
            const last = this._buf[this._buf.length - 1];
            const dx = x - last.x, dy = y - last.y;
            if (dx * dx + dy * dy > 250 * 250) {
                this._buf = [];
                this.x = x;
                this.y = y;
            }
        }

        this._buf.push({
            ms: now, x, y,
            angle:    angle    ?? this.angle,
            size:     size     ?? this.size,
            score:    score    ?? this.score,
            maxLen:   maxLen   ?? this.maxLen,
            boosting: boosting ?? false,
        });
        // Keep at most ~1.5 s of history (75 states at 50 Hz)
        if (this._buf.length > 75) this._buf.shift();
    }

    update() {
        if (!this.alive) return;
        const dt       = typeof _dt !== 'undefined' ? _dt : 1;
        const renderMs = performance.now() - 100;   // render 100 ms behind real-time
        const buf      = this._buf;

        if (buf.length === 0) return;

        // Find the two states that bracket renderMs
        let prev = null, next = null;
        for (let i = 0; i < buf.length; i++) {
            if (buf[i].ms <= renderMs) prev = buf[i];
            else { next = buf[i]; break; }
        }

        if (prev && next) {
            // Smooth interpolation between two known positions — zero snapping
            const span = next.ms - prev.ms;
            const t    = span > 0 ? (renderMs - prev.ms) / span : 1;
            this.x = prev.x + (next.x - prev.x) * t;
            this.y = prev.y + (next.y - prev.y) * t;
            let da = next.angle - prev.angle;
            while (da >  Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            this.angle    = prev.angle + da * t;
            this.size     = prev.size  + (next.size - prev.size) * t;
            this.boosting = prev.boosting;
        } else if (prev) {
            // Only past states — dead reckon forward from the newest one
            const ageDt = Math.min((performance.now() - prev.ms) * 60 / 1000, 6);
            const spd   = prev.boosting ? BOOST_SPEED : BASE_SPEED;
            const tx    = prev.x + Math.cos(prev.angle) * spd * ageDt;
            const ty    = prev.y + Math.sin(prev.angle) * spd * ageDt;
            const f     = 1 - Math.pow(0.25, dt);
            this.x     += (tx - this.x) * f;
            this.y     += (ty - this.y) * f;
            this.angle  = prev.angle;
            this.size   = prev.size;
            this.boosting = prev.boosting;
        } else {
            // All states are in the future (first 100 ms after join) — snap to oldest
            this.x     = buf[0].x;
            this.y     = buf[0].y;
            this.angle = buf[0].angle;
            this.size  = buf[0].size;
            this.boosting = buf[0].boosting;
        }

        // Score/maxLen don't need smooth interpolation — use latest received value
        const latest    = buf[buf.length - 1];
        this.score  = latest.score;
        this.maxLen = latest.maxLen;

        this.trail.push(this.x, this.y, this.maxLen);
    }
}

// ── PARTICLE ─────────────────────────────────────────────────
class Particle {
    constructor(x, y, vx, vy, r, g, b, life, size) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = life; this.maxLife = life;
        this.size = size;
        // Pre-build solid color string ONCE — avoids per-frame string allocation
        this._col = `rgb(${r},${g},${b})`;
    }

    update() {
        const dt = typeof _dt !== 'undefined' ? _dt : 1;
        this.x  += this.vx * dt;
        this.y  += this.vy * dt;
        const f  = Math.pow(0.96, dt);
        this.vx *= f;
        this.vy *= f;
        this.life -= dt;
    }

    draw() {
        const t = this.life / this.maxLife;
        if (t <= 0) return;  // life is a float — can go negative before removal
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        ctx.globalAlpha = t;
        ctx.fillStyle   = this._col;
        ctx.beginPath();
        ctx.arc(sx, sy, this.size * t, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}
