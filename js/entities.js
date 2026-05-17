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
        this.aiTick           = 0;
        this.aiWander         = Math.random() * Math.PI * 2;
        this.aiCoinTarget     = null;
        this._wasBoostingLast = false;
        this._wakeAcc         = 0;
    }

    eat(v) {
        const trailGrow = v > 1 ? 8 : 2;   // slowed: was 25/5
        const scoreGain = v > 1 ? 5 : 2;
        this.maxLen = Math.min(this.maxLen + trailGrow, MAX_TRAIL_LEN);
        this.score += scoreGain;
        // size is recalculated every frame in update()
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
            this.size = Math.max(13, 13 + Math.min(this.score, 500) * 0.02);

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

        // Wake foam bubbles — spawn every ~7 frames behind the ship
        this._wakeAcc += dt;
        if (this._wakeAcc >= 7) {
            this._wakeAcc -= 7;
            if (typeof spawnWakeDrop === 'function') spawnWakeDrop(this);
        }
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

        const _mob = navigator.maxTouchPoints > 0 && window.innerWidth <= 768;
        const s = this.size * (_mob ? 1.15 : 1);
        const c = this.c;

        if      (this.shipType === 'sandal') this._drawSandal(s, c);
        else if (this.shipType === 'savas')  this._drawSavasGemisi(s, c);
        else                                  this._drawGemi(s, c);

        ctx.restore();

        // Name tag + bounty crown
        const nameY   = sy - s * (this.shipType === 'savas' ? 3.2 : 2.6);
        const isBounty = !this.isPlayer && this.score >= (typeof BOUNTY_SCORE !== 'undefined' ? BOUNTY_SCORE : 300);
        ctx.save();
        ctx.font         = `bold ${this.isPlayer ? 14 : 11}px Georgia`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
        ctx.lineWidth    = 3;
        ctx.fillStyle    = isBounty ? '#FFD700' : (this.isPlayer ? '#00FF88' : c.accent);
        const dsq        = (sx - canvas.width/2)**2 + (sy - canvas.height/2)**2;
        if (this.isPlayer || dsq < 450*450) {
            ctx.strokeText(this.name, sx, nameY);
            ctx.fillText  (this.name, sx, nameY);
            if (isBounty) {
                // Bounty crown glow
                ctx.shadowColor = 'rgba(255,200,0,0.85)';
                ctx.shadowBlur  = 10;
                ctx.font        = '13px serif';
                ctx.fillStyle   = '#FFD700';
                ctx.fillText('💰', sx, nameY - 14);
                ctx.shadowBlur  = 0;
            }
        }
        ctx.restore();
    }

    // ── Sandal (small rowing boat) ────────────────────────────
    _drawSandal(s, c) {
        nx_drawSandalG(ctx, s, c, { angle: this.angle, frame: frame });
    }

    // ── Gemi (brigantine sailing ship) ────────────────────────
    _drawGemi(s, c) {
        nx_drawGemiG(ctx, s, c, { angle: this.angle, frame: frame });
    }
    // ── Savaş Gemisi (man-of-war) ─────────────────────────────
    _drawSavasGemisi(s, c) {
        nx_drawSavasG(ctx, s, c, { angle: this.angle, frame: frame });
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

// ── WHIRLPOOL ─────────────────────────────────────────────────
class Whirlpool {
    constructor(x, y) {
        this.x     = x;
        this.y     = y;
        this.r     = 60;    // instant-kill radius
        this.pullR = 130;   // pull-toward radius
        this.spin  = Math.random() * Math.PI * 2;
    }

    update(dt = 1) {
        this.spin += 0.038 * dt;
    }

    draw() {
        const sx = this.x - camera.x;
        const sy = this.y - camera.y;
        if (sx < -220 || sx > canvas.width + 220 || sy < -220 || sy > canvas.height + 220) return;

        ctx.save();
        ctx.translate(sx, sy);

        // Outer warning ripples
        for (let i = 3; i >= 0; i--) {
            ctx.save();
            ctx.rotate(this.spin * (i % 2 === 0 ? 1 : -1) + i * 0.55);
            ctx.globalAlpha = 0.08 + i * 0.03;
            ctx.strokeStyle = '#00C8FF';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.arc(0, 0, this.pullR - i * 10, 0, Math.PI * 1.65);
            ctx.stroke();
            ctx.restore();
        }

        // Spinning vortex arms
        for (let arm = 0; arm < 4; arm++) {
            ctx.save();
            ctx.rotate(this.spin * 1.4 + arm * Math.PI / 2);
            const grad = ctx.createLinearGradient(0, 0, this.r, 0);
            grad.addColorStop(0,   'rgba(0,10,40,0.90)');
            grad.addColorStop(0.5, 'rgba(0,40,120,0.50)');
            grad.addColorStop(1,   'rgba(0,80,180,0.0)');
            ctx.strokeStyle = grad;
            ctx.lineWidth   = 8 - arm;
            ctx.lineCap     = 'round';
            ctx.beginPath();
            ctx.arc(0, 0, this.r * (0.4 + arm * 0.18), 0, Math.PI * 0.9);
            ctx.stroke();
            ctx.restore();
        }

        // Dark center void
        const voidGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.r * 0.55);
        voidGrad.addColorStop(0,   'rgba(0,2,18,0.98)');
        voidGrad.addColorStop(0.7, 'rgba(0,10,40,0.80)');
        voidGrad.addColorStop(1,   'rgba(0,20,60,0.0)');
        ctx.fillStyle = voidGrad;
        ctx.beginPath();
        ctx.arc(0, 0, this.r * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Glowing inner ring
        ctx.strokeStyle = 'rgba(0,180,255,0.35)';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.r * 0.55, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    // Returns pull vector if ship is in range, else null
    pullForce(px, py) {
        const dx = this.x - px, dy = this.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 > this.pullR * this.pullR) return null;
        const d   = Math.sqrt(d2);
        const str = (1 - d / this.pullR) * 0.55;
        return { fx: (dx / d) * str, fy: (dy / d) * str };
    }

    // True if ship is inside the kill zone
    isInside(px, py) {
        const dx = px - this.x, dy = py - this.y;
        return dx * dx + dy * dy < this.r * this.r;
    }
}
