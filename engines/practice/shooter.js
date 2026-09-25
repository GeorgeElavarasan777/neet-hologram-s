/* Space-shooter MCQ practice, adapted for phones from "CBSE Math Quest" (mathquest.html).
   Enemy ships each carry one answer; shoot the ship with the correct one. Differences from the desktop
   original: the canvas fills the screen in portrait and landscape (device-pixel sharp), drag anywhere to
   steer and hold to fire, answer ships are sized to their text and use two rows when they would not fit,
   the question and HUD are HTML (crisp, wraps, readable), the game pauses when the app is hidden, only
   letting the CORRECT ship land costs a shield (wrong ships that land just disappear), and the state is
   saved every wave so a round can be continued later.
   Shooter.start({ chapters, state?, onSave(state), onEnd(result), sound, $ }) */
(function () {
  'use strict';
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2'];

  // WebAudio blips (generated, no files); the player can mute
  const Sound = {
    ctx: null, on: true,
    init() { if (!this.ctx) try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    beep(f, d, type = 'square', vol = 0.06, slide) {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + d + 0.02);
    },
    shoot() { this.beep(720, 0.06, 'square', 0.035, 420); },
    ok() { this.beep(523, 0.09, 'triangle', 0.08); setTimeout(() => this.beep(784, 0.12, 'triangle', 0.08), 90); },
    wrong() { this.beep(150, 0.22, 'sawtooth', 0.08, 70); },
    boom() { this.beep(180, 0.2, 'sawtooth', 0.06, 60); },
    level() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.1, 'triangle', 0.07), i * 90)); },
  };

  const G = {
    running: false, paused: false,
    start(o) {
      this.o = o; const $ = o.$;
      this.cv = $('#gameCanvas'); this.ctx = this.cv.getContext('2d');
      this.hud = { q: $('#gQuestion'), topic: $('#gTopic'), hint: $('#gHint'), score: $('#gScore'), level: $('#gLevel'), shields: $('#gShields'), streak: $('#gStreak') };
      const s = o.state || {};
      Object.assign(this, { score: s.score || 0, level: s.level || 1, shields: s.shields ?? 3, streak: s.streak || 0, bestStreak: s.bestStreak || 0, correct: s.correct || 0, waves: s.waves || 0, log: s.log || [], hintOn: false });
      this.enemies = []; this.bullets = []; this.particles = []; this.floats = []; this.stars = [];
      this.input = { left: false, right: false, fire: false, tx: null };
      this.fireCd = 0; this.shake = 0; this.baseFlash = 0; this.t = 0; this.waveDelay = 0; this.countdown = 2.4;
      Sound.on = o.sound !== false;
      this.resize(); this.player = { x: this.W / 2, vx: 0 };
      for (let i = 0; i < 130; i++) { const z = Math.floor(rnd(0, 3)); this.stars.push({ x: rnd(0, this.W), y: rnd(0, this.H), r: [1, 1.4, 2][z], sp: 10 + z * 28, tw: rnd(0, 7) }); }
      this.bind();
      this.spawn(s.question || null);
      // continuing mid-wave: the wrong answers already shot stay destroyed (and still count as a miss)
      if (s.question && s.wrongTries && s.wrongTries.length) { this.wrongTries = s.wrongTries.slice(); this.enemies = this.enemies.filter((e) => !this.wrongTries.includes(e.text)); }
      this.running = true; this.paused = false; this.last = performance.now();
      cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame((t) => this.frame(t));
    },
    stop() { this.running = false; cancelAnimationFrame(this.raf); this.unbind(); },
    pause(on = true) { if (!this.running) return; this.paused = on; if (on) this.save(); this.o.onPause && this.o.onPause(on); if (!on) this.last = performance.now(); },

    // ── layout
    resize() {
      const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const oldW = this.W || r.width, oldH = this.H || r.height;
      this.W = Math.max(280, r.width); this.H = Math.max(300, r.height);
      this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr); this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._prevBase = this.baseY; this.baseY = this.H - 56; this.playerY = this.H - 84;
      const kx = this.W / oldW, ky = this.H / oldH;
      if (this.player) this.player.x = clamp(this.player.x * kx, 24, this.W - 24);
      if (this.enemies && this.enemies.length && this.q) this.relayout();
      for (const s of this.stars || []) { s.x *= kx; s.y *= ky; }
      this.font = `700 ${this.W < 420 ? 15 : 17}px ui-monospace, "Share Tech Mono", Consolas, monospace`;
    },

    // ── one question = one wave of answer ships
    spawn(saved) {
      const count = Math.min(5, 3 + Math.floor((this.level - 1) / 2));
      const q = saved && saved.options ? saved : this.o.next(count);
      this.q = q; this.hintOn = false; this.wrongTries = []; this.waveDone = false;
      this.hud.topic.textContent = `${q.chapterTitle} · ${q.topic}`; this.hud.topic.style.color = q.color || '';
      this.hud.q.textContent = q.q; this.hud.hint.hidden = true; this.hud.hint.textContent = this.maskHint(q);
      this.updateHud();
      this.spawnShips();
      this.o.onSave(this.snapshot());
    },
    // one column per answer, so no ship ever hides another (a lower ship would block the shot);
    // long answers wrap onto up to 3 lines inside their ship, and the font shrinks if a word is too wide
    spawnShips() {
      const q = this.q, ctx = this.ctx, n = q.options.length, gap = 8, usable = this.W - 16, colW = (usable - gap * (n - 1)) / n;
      const lay = (text) => {
        for (let fs = this.W < 420 ? 15 : 17; fs >= 11; fs--) {
          ctx.font = `700 ${fs}px ui-monospace, "Share Tech Mono", Consolas, monospace`;
          const max = colW - 18, words = String(text).split(' '), lines = []; let cur = '';
          for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width <= max || !cur) cur = t; else { lines.push(cur); cur = w; } }
          lines.push(cur);
          const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
          if ((widest <= max && lines.length <= 3) || fs === 11) return { fs, lines, w: Math.min(colW, Math.max(56, widest + 26)), h: 20 + lines.length * (fs + 3) };
        }
      };
      // ships enter just below the question panel (never hidden behind it), then fall to the base:
      // ~10 s on level 1, quicker each level (never below ~5 s)
      const hud = document.querySelector('.ghud'), top = hud ? hud.getBoundingClientRect().bottom - this.cv.getBoundingClientRect().top + 6 : 20;
      this.topY = Math.min(Math.max(20, top), this.baseY * 0.45);
      const fall = Math.max(5, 10.5 - (this.level - 1) * 0.9), vy = (this.baseY - this.topY) / fall;
      this.enemies = q.options.map((text, i) => {
        const L = lay(text);
        return { i, x: 8 + colW / 2 + i * (colW + gap), y: this.topY + L.h / 2 + Math.random() * 18, w: L.w, h: L.h, lines: L.lines, fs: L.fs, text, ok: i === q.answer, vy, wob: rnd(0, 7), hit: 0, dead: false, col: COLORS[i % COLORS.length] };
      });
    },
    // after a rotation: rebuild the ships for the new width, keeping how far down each one was
    relayout() {
      const keep = new Map(this.enemies.filter((e) => !e.dead).map((e) => [e.i, e.y / (this._prevBase || this.baseY)]));
      this.spawnShips(); this.enemies = this.enemies.filter((e) => keep.has(e.i));
      for (const e of this.enemies) e.y = Math.max(this.topY + e.h / 2, keep.get(e.i) * this.baseY); // never behind the question panel
    },
    snapshot() { return { score: this.score, level: this.level, shields: this.shields, streak: this.streak, bestStreak: this.bestStreak, correct: this.correct, waves: this.waves, log: this.log.slice(-200), question: this.q, wrongTries: (this.wrongTries || []).slice() }; },
    save() { if (this.running) this.o.onSave(this.snapshot()); },
    updateHud() {
      this.hud.score.textContent = this.score; this.hud.level.textContent = this.level; this.hud.streak.textContent = this.streak;
      this.hud.shields.innerHTML = [0, 1, 2].map((i) => `<i class="${i < this.shields ? 'on' : ''}"></i>`).join('');
    },
    // the hint shows the method but not the final value ("… = ?"); the full working is in the results review
    maskHint(q) {
      const ans = String(q.options[q.answer] || ''), core = ans.replace(/\s*(cm²|cm³|cm|m|°)$/, '').replace(/^₹/, '');
      if (!q.hint || !core) return q.hint || '';
      const esc = core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return q.hint.replace(new RegExp(`(^|[^\\d.\\w])${esc}(?!\\w|\\.\\d)`, 'gi'), '$1?');
    },
    toggleHint() { this.hintOn = !this.hintOn; this.hud.hint.hidden = !this.hintOn || !this.q.hint; },

    // ── outcomes
    record(result) {
      if (this.waveDone) return; this.waveDone = true; this.waves++;
      this.log.push({ q: this.q.q, answer: this.q.options[this.q.answer], options: this.q.options.filter((_, i) => i !== this.q.answer), hint: this.q.hint, topic: this.q.topic, chapter: this.q.chapter, chapterTitle: this.q.chapterTitle, color: this.q.color, result, wrong: this.wrongTries.slice() });
    },
    correctHit(e) {
      this.explode(e.x, e.y, '#7CFFB2', 34); Sound.ok(); Sound.boom(); this.addShake(8);
      this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); this.correct++;
      const gain = (this.hintOn ? 5 : 10) * this.level; this.score += gain;
      this.float(e.x, e.y - 20, '+' + gain, '#7CFFB2');
      for (const o of this.enemies) if (o !== e) this.explode(o.x, o.y, '#5b7bd2', 10);
      this.enemies = []; this.record(this.wrongTries.length ? 'correct-after-wrong' : 'correct');
      this.o.onAnswer && this.o.onAnswer(this.q, !this.wrongTries.length);
      if (this.correct % 5 === 0) { this.level++; this.float(this.W / 2, this.H * 0.35, `LEVEL ${this.level}!`, '#ffd166', 1.6); Sound.level(); }
      this.waveDelay = 0.7; this.updateHud();
    },
    wrongHit(e) {
      e.dead = true; this.explode(e.x, e.y, '#ff6b6b', 18); Sound.wrong(); this.addShake(10);
      this.shields--; this.streak = 0; this.baseFlash = 0.5; this.wrongTries.push(e.text);
      this.float(e.x, e.y - 20, '−1 shield', '#ff6b6b'); this.updateHud();
      if (this.shields <= 0) this.gameOver(); else this.save(); // a lost shield is saved at once
    },
    correctLanded(e) {
      e.dead = true; this.shields--; this.streak = 0; this.baseFlash = 0.7; this.addShake(9); Sound.wrong();
      this.float(this.W / 2, this.baseY - 30, `Answer: ${e.text}`, '#ffd166', 2.2);
      for (const o of this.enemies) o.dead = true;
      this.record('missed'); this.o.onAnswer && this.o.onAnswer(this.q, false);
      this.updateHud(); if (this.shields <= 0) this.gameOver(); else { this.waveDelay = 1.6; this.save(); }
    },
    gameOver() {
      this.record('missed'); // the question the game was lost on goes into the review too
      this.running = false; cancelAnimationFrame(this.raf); this.unbind();
      this.o.onEnd({ score: this.score, level: this.level, correct: this.correct, waves: this.waves, bestStreak: this.bestStreak, log: this.log });
    },

    // ── effects
    explode(x, y, color, n) { if (REDUCED) n = Math.ceil(n / 3); for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), s = rnd(40, 220); this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.4, 0.9), max: 0.9, size: rnd(1.5, 3.5), color }); } },
    float(x, y, txt, color, life = 1.1) { this.floats.push({ x, y, vy: -34, life, max: life, txt, color }); },
    addShake(v) { if (!REDUCED) this.shake = Math.min(14, this.shake + v); },
    fire() {
      if (this.fireCd > 0) return; this.fireCd = 0.16;
      this.bullets.push({ x: this.player.x, y: this.playerY - 22, vy: -620, trail: [] }); Sound.shoot();
      for (let i = 0; i < 4; i++) this.particles.push({ x: this.player.x, y: this.playerY - 22, vx: rnd(-40, 40), vy: rnd(-160, -60), life: 0.18, max: 0.18, size: rnd(1, 2.5), color: '#9fe8ff' });
    },

    // ── input: keyboard + drag-to-steer / hold-to-fire
    bind() {
      const I = this.input;
      this._key = (e, down) => {
        if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
        const k = e.code;
        if (k === 'ArrowLeft' || k === 'KeyA') { I.left = down; I.tx = null; }
        else if (k === 'ArrowRight' || k === 'KeyD') { I.right = down; I.tx = null; }
        else if (k === 'Space') { I.fire = down; e.preventDefault(); if (down) Sound.init(); }
        else if (down && k === 'KeyH') this.toggleHint();
        else if (down && (k === 'KeyP' || k === 'Escape')) this.pause(!this.paused);
        else return;
      };
      this._kd = (e) => this._key(e, true); this._ku = (e) => this._key(e, false);
      const pos = (e) => { const r = this.cv.getBoundingClientRect(); return e.clientX - r.left; };
      this._pd = (e) => { if (this.paused) return; Sound.init(); I.tx = pos(e); I.fire = true; try { this.cv.setPointerCapture(e.pointerId); } catch (x) { /* ok */ } e.preventDefault(); };
      this._pm = (e) => { if (e.pointerType === 'mouse' && !e.buttons) { I.tx = pos(e); return; } if (I.fire) I.tx = pos(e); };
      this._pu = () => { I.fire = false; };
      this._vis = () => { if (document.hidden) this.pause(true); };
      this._rs = () => { clearTimeout(this._rt); this._rt = setTimeout(() => this.resize(), 80); };
      addEventListener('keydown', this._kd); addEventListener('keyup', this._ku);
      this.cv.addEventListener('pointerdown', this._pd); this.cv.addEventListener('pointermove', this._pm);
      addEventListener('pointerup', this._pu); addEventListener('pointercancel', this._pu);
      document.addEventListener('visibilitychange', this._vis); addEventListener('resize', this._rs);
    },
    unbind() {
      removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku);
      if (this.cv) { this.cv.removeEventListener('pointerdown', this._pd); this.cv.removeEventListener('pointermove', this._pm); }
      removeEventListener('pointerup', this._pu); removeEventListener('pointercancel', this._pu);
      document.removeEventListener('visibilitychange', this._vis); removeEventListener('resize', this._rs);
    },

    // ── simulation
    update(dt) {
      this.t += dt;
      for (const s of this.stars) { s.y += s.sp * dt; s.tw += dt * 2; if (s.y > this.H) { s.y = 0; s.x = rnd(0, this.W); } }
      if (this.countdown > 0) { this.countdown -= dt; return; }
      const I = this.input, P = this.player;
      let dir = (I.right ? 1 : 0) - (I.left ? 1 : 0);
      if (dir) P.vx += dir * 1900 * dt; else P.vx *= Math.pow(0.001, dt);
      if (I.tx != null) P.vx += (I.tx - P.x) * 9 * dt, P.vx *= Math.pow(0.02, dt);
      P.vx = clamp(P.vx, -520, 520); P.x = clamp(P.x + P.vx * dt, 24, this.W - 24);
      if (I.fire) this.fire(); this.fireCd -= dt;
      for (const b of this.bullets) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 6) b.trail.shift(); b.y += b.vy * dt; }
      this.bullets = this.bullets.filter((b) => b.y > -20);
      for (const e of this.enemies) {
        if (e.dead) continue;
        e.y += e.vy * dt; e.wob += dt * 2.2; e.hit = Math.max(0, e.hit - dt * 4);
        if (e.y + e.h / 2 >= this.baseY) { if (e.ok) { this.correctLanded(e); if (!this.running) return; } else { e.dead = true; this.explode(e.x, this.baseY, '#5b7bd2', 8); } }
      }
      for (const b of this.bullets) {
        if (b.dead) continue;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.abs(b.x - e.x) < e.w / 2 + 3 && Math.abs(b.y - e.y) < e.h / 2 + 4) { b.dead = true; if (e.ok) this.correctHit(e); else this.wrongHit(e); break; }
        }
        if (!this.running) return;
      }
      this.bullets = this.bullets.filter((b) => !b.dead); this.enemies = this.enemies.filter((e) => !e.dead);
      if (this.waveDelay > 0) { this.waveDelay -= dt; if (this.waveDelay <= 0) this.spawn(); }
      else if (!this.enemies.length) this.spawn();
      for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; }
      this.particles = this.particles.filter((p) => p.life > 0);
      for (const f of this.floats) { f.life -= dt; f.y += f.vy * dt; }
      this.floats = this.floats.filter((f) => f.life > 0);
      this.baseFlash = Math.max(0, this.baseFlash - dt); this.shake *= Math.pow(0.0001, dt);
    },

    // ── drawing (the original's look: parallax stars, city base, flame flicker, trails, particles)
    draw() {
      const c = this.ctx, W = this.W, H = this.H;
      c.save();
      if (this.shake > 0.2) c.translate(rnd(-this.shake, this.shake), rnd(-this.shake, this.shake));
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#070b1c'); g.addColorStop(1, '#03040c'); c.fillStyle = g; c.fillRect(-20, -20, W + 40, H + 40);
      const ng = c.createRadialGradient(W * 0.7, H * 0.25, 10, W * 0.7, H * 0.25, Math.max(W, H) * 0.45); ng.addColorStop(0, 'rgba(70,110,230,0.18)'); ng.addColorStop(1, 'rgba(70,110,230,0)'); c.fillStyle = ng; c.fillRect(0, 0, W, H);
      for (const s of this.stars) { c.fillStyle = `rgba(200,220,255,${(0.4 + 0.6 * Math.abs(Math.sin(s.tw))) * 0.8})`; c.beginPath(); c.arc(s.x, s.y, s.r, 0, 7); c.fill(); }
      // base
      const y = this.baseY;
      if (this.baseFlash > 0) { c.fillStyle = `rgba(255,90,90,${this.baseFlash})`; c.fillRect(0, y, W, H - y); }
      c.fillStyle = '#10204a'; c.fillRect(0, y + 16, W, H - y);
      c.fillStyle = '#1b3a7a'; for (let x = 10; x < W; x += 46) { const h = 18 + ((x * 7) % 3) * 8; c.fillRect(x, y + 16 - (h - 18), x % 92 === 0 ? 34 : 24, h); }
      c.strokeStyle = 'rgba(120,180,255,0.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, y + 16); c.lineTo(W, y + 16); c.stroke();
      // enemies: answer pills with wings
      c.font = this.font; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const e of this.enemies) {
        const ex = e.x, ey = e.y + Math.sin(e.wob) * 3, w = e.w, h = e.h;
        c.fillStyle = '#3a4f8f';
        c.beginPath(); c.moveTo(ex - w / 2 - 12, ey + 8); c.lineTo(ex - w / 2 + 6, ey - 6); c.lineTo(ex - w / 2 + 6, ey + 12); c.fill();
        c.beginPath(); c.moveTo(ex + w / 2 + 12, ey + 8); c.lineTo(ex + w / 2 - 6, ey - 6); c.lineTo(ex + w / 2 - 6, ey + 12); c.fill();
        c.fillStyle = e.col; this.pill(ex - w / 2, ey - h / 2, w, h, h / 2); c.fill();
        c.strokeStyle = 'rgba(220,235,255,0.85)'; c.lineWidth = 2; c.stroke();
        c.fillStyle = '#04050d'; c.font = `700 ${e.fs}px ui-monospace, "Share Tech Mono", Consolas, monospace`;
        const lh = e.fs + 3, top = ey - ((e.lines.length - 1) * lh) / 2;
        e.lines.forEach((l, k) => c.fillText(l, ex, top + k * lh + 1));
      }
      // bullets
      for (const b of this.bullets) {
        for (let i = 0; i < b.trail.length; i++) { const p = b.trail[i], a = i / b.trail.length; c.fillStyle = `rgba(150,230,255,${a * 0.5})`; c.beginPath(); c.arc(p.x, p.y, 2.5 * a, 0, 7); c.fill(); }
        c.fillStyle = '#bff4ff'; c.shadowColor = '#7fdcff'; c.shadowBlur = 10; c.beginPath(); c.arc(b.x, b.y, 4, 0, 7); c.fill(); c.shadowBlur = 0;
      }
      // player
      const px = this.player.x, py = this.playerY + Math.sin(this.t * 3) * 2, fl = 10 + Math.random() * 10;
      c.fillStyle = 'rgba(255,170,60,0.9)'; c.beginPath(); c.moveTo(px - 6, py + 14); c.lineTo(px, py + 14 + fl); c.lineTo(px + 6, py + 14); c.fill();
      c.fillStyle = 'rgba(255,230,120,0.9)'; c.beginPath(); c.moveTo(px - 3, py + 14); c.lineTo(px, py + 14 + fl * 0.6); c.lineTo(px + 3, py + 14); c.fill();
      c.fillStyle = '#cfe3ff'; c.strokeStyle = '#5aa0ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, py - 20); c.lineTo(px - 15, py + 14); c.lineTo(px + 15, py + 14); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#2b6fff'; c.beginPath(); c.arc(px, py - 4, 5, 0, 7); c.fill();
      // particles + floating text
      for (const p of this.particles) { c.globalAlpha = clamp(p.life / p.max, 0, 1); c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size, 0, 7); c.fill(); }
      c.globalAlpha = 1; c.font = `700 ${W < 420 ? 17 : 20}px ui-monospace, Consolas, monospace`;
      for (const f of this.floats) { c.globalAlpha = clamp(f.life / f.max, 0, 1); c.fillStyle = f.color; c.fillText(f.txt, clamp(f.x, 70, W - 70), f.y); }
      c.globalAlpha = 1;
      if (this.countdown > 0) { c.fillStyle = 'rgba(4,5,13,0.45)'; c.fillRect(0, 0, W, H); c.fillStyle = '#eaf2ff'; c.font = '700 44px ui-monospace, Consolas, monospace'; c.fillText(this.countdown > 0.8 ? String(Math.ceil(this.countdown - 0.8)) : 'GO!', W / 2, H * 0.55); }
      c.restore();
    },
    pill(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); },
    frame(now) {
      if (!this.running) return;
      let dt = (now - this.last) / 1000; this.last = now; if (dt > 0.05) dt = 0.05;
      if (!this.paused && !this.manual) this.update(dt); // `manual`: tests step the game themselves (tools/test-practice)
      if (this.running) this.draw();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    },
  };
  window.Shooter = G; window.ShooterSound = Sound;
})();
