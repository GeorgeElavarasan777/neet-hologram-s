#!/usr/bin/env node
// Live end-to-end test of every HoloStudy setting and feature toggle, on a connected emulator or phone
// running the DEBUG build (needed for DevTools access). It drives the real controls through the
// Chrome DevTools Protocol, checks the page state and the Android window state (screen-awake flag,
// hidden system bars, status-bar icon colour, refresh-rate mode), takes screenshots, and finally
// restores the user's own settings, notes, timer and progress exactly as they were.
//   node tools/e2e-toggles.mjs [outDir]            PACE=ms between steps (default 450) so it can be watched
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ADB = process.env.ADB || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const PKG = 'com.holostudy.lms';
const OUT = path.resolve(process.argv[2] || 'e2e-results');
const PACE = +(process.env.PACE || 450);
mkdirSync(OUT, { recursive: true });
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', maxBuffer: 64 << 20 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── DevTools connection to the app's WebView ─────────
let ws, seq = 0;
async function connect() {
  const pid = adb('shell', 'pidof', PKG).trim();
  if (!pid) throw new Error('HoloStudy is not running');
  try { adb('forward', '--remove', 'tcp:9333'); } catch { /* not forwarded yet */ }
  adb('forward', 'tcp:9333', `localabstract:webview_devtools_remote_${pid}`);
  for (let i = 0; i < 30; i++) {
    try {
      const pages = await (await fetch('http://127.0.0.1:9333/json')).json();
      const p = pages.find((x) => x.type === 'page' && /index\.html/.test(x.url));
      if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); return; }
    } catch { /* retry */ }
    await sleep(500);
  }
  throw new Error('could not attach to the WebView — is the debug build installed and open?');
}
function evaluate(body) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const on = (m) => {
      const r = JSON.parse(m.data); if (r.id !== id) return; ws.removeEventListener('message', on);
      const ex = r.result && r.result.exceptionDetails;
      if (ex) reject(new Error(ex.exception ? ex.exception.description : ex.text)); else resolve(r.result && r.result.result ? r.result.result.value : undefined);
    };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: `(async () => { ${body} })()`, returnByValue: true, awaitPromise: true } }));
  });
}
async function helpers() {
  await evaluate(`
    const $ = (s, r = document) => r.querySelector(s);
    window.__t = {
      $, sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      v: (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
      click(sel) { const el = typeof sel === 'string' ? $(sel) : sel; if (!el) throw new Error('missing ' + sel); el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.click(); },
      range(sel, value) { const el = $(sel); if (!el) throw new Error('missing ' + sel); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); },
      toggle(sel, on) { const el = $(sel); if (!el) throw new Error('missing ' + sel); if (el.checked !== on) el.click(); },
      drawer(tab) { if (!$('#ss-drawer.open')) $('[data-act="open-settings"]').click(); if (tab) $('#ss-drawer [data-tab="' + tab + '"]').click(); },
      ratio: (a, b) => SSThemes.contrast(a, b),
      prefs: () => SS.prefs(),
    };
    return true;`);
}
async function afterReload() { await sleep(4500); await helpers(); }

// ───────── Android-side observations ─────────
function ourWindow() {
  const w = adb('shell', 'dumpsys', 'window', 'windows');
  const i = w.indexOf(`${PKG}/${PKG}.MainActivity}:`); if (i < 0) return '';
  const j = w.indexOf('Window #', i + 10); return w.slice(i, j > 0 ? j : i + 8000);
}
// An attached DevTools session itself makes the WebView keep the screen on, so detach before reading
// the flag (as a normal user would be) and reattach afterwards. The page is not reloaded, so the
// in-page helpers survive.
async function keepAwake() {
  try { ws.close(); } catch { /* already closed */ }
  await sleep(1800);
  const line = ourWindow().split('\n').find((l) => /\bfl=/.test(l)) || '';
  await connect();
  return /KEEP_SCREEN_ON/.test(line);
}
const displayMode = () => { const m = /preferredDisplayMode=(\d+)/.exec(ourWindow()); return m ? +m[1] : 0; };
const focusedApp = () => { const m = /mCurrentFocus=Window\{[^ ]+ [^ ]+ ([^/}]+)/.exec(adb('shell', 'dumpsys', 'window')); return m ? m[1] : ''; };
let shotN = 0;
function shot(name) {
  const file = path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`);
  writeFileSync(file, execFileSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 }));
  return file;
}
// status-bar icon colour, read from the pixels of the clock area of a screenshot
function statusIcons() {
  const file = shot('statusbar-probe');
  const ps = `Add-Type -AssemblyName System.Drawing; $b=[Drawing.Bitmap]::FromFile('${file.replace(/'/g, "''")}'); $l=@(); for($x=70;$x -lt 180;$x+=2){ for($y=40;$y -lt 90;$y+=2){ $c=$b.GetPixel($x,$y); $l += (0.2126*$c.R+0.7152*$c.G+0.0722*$c.B)/255 } }; $b.Dispose(); $s=$l|Sort-Object; $med=$s[[int]($s.Count/2)]; $ink=$l|Where-Object{ [Math]::Abs($_-$med) -gt 0.3 }; if(-not $ink){'none'} elseif((($ink|Measure-Object -Average).Average) -lt $med){'dark'} else {'light'}`;
  return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
}

// ───────── test bookkeeping ─────────
const results = [];
async function test(area, name, fn) {
  let ok = false, detail = '';
  try { const r = await fn(); ok = r === true || !!(r && r.ok); detail = r && typeof r === 'object' ? r.detail || '' : ''; }
  catch (e) { detail = 'ERROR: ' + String(e.message).split('\n')[0]; }
  results.push({ area, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${area} · ${name}${detail ? '  — ' + detail : ''}`);
  await sleep(PACE);
}

// ───────── run ─────────
await connect(); await helpers();
console.log(`HoloStudy live toggle test · screenshots → ${OUT}\n`);
// back to the dashboard, then remember the user's own state so it can be restored exactly
await evaluate(`for (let i = 0; i < 4 && SS.hooks.back && SS.hooks.back(); i++) await __t.sleep(400); SS.closeSettings(); return true;`);
const snapshot = await evaluate(`return JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter((k) => /^(ss\\.|holostudy-lms)/.test(k)).map((k) => [k, localStorage.getItem(k)])));`);
writeFileSync(path.join(OUT, 'user-state-backup.json'), snapshot);

// THEMES — all ten, via the swatches, each checked for WCAG AA
const THEMES = { carbon: 'Carbon Fiber Black', rich: 'Rich Black', ink: 'Ink Wash', paper: 'Paper White', slate: 'Slate Monochrome', blueprint: 'Blueprint Inverse', chalk: 'Chalkboard', marble: 'Marble Grey', graphite: 'Graphite Gradient', duotone: 'Duotone Sketch' };
for (const [id, name] of Object.entries(THEMES)) {
  await test('Themes', name, () => evaluate(`const t = __t; t.drawer('theme'); t.click('#ss-drawer [data-theme-id="${id}"]'); await t.sleep(300);
    const bg = t.v('--bg'), r1 = t.ratio(t.v('--text'), bg), r2 = t.ratio(t.v('--muted'), bg);
    const ok = document.documentElement.dataset.theme === '${id}' && t.$('#ss-drawer [data-theme-id="${id}"]').getAttribute('aria-checked') === 'true' && document.querySelector('meta[name=theme-color]').content.toUpperCase() === bg.toUpperCase() && r1 >= 4.5 && r2 >= 4.5;
    return { ok, detail: 'text ' + r1.toFixed(1) + ':1 · secondary ' + r2.toFixed(1) + ':1' };`));
  if (id === 'paper' || id === 'chalk' || id === 'blueprint') { await evaluate(`SS.closeSettings(); return true;`); await sleep(700); shot(`theme-${id}`); }
  if (id === 'paper') await test('Android', 'Light theme → dark status-bar icons', () => { const s = statusIcons(); return { ok: s === 'dark', detail: `icons read as ${s}` }; });
  if (id === 'carbon') { await evaluate(`SS.closeSettings(); return true;`); await sleep(600); await test('Android', 'Dark theme → light status-bar icons', () => { const s = statusIcons(); return { ok: s === 'light', detail: `icons read as ${s}` }; }); }
}
await evaluate(`__t.drawer('theme'); __t.click('#ss-drawer [data-theme-id="graphite"]'); return true;`);

// CONTRAST
for (const [mode, min] of [['soft', 7], ['standard', 4.5], ['high', 10]]) {
  await test('Contrast', mode, () => evaluate(`const t = __t; t.drawer('theme'); t.click('#ss-drawer [data-seg="contrast"][data-val="${mode}"]'); await t.sleep(250);
    const r = t.ratio(t.v('--text'), t.v('--bg'));
    return { ok: t.prefs().contrast === '${mode}' && r >= ${min}, detail: 'body text ' + r.toFixed(1) + ':1 (needs ≥ ${min})' };`));
}
await evaluate(`__t.click('#ss-drawer [data-seg="contrast"][data-val="standard"]'); return true;`);

// WARM LIGHT
await test('Warm light', 'switch on', () => evaluate(`const t = __t; t.drawer('theme'); t.toggle('#ss-drawer input[data-pref="warm.on"]', true); await t.sleep(800);
  const o = +getComputedStyle(t.$('#ss-warm')).opacity; return { ok: t.prefs().warm.on && o > 0.04, detail: 'filter opacity ' + o.toFixed(2) };`));
await test('Warm light', 'strength slider', () => evaluate(`const t = __t; t.range('#ss-drawer input[data-pref="warm.strength"]', 0.35); await t.sleep(200);
  return { ok: Math.abs(+t.v('--warm') - 0.35) < 0.001, detail: '--warm = ' + t.v('--warm') };`));
await evaluate(`SS.closeSettings(); await __t.sleep(700); return true;`); shot('warm-light');
await test('Warm light', 'switch off', () => evaluate(`const t = __t; t.drawer('theme'); t.toggle('#ss-drawer input[data-pref="warm.on"]', false); t.range('#ss-drawer input[data-pref="warm.strength"]', 0.18); await t.sleep(800);
  return { ok: !t.prefs().warm.on && +t.v('--warm') === 0, detail: '--warm = ' + t.v('--warm') };`));

// FONTS — pairings, per-part picker, size and line height
const PAIRS = { clean: ['Inter', null, 'Inter', 'JetBrains Mono'], claude: ['DM Sans', 'Newsreader', 'Newsreader', 'JetBrains Mono'], textbook: ['IBM Plex Sans', 'Merriweather', 'Literata', 'IBM Plex Mono'], easy: ['Lexend', 'Lexend', 'Lexend', 'JetBrains Mono'], accessible: ['Atkinson Hyperlegible', 'Atkinson Hyperlegible', 'Atkinson Hyperlegible', 'IBM Plex Mono'], dyslexia: ['OpenDyslexic', 'OpenDyslexic', 'OpenDyslexic', 'IBM Plex Mono'], chalk: ['Inter', 'Caveat', 'Inter', 'Share Tech Mono'] };
for (const [id, [body, head, read, mono]] of Object.entries(PAIRS)) {
  await test('Fonts', `pairing: ${id}`, () => evaluate(`const t = __t; t.drawer('type'); t.click('#ss-drawer [data-pairing="${id}"]'); await t.sleep(300);
    const first = (v) => t.v(v).split(',')[0].replace(/["']/g, '').trim();
    const want = { '--font-body': ${JSON.stringify(body)}, '--font-head': ${JSON.stringify(head)}, '--font-read': ${JSON.stringify(read)}, '--font-mono': ${JSON.stringify(mono)} };
    const bad = Object.entries(want).filter(([k, v]) => v && first(k) !== v).map(([k, v]) => k + '=' + first(k));
    const fams = [...new Set(Object.values(want).filter(Boolean))];
    await Promise.all(fams.map((f) => document.fonts.load('16px "' + f + '"')));
    const notLoaded = fams.filter((f) => !document.fonts.check('16px "' + f + '"'));
    return { ok: !bad.length && !notLoaded.length && t.$('#ss-drawer [data-pairing="${id}"]').getAttribute('aria-checked') === 'true', detail: bad.length ? 'wrong: ' + bad.join(', ') : notLoaded.length ? 'not loaded: ' + notLoaded.join(', ') : fams.length + ' font file' + (fams.length > 1 ? 's' : '') + ' loaded' };`));
}
await test('Fonts', 'per-part picker (headings → Caveat)', () => evaluate(`const t = __t; t.drawer('type'); t.click('#ss-drawer [data-pairing="claude"]'); t.click('#ss-drawer [data-font-role="heading"]'); await t.sleep(200); t.click('#ss-drawer [data-font-pick="caveat"]'); await t.sleep(250);
  const ok = t.v('--font-head').startsWith('"Caveat"') && document.documentElement.dataset.handwritten === '1' && t.v('--font-body').startsWith('"DM Sans"') && t.$('#ss-drawer [data-pairing="claude"]').getAttribute('aria-checked') === 'false';
  t.click('#ss-drawer [data-font-pick="newsreader"]'); t.click('#ss-drawer [data-font-role="body"]'); return { ok, detail: 'only the heading font changed; the pairing correctly shows as customised' };`));
for (const px of [14, 22, 17]) await test('Fonts', `text size ${px}px`, () => evaluate(`const t = __t; t.drawer('type'); t.range('#ss-drawer input[data-pref="font.size"]', ${px}); await t.sleep(200);
  const fs = getComputedStyle(document.documentElement).fontSize; return { ok: fs === '${px}px', detail: 'root font-size ' + fs };`));
for (const lh of [1.4, 1.9, 1.6]) await test('Fonts', `line height ${lh}`, () => evaluate(`const t = __t; t.range('#ss-drawer input[data-pref="font.lineHeight"]', ${lh}); await t.sleep(150);
  return { ok: +t.v('--lh') === ${lh}, detail: '--lh ' + t.v('--lh') };`));

// WALLPAPER — one from every gallery category, all four targets, overlay, readability guard, blur, none
for (const [wp, label] of [['grad-dusk', 'Minimal gradient'], ['grain-film', 'Grain texture'], ['geo-iso', 'Geometric line art'], ['nat-ridges', 'Nature (desaturated)'], ['ink-night', 'Ink wash'], ['solid-slate', 'Solid tone']]) {
  await test('Wallpaper', label, () => evaluate(`const t = __t; t.drawer('wall'); t.click('#ss-drawer [data-seg="wallpaper.target"][data-val="full"]'); t.click('#ss-drawer .ss-wp[data-wp="${wp}"]');
    for (let i = 0; i < 30 && !(t.$('#ss-wall').classList.contains('on') && /Readable|Below AA/.test(t.$('#ss-wallnote').textContent)); i++) await t.sleep(150);
    const img = t.v('--wall-img'), note = t.$('#ss-wallnote').textContent;
    return { ok: t.$('#ss-wall').classList.contains('on') && img.startsWith('url("blob:') && /Readable|Below AA/.test(note), detail: note.replace(/\\s+/g, ' ').slice(0, 95) };`));
}
await evaluate(`SS.closeSettings(); await __t.sleep(800); return true;`); shot('wallpaper-full');
await test('Wallpaper', 'readability guard (bright photo on dark theme)', () => evaluate(`const t = __t; t.drawer('wall'); t.range('#ss-drawer input[data-pref="wallpaper.overlay"]', 0); t.click('#ss-drawer .ss-wp[data-wp="nat-ridges"]');
  for (let i = 0; i < 30 && !/Below AA|Readable/.test(t.$('#ss-wallnote').textContent); i++) await t.sleep(150);
  const flagged = t.$('#ss-wallnote').classList.contains('flag'), ov = +t.v('--wall-ov');
  return { ok: flagged && ov > 0, detail: 'flagged, overlay raised to ' + Math.round(ov * 100) + '%' };`));
await test('Wallpaper', 'overlay slider', () => evaluate(`const t = __t; t.range('#ss-drawer input[data-pref="wallpaper.overlay"]', 0.9); for (let i = 0; i < 20 && +t.v('--wall-ov') < 0.89; i++) await t.sleep(100);
  return { ok: Math.abs(+t.v('--wall-ov') - 0.9) < 0.01, detail: 'overlay ' + Math.round(+t.v('--wall-ov') * 100) + '%' };`));
for (const [target, sel] of [['header', '.topbar'], ['cards', '.panel'], ['sidebar', '#side'], ['full', '#ss-wall']]) {
  await test('Wallpaper', `apply to ${target}`, () => evaluate(`const t = __t; t.drawer('wall'); t.click('#ss-drawer [data-seg="wallpaper.target"][data-val="${target}"]'); await t.sleep(500);
    const el = t.$('${sel}'), bgi = getComputedStyle(el).backgroundImage;
    return { ok: document.documentElement.dataset.wallTarget === '${target}' && document.documentElement.classList.contains('ss-has-wall') && bgi.includes('blob:'), detail: '${sel} ' + (bgi.includes('blob:') ? 'shows the wallpaper' : 'has no wallpaper') + ('${target}' === 'sidebar' ? ' (sidebar is hidden on phones; styles still applied)' : '') };`));
  if (target === 'header' || target === 'cards') { await evaluate(`SS.closeSettings(); await __t.sleep(700); return true;`); shot(`wallpaper-${target}`); }
}
await test('Wallpaper', 'auto-blur behind panels', () => evaluate(`const t = __t; t.drawer('wall'); t.toggle('#ss-drawer input[data-pref="wallpaper.autoBlur"]', true); await t.sleep(200); const on = document.documentElement.classList.contains('ss-blur');
  t.toggle('#ss-drawer input[data-pref="wallpaper.autoBlur"]', false); await t.sleep(200); const off = !document.documentElement.classList.contains('ss-blur');
  t.toggle('#ss-drawer input[data-pref="wallpaper.autoBlur"]', true); return { ok: on && off, detail: 'blurred while the drawer is open; not blurred when switched off' };`));
await test('Wallpaper', 'none', () => evaluate(`const t = __t; t.drawer('wall'); t.click('#ss-drawer .ss-wp[data-wp=""]'); await t.sleep(500);
  return { ok: !t.$('#ss-wall').classList.contains('on') && !document.documentElement.classList.contains('ss-has-wall'), detail: 'theme background restored' };`));

// POMODORO + screen-awake flag
const pomo = (body) => evaluate(`const t = __t; t.drawer('study'); const m = t.$('#ss-drawer [data-ss-mount="pomo"]'); const time = () => m.querySelector('.time').textContent, phase = () => m.querySelector('.phase').textContent; ${body}`);
await test('Pomodoro', 'reset', () => pomo(`t.click(m.querySelector('[data-act="pomo-reset"]')); await t.sleep(200); while (phase() !== 'Focus') { t.click(m.querySelector('[data-act="pomo-skip"]')); await t.sleep(150); }
  return { ok: time() === '25:00' && phase() === 'Focus', detail: phase() + ' ' + time() };`));
await test('Pomodoro', 'start counts down', () => pomo(`t.click(m.querySelector('[data-act="pomo-toggle"]')); const a = time(); await t.sleep(2300); const b = time();
  return { ok: a !== b && !t.$('#ss-topline').hidden, detail: a + ' → ' + b + ', top progress line visible' };`));
await test('Android', 'screen kept awake while focusing', async () => ({ ok: await keepAwake(), detail: 'FLAG_KEEP_SCREEN_ON set' }));
await test('Pomodoro', 'pause stops the clock', () => pomo(`t.click(m.querySelector('[data-act="pomo-toggle"]')); await t.sleep(300); const a = time(); await t.sleep(1600);
  return { ok: a === time() && t.$('#ss-topline').hidden, detail: 'held at ' + a };`));
await test('Android', 'screen-awake released on pause', async () => ({ ok: !(await keepAwake()), detail: 'FLAG_KEEP_SCREEN_ON cleared' }));
await test('Pomodoro', 'skip → short break → focus', () => pomo(`t.click(m.querySelector('[data-act="pomo-skip"]')); await t.sleep(200); const p1 = phase() + ' ' + time(); t.click(m.querySelector('[data-act="pomo-skip"]')); await t.sleep(200);
  return { ok: p1 === 'Short break 05:00' && phase() === 'Focus', detail: p1 + ' → ' + phase() };`));
await test('Pomodoro', 'focus length slider', () => pomo(`t.range('#ss-drawer input[data-pref="pomodoro.focus"]', 30); t.click(m.querySelector('[data-act="pomo-reset"]')); await t.sleep(200); const a = time();
  t.range('#ss-drawer input[data-pref="pomodoro.focus"]', 25); t.click(m.querySelector('[data-act="pomo-reset"]')); await t.sleep(200); return { ok: a === '30:00' && time() === '25:00', detail: '30:00 then back to 25:00' };`));
for (const key of ['autoNext', 'chime', 'haptic', 'keepAwake']) await test('Pomodoro', `toggle: ${key}`, () => evaluate(`const t = __t; t.drawer('study'); const sel = '#ss-drawer input[data-pref="pomodoro.${key}"]'; const before = t.prefs().pomodoro.${key};
  t.click(sel); await t.sleep(150); const flipped = t.prefs().pomodoro.${key} === !before; t.click(sel); await t.sleep(150); return { ok: flipped && t.prefs().pomodoro.${key} === before, detail: 'switched and switched back' };`));
await test('Android', 'screen-awake off when that toggle is off', async () => {
  await pomo(`t.toggle('#ss-drawer input[data-pref="pomodoro.keepAwake"]', false); t.click(m.querySelector('[data-act="pomo-toggle"]')); await t.sleep(900); return true;`);
  const flag = await keepAwake();
  await pomo(`t.click(m.querySelector('[data-act="pomo-toggle"]')); t.click(m.querySelector('[data-act="pomo-reset"]')); t.toggle('#ss-drawer input[data-pref="pomodoro.keepAwake"]', true); return true;`);
  return { ok: !flag, detail: 'timer running, flag not set' };
});

// AMBIENT SOUND
const amb = (body) => evaluate(`const t = __t; t.drawer('study'); const m = t.$('#ss-drawer [data-ss-mount="amb"]'); const btn = m.querySelector('[data-act="amb-toggle"]'); ${body}`);
await test('Ambient sound', 'rain plays', () => amb(`t.click(m.querySelector('[data-snd="rain"]')); await t.sleep(600); return { ok: btn.textContent === 'Pause sound' && btn.getAttribute('aria-pressed') === 'true' && t.prefs().sound.type === 'rain', detail: 'playing rain' };`));
await test('Ambient sound', 'brown noise', () => amb(`t.click(m.querySelector('[data-snd="brown"]')); await t.sleep(600); return { ok: btn.textContent === 'Pause sound' && m.querySelector('[data-snd="brown"]').getAttribute('aria-checked') === 'true', detail: 'switched to brown noise' };`));
await test('Ambient sound', 'volume slider', () => amb(`t.range('#ss-drawer [data-ss-mount="amb"] input[data-pref="sound.volume"]', 0.2); await t.sleep(150); return { ok: t.prefs().sound.volume === 0.2, detail: 'volume 20%' };`));
await test('Ambient sound', 'pause / play button', () => amb(`t.click(btn); await t.sleep(400); const paused = btn.textContent === 'Play sound'; t.click(btn); await t.sleep(400); const again = btn.textContent === 'Pause sound'; return { ok: paused && again, detail: 'paused, then playing again' };`));
await test('Ambient sound', 'silence', () => amb(`t.click(m.querySelector('[data-snd="silence"]')); await t.sleep(500); t.range('#ss-drawer [data-ss-mount="amb"] input[data-pref="sound.volume"]', 0.4); return { ok: btn.textContent === 'Play sound' && btn.disabled, detail: 'stopped; play disabled' };`));

// FOCUS MODE + notes + hidden system bars
const h0 = await evaluate(`return innerHeight;`);
await test('Focus Mode', 'enter (lesson + notes only)', () => evaluate(`const t = __t; t.drawer('study'); t.toggle('#ss-drawer input[data-pref="focus.notes"]', true); t.toggle('#ss-drawer input[data-pref="focus.immersive"]', true); t.click('#ss-drawer [data-act="focus"]');
  for (let i = 0; i < 40 && !document.documentElement.classList.contains('ss-focus'); i++) await t.sleep(200); await t.sleep(1500);
  const hidden = (s) => getComputedStyle(t.$(s)).display === 'none';
  return { ok: document.documentElement.classList.contains('ss-focus') && hidden('#side') && hidden('#botnav') && hidden('main') && !t.$('#ss-notes').hidden && !t.$('#viewer').hidden, detail: 'sidebar, navigation and page hidden; lesson and notes shown' };`));
shot('focus-mode');
await test('Android', 'Focus Mode hides the system bars', async () => { const h1 = await evaluate(`return innerHeight;`); return { ok: h1 > h0, detail: `usable height ${h0}px → ${h1}px` }; });
await test('Android', 'screen kept awake in Focus Mode', async () => ({ ok: await keepAwake(), detail: 'FLAG_KEEP_SCREEN_ON set' }));
await test('Notes', 'typing saves to this profile', () => evaluate(`const t = __t; const ta = t.$('#ss-notes-text'); ta.value = 'E2E test note'; ta.dispatchEvent(new Event('input', { bubbles: true })); await t.sleep(700);
  const all = JSON.parse(localStorage.getItem('ss.notes.' + SS.profileId()) || '{}'); return { ok: Object.values(all).some((n) => n.text === 'E2E test note') && /Saved/.test(t.$('#ss-notes-status').textContent), detail: t.$('#ss-notes-status').textContent };`));
await test('Focus Mode', 'exit with Esc', () => evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await __t.sleep(900); return { ok: !document.documentElement.classList.contains('ss-focus'), detail: 'back to the lesson view' };`));
await test('Android', 'system bars back after Focus Mode', async () => { await sleep(600); const h = await evaluate(`return innerHeight;`); return { ok: h === h0, detail: `usable height ${h}px` }; });
await test('Focus Mode', 'toggle: show notes off', () => evaluate(`const t = __t; SS.set('focus.notes', false); SS.focus.enter(); await t.sleep(900); const ok = t.$('#ss-notes').hidden; SS.focus.exit(); SS.set('focus.notes', true); await t.sleep(500); return { ok, detail: 'notes panel stays closed' };`));
await test('Focus Mode', 'toggle: hide system bars off', async () => {
  await evaluate(`SS.set('focus.immersive', false); SS.focus.enter(); await __t.sleep(1200); return true;`);
  const h = await evaluate(`return innerHeight;`);
  await evaluate(`SS.focus.exit(); SS.set('focus.immersive', true); await __t.sleep(600); return true;`);
  return { ok: h === h0, detail: `bars stay visible (height ${h}px)` };
});
await evaluate(`for (let i = 0; i < 4 && SS.hooks.back(); i++) await __t.sleep(400); return true;`);

// DISPLAY: motion + refresh rate
for (const m of ['full', 'none', 'calm']) await test('Display', `motion: ${m}`, () => evaluate(`const t = __t; t.drawer('profile'); t.click('#ss-drawer [data-seg="display.motion"][data-val="${m}"]'); await t.sleep(200); return { ok: document.documentElement.dataset.motion === '${m}', detail: 'data-motion=' + document.documentElement.dataset.motion };`));
await test('Display', 'refresh-rate choices match the screen', () => evaluate(`const t = __t; t.drawer('profile'); for (let i = 0; i < 20 && !t.$('#ss-refresh [data-refresh]'); i++) await t.sleep(200);
  const opts = [...document.querySelectorAll('#ss-refresh [data-refresh]')].map((b) => b.textContent); return { ok: opts.includes('Adaptive') && opts.some((o) => /Hz/.test(o)), detail: opts.join(' / ') + ' · ' + t.$('#ss-fps').textContent.replace('Screen is drawing at about ', '').replace(' right now.', '') };`));
await test('Android', 'refresh rate: System', async () => { await evaluate(`__t.click('#ss-refresh [data-refresh="system"]'); await __t.sleep(600); return true;`); const m = displayMode(); return { ok: m === 0, detail: `preferredDisplayMode=${m} (Android decides)` }; });
await test('Android', 'refresh rate: 60 Hz', async () => { await evaluate(`__t.click('#ss-refresh [data-refresh="60"]'); await __t.sleep(600); return true;`); const m = displayMode(); return { ok: m > 0, detail: `preferredDisplayMode=${m}` }; });
await test('Android', 'refresh rate: Adaptive', async () => { await evaluate(`__t.click('#ss-refresh [data-refresh="adaptive"]'); await __t.sleep(600); return true;`); const m = displayMode(); return { ok: m > 0, detail: `preferredDisplayMode=${m} (base rate while reading)` }; });

// DATA: export notes opens the system save dialog; cancelling is reported
await test('Your data', 'export notes → system save dialog', async () => {
  await evaluate(`__t.drawer('profile'); __t.click('#ss-drawer [data-act="export-notes"]'); return true;`); await sleep(2500);
  const app = focusedApp(); shot('export-notes-dialog'); adb('shell', 'input', 'keyevent', '4'); await sleep(1500);
  const note = await evaluate(`return __t.$('#ss-datanote').textContent;`);
  return { ok: /documentsui/.test(app) && /not saved/.test(note), detail: `opened ${app}; cancel reported: "${note}"` };
});

// PROFILES (each switch reloads the page)
const T0 = await evaluate(`return SS.prefs().theme;`);
await test('Profiles', 'create a new profile', async () => {
  await evaluate(`window.prompt = () => 'E2E profile'; __t.drawer('profile'); __t.click('#ss-drawer [data-act="profile-new"]'); return true;`); await afterReload();
  return evaluate(`return { ok: SS.profileName() === 'E2E profile' && SS.prefs().theme === 'graphite' && SS.prefs().font.family === 'inter', detail: 'fresh defaults in the new profile' };`);
});
await evaluate(`__t.drawer('theme'); __t.click('#ss-drawer [data-theme-id="paper"]'); await __t.sleep(400); return true;`);
await test('Profiles', 'switch back keeps each profile separate', async () => {
  await evaluate(`__t.drawer('profile'); const s = __t.$('#ss-profile'); s.value = 'default'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`); await afterReload();
  return evaluate(`return { ok: SS.profileId() === 'default' && SS.prefs().theme === ${JSON.stringify(T0)}, detail: 'your profile theme: ' + SS.prefs().theme };`);
});
await test('Profiles', 'delete the test profile', async () => {
  const id = await evaluate(`return JSON.parse(localStorage.getItem('ss.profiles')).list.find((p) => p.name === 'E2E profile').id;`);
  await evaluate(`__t.drawer('profile'); const s = __t.$('#ss-profile'); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`); await afterReload();
  const kept = await evaluate(`return SS.prefs().theme;`);
  await evaluate(`window.confirm = () => true; __t.drawer('profile'); __t.click('#ss-drawer [data-act="profile-delete"]'); return true;`); await afterReload();
  return evaluate(`const list = JSON.parse(localStorage.getItem('ss.profiles')).list, gone = !localStorage.getItem(${JSON.stringify('ss.prefs.' + id)});
    return { ok: ${JSON.stringify(kept)} === 'paper' && !list.some((p) => p.name === 'E2E profile') && gone, detail: 'its own theme persisted (paper); deleted together with its data' };`);
});

// RESET + PERSISTENCE
await test('Your data', 'reset settings to defaults', () => evaluate(`window.confirm = () => true; __t.drawer('profile'); __t.click('#ss-drawer [data-act="reset-prefs"]'); await __t.sleep(400);
  return { ok: SS.prefs().theme === 'graphite' && SS.prefs().font.family === 'inter' && /reset/.test(__t.$('#ss-datanote').textContent), detail: __t.$('#ss-datanote').textContent };`));
await test('Persistence', 'settings survive an app reload', async () => {
  await evaluate(`__t.drawer('theme'); __t.click('#ss-drawer [data-theme-id="chalk"]'); await __t.sleep(500); location.reload(); return true;`); await afterReload();
  return evaluate(`return { ok: SS.prefs().theme === 'chalk' && document.documentElement.dataset.theme === 'chalk', detail: 'Chalkboard still applied after reload' };`);
});

// LESSON FEATURES: speech voices and the built-in Claude hologram sample
await test('Lessons', 'Listen: Android voices available', () => evaluate(`document.getElementById('docsBtn').click(); let w; for (let i = 0; i < 30; i++) { await __t.sleep(400); w = document.getElementById('viewerFrame').contentWindow; try { if (w.document.readyState === 'complete' && w.eval('typeof UI') === 'object') break; } catch (e) {} }
  for (let i = 0; i < 20 && !w.speechSynthesis.getVoices().length; i++) await __t.sleep(300); const n = w.speechSynthesis.getVoices().length; return { ok: n > 0, detail: n + ' voices from Android text-to-speech' };`));
await test('Lessons', 'Claude hologram sample renders', () => evaluate(`const w = document.getElementById('viewerFrame').contentWindow, d = w.document;
  const docs = await w.eval('DB').all('docs'); if (!docs.length) return { ok: false, detail: 'no document in the library' };
  await w.eval('UI').openStored(docs[0].id); await __t.sleep(2000); w.eval('UI').setTab('holo'); await __t.sleep(800);
  const chip = [...d.querySelectorAll('#modelChips .chip')].find((c) => /Claude/.test(c.textContent)); if (chip && !w.ClaudeHolo.on) chip.click(); await __t.sleep(500);
  if (w.ClaudeHolo.on) { w.ClaudeHolo.leave(); await __t.sleep(300); }
  d.getElementById('cxSample').click(); await __t.sleep(1500); const m = w.ClaudeHolo.mesh;
  return { ok: w.ClaudeHolo.on && m && m.labels.length === 5 && w.eval('UI').holoMain.mesh === m, detail: (w.ClaudeHolo.spec || {}).title + ' · ' + (m ? m.labels.length : 0) + ' numbered parts' };`));
shot('claude-sample');
await evaluate(`const w = document.getElementById('viewerFrame').contentWindow; try { w.ClaudeHolo.leave(); } catch (e) {} for (let i = 0; i < 4 && SS.hooks.back(); i++) await __t.sleep(400); return true;`);

// ───────── restore the user's own state exactly ─────────
await evaluate(`const saved = JSON.parse(${JSON.stringify(snapshot)}); Object.keys(localStorage).filter((k) => /^(ss\\.|holostudy-lms)/.test(k)).forEach((k) => localStorage.removeItem(k)); for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v); location.reload(); return true;`);
await afterReload();
const restored = await evaluate(`return SS.prefs().theme + ' · ' + SS.prefs().font.family + ' · profile ' + SS.profileName();`);

const pass = results.filter((r) => r.ok).length;
const md = [`# HoloStudy live toggle test`, ``, `${pass}/${results.length} passed · ${new Date().toISOString()}`, ``, `| Area | Check | Result | Detail |`, `|---|---|---|---|`, ...results.map((r) => `| ${r.area} | ${r.name} | ${r.ok ? 'PASS' : '**FAIL**'} | ${r.detail.replace(/\|/g, '/')} |`), ``, `Your settings were restored afterwards (${restored}).`].join('\n');
writeFileSync(path.join(OUT, 'report.md'), md); writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
console.log(`\n${pass}/${results.length} passed · restored: ${restored} · report: ${path.join(OUT, 'report.md')}`);
ws.close();
process.exit(pass === results.length ? 0 : 1);
