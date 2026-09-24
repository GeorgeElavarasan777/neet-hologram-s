/* Study-space wallpapers — every image is generated on-device from code (no stock photos,
   nothing to license, nothing downloaded). Each wallpaper is drawn once to a canvas and cached
   as a bitmap blob URL, so the page composites a plain image instead of re-running gradients or
   SVG filters on every frame — this keeps scrolling smooth at 60/90/120 Hz. */
(function (root) {
  'use strict';

  // ---------- helpers ----------
  function rng(seed) { // mulberry32 — deterministic, so a wallpaper always looks the same
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function valueNoise(seed, cells) {
    const r = rng(seed), g = [];
    for (let i = 0; i < (cells + 1) * (cells + 1); i++) g.push(r());
    const at = (x, y) => g[(y % (cells + 1)) * (cells + 1) + (x % (cells + 1))];
    const s = (t) => t * t * (3 - 2 * t);
    return function (u, v) { // u,v in [0,1)
      const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }
  function fbm(seed, octaves, base) {
    const layers = []; for (let o = 0; o < octaves; o++) layers.push(valueNoise(seed + o * 101, base << o));
    return (u, v) => { let sum = 0, amp = 0.5, norm = 0; for (const n of layers) { sum += n(u, v) * amp; norm += amp; amp *= 0.5; } return sum / norm; };
  }
  function grain(ctx, w, h, amount, seed) {
    const r = rng(seed || 7), img = ctx.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amount; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }
  function vgrad(ctx, w, h, stops) { const g = ctx.createLinearGradient(0, 0, 0, h); stops.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); }
  function ridge(ctx, w, h, seed, baseY, amp, color, rough) {
    const r = rng(seed), n = fbm(seed, 5, 3);
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += Math.max(2, w / 400)) {
      const u = x / w, y = baseY - (n(u * 0.999, 0.37) - 0.5) * amp * 2 - Math.sin(u * Math.PI * (1 + r())) * amp * 0.35 - (rough ? (r() - 0.5) * amp * 0.03 : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function fogBand(ctx, w, h, y, height, color) { const g = ctx.createLinearGradient(0, y - height, 0, y + height); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, color); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, y - height, w, height * 2); }
  const S = (w, h) => Math.min(w, h) / 1000; // scale factor relative to a 1000px canvas

  // ---------- gallery ----------
  const CATEGORIES = [
    { id: 'gradients', name: 'Minimal gradients', items: [
      { id: 'grad-fog', name: 'Fog', tone: 'light', draw(c, w, h) { vgrad(c, w, h, [[0, '#F6F6F4'], [1, '#D9D9D5']]); const g = c.createRadialGradient(w * 0.2, h * 0.1, 0, w * 0.2, h * 0.1, Math.max(w, h) * 0.7); g.addColorStop(0, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); grain(c, w, h, 5); } },
      { id: 'grad-dusk', name: 'Dusk', tone: 'dark', draw(c, w, h) { vgrad(c, w, h, [[0, '#101114'], [1, '#2C2F35']]); const g = c.createRadialGradient(w * 0.75, h * 0.85, 0, w * 0.75, h * 0.85, Math.max(w, h) * 0.6); g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); grain(c, w, h, 6); } },
      { id: 'grad-mist', name: 'Mist', tone: 'light', draw(c, w, h) { const g = c.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.75); g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, '#DDE0E4'); c.fillStyle = g; c.fillRect(0, 0, w, h); grain(c, w, h, 5); } },
      { id: 'grad-deep', name: 'Deep', tone: 'dark', draw(c, w, h) { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0A0B0D'); g.addColorStop(0.55, '#1F2227'); g.addColorStop(1, '#0C0D10'); c.fillStyle = g; c.fillRect(0, 0, w, h); grain(c, w, h, 6); } },
    ] },
    { id: 'grain', name: 'Grain & noise textures', items: [
      { id: 'grain-fine', name: 'Fine grain', tone: 'light', draw(c, w, h) { c.fillStyle = '#EDEDEA'; c.fillRect(0, 0, w, h); grain(c, w, h, 22, 3); } },
      { id: 'grain-film', name: 'Film grain', tone: 'dark', draw(c, w, h) { c.fillStyle = '#1B1C1F'; c.fillRect(0, 0, w, h); grain(c, w, h, 26, 5); } },
      { id: 'grain-paper', name: 'Paper fibre', tone: 'light', draw(c, w, h) {
        c.fillStyle = '#F3F2EE'; c.fillRect(0, 0, w, h); const r = rng(11), k = S(w, h);
        for (let i = 0; i < 2600; i++) { const x = r() * w, y = r() * h, a = r() * Math.PI, l = (6 + r() * 26) * k; c.strokeStyle = `rgba(0,0,0,${0.025 + r() * 0.04})`; c.lineWidth = 0.6 + r(); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 0.4) * l / 2, y + Math.sin(a + 0.4) * l / 2, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke(); }
        grain(c, w, h, 10, 12);
      } },
      { id: 'grain-concrete', name: 'Concrete', tone: 'dark', draw(c, w, h) {
        const n = fbm(21, 5, 4), img = c.createImageData(w, h), d = img.data, r = rng(22);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = 48 + n(x / w, y / h) * 34 + (r() - 0.5) * 18, i = (y * w + x) * 4; d[i] = d[i + 1] = v; d[i + 2] = v + 2; d[i + 3] = 255; }
        c.putImageData(img, 0, 0);
      } },
    ] },
    { id: 'geometric', name: 'Geometric line art', items: [
      { id: 'geo-iso', name: 'Isometric', tone: 'dark', draw(c, w, h) {
        c.fillStyle = '#111214'; c.fillRect(0, 0, w, h); const s = 46 * S(w, h) + 18; c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1;
        const t = Math.tan(Math.PI / 6);
        for (let x = -h; x < w + h; x += s) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + h / t, h); c.stroke(); c.beginPath(); c.moveTo(x, 0); c.lineTo(x - h / t, h); c.stroke(); }
        for (let x = 0; x < w; x += s * t * 2) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      } },
      { id: 'geo-arcs', name: 'Arcs', tone: 'light', draw(c, w, h) {
        c.fillStyle = '#F5F5F3'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(0,0,0,.09)'; c.lineWidth = 1.2; const step = 28 * S(w, h) + 10;
        for (let r = step; r < Math.hypot(w, h); r += step) { c.beginPath(); c.arc(0, h, r, -Math.PI / 2, 0); c.stroke(); c.beginPath(); c.arc(w, 0, r * 1.3, Math.PI / 2, Math.PI); c.stroke(); }
      } },
      { id: 'geo-contour', name: 'Contours', tone: 'dark', draw(c, w, h) {
        c.fillStyle = '#131417'; c.fillRect(0, 0, w, h); const n = fbm(31, 4, 2), cells = 220, cw = w / cells, ch = h / cells;
        c.strokeStyle = 'rgba(255,255,255,.10)'; c.lineWidth = 1;
        // marching-squares-lite: draw short segments where the field crosses each contour level
        for (let lvl = 0.3; lvl < 0.72; lvl += 0.035) {
          c.beginPath();
          for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
            const a = n(i / cells, j / cells), b = n((i + 1) / cells, j / cells), d = n(i / cells, (j + 1) / cells);
            if ((a - lvl) * (b - lvl) < 0) { const t = (lvl - a) / (b - a); c.moveTo((i + t) * cw, j * ch); c.lineTo((i + t) * cw + 0.8, j * ch + ch); }
            if ((a - lvl) * (d - lvl) < 0) { const t = (lvl - a) / (d - a); c.moveTo(i * cw, (j + t) * ch); c.lineTo(i * cw + cw, (j + t) * ch + 0.8); }
          }
          c.stroke();
        }
      } },
      { id: 'geo-dots', name: 'Dot matrix', tone: 'light', draw(c, w, h) {
        c.fillStyle = '#F4F4F2'; c.fillRect(0, 0, w, h); const s = 22 * S(w, h) + 8, r = rng(41);
        for (let y = s / 2; y < h; y += s) for (let x = s / 2; x < w; x += s) { const big = r() < 0.04; c.fillStyle = big ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.10)'; c.beginPath(); c.arc(x, y, big ? 2.6 : 1.3, 0, Math.PI * 2); c.fill(); }
      } },
    ] },
    { id: 'nature', name: 'Nature (desaturated)', note: 'Rendered scenes in greyscale — add your own photo with Upload.', items: [
      { id: 'nat-ridges', name: 'Misty ridges', tone: 'light', draw(c, w, h) {
        vgrad(c, w, h, [[0, '#E9EAEB'], [0.6, '#D4D6D8'], [1, '#C8CACC']]);
        const cols = ['#B9BCBF', '#9DA1A5', '#7F8388', '#5F6368', '#3E4145'];
        cols.forEach((col, i) => { ridge(c, w, h, 50 + i, h * (0.42 + i * 0.12), h * (0.10 - i * 0.012), col, true); fogBand(c, w, h, h * (0.48 + i * 0.12), h * 0.06, 'rgba(230,231,232,.55)'); });
        grain(c, w, h, 12, 51);
      } },
      { id: 'nat-pines', name: 'Pine fog', tone: 'light', draw(c, w, h) {
        vgrad(c, w, h, [[0, '#E4E5E6'], [1, '#C9CBCD']]); const r = rng(61);
        [['#AEB1B4', 0.55, 0.16], ['#8C9094', 0.66, 0.2], ['#62666B', 0.8, 0.26], ['#34373B', 0.95, 0.34]].forEach(([col, base, size], li) => {
          c.fillStyle = col;
          for (let x = -20; x < w + 20; x += (size * h) * (0.18 + r() * 0.2)) {
            const th = size * h * (0.6 + r() * 0.5), tw = th * 0.32, y0 = h * base + r() * h * 0.03;
            c.beginPath(); c.moveTo(x, y0 - th);
            for (let k = 1; k <= 4; k++) { c.lineTo(x + tw * k / 4, y0 - th + th * k / 4); c.lineTo(x + tw * k / 8, y0 - th + th * k / 4); }
            for (let k = 4; k >= 1; k--) { c.lineTo(x - tw * k / 8, y0 - th + th * k / 4); c.lineTo(x - tw * k / 4, y0 - th + th * k / 4); }
            c.closePath(); c.fill(); c.fillRect(x - th * 0.015, y0 - 2, th * 0.03, h);
          }
          fogBand(c, w, h, h * (base - 0.02), h * 0.07, 'rgba(228,229,230,.6)');
          if (li === 3) { c.fillStyle = col; c.fillRect(0, h * base, w, h); }
        });
        grain(c, w, h, 12, 62);
      } },
      { id: 'nat-sea', name: 'Still sea', tone: 'light', draw(c, w, h) {
        const hy = h * 0.55; vgrad(c, w, hy, [[0, '#D8DADC'], [1, '#EEEFF0']]);
        c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.arc(w * 0.68, hy * 0.62, Math.min(w, h) * 0.05, 0, Math.PI * 2); c.fill();
        const g = c.createLinearGradient(0, hy, 0, h); g.addColorStop(0, '#C3C6C9'); g.addColorStop(1, '#8D9195'); c.fillStyle = g; c.fillRect(0, hy, w, h - hy);
        const r = rng(71); for (let i = 0; i < 900; i++) { const y = hy + Math.pow(r(), 1.6) * (h - hy), l = (20 + r() * 120) * (0.3 + (y - hy) / (h - hy)); c.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.08})`; c.fillRect(r() * w, y, l, 1 + (y - hy) / h * 2); }
        c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(w * 0.66, hy, w * 0.04, h - hy);
        grain(c, w, h, 10, 72);
      } },
      { id: 'nat-dunes', name: 'Dunes', tone: 'light', draw(c, w, h) {
        vgrad(c, w, h, [[0, '#E6E6E5'], [1, '#D6D5D3']]);
        for (let i = 0; i < 5; i++) {
          const y0 = h * (0.45 + i * 0.13), r = rng(80 + i), amp = h * 0.07;
          const path = new Path2D(); path.moveTo(0, h); path.lineTo(0, y0);
          const a = r() * 2, b = 1 + r() * 1.5;
          for (let x = 0; x <= w; x += 8) path.lineTo(x, y0 - Math.sin(x / w * Math.PI * b + a) * amp);
          path.lineTo(w, h); path.closePath();
          const g = c.createLinearGradient(0, y0 - amp, w, y0 + amp); const t = 190 - i * 26; g.addColorStop(0, `rgb(${t + 25},${t + 24},${t + 22})`); g.addColorStop(1, `rgb(${t - 20},${t - 21},${t - 23})`);
          c.fillStyle = g; c.fill(path);
        }
        grain(c, w, h, 12, 85);
      } },
    ] },
    { id: 'ink', name: 'Abstract ink washes', items: [
      { id: 'ink-bloom', name: 'Sumi bloom', tone: 'light', draw(c, w, h) { c.fillStyle = '#F4F3EF'; c.fillRect(0, 0, w, h); inkBlooms(c, w, h, 91, 'rgba(20,20,22,', 'multiply'); grain(c, w, h, 8, 92); } },
      { id: 'ink-night', name: 'Night ink', tone: 'dark', draw(c, w, h) { c.fillStyle = '#111215'; c.fillRect(0, 0, w, h); inkBlooms(c, w, h, 93, 'rgba(235,235,232,', 'screen'); grain(c, w, h, 8, 94); } },
      { id: 'ink-brush', name: 'Brush field', tone: 'light', draw(c, w, h) { c.fillStyle = '#F5F4F1'; c.fillRect(0, 0, w, h); brushStrokes(c, w, h, 95, 'rgba(25,25,28,'); grain(c, w, h, 8, 96); } },
      { id: 'ink-grey', name: 'Grey wash', tone: 'dark', draw(c, w, h) { c.fillStyle = '#2A2C30'; c.fillRect(0, 0, w, h); inkBlooms(c, w, h, 97, 'rgba(0,0,0,', 'multiply'); inkBlooms(c, w, h, 98, 'rgba(200,200,200,', 'screen', 0.5); grain(c, w, h, 8, 99); } },
    ] },
    { id: 'solid', name: 'Solid tones', items: [
      ['solid-snow', 'Snow', '#F7F7F5', 'light'], ['solid-fog', 'Fog', '#E4E4E1', 'light'], ['solid-ash', 'Ash', '#B9BABB', 'light'],
      ['solid-slate', 'Slate', '#3B3E43', 'dark'], ['solid-graphite', 'Graphite', '#1E2024', 'dark'], ['solid-night', 'Night', '#0B0B0C', 'dark'],
    ].map(([id, name, col, tone]) => ({ id, name, tone, solid: col, draw(c, w, h) { c.fillStyle = col; c.fillRect(0, 0, w, h); } })) },
  ];

  function inkBlooms(c, w, h, seed, rgbaPrefix, blend, strength) {
    const r = rng(seed), k = strength || 1; c.save(); c.globalCompositeOperation = blend;
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * h, rad = (0.08 + r() * 0.28) * Math.max(w, h), a = (0.05 + r() * 0.12) * k;
      c.filter = `blur(${Math.round(rad * 0.08)}px)`;
      const g = c.createRadialGradient(x, y, rad * 0.1, x, y, rad); g.addColorStop(0, rgbaPrefix + a + ')'); g.addColorStop(0.7, rgbaPrefix + (a * 0.6) + ')'); g.addColorStop(1, rgbaPrefix + '0)');
      c.fillStyle = g; c.beginPath();
      for (let t = 0; t <= Math.PI * 2 + 0.01; t += 0.2) { const rr = rad * (0.75 + r() * 0.3); c.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); }
      c.fill();
    }
    c.restore();
  }
  function brushStrokes(c, w, h, seed, rgbaPrefix) {
    const r = rng(seed); c.save(); c.lineCap = 'round';
    for (let s = 0; s < 7; s++) {
      const y = h * (0.1 + r() * 0.8), x0 = -w * 0.1, x1 = w * (0.5 + r() * 0.6), bend = (r() - 0.5) * h * 0.3, width = (0.02 + r() * 0.05) * h;
      for (let k = 0; k < 60; k++) { // many thin bristle lines make one brush stroke
        const off = (r() - 0.5) * width; c.strokeStyle = rgbaPrefix + (0.015 + r() * 0.04) + ')'; c.lineWidth = 1 + r() * 3;
        c.beginPath(); c.moveTo(x0, y + off); c.quadraticCurveTo((x0 + x1) / 2, y + bend + off, x1 * (0.85 + r() * 0.15), y + off * 1.2 + bend * 0.3); c.stroke();
      }
    }
    c.restore();
  }

  // ---------- theme artwork (transparent layers that belong to a theme) ----------
  const THEME_ART = {
    inkLandscape(c, w, h) { // white ink-wash mountains + a few brush reeds
      const cols = ['rgba(255,255,255,.35)', 'rgba(255,255,255,.55)', 'rgba(255,255,255,.8)'];
      cols.forEach((col, i) => { c.filter = `blur(${2 - i * 0.6}px)`; ridge(c, w, h, 120 + i, h * (0.55 + i * 0.13), h * (0.16 - i * 0.03), col, true); fogBand(c, w, h, h * (0.62 + i * 0.13), h * 0.05, 'rgba(28,30,34,.35)'); });
      c.filter = 'none'; const r = rng(130); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineCap = 'round';
      for (let i = 0; i < 18; i++) { const x = w * (0.04 + r() * 0.2), y = h, len = h * (0.12 + r() * 0.2); c.lineWidth = 1 + r() * 2.5; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (r() - 0.3) * 40, y - len * 0.6, x + (r() - 0.2) * 70, y - len); c.stroke(); }
    },
    blueprintArt(c, w, h) { // pale-blue technical drawing: compass rose, gear, dimension lines
      const k = Math.min(w, h) / 900; c.strokeStyle = '#BCCDE6'; c.fillStyle = '#BCCDE6'; c.lineWidth = 1.4 * k;
      const cx = w * 0.62, cy = h * 0.58, R = 250 * k;
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(cx, cy, R * 0.72, 0, Math.PI * 2); c.stroke();
      c.setLineDash([10 * k, 6 * k]); c.beginPath(); c.moveTo(cx - R * 1.25, cy); c.lineTo(cx + R * 1.25, cy); c.moveTo(cx, cy - R * 1.25); c.lineTo(cx, cy + R * 1.25); c.stroke(); c.setLineDash([]);
      for (let a = 0; a < 72; a++) { const t = a / 72 * Math.PI * 2, l = a % 6 === 0 ? 16 : 7; c.beginPath(); c.moveTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); c.lineTo(cx + Math.cos(t) * (R - l * k), cy + Math.sin(t) * (R - l * k)); c.stroke(); }
      const gx = cx - R * 0.95, gy = cy + R * 0.7, gr = 90 * k; c.beginPath(); // gear
      for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI * 2, rr = i % 2 ? gr : gr * 1.18; c.lineTo(gx + Math.cos(t) * rr, gy + Math.sin(t) * rr); } c.closePath(); c.stroke();
      c.beginPath(); c.arc(gx, gy, gr * 0.35, 0, Math.PI * 2); c.stroke();
      const dy = cy - R * 1.15; c.beginPath(); c.moveTo(cx - R, dy); c.lineTo(cx + R, dy); c.stroke(); // dimension line with arrows
      [[cx - R, 1], [cx + R, -1]].forEach(([x, s]) => { c.beginPath(); c.moveTo(x, dy); c.lineTo(x + s * 14 * k, dy - 6 * k); c.lineTo(x + s * 14 * k, dy + 6 * k); c.closePath(); c.fill(); c.beginPath(); c.moveTo(x, dy - 18 * k); c.lineTo(x, dy + 18 * k); c.stroke(); });
      c.strokeRect(cx + R * 0.35, cy + R * 0.95, 180 * k, 90 * k); c.beginPath(); c.moveTo(cx + R * 0.35, cy + R * 0.95 + 45 * k); c.lineTo(cx + R * 0.35 + 180 * k, cy + R * 0.95 + 45 * k); c.stroke();
    },
    chalkDust(c, w, h) { // sparse chalk specks + faint erased swipes
      const r = rng(140); c.save(); c.filter = 'blur(18px)';
      for (let i = 0; i < 7; i++) { c.strokeStyle = `rgba(255,255,255,${0.035 + r() * 0.04})`; c.lineWidth = 60 + r() * 90; c.beginPath(); const y = r() * h; c.moveTo(-50, y); c.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 200, w * 0.6, y + (r() - 0.5) * 200, w + 50, y + (r() - 0.5) * 120); c.stroke(); }
      c.restore(); const n = Math.round(w * h / 90);
      for (let i = 0; i < n; i++) { c.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.12})`; const s = r() < 0.9 ? 1 : 2; c.fillRect(r() * w, r() * h, s, s); }
    },
    marble(c, w, h) { // soft grey veining via turbulence (drawn small, scaled up smoothly)
      const sw = Math.max(240, Math.round(w / 3)), sh = Math.max(240, Math.round(h / 3)), n = fbm(150, 5, 3), img = new ImageData(sw, sh), d = img.data;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const u = x / sw, v = y / sh, t = Math.sin((u * 3.2 + v * 1.4 + n(u, v) * 5.5) * Math.PI), vein = Math.pow(1 - Math.abs(t), 10);
        const i = (y * sw + x) * 4; d[i] = d[i + 1] = 118; d[i + 2] = 122; d[i + 3] = Math.round(vein * 70 + (n(v, u) - 0.5) * 16 + 8);
      }
      const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh; tmp.getContext('2d').putImageData(img, 0, 0);
      c.imageSmoothingQuality = 'high'; c.drawImage(tmp, 0, 0, w, h);
    },
    doodles(c, w, h) { // black line doodles of books, lamps and plants with one 20% grey
      const r = rng(160), k = Math.min(w, h) / 1000, ink = 'rgba(11,11,11,.26)', grey = 'rgba(204,204,204,.55)';
      c.lineWidth = 2 * k + 0.6; c.lineJoin = 'round'; c.lineCap = 'round';
      const shapes = [books, lamp, plant, cup, pencil];
      for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
        if ((gx === 1 || gx === 2) && (gy === 1 || gy === 2)) continue; // keep the centre calm: doodles live near edges
        const x = (gx + 0.2 + r() * 0.6) * w / 4, y = (gy + 0.2 + r() * 0.6) * h / 4;
        c.save(); c.translate(x, y); c.rotate((r() - 0.5) * 0.5); c.scale(k * (0.8 + r() * 0.4), k * (0.8 + r() * 0.4));
        shapes[Math.floor(r() * shapes.length)](c, ink, grey); c.restore();
      }
      function books(c, ink, grey) { c.fillStyle = grey; c.fillRect(-60, -10, 120, 24); c.strokeStyle = ink; c.strokeRect(-60, -10, 120, 24); c.strokeRect(-50, -34, 104, 24); c.strokeRect(-56, 14, 112, 24); c.beginPath(); c.moveTo(-40, -34); c.lineTo(-40, -10); c.moveTo(30, 14); c.lineTo(30, 38); c.stroke(); }
      function lamp(c, ink, grey) { c.fillStyle = grey; c.beginPath(); c.moveTo(-30, -60); c.lineTo(30, -60); c.lineTo(45, -25); c.lineTo(-45, -25); c.closePath(); c.fill(); c.strokeStyle = ink; c.stroke(); c.beginPath(); c.moveTo(0, -25); c.lineTo(0, 45); c.moveTo(-30, 50); c.lineTo(30, 50); c.stroke(); c.beginPath(); c.arc(0, 50, 30, Math.PI, 0); c.stroke(); }
      function plant(c, ink, grey) { c.fillStyle = grey; c.beginPath(); c.moveTo(-28, 10); c.lineTo(28, 10); c.lineTo(20, 55); c.lineTo(-20, 55); c.closePath(); c.fill(); c.strokeStyle = ink; c.stroke(); c.beginPath(); c.moveTo(0, 10); c.quadraticCurveTo(-5, -30, -35, -55); c.moveTo(0, 10); c.quadraticCurveTo(6, -40, 30, -62); c.moveTo(0, 10); c.lineTo(0, -45); c.stroke(); [[-35, -55], [30, -62], [0, -45], [-18, -25], [16, -30]].forEach(([x, y]) => { c.beginPath(); c.ellipse(x, y, 13, 6, -0.6, 0, Math.PI * 2); c.stroke(); }); }
      function cup(c, ink, grey) { c.fillStyle = grey; c.fillRect(-26, -20, 52, 50); c.strokeStyle = ink; c.strokeRect(-26, -20, 52, 50); c.beginPath(); c.arc(34, 5, 12, -Math.PI / 2, Math.PI / 2); c.stroke(); c.beginPath(); c.moveTo(-8, -30); c.quadraticCurveTo(-14, -42, -6, -52); c.moveTo(8, -30); c.quadraticCurveTo(2, -42, 10, -52); c.stroke(); }
      function pencil(c, ink, grey) { c.fillStyle = grey; c.fillRect(-60, -8, 95, 16); c.strokeStyle = ink; c.strokeRect(-60, -8, 95, 16); c.beginPath(); c.moveTo(35, -8); c.lineTo(62, 0); c.lineTo(35, 8); c.moveTo(-48, -8); c.lineTo(-48, 8); c.stroke(); }
    },
  };

  // ---------- rendering + cache ----------
  const cache = new Map();
  function allItems() { const out = []; CATEGORIES.forEach((cat) => cat.items.forEach((it) => out.push({ ...it, cat: cat.id }))); return out; }
  function find(id) { return allItems().find((x) => x.id === id) || null; }
  function canvasToUrl(cv, alpha) {
    return new Promise((res) => cv.toBlob((b) => res(b ? URL.createObjectURL(b) : cv.toDataURL()), alpha ? 'image/webp' : 'image/jpeg', alpha ? 0.92 : 0.88));
  }
  // draw off the critical path so opening a panel never janks a frame
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 300 }) : setTimeout(fn, 16));

  function render(kind, id, w, h) {
    const key = kind + ':' + id + ':' + w + 'x' + h;
    if (cache.has(key)) return cache.get(key);
    const p = new Promise((resolve) => idle(() => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (kind === 'art') { THEME_ART[id](ctx, w, h); } else { const it = find(id); if (!it) return resolve(null); it.draw(ctx, w, h); }
      resolve(canvasToUrl(cv, kind === 'art'));
    }));
    cache.set(key, p);
    return p;
  }
  function screenSize() { // big enough for this screen, capped to keep memory low
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = Math.round(Math.max(screen.width, window.innerWidth) * dpr), H = Math.round(Math.max(screen.height, window.innerHeight) * dpr);
    const scale = Math.min(1, 1600 / Math.max(W, H)); return [Math.round(W * scale), Math.round(H * scale)];
  }

  root.SSWallpapers = {
    CATEGORIES, THEME_ART, find,
    full(id) { const [w, h] = screenSize(); return render('wall', id, w, h); },
    thumb(id) { return render('wall', id, 192, 120); },
    art(id) { const [w, h] = screenSize(); return render('art', id, w, h); },
    artThumb(id) { return render('art', id, 192, 120); },
    // low-memory: drop gallery thumbnails and any full-size image not currently on screen
    release(keepUrls) {
      const keep = new Set(keepUrls || []);
      cache.forEach((p, key) => p.then((u) => {
        if (!u || keep.has(u)) return;
        if (u.startsWith('blob:')) URL.revokeObjectURL(u);
        cache.delete(key);
      }));
    },
  };
})(window);
