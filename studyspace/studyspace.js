/* Study space — preferences, themes, wallpapers, focus mode, notes, Pomodoro and ambient sound
   for HoloStudy LMS. Loaded in <head> so the saved theme is applied before first paint.

   All preferences for a profile live in ONE JSON object in localStorage ("ss.prefs.<profile>").
   Custom wallpapers live in IndexedDB (too big for localStorage). Nothing leaves the device.

   Public API (window.SS): prefs(), set(path, value), profileId(), openSettings(tab), closeSettings(),
   focus.toggle(), lesson.open({key,title}), lesson.close(), frameLoaded(iframe), back(). */
(function () {
  'use strict';
  const T = window.SSThemes, W = window.SSWallpapers;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const root = document.documentElement;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked: keep working in memory */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ───────────────────────── native bridge (Android app) ─────────────────────────
  // The app injects `SSNative` (a WebMessageListener object) into its own pages only.
  const Native = (() => {
    const obj = window.SSNative, handlers = {};
    if (obj) obj.addEventListener('message', (e) => {
      let m; try { m = JSON.parse(e.data); } catch (_) { return; }
      if (!m || m.ch === 'tts') return; // speech has its own listener (native-speech.js)
      (handlers[m.ch + '.' + m.ev] || []).forEach((f) => f(m));
    });
    return {
      available: !!obj,
      send(ch, cmd, data) { if (obj) obj.postMessage(JSON.stringify(Object.assign({ ch, cmd }, data || {}))); },
      on(key, fn) { (handlers[key] = handlers[key] || []).push(fn); },
    };
  })();

  // ───────────────────────── profiles + preferences ─────────────────────────
  let profiles = store.get('ss.profiles', null);
  if (!profiles || !Array.isArray(profiles.list) || !profiles.list.length) profiles = { active: 'default', list: [{ id: 'default', name: 'Me' }] };
  if (!profiles.list.some((p) => p.id === profiles.active)) profiles.active = profiles.list[0].id;
  const pid = () => profiles.active;
  const K = { prefs: () => 'ss.prefs.' + pid(), notes: () => 'ss.notes.' + pid(), pomo: () => 'ss.pomo.' + pid() };

  const DEFAULTS = {
    v: 1,
    theme: 'graphite', contrast: 'standard',
    font: { family: 'inter', heading: 'auto', reading: 'auto', mono: 'jetbrains', size: 17, lineHeight: 1.6 },
    warm: { on: false, strength: 0.18 },
    wallpaper: { id: null, target: 'full', overlay: 0.35, autoBlur: true },
    sound: { type: 'rain', volume: 0.4 },
    pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4, autoNext: false, chime: true, haptic: true, keepAwake: true },
    focus: { notes: true, immersive: true },
    display: { refresh: 'adaptive', motion: 'calm' },
  };
  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (over && typeof over === 'object') for (const k of Object.keys(over)) {
      out[k] = base && typeof base[k] === 'object' && base[k] && !Array.isArray(base[k]) ? merge(base[k], over[k]) : over[k];
    }
    return out;
  }
  let prefs = merge(DEFAULTS, store.get(K.prefs(), {}));
  // older saves: the Chalkboard-only "handwritten headings" switch is now the Caveat heading font
  if (prefs.font.handwritten) { if (prefs.font.heading === 'auto') prefs.font.heading = 'caveat'; }
  delete prefs.font.handwritten;
  let saveT;
  function savePrefs() { clearTimeout(saveT); saveT = setTimeout(() => store.set(K.prefs(), prefs), 200); }
  function setPref(path, value) {
    const parts = path.split('.'); let o = prefs;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = value;
    savePrefs();
    apply(path);
    syncUI();
  }

  // ───────────────────────── fonts ─────────────────────────
  // Every font is bundled (SIL OFL). `roles` says where it is offered:
  // text = body / headings / lesson reading; head = headings only; mono = numbers & timer.
  const FONTS = [
    { id: 'inter', name: 'Inter', kind: 'Sans', stack: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', note: 'Clean, neutral', roles: ['text'] },
    { id: 'dmsans', name: 'DM Sans', kind: 'Sans', stack: '"DM Sans", "Inter", system-ui, sans-serif', note: 'Soft geometric, calm', roles: ['text'] },
    { id: 'plex', name: 'IBM Plex Sans', kind: 'Sans', stack: '"IBM Plex Sans", system-ui, sans-serif', note: 'Technical and friendly', roles: ['text'] },
    { id: 'lexend', name: 'Lexend', kind: 'Sans', stack: '"Lexend", system-ui, sans-serif', note: 'Designed for reading fluency', roles: ['text'] },
    { id: 'atkinson', name: 'Atkinson Hyperlegible', kind: 'Accessible', stack: '"Atkinson Hyperlegible", system-ui, sans-serif', note: 'Distinct letterforms for low vision', roles: ['text'] },
    { id: 'opendyslexic', name: 'OpenDyslexic', kind: 'Accessible', stack: '"OpenDyslexic", "Atkinson Hyperlegible", sans-serif', note: 'Weighted letters for dyslexic readers', roles: ['text'] },
    { id: 'sourceserif', name: 'Source Serif 4', kind: 'Serif', stack: '"Source Serif 4", Georgia, "Gelasio", serif', note: 'Book-like serif', roles: ['text'] },
    { id: 'newsreader', name: 'Newsreader', kind: 'Serif', stack: '"Newsreader", "Source Serif 4", Georgia, serif', note: 'Warm text serif for long answers', roles: ['text'] },
    { id: 'literata', name: 'Literata', kind: 'Serif', stack: '"Literata", "Source Serif 4", Georgia, serif', note: 'Made for long-form e-reading', roles: ['text'] },
    { id: 'merriweather', name: 'Merriweather', kind: 'Serif', stack: '"Merriweather", Georgia, serif', note: 'Sturdy serif for screens', roles: ['text'] },
    { id: 'georgia', name: 'Georgia', kind: 'Serif', stack: 'Georgia, "Gelasio", "Source Serif 4", serif', note: 'Classic serif', roles: ['text'] },
    { id: 'jetbrains', name: 'JetBrains Mono', kind: 'Mono', stack: '"JetBrains Mono", ui-monospace, Consolas, monospace', note: 'Clear monospace', roles: ['text', 'mono'] },
    { id: 'caveat', name: 'Caveat', kind: 'Handwritten', stack: '"Caveat", "Inter", cursive', note: 'Chalk-style handwriting', roles: ['head'] },
    { id: 'plexmono', name: 'IBM Plex Mono', kind: 'Mono', stack: '"IBM Plex Mono", ui-monospace, monospace', note: 'Friendly monospace', roles: ['mono'] },
    { id: 'sharetech', name: 'Share Tech Mono', kind: 'Mono', stack: '"Share Tech Mono", ui-monospace, monospace', note: 'Instrument-panel digits', roles: ['mono'] },
  ];
  const fontOf = (id) => FONTS.find((f) => f.id === id) || FONTS[0];

  // The four parts of the app that each get their own font, and the preference that stores it.
  const FONT_ROLES = [
    { id: 'heading', label: 'Headings', path: 'font.heading', auto: 'Theme default', offers: ['text', 'head'] },
    { id: 'body', label: 'Body', path: 'font.family', offers: ['text'] },
    { id: 'reading', label: 'Lessons', path: 'font.reading', auto: 'Same as body', offers: ['text'] },
    { id: 'mono', label: 'Numbers', path: 'font.mono', offers: ['mono'] },
  ];
  // Ready-made pairings: one tap sets all four roles.
  const PAIRINGS = [
    { id: 'clean', name: 'Clean', note: 'Inter everywhere', set: { family: 'inter', heading: 'auto', reading: 'auto', mono: 'jetbrains' } },
    { id: 'claude', name: 'Claude-style', note: 'Serif answers, soft sans interface', set: { family: 'dmsans', heading: 'newsreader', reading: 'newsreader', mono: 'jetbrains' } },
    { id: 'textbook', name: 'Textbook', note: 'Printed-book serifs', set: { family: 'plex', heading: 'merriweather', reading: 'literata', mono: 'plexmono' } },
    { id: 'easy', name: 'Easy reading', note: 'Lexend throughout', set: { family: 'lexend', heading: 'lexend', reading: 'lexend', mono: 'jetbrains' } },
    { id: 'accessible', name: 'Accessible', note: 'Atkinson Hyperlegible', set: { family: 'atkinson', heading: 'atkinson', reading: 'atkinson', mono: 'plexmono' } },
    { id: 'dyslexia', name: 'Dyslexia-friendly', note: 'OpenDyslexic', set: { family: 'opendyslexic', heading: 'opendyslexic', reading: 'opendyslexic', mono: 'plexmono' } },
    { id: 'chalk', name: 'Chalk notes', note: 'Handwritten headings', set: { family: 'inter', heading: 'caveat', reading: 'auto', mono: 'sharetech' } },
  ];
  const pairingActive = (p) => Object.keys(p.set).every((k) => prefs.font[k] === p.set[k]);
  // resolved stacks for each role
  function fontStacks() {
    const body = fontOf(prefs.font.family).stack, th = current.theme;
    const heading = prefs.font.heading && prefs.font.heading !== 'auto' ? fontOf(prefs.font.heading).stack : th.headingFont || body;
    const reading = prefs.font.reading && prefs.font.reading !== 'auto' ? fontOf(prefs.font.reading).stack : body;
    const mono = fontOf(prefs.font.mono || 'jetbrains').stack;
    return { body, heading, reading, mono };
  }

  // ───────────────────────── apply ─────────────────────────
  let current = null; // { theme, tok }
  function hexA(hex, a) { const [r, g, b] = T.hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }

  function applyTheme() {
    current = T.resolve(prefs.theme, prefs.contrast);
    const { theme, tok } = current, s = root.style;
    s.setProperty('--bg', tok.bg); s.setProperty('--surface', tok.surface); s.setProperty('--surface-2', tok.surface2);
    s.setProperty('--text', tok.text); s.setProperty('--muted', tok.muted); s.setProperty('--accent', tok.accent);
    s.setProperty('--accent-2', tok.accent2); s.setProperty('--border', tok.border); s.setProperty('--on-accent', tok.onAccent);
    s.setProperty('--bg-image', theme.bgGradient || 'none');
    s.setProperty('--radius', theme.glass ? '20px' : theme.flat ? '8px' : '12px');
    s.setProperty('color-scheme', theme.dark ? 'dark' : 'light');
    root.dataset.theme = theme.id; root.dataset.dark = theme.dark ? '1' : '0';
    root.dataset.divider = theme.divider || ''; root.dataset.glass = theme.glass ? '1' : '';
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = tok.bg;
    Native.send('window', 'theme', { top: tok.bg, bottom: theme.gradientEnd || tok.bg, dark: !!theme.dark });
  }
  function applyFont() {
    const f = fontStacks(), s = root.style;
    s.setProperty('--font-body', f.body);
    s.setProperty('--font-head', f.heading);
    s.setProperty('--font-read', f.reading);
    s.setProperty('--font-mono', f.mono);
    s.setProperty('--fs', Math.min(22, Math.max(14, +prefs.font.size || 17)) + 'px');
    s.setProperty('--lh', Math.min(1.9, Math.max(1.4, +prefs.font.lineHeight || 1.6)));
    root.dataset.handwritten = prefs.font.heading === 'caveat' ? '1' : '';
  }
  function applyWarm() { root.style.setProperty('--warm', prefs.warm.on ? Math.min(0.4, Math.max(0.05, prefs.warm.strength)) : 0); }
  function applyMotion() { root.dataset.motion = prefs.display.motion; }

  // theme artwork: CSS pattern layer + generated image layer
  let artToken = 0;
  async function applyArt() {
    const a = $('#ss-art-css'), b = $('#ss-art-img'); if (!a || !b) return;
    const art = current.theme.art, token = ++artToken;
    const hide = !art || (prefs.wallpaper.id && prefs.wallpaper.target === 'full');
    if (hide) { a.classList.remove('on'); b.classList.remove('on'); return; }
    if (art.layers) {
      a.style.backgroundImage = art.layers.join(',');
      a.style.backgroundSize = art.layerSize || art.size || 'auto';
      a.style.backgroundRepeat = 'repeat'; a.style.setProperty('--o', 1); a.classList.add('on');
    } else a.classList.remove('on');
    if (art.gen) {
      const url = await W.art(art.gen);
      if (token !== artToken || !url) return;
      b.style.backgroundImage = `url("${url}")`; b.style.backgroundSize = art.size || 'cover'; b.style.backgroundPosition = art.position || 'center';
      b.style.setProperty('--o', art.opacity || 1); b.classList.add('on');
    } else b.classList.remove('on');
  }

  // ───────────────────────── wallpaper + readability guard ─────────────────────────
  let wallUrl = null, wallToken = 0, wallCheck = null; // wallCheck: {id, need, before, ratio}
  const IDB = {
    open() { return new Promise((res, rej) => { const r = indexedDB.open('studyspace', 1); r.onupgradeneeded = () => r.result.createObjectStore('wallpapers'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
    async run(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('wallpapers', mode); const req = fn(tx.objectStore('wallpapers')); tx.oncomplete = () => { res(req && req.result); db.close(); }; tx.onerror = () => { rej(tx.error); db.close(); }; }); },
    get(k) { return this.run('readonly', (s) => s.get(k)); },
    put(k, v) { return this.run('readwrite', (s) => s.put(v, k)); },
    del(k) { return this.run('readwrite', (s) => s.delete(k)); },
  };
  let customUrl = null;
  async function customWallpaperUrl() {
    if (customUrl) return customUrl;
    try { const blob = await IDB.get('custom:' + pid()); if (blob) customUrl = URL.createObjectURL(blob); } catch (e) {}
    return customUrl;
  }
  function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }

  // Worst-case (5th percentile) contrast of text/muted over the wallpaper once the overlay is applied.
  const checkCache = new Map();
  async function readability(url) {
    const key = url + '|' + prefs.theme + '|' + prefs.contrast;
    if (checkCache.has(key)) return checkCache.get(key);
    const img = await loadImage(url), n = 40, cv = document.createElement('canvas'); cv.width = n; cv.height = n;
    const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(img, 0, 0, n, n);
    const d = c.getImageData(0, 0, n, n).data, bg = T.hexToRgb(current.tok.bg), fgs = [current.tok.text, current.tok.muted].map(T.hexToRgb);
    const at = (o) => {
      const r = [];
      for (let i = 0; i < d.length; i += 4) { const px = [0, 1, 2].map((k) => d[i + k] * (1 - o) + bg[k] * o); r.push(Math.min(T.contrast(px, fgs[0]), T.contrast(px, fgs[1]))); }
      r.sort((a, b) => a - b); return r[Math.floor(r.length * 0.05)];
    };
    let need = 0.9;
    for (let o = 0; o <= 0.9001; o += 0.05) if (at(o) >= T.AA) { need = +o.toFixed(2); break; }
    const out = { need, at: at, ratioAt: (o) => +at(o).toFixed(2) };
    checkCache.set(key, out); return out;
  }

  async function applyWallpaper() {
    const wp = prefs.wallpaper, token = ++wallToken, layer = $('#ss-wall');
    root.dataset.wallTarget = wp.target;
    if (!wp.id) { root.classList.remove('ss-has-wall'); if (layer) layer.classList.remove('on'); wallUrl = null; wallCheck = null; renderWallNote(); return; }
    // never show the previous wallpaper's verdict while this one is being checked
    if (!wallCheck || wallCheck.id !== wp.id) { wallCheck = null; renderWallNote(); }
    const url = wp.id === 'custom' ? await customWallpaperUrl() : await W.full(wp.id);
    if (token !== wallToken) return;
    if (!url) { setPref('wallpaper.id', null); return; }
    wallUrl = url;
    let eff = wp.overlay;
    try {
      const chk = await readability(url);
      if (token !== wallToken) return;
      eff = Math.max(wp.overlay, chk.need);
      wallCheck = { id: wp.id, need: chk.need, raised: chk.need > wp.overlay, before: chk.ratioAt(wp.overlay), after: chk.ratioAt(eff) };
    } catch (e) { wallCheck = null; }
    root.style.setProperty('--wall-img', `url("${url}")`);
    root.style.setProperty('--wall-ov', eff);
    root.style.setProperty('--wall-ov-color', hexA(current.tok.bg, eff));
    root.classList.add('ss-has-wall');
    if (layer) layer.classList.add('on');
    renderWallNote();
  }
  function renderWallNote() {
    const el = $('#ss-wallnote'); if (!el) return;
    if (!prefs.wallpaper.id) { el.className = 'ss-note'; el.textContent = 'No wallpaper: the theme background is used.'; return; }
    if (!wallCheck) { el.className = 'ss-note'; el.textContent = 'Checking readability…'; return; }
    if (wallCheck.raised) {
      el.className = 'ss-note flag';
      el.textContent = `Below AA: this wallpaper drops text to ${wallCheck.before}:1 at ${Math.round(prefs.wallpaper.overlay * 100)}% overlay. The overlay was raised to ${Math.round(wallCheck.need * 100)}% so text stays at ${wallCheck.after}:1 (AA needs 4.5:1).`;
    } else {
      el.className = 'ss-note';
      el.textContent = `Readable: text contrast is at least ${wallCheck.before}:1 over this wallpaper (AA needs 4.5:1).`;
    }
  }
  function updateBlur() {
    const modal = !!$('#ss-drawer.open') || (document.getElementById('drawer') && !document.getElementById('drawer').hidden) || Focus.on;
    root.classList.toggle('ss-blur', !!(prefs.wallpaper.autoBlur && modal));
  }

  function apply(path) {
    const p = path || '';
    if (!p || /^(theme|contrast)/.test(p)) { applyTheme(); applyFont(); applyArt(); applyWallpaper(); themeFrames(); }
    else if (/^font/.test(p)) { applyFont(); themeFrames(); }
    else if (/^warm/.test(p)) applyWarm();
    else if (/^wallpaper/.test(p)) { applyWallpaper(); applyArt(); updateBlur(); }
    else if (/^display\.motion/.test(p)) applyMotion();
    else if (/^display\.refresh/.test(p)) Native.send('display', 'setRefresh', { mode: prefs.display.refresh });
    else if (/^sound/.test(p)) Amb.sync();
    else if (/^pomodoro/.test(p)) Pomo.render();
    if (!p) { applyWarm(); applyMotion(); }
  }

  // ───────────────────────── lesson engines (same-origin iframes) ─────────────────────────
  function frameCSS(path) {
    const { tok, theme } = current, f = fontStacks(), [ar, ag, ab] = T.hexToRgb(tok.accent), scheme = theme.dark ? 'dark' : 'light';
    const s1 = tok.surfaceSolid, s2 = tok.surface2Solid;
    // tokens the light-theme remapping (lightFixCSS) refers to must exist inside the frame too
    const shared = `:root{--on-accent:${tok.onAccent}!important;--surface-2:${s2}!important;--accent:${tok.accent}!important;}`;
    return shared + frameVars(path, tok, f, s1, s2, ar, ag, ab, scheme);
  }
  function frameVars(path, tok, f, s1, s2, ar, ag, ab, scheme) {
    // lessons use the Lessons font; their display titles switch only when a heading font is chosen explicitly
    const display = prefs.font.heading && prefs.font.heading !== 'auto' ? `--font-display:${f.heading}!important;` : '';
    if (/engines\/(study|practice)\//.test(path)) return `:root{--bg:${tok.bg}!important;--bg-2:${tok.bg}!important;--panel:${s1}!important;--card:${s1}!important;--card-2:${s2}!important;
      --border:${tok.border}!important;--border-2:${tok.border}!important;--text:${tok.text}!important;--text-2:${tok.muted}!important;--muted:${tok.muted}!important;--dim:${tok.muted}!important;
      --chrome:${tok.accent}!important;--chrome-soft:rgba(${ar},${ag},${ab},.14)!important;--subject:${tok.accent}!important;--subject-rgb:${ar},${ag},${ab}!important;
      --font-ui:${f.reading}!important;--font-mono:${f.mono}!important;${display}color-scheme:${scheme}!important;} body::before{background:none!important;}`;
    if (/engines\/holograms\//.test(path)) return `:root{--bg:${tok.bg}!important;--card:${s1}!important;--card2:${s2}!important;--line:${tok.border}!important;
      --text:${tok.text}!important;--muted:${tok.muted}!important;--blue:${tok.accent}!important;--cyan:${tok.accent}!important;--acc:${tok.accent}!important;color-scheme:${scheme}!important;}
      html,body{font-family:${f.reading}!important;}`;
    return '';
  }
  // The lesson engines were designed dark-only, and some rules hard-code near-white text or dark
  // text on accent buttons. On light themes, scan their stylesheets once and remap those rules to
  // theme tokens, so every lesson stays readable (WCAG AA) without editing the engines themselves.
  const lightFixCache = new WeakMap();
  function parseRgb(v) { const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(v || ''); return m ? { rgb: [+m[1], +m[2], +m[3]], a: m[4] == null ? 1 : +m[4] } : null; }
  function lightFixCSS(doc) {
    if (lightFixCache.has(doc)) return lightFixCache.get(doc);
    const out = [];
    const walk = (rules) => {
      for (const r of rules) {
        if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue; } // @media, @supports
        if (!r.selectorText || !r.style) continue;
        // cssText, not st.background: shorthands that use var() are not exposed through their property
        const st = r.style, sel = r.selectorText, bg = ((st.cssText || '').match(/background[^;]*/g) || []).join(' ');
        if ((st.webkitBackgroundClip || st.backgroundClip) === 'text') { out.push(`${sel}{background:none!important;-webkit-text-fill-color:currentColor!important;color:var(--text)!important}`); continue; }
        const c = parseRgb(st.color);
        if (c && c.a > 0.5) {
          const L = T.luminance(c.rgb);
          if (L > 0.55) out.push(`${sel}{color:var(--text)!important}`);
          else if (L < 0.06 && /--chrome|--subject|--accent/.test(bg)) out.push(`${sel}{color:var(--on-accent)!important}`);
        }
        const b = parseRgb(st.backgroundColor);
        if (b && b.a > 0.5 && T.luminance(b.rgb) < 0.04 && !/canvas/.test(sel)) out.push(`${sel}{background-color:var(--surface-2)!important}`);
      }
    };
    try { for (const sheet of doc.styleSheets) { if (sheet.ownerNode && sheet.ownerNode.id === 'ss-bridge') continue; try { walk(sheet.cssRules); } catch (e) { /* cross-origin sheet */ } } } catch (e) {}
    const css = out.join('\n'); lightFixCache.set(doc, css); return css;
  }

  const frames = new Set();
  function themeFrame(frame) {
    let doc; try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc || !doc.head || !doc.location || doc.location.href === 'about:blank') return;
    let st = doc.getElementById('ss-bridge');
    if (!st) {
      const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('studyspace/fonts.css', location.href).href; doc.head.appendChild(link);
      st = doc.createElement('style'); st.id = 'ss-bridge'; doc.head.appendChild(st);
    }
    st.textContent = frameCSS(doc.location.pathname) + (current.theme.dark ? '' : '\n' + lightFixCSS(doc));
  }
  function themeFrames() { frames.forEach((f) => { if (f.isConnected) themeFrame(f); else frames.delete(f); }); }

  // ───────────────────────── ambient sound (generated, loops seamlessly, never autoplays) ─────────────────────────
  const Amb = {
    ctx: null, gain: null, src: null, nodes: [], playing: false, wasPlaying: false,
    ensure() {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); this.gain = this.ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(this.ctx.destination); }
      return this.ctx;
    },
    buffer(type) {
      this._buf = this._buf || {}; if (this._buf[type]) return this._buf[type];
      const ctx = this.ctx, sr = ctx.sampleRate, len = Math.round(sr * (type === 'rain' ? 8 : 6)), fade = Math.round(sr * 0.5);
      const gen = new Float32Array(len + fade); let b = 0, lp = 0;
      for (let i = 0; i < gen.length; i++) {
        const w = Math.random() * 2 - 1;
        b = (b + 0.02 * w) / 1.02; // brown noise (leaky integrator)
        if (type === 'brown') gen[i] = b * 3.2;
        else { lp += (w - lp) * 0.55; gen[i] = lp * 0.22 + b * 1.4; } // rain bed: softened white + low rumble
      }
      if (type === 'rain') { // droplets: short decaying clicks at random times
        for (let t = 0; t < gen.length;) { t += Math.round(sr * (0.004 + Math.random() * 0.03)); const amp = 0.05 + Math.random() * 0.2, dec = sr * (0.001 + Math.random() * 0.003);
          for (let k = 0; k < dec * 4 && t + k < gen.length; k++) gen[t + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / dec); }
      }
      const buf = ctx.createBuffer(1, len, sr), out = buf.getChannelData(0);
      for (let i = 0; i < len; i++) out[i] = i < fade ? gen[i] * (i / fade) + gen[len + i] * (1 - i / fade) : gen[i]; // crossfaded loop seam
      return (this._buf[type] = buf);
    },
    level() { const v = Math.max(0, Math.min(1, prefs.sound.volume)); return v * v * 0.9; },
    play() {
      const type = prefs.sound.type; this.stop(true);
      if (type === 'silence') { this.render(); return; }
      const ctx = this.ensure(); if (!ctx) return; if (ctx.state === 'suspended') ctx.resume();
      const src = ctx.createBufferSource(); src.buffer = this.buffer(type); src.loop = true;
      let head = src; this.nodes = [];
      if (type === 'rain') { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500; src.connect(hp); hp.connect(lp); head = lp; this.nodes = [hp, lp]; }
      head.connect(this.gain); src.start();
      this.gain.gain.cancelScheduledValues(ctx.currentTime); this.gain.gain.setTargetAtTime(this.level(), ctx.currentTime, 0.6); // 1.5 s fade-in
      this.src = src; this.playing = true; this.render();
    },
    stop(immediate) {
      if (!this.src) { this.playing = false; this.render(); return; }
      const ctx = this.ctx, src = this.src, nodes = this.nodes; this.src = null; this.playing = false;
      this.gain.gain.cancelScheduledValues(ctx.currentTime); this.gain.gain.setTargetAtTime(0, ctx.currentTime, immediate ? 0.05 : 0.4);
      setTimeout(() => { try { src.stop(); src.disconnect(); nodes.forEach((n) => n.disconnect()); } catch (e) {} }, immediate ? 200 : 1600);
      this.render();
    },
    toggle() { if (this.playing) this.stop(); else this.play(); },
    sync() { if (this.ctx && this.playing) { if (this.src && this.src.buffer !== this.buffer(prefs.sound.type)) this.play(); else this.gain.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.15); } this.render(); },
    render() {
      $$('[data-ss-mount="amb"]').forEach((m) => {
        $$('[data-snd]', m).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.snd === prefs.sound.type)));
        const pb = $('[data-act="amb-toggle"]', m); if (pb) { pb.textContent = this.playing ? 'Pause sound' : 'Play sound'; pb.setAttribute('aria-pressed', String(this.playing)); pb.disabled = prefs.sound.type === 'silence'; }
        const vol = $('[data-pref="sound.volume"]', m); if (vol) vol.value = prefs.sound.volume;
      });
    },
  };
  document.addEventListener('visibilitychange', () => { // fade out in the background, back in on return
    if (!Amb.ctx) return;
    if (document.hidden) { Amb.wasPlaying = Amb.playing; if (Amb.playing) Amb.stop(); }
    else if (Amb.wasPlaying) { Amb.wasPlaying = false; Amb.play(); }
  });

  // soft two-tone bell for the end of a Pomodoro phase
  function chime() {
    const ctx = Amb.ensure(); if (!ctx) return; if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime, g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2); g.connect(ctx.destination);
    [528, 792].forEach((f, i) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(t + i * 0.18); o.stop(t + 2.4); });
  }

  // ───────────────────────── Pomodoro ─────────────────────────
  const PHASE = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  const Pomo = {
    st: null, t: null,
    load() { this.st = Object.assign({ phase: 'focus', running: false, endsAt: 0, remaining: null, cycle: 0 }, store.get(K.pomo(), {})); if (this.st.remaining == null) this.st.remaining = this.len(this.st.phase); },
    save() { store.set(K.pomo(), this.st); },
    len(phase) { const p = prefs.pomodoro; return (phase === 'focus' ? p.focus : phase === 'short' ? p.short : p.long) * 60000; },
    left() { return this.st.running ? Math.max(0, this.st.endsAt - Date.now()) : this.st.remaining; },
    start() {
      if (this.st.running) return;
      Amb.ensure();
      // read the time left BEFORE marking it running: left() switches to endsAt once running is true
      this.st.endsAt = Date.now() + this.left();
      this.st.running = true;
      this.save(); this.tick(); awake();
    },
    pause() { if (!this.st.running) return; this.st.remaining = this.left(); this.st.running = false; this.save(); this.tick(); awake(); },
    toggle() { this.st.running ? this.pause() : this.start(); },
    reset() { this.st.running = false; this.st.remaining = this.len(this.st.phase); this.save(); this.tick(); awake(); },
    skip() { this.next(false); },
    next(finished) {
      if (this.st.phase === 'focus') { if (finished) this.st.cycle++; this.st.phase = this.st.cycle > 0 && this.st.cycle % prefs.pomodoro.longEvery === 0 && finished ? 'long' : 'short'; }
      else this.st.phase = 'focus';
      this.st.remaining = this.len(this.st.phase);
      const auto = finished && prefs.pomodoro.autoNext;
      this.st.running = auto; if (auto) this.st.endsAt = Date.now() + this.st.remaining;
      this.save(); this.tick(); awake();
    },
    complete() {
      if (prefs.pomodoro.chime) chime();
      if (prefs.pomodoro.haptic) Native.send('haptic', 'soft', {});
      this.next(true);
    },
    tick() {
      clearTimeout(this.t);
      if (this.st.running) {
        const r = this.left();
        if (r <= 0) { this.complete(); return; }
        this.t = setTimeout(() => this.tick(), (r % 1000) || 1000); // wake once per second, aligned to the second
      }
      this.render();
    },
    fmt(ms) { const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); },
    render() {
      if (!this.st) return;
      const left = this.left(), total = this.len(this.st.phase), pct = Math.max(0, Math.min(100, 100 - (left / total) * 100));
      $$('[data-ss-mount="pomo"]').forEach((m) => {
        const set = (sel, v) => { const e = $(sel, m); if (e) e.textContent = v; };
        set('.phase', PHASE[this.st.phase]); set('.time', this.fmt(left));
        set('.cycle', `${this.st.cycle % prefs.pomodoro.longEvery}/${prefs.pomodoro.longEvery} until long break`);
        const bar = $('.ss-bar i', m); if (bar) bar.style.width = pct + '%';
        const tb = $('[data-act="pomo-toggle"]', m); if (tb) tb.textContent = this.st.running ? 'Pause' : (left < total ? 'Resume' : 'Start');
      });
      const line = $('#ss-topline'); if (line) { line.hidden = !this.st.running; const i = $('i', line); if (i) i.style.width = pct + '%'; }
      $$('.ss-vtimer').forEach((e) => { e.textContent = this.st.running || left < total ? `${PHASE[this.st.phase]} · ${this.fmt(left)}` : ''; });
    },
  };
  function awake() { // keep the screen on while focusing (Android app only)
    const on = !!(prefs.pomodoro.keepAwake && ((Pomo.st && Pomo.st.running && Pomo.st.phase === 'focus') || Focus.on));
    Native.send('window', 'keepAwake', { on });
  }

  // ───────────────────────── notes (per lesson, per profile) ─────────────────────────
  const Notes = {
    key: null,
    all() { return store.get(K.notes(), {}); },
    load(key) { const n = this.all()[key]; return n ? n.text : ''; },
    save(key, text, title) { const all = this.all(); if (text.trim()) all[key] = { text, title, updated: Date.now() }; else delete all[key]; store.set(K.notes(), all); },
    exportText() {
      const all = this.all(), keys = Object.keys(all);
      if (!keys.length) return '';
      return keys.map((k) => `# ${all[k].title || k}\n(${new Date(all[k].updated).toLocaleString()})\n\n${all[k].text}\n`).join('\n');
    },
  };
  let lesson = null; // {key, title}
  function mountNotes() {
    const aside = $('#ss-notes'); if (!aside || aside.dataset.ready) return;
    aside.dataset.ready = '1';
    aside.innerHTML = `<header><span id="ss-notes-title">Notes</span><button class="ss-btn quiet" data-act="notes-hide" style="min-height:32px;padding:.2em .6em">Hide</button></header>
      <textarea id="ss-notes-text" placeholder="Write while you study — saved on this device as you type." spellcheck="true"></textarea>
      <footer id="ss-notes-status">Notes are private to this profile.</footer>`;
    let t;
    $('#ss-notes-text').addEventListener('input', (e) => {
      clearTimeout(t); $('#ss-notes-status').textContent = 'Saving…';
      t = setTimeout(() => { if (lesson) { Notes.save(lesson.key, e.target.value, lesson.title); $('#ss-notes-status').textContent = 'Saved · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } }, 400);
    });
    $('[data-act="notes-hide"]', aside).addEventListener('click', () => showNotes(false));
  }
  function showNotes(on) {
    const aside = $('#ss-notes'); if (!aside) return;
    mountNotes(); aside.hidden = !on;
    $$('[data-act="notes-toggle"]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
    if (on && lesson) { $('#ss-notes-title').textContent = 'Notes · ' + lesson.title; $('#ss-notes-text').value = Notes.load(lesson.key); }
  }

  // ───────────────────────── focus mode ─────────────────────────
  const Focus = {
    on: false,
    enter() {
      if (!lesson) {
        const ok = SS.hooks.resume && SS.hooks.resume();
        if (!ok) { status('Open a chapter first. Focus Mode shows only the lesson and your notes.'); return; }
      }
      closeSettings(); // Focus Mode shows only the lesson; the drawer must not linger underneath (Esc/Back exit focus)
      this.on = true; root.classList.add('ss-focus');
      showNotes(!!prefs.focus.notes);
      if (prefs.focus.immersive) Native.send('window', 'immersive', { on: true });
      updateBlur(); awake(); syncFocusButtons();
    },
    exit() {
      if (!this.on) return;
      this.on = false; root.classList.remove('ss-focus');
      Native.send('window', 'immersive', { on: false });
      updateBlur(); awake(); syncFocusButtons();
    },
    toggle() { this.on ? this.exit() : this.enter(); },
  };
  function syncFocusButtons() { $$('[data-act="focus"]').forEach((b) => { b.setAttribute('aria-pressed', String(Focus.on)); b.textContent = Focus.on ? 'Exit Focus Mode' : 'Focus Mode'; }); }

  // a quiet inline status line (no popups)
  let statusT;
  function status(msg) {
    let el = $('#ss-status');
    if (!el) { el = document.createElement('div'); el.id = 'ss-status'; el.setAttribute('role', 'status'); el.style.cssText = 'position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:95;max-width:min(520px,90vw);padding:.6em 1em;border-radius:10px;background:var(--surface-2);color:var(--text);border:1px solid var(--border);font:500 .82rem/1.4 var(--font-body);backdrop-filter:blur(8px);opacity:0;transition:opacity var(--dur);pointer-events:none;text-align:center;'; document.body.appendChild(el); }
    el.textContent = msg; el.style.opacity = '1'; clearTimeout(statusT); statusT = setTimeout(() => { el.style.opacity = '0'; }, 3200);
  }

  // ───────────────────────── settings drawer ─────────────────────────
  const TABS = [['theme', 'Theme'], ['type', 'Type'], ['wall', 'Wallpaper'], ['study', 'Study tools'], ['profile', 'Profile & display']];
  let drawerBuilt = false, activeTab = 'theme';

  function seg(pref, options, label) {
    return `<div class="ss-seg" role="radiogroup" aria-label="${esc(label)}">${options.map(([v, l]) => `<button type="button" role="radio" data-seg="${pref}" data-val="${v}">${l}</button>`).join('')}</div>`;
  }
  function range(pref, label, min, max, step, fmt) {
    return `<label class="ss-field"><span>${label}<output data-out="${pref}"></output></span><input class="ss-range" type="range" min="${min}" max="${max}" step="${step}" data-pref="${pref}" data-fmt="${fmt || ''}"></label>`;
  }
  function toggle(pref, label, sub) {
    return `<label class="ss-toggle"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-pref="${pref}"></label>`;
  }
  const pomoHTML = (compact) => `<div class="ss-pomo${compact ? ' compact' : ''}" data-ss-mount="pomo">
      <div class="row"><span class="phase">Focus</span><span class="cycle"></span></div>
      <div class="time" aria-live="off">25:00</div>
      <div class="ss-bar"><i></i></div>
      <div class="ctl"><button class="ss-btn primary" data-act="pomo-toggle">Start</button><button class="ss-btn" data-act="pomo-reset">Reset</button><button class="ss-btn" data-act="pomo-skip">Skip</button></div>
    </div>`;
  const ambHTML = () => `<div class="ss-amb" data-ss-mount="amb">
      <div class="ss-seg" role="radiogroup" aria-label="Ambient sound"><button type="button" role="radio" data-snd="rain">Rain</button><button type="button" role="radio" data-snd="brown">Brown noise</button><button type="button" role="radio" data-snd="silence">Silence</button></div>
      <input class="ss-range" type="range" min="0" max="1" step="0.01" data-pref="sound.volume" aria-label="Sound volume">
      <button class="ss-btn" data-act="amb-toggle" aria-pressed="false">Play sound</button>
    </div>`;

  function buildDrawer() {
    if (drawerBuilt) return; drawerBuilt = true;
    const d = document.createElement('aside'); d.id = 'ss-drawer'; d.setAttribute('aria-label', 'Study space settings'); d.setAttribute('aria-hidden', 'true');
    const app = Native.available;
    d.innerHTML = `
      <div class="ss-dhead"><h2>Study space</h2><button class="ss-close" data-act="close-settings" aria-label="Close settings">×</button></div>
      <div class="ss-tabs" role="tablist">${TABS.map(([id, l]) => `<button role="tab" data-tab="${id}" aria-selected="false">${l}</button>`).join('')}</div>
      <div class="ss-dbody">
        <section class="ss-panel" data-panel="theme">
          <h3>Theme</h3>
          <div class="ss-swatches" role="radiogroup" aria-label="Theme">${T.THEMES.map((t) => `<button type="button" class="ss-swatch" role="radio" data-theme-id="${t.id}" title="${esc(t.note)}"><span class="pv"></span><strong>${esc(t.name)}</strong></button>`).join('')}</div>
          <p class="ss-note" id="ss-aa"></p>
          <h3>Contrast</h3>
          ${seg('contrast', [['soft', 'Soft'], ['standard', 'Standard'], ['high', 'High']], 'Contrast')}
          <p class="ss-note">Soft lowers glare but always keeps text at 4.5:1 or better (WCAG AA).</p>
          <div data-only-theme="chalk"><button class="ss-btn" data-font-set="heading:caveat" style="width:100%">Use handwritten chalk headings</button><p class="ss-note">Change it any time under Type → Headings.</p></div>
          <h3>Warm light</h3>
          ${toggle('warm.on', 'Warm light filter', 'Cuts blue light for night study; also covers lessons')}
          ${range('warm.strength', 'Warmth', 0.05, 0.4, 0.01, 'pct')}
        </section>
        <section class="ss-panel" data-panel="type" hidden>
          <div class="ss-preview" aria-label="Preview">
            <b>Photosynthesis, step by step</b>
            <p class="pv-body">Tap a chapter to Listen, Read or open its hologram.</p>
            <p class="pv-read">Light reactions split water and make ATP and NADPH; the Calvin cycle then fixes CO₂ into sugar.</p>
            <span class="pv-mono">25:00 · 12 / 107 notes · 64%</span>
          </div>
          <h3>Font pairings</h3>
          <div class="ss-pairings" role="radiogroup" aria-label="Font pairings">${PAIRINGS.map((p) => {
            const head = p.set.heading === 'auto' ? fontOf(p.set.family).stack : fontOf(p.set.heading).stack;
            return `<button type="button" role="radio" data-pairing="${p.id}"><b style="font-family:${esc(head)}">${esc(p.name)}</b><small style="font-family:${esc(fontOf(p.set.family).stack)}">${esc(p.note)}</small></button>`;
          }).join('')}</div>
          <p class="ss-note">Claude-style mirrors how Claude's chat reads: a warm serif for answers and a soft sans for the interface. Claude's own fonts are proprietary, so it uses open lookalikes (Newsreader and DM Sans).</p>
          <h3>Font for each part</h3>
          <div class="ss-seg" role="radiogroup" aria-label="Which part">${FONT_ROLES.map((r) => `<button type="button" role="radio" data-font-role="${r.id}">${r.label}</button>`).join('')}</div>
          <p class="ss-note" id="ss-role-note"></p>
          <div class="ss-fonts" id="ss-fontlist" role="radiogroup" aria-label="Font"></div>
          <h3>Size &amp; spacing</h3>
          ${range('font.size', 'Text size', 14, 22, 1, 'px')}
          ${range('font.lineHeight', 'Line height', 1.4, 1.9, 0.05, 'x')}
          <p class="ss-note">Research on reading comfort favours 16–18 px body text and 1.5–1.7 line height for long sessions.</p>
        </section>
        <section class="ss-panel" data-panel="wall" hidden>
          <h3>Apply to</h3>
          ${seg('wallpaper.target', [['full', 'Background'], ['sidebar', 'Sidebar'], ['header', 'Header'], ['cards', 'Cards']], 'Apply wallpaper to')}
          <div style="height:12px"></div>
          ${range('wallpaper.overlay', 'Overlay (keeps text readable)', 0, 0.9, 0.05, 'pct')}
          <p class="ss-note" id="ss-wallnote"></p>
          ${toggle('wallpaper.autoBlur', 'Blur wallpaper behind panels', 'When a drawer or Focus Mode is open')}
          <h3>Your wallpaper</h3>
          <div class="ss-upload"><input type="file" id="ss-upfile" accept="image/*" hidden><button class="ss-btn" data-act="upload">Upload image…</button><button class="ss-btn quiet" data-act="remove-custom" hidden>Remove</button></div>
          <p class="ss-note" id="ss-upnote">Stored only on this device · max 5 MB.</p>
          <div class="ss-wpgrid" id="ss-custom"></div>
          <h3>Gallery</h3>
          <div class="ss-wpcat"><div class="ss-wpgrid"><button type="button" class="ss-wp none" data-wp="">None</button></div></div>
          ${W.CATEGORIES.map((c) => `<div class="ss-wpcat"><span>${esc(c.name)}</span>${c.note ? `<p class="ss-note" style="margin-top:-.2rem">${esc(c.note)}</p>` : ''}<div class="ss-wpgrid">${c.items.map((it) => `<button type="button" class="ss-wp" data-wp="${it.id}" aria-label="${esc(it.name)}"><span>${esc(it.name)}</span></button>`).join('')}</div></div>`).join('')}
        </section>
        <section class="ss-panel" data-panel="study" hidden>
          <h3>Pomodoro</h3>
          ${pomoHTML(false)}
          <div style="height:12px"></div>
          ${range('pomodoro.focus', 'Focus length', 15, 60, 5, 'min')}
          ${range('pomodoro.short', 'Short break', 3, 15, 1, 'min')}
          ${range('pomodoro.long', 'Long break', 10, 30, 5, 'min')}
          ${toggle('pomodoro.autoNext', 'Start the next phase automatically')}
          ${toggle('pomodoro.chime', 'Soft chime when a phase ends')}
          ${app ? toggle('pomodoro.haptic', 'Gentle vibration when a phase ends') + toggle('pomodoro.keepAwake', 'Keep the screen on while focusing') : ''}
          <h3>Ambient sound</h3>
          ${ambHTML()}
          <p class="ss-note">Generated on the device. It never plays until you press play, and it fades out when you leave the app.</p>
          <h3>Focus Mode</h3>
          <button class="ss-btn primary" data-act="focus" style="width:100%">Focus Mode</button>
          <p class="ss-note">Hides the sidebar, navigation and everything except the lesson and your notes.</p>
          ${toggle('focus.notes', 'Show notes in Focus Mode')}
          ${app ? toggle('focus.immersive', 'Hide the status and navigation bars', 'Swipe from the edge to show them again') : ''}
        </section>
        <section class="ss-panel" data-panel="profile" hidden>
          <h3>Profile</h3>
          <label class="ss-field"><span>Active profile</span><select class="ss-select" id="ss-profile"></select></label>
          <div class="ss-upload"><button class="ss-btn" data-act="profile-new">New profile</button><button class="ss-btn" data-act="profile-rename">Rename</button><button class="ss-btn quiet" data-act="profile-delete">Delete</button></div>
          <p class="ss-note">Each profile keeps its own theme, wallpaper, fonts, timer, notes and progress.</p>
          <h3>Motion</h3>
          ${seg('display.motion', [['full', 'Full'], ['calm', 'Calm'], ['none', 'None']], 'Motion')}
          <p class="ss-note">Calm keeps only short fades. None removes all animation.</p>
          <h3>Refresh rate</h3>
          ${app ? `<div id="ss-refresh"></div><p class="ss-note" id="ss-refresh-note"></p>` : '<p class="ss-note">Refresh-rate control is available in the Android app.</p>'}
          <p class="ss-note" id="ss-fps">Measuring screen frame rate…</p>
          <h3>Your data</h3>
          <div class="ss-upload"><button class="ss-btn" data-act="export-notes">Export notes</button><button class="ss-btn quiet" data-act="reset-prefs">Reset settings</button></div>
          <p class="ss-note" id="ss-datanote">Everything stays on this device. Nothing is uploaded.</p>
        </section>
      </div>`;
    document.body.appendChild(d);

    // swatch previews: each drawn from that theme's own resolved tokens
    $$('.ss-swatch', d).forEach((b) => {
      const { theme, tok } = T.resolve(b.dataset.themeId, 'standard'), pv = $('.pv', b);
      pv.style.background = (theme.bgGradient ? theme.bgGradient + ',' : '') + tok.bg;
      pv.innerHTML = `<i style="background:${tok.text}"></i><i style="background:${tok.muted}"></i><s style="background:${tok.surface};border:1px solid ${tok.border}"></s><b style="background:${tok.accent}"></b>`;
      const art = theme.art;
      if (art && art.layers) { pv.style.backgroundImage = art.layers.join(',') + (theme.bgGradient ? ',' + theme.bgGradient : ''); pv.style.backgroundColor = tok.bg; pv.style.backgroundSize = art.layerSize || art.size; }
      if (art && art.gen) W.artThumb(art.gen).then((u) => { if (!u) return; const layer = document.createElement('span'); layer.style.cssText = `position:absolute;inset:0;background:url("${u}") center/cover;opacity:${art.opacity}`; pv.prepend(layer); });
    });
    // tabs
    $$('[data-tab]', d).forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
    // generic controls
    d.addEventListener('click', onDrawerClick);
    d.addEventListener('input', onInput);
    d.addEventListener('change', onInput);
    $('#ss-upfile', d).addEventListener('change', onUpload);
    $('#ss-profile', d).addEventListener('change', (e) => switchProfile(e.target.value));
  }

  let fontRole = 'body';
  const ROLE_NOTES = {
    heading: 'Headings: page titles, chapter names and section headers.',
    body: 'Body: menus, buttons, cards and everything else in the app.',
    reading: 'Lessons: the text inside Listen, Read and Summary, the hologram panels, and your notes.',
    mono: 'Numbers: the Pomodoro timer, progress figures and the lessons\' counters.',
  };
  function renderFontList() {
    const list = $('#ss-fontlist'); if (!list) return;
    const role = FONT_ROLES.find((r) => r.id === fontRole);
    const fonts = FONTS.filter((f) => f.roles.some((x) => role.offers.includes(x)));
    const autoBtn = role.auto ? `<button type="button" role="radio" data-font-pick="auto"><span>${esc(role.auto)}</span><small>Automatic</small></button>` : '';
    list.innerHTML = autoBtn + fonts.map((f) => `<button type="button" role="radio" data-font-pick="${f.id}" style="font-family:${esc(f.stack)}"><span>${esc(f.name)}</span><small>${esc(f.kind)} · ${esc(f.note)}</small></button>`).join('');
    const note = $('#ss-role-note'); if (note) note.textContent = ROLE_NOTES[fontRole];
  }

  function showTab(id) {
    activeTab = id;
    $$('#ss-drawer [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    $$('#ss-drawer [data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== id; });
    if (id === 'type') renderFontList();
    if (id === 'wall') loadThumbs();
    if (id === 'profile') { renderProfiles(); refreshDisplay(); }
    $('#ss-drawer .ss-dbody').scrollTop = 0;
  }
  let thumbsLoaded = false;
  function loadThumbs() {
    if (thumbsLoaded) { renderCustom(); return; } thumbsLoaded = true;
    $$('#ss-drawer .ss-wp[data-wp]').forEach((b) => { const id = b.dataset.wp; if (!id) return; W.thumb(id).then((u) => { if (u) b.style.backgroundImage = `url("${u}")`; }); });
    renderCustom();
  }
  async function renderCustom() {
    const box = $('#ss-custom'); if (!box) return;
    const url = await customWallpaperUrl();
    box.innerHTML = url ? `<button type="button" class="ss-wp" data-wp="custom" style="background-image:url('${url}')"><span>Your image</span></button>` : '';
    const rm = $('[data-act="remove-custom"]'); if (rm) rm.hidden = !url;
    syncUI();
  }

  function onDrawerClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.themeId) return setPref('theme', b.dataset.themeId);
    if (b.dataset.pairing) { const p = PAIRINGS.find((x) => x.id === b.dataset.pairing); Object.assign(prefs.font, p.set); savePrefs(); apply('font'); syncUI(); return; }
    if (b.dataset.fontRole) { fontRole = b.dataset.fontRole; renderFontList(); syncUI(); return; }
    if (b.dataset.fontPick) return setPref(FONT_ROLES.find((r) => r.id === fontRole).path, b.dataset.fontPick);
    if (b.dataset.fontSet) { const [role, id] = b.dataset.fontSet.split(':'); return setPref(FONT_ROLES.find((r) => r.id === role).path, id); }
    if (b.dataset.seg) return setPref(b.dataset.seg, b.dataset.val);
    if (b.dataset.wp !== undefined) return setPref('wallpaper.id', b.dataset.wp || null);
    if (b.dataset.refresh) return setPref('display.refresh', b.dataset.refresh);
    switch (b.dataset.act) {
      case 'close-settings': return closeSettings();
      case 'upload': return $('#ss-upfile').click();
      case 'remove-custom': return removeCustom();
      case 'profile-new': return newProfile();
      case 'profile-rename': return renameProfile();
      case 'profile-delete': return deleteProfile();
      case 'export-notes': return exportNotes();
      case 'reset-prefs': return resetPrefs();
    }
  }
  function onInput(e) {
    const el = e.target, path = el.dataset && el.dataset.pref; if (!path) return;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
    setPref(path, v);
  }

  // shared widgets (sidebar, drawer, viewer bar) — delegated so any mount point works
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act],[data-snd]'); if (!b) return;
    if (b.dataset.snd) { // choosing a sound is an explicit tap, so it may start playback
      prefs.sound.type = b.dataset.snd; savePrefs();
      if (b.dataset.snd === 'silence') Amb.stop(); else Amb.play();
      return;
    }
    switch (b.dataset.act) {
      case 'pomo-toggle': return Pomo.toggle();
      case 'pomo-reset': return Pomo.reset();
      case 'pomo-skip': return Pomo.skip();
      case 'amb-toggle': return Amb.toggle();
      case 'focus': return Focus.toggle();
      case 'notes-toggle': return showNotes($('#ss-notes') ? $('#ss-notes').hidden : true);
      case 'open-settings': return openSettings(b.dataset.tabTarget);
    }
  });
  document.addEventListener('input', (e) => { const el = e.target; if (el.closest('#ss-drawer')) return; if (el.dataset && el.dataset.pref) setPref(el.dataset.pref, el.type === 'range' ? +el.value : el.value); });

  function fmtOut(el) {
    const v = +el.value, f = el.dataset.fmt;
    return f === 'pct' ? Math.round(v * 100) + '%' : f === 'px' ? v + ' px' : f === 'x' ? v.toFixed(2) : f === 'min' ? v + ' min' : String(v);
  }
  function get(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), prefs); }
  function syncUI() {
    const d = $('#ss-drawer');
    if (d) {
      $$('.ss-swatch', d).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeId === prefs.theme)));
      $$('[data-pairing]', d).forEach((b) => b.setAttribute('aria-checked', String(pairingActive(PAIRINGS.find((p) => p.id === b.dataset.pairing)))));
      $$('[data-font-role]', d).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.fontRole === fontRole)));
      const roleVal = get(FONT_ROLES.find((r) => r.id === fontRole).path) || 'auto';
      $$('[data-font-pick]', d).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.fontPick === roleVal)));
      $$('[data-seg]', d).forEach((b) => b.setAttribute('aria-checked', String(get(b.dataset.seg) === b.dataset.val)));
      $$('.ss-wp', d).forEach((b) => b.setAttribute('aria-checked', String((b.dataset.wp || null) === prefs.wallpaper.id)));
      $$('[data-only-theme]', d).forEach((el) => { el.hidden = el.dataset.onlyTheme !== prefs.theme; });
      const r = current.tok.report, aa = $('#ss-aa', d);
      if (aa) aa.textContent = `${current.theme.note} Contrast: text ${r.text}:1 · secondary ${r.muted}:1 · accent ${r.accent}:1, all at or above WCAG AA (4.5:1).`;
      renderWallNote();
    }
    $$('[data-pref]').forEach((el) => {
      const v = get(el.dataset.pref);
      if (el.type === 'checkbox') el.checked = !!v; else if (document.activeElement !== el) el.value = v;
      const out = el.closest('.ss-field') && $(`output[data-out="${el.dataset.pref}"]`, el.closest('.ss-field')); if (out) out.textContent = fmtOut(el);
    });
    $$('[data-refresh]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.refresh === prefs.display.refresh)));
    Amb.render(); Pomo.render(); syncFocusButtons();
  }

  function openSettings(tab) {
    buildDrawer(); const d = $('#ss-drawer');
    d.classList.add('open'); d.setAttribute('aria-hidden', 'false');
    showTab(tab || activeTab); syncUI(); updateBlur();
    setTimeout(() => { const t = $('[data-tab][aria-selected="true"]', d); if (t) t.focus({ preventScroll: true }); }, 50);
  }
  function closeSettings() { const d = $('#ss-drawer'); if (!d) return; d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); updateBlur(); }
  const settingsOpen = () => !!$('#ss-drawer.open');

  // ───────────────────────── custom wallpaper upload ─────────────────────────
  async function onUpload(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    const note = $('#ss-upnote'); if (!file) return;
    if (!/^image\//.test(file.type)) { note.textContent = 'That file is not an image.'; return; }
    if (file.size > 5 * 1024 * 1024) { note.textContent = `That image is ${(file.size / 1048576).toFixed(1)} MB. The limit is 5 MB.`; return; }
    note.textContent = 'Preparing…';
    try {
      // downscale to screen size once, so the page never decodes a huge photo on every repaint
      const src = URL.createObjectURL(file), img = await loadImage(src); URL.revokeObjectURL(src);
      const max = 1800, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.9));
      await IDB.put('custom:' + pid(), blob || file);
      if (customUrl) URL.revokeObjectURL(customUrl); customUrl = null;
      note.textContent = 'Saved on this device.';
      await renderCustom();
      setPref('wallpaper.id', 'custom');
    } catch (err) { note.textContent = 'Could not read that image.'; }
  }
  async function removeCustom() {
    try { await IDB.del('custom:' + pid()); } catch (e) {}
    if (customUrl) URL.revokeObjectURL(customUrl); customUrl = null;
    if (prefs.wallpaper.id === 'custom') setPref('wallpaper.id', null);
    renderCustom();
  }

  // ───────────────────────── profiles ─────────────────────────
  function saveProfiles() { store.set('ss.profiles', profiles); }
  function renderProfiles() { const sel = $('#ss-profile'); if (!sel) return; sel.innerHTML = profiles.list.map((p) => `<option value="${esc(p.id)}"${p.id === pid() ? ' selected' : ''}>${esc(p.name)}</option>`).join(''); }
  function switchProfile(id) { if (id === pid()) return; store.set(K.prefs(), prefs); profiles.active = id; saveProfiles(); location.reload(); }
  function newProfile() {
    const name = (window.prompt('Name for the new profile', 'Profile ' + (profiles.list.length + 1)) || '').trim(); if (!name) return;
    const id = 'p' + Date.now().toString(36); profiles.list.push({ id, name }); saveProfiles(); switchProfile(id);
  }
  function renameProfile() {
    const p = profiles.list.find((x) => x.id === pid()); const name = (window.prompt('Rename profile', p.name) || '').trim(); if (!name) return;
    p.name = name; saveProfiles(); renderProfiles();
  }
  async function deleteProfile() {
    if (profiles.list.length < 2) { $('#ss-datanote').textContent = 'This is the only profile, so it cannot be deleted.'; return; }
    const p = profiles.list.find((x) => x.id === pid());
    if (!window.confirm(`Delete profile "${p.name}" with its settings, notes and progress?`)) return;
    [K.prefs(), K.notes(), K.pomo(), 'holostudy-lms-v1:' + pid()].forEach(store.del);
    try { await IDB.del('custom:' + pid()); } catch (e) {}
    profiles.list = profiles.list.filter((x) => x.id !== p.id); profiles.active = profiles.list[0].id; saveProfiles(); location.reload();
  }
  function resetPrefs() {
    if (!window.confirm('Reset theme, fonts, wallpaper and timer settings for this profile? Notes and progress are kept.')) return;
    prefs = merge(DEFAULTS, {}); store.set(K.prefs(), prefs); apply(); syncUI();
    $('#ss-datanote').textContent = 'Settings reset to defaults.';
  }
  function exportNotes() {
    const text = Notes.exportText(), note = $('#ss-datanote');
    if (!text) { note.textContent = 'No notes yet. Open a lesson and write in the Notes panel.'; return; }
    const name = `holostudy-notes-${new Date().toISOString().slice(0, 10)}.txt`;
    if (Native.available) { Native.send('file', 'save', { name, mime: 'text/plain', text }); note.textContent = 'Choose where to save your notes…'; return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    note.textContent = 'Notes exported.';
  }
  Native.on('file.saved', (m) => { const n = $('#ss-datanote'); if (n) n.textContent = m.ok ? 'Notes saved.' : 'Notes were not saved.'; });

  // ───────────────────────── display: refresh rate + measured fps ─────────────────────────
  let modes = null;
  Native.on('display.modes', (m) => { modes = m; renderRefresh(); });
  function refreshDisplay() { if (Native.available) Native.send('display', 'getModes', {}); measureFps(); }
  function renderRefresh() {
    const box = $('#ss-refresh'); if (!box || !modes) return;
    const rates = (modes.rates || []).map(Math.round), opts = [['adaptive', 'Adaptive']];
    rates.forEach((r) => opts.push([String(r), r + ' Hz']));
    if (rates.length > 1) opts.push(['max', 'Max']);
    opts.push(['system', 'System']);
    box.innerHTML = `<div class="ss-seg" role="radiogroup" aria-label="Refresh rate">${opts.map(([v, l]) => `<button type="button" role="radio" data-refresh="${v}">${l}</button>`).join('')}</div>`;
    const note = $('#ss-refresh-note');
    if (note) note.textContent = rates.length > 1
      ? `This screen supports ${rates.join(' / ')} Hz. Adaptive uses ${Math.max(...rates)} Hz while you touch or scroll and drops to ${Math.min(...rates.filter((r) => r >= 60).concat([60]))} Hz while you read, for smooth scrolling and longer battery life.`
      : `This screen runs at ${rates[0] || 60} Hz only, so there is nothing to switch. On 90/120 Hz phones you can choose Adaptive, a fixed rate, or Max here.`;
    syncUI();
  }
  let fpsBusy = false;
  function measureFps() {
    if (fpsBusy) return; fpsBusy = true;
    let n = 0; const t0 = performance.now();
    const f = (t) => { n++; if (t - t0 < 1000) requestAnimationFrame(f); else { fpsBusy = false; const el = $('#ss-fps'); if (el) el.textContent = `Screen is drawing at about ${Math.round(n * 1000 / (t - t0))} frames per second right now.`; } };
    requestAnimationFrame(f);
  }
  Native.on('app.memory', () => { W.release([wallUrl]); checkCache.clear(); }); // low-memory: free cached images

  // ───────────────────────── back handling (Android back button / gesture) ─────────────────────────
  function back() {
    if (settingsOpen()) { closeSettings(); return true; }
    if (Focus.on) { Focus.exit(); return true; }
    if (SS.hooks.back && SS.hooks.back()) return true;
    return false;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (settingsOpen()) { closeSettings(); e.preventDefault(); } else if (Focus.on) { Focus.exit(); e.preventDefault(); } }
  });

  // ───────────────────────── boot ─────────────────────────
  applyTheme(); applyFont(); applyWarm(); applyMotion(); // synchronous: no flash of the wrong theme
  function boot() {
    ['ss-bg', 'ss-art-css', 'ss-art-img', 'ss-wall', 'ss-warm', 'ss-topline'].forEach((id) => {
      if ($('#' + id)) return; const el = document.createElement('div'); el.id = id;
      if (id.startsWith('ss-art')) el.className = 'ss-art';
      if (id === 'ss-topline') { el.hidden = true; el.innerHTML = '<i></i>'; }
      el.setAttribute('aria-hidden', 'true'); document.body.prepend(el);
    });
    Pomo.load(); Pomo.tick();
    applyArt(); applyWallpaper();
    if (Native.available) { Native.send('app', 'hello', {}); Native.send('display', 'setRefresh', { mode: prefs.display.refresh }); }
    syncUI(); awake();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  const SS = window.SS = {
    native: Native, hooks: {},
    prefs: () => prefs, set: setPref, profileId: pid,
    profileName: () => (profiles.list.find((p) => p.id === pid()) || {}).name,
    openSettings, closeSettings, status, back,
    pomoHTML, ambHTML,
    focus: Focus,
    lesson: {
      open(info) { lesson = info; if (!$('#ss-notes').hidden) showNotes(true); },
      close() { lesson = null; Focus.exit(); showNotes(false); },
      get current() { return lesson; },
    },
    frameLoaded(frame) { frames.add(frame); themeFrame(frame); },
    updateBlur,
  };
  window.SSApp = { back };
})();
