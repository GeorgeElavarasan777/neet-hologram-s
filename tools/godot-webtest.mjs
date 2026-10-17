#!/usr/bin/env node
// Runs the Godot edition's walk-through (godot/scripts/autotest.gd) in a real browser: headless Edge or
// Chrome on a phone-sized screen (412 × 860, pixel ratio 2.625, touch), WebGL through SwiftShader.
//   node tools/godot-webtest.mjs [--out <dir>] [--fixture]
// It serves build/godot-web (run tools/godot-build.mjs first) and, for "Add a PDF", makes its own test files:
//   sample-book.pdf   three biology chapters (NCERT text) printed to a real PDF by the browser, with running
//                     headers/footers and bookmarks; chapter 3 is renamed so its holograms must be found by
//                     what the text talks about, not by its NCERT title
//   scanned.pdf       one page with only a drawing (no text layer), broken.pdf  random bytes
// The page asks for real taps (window.__click: the driver clicks there with the mouse, so the browser
// allows the file picker) and for files (window.__pickFile: the driver answers the picker with that file).
// Screenshots at every window.__shot go to --out (default: <tmp>/holostudy-webtest). --fixture also saves
// the converted sample book to godot/tests/sample-book.json (the desktop autotest's stand-in for the
// browser converter). Exit code = failed steps.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'build', 'godot-web');
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join(os.tmpdir(), 'holostudy-webtest'));
const FIX = path.join(OUT, 'files');
fs.mkdirSync(FIX, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!fs.existsSync(path.join(WEB, 'index.html')) || !fs.existsSync(path.join(WEB, 'import', 'holostudy-import.js'))) {
  console.error('build/godot-web is missing or old — run: node tools/godot-build.mjs'); process.exit(1);
}

// ───────── the sample book (HTML → PDF in the browser) ─────────
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function sampleHTML() {
  const w = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'engines', 'study', 'holostudy-demos.js'), 'utf8'), { window: w });
  const text = w.DEMO_PACK.biology11.text;
  const chapter = (n) => { const a = text.indexOf(`\nChapter ${n}:`), b = text.indexOf(`\nChapter ${n + 1}:`); return text.slice(a + 1, b > 0 ? b : undefined); };
  const parts = [[2, null], [8, null], [3, 'Plants Without Flowers and Seeds']].map(([n, rename], k) => {
    const lines = chapter(n).split('\n');
    const title = rename || lines[0].replace(/^Chapter \d+:\s*/, '');
    let html = `<h1>Chapter ${k + 1}: ${esc(title)}</h1>\n`;
    let words = 0;
    for (const l of lines.slice(1)) {
      const t = l.trim();
      if (!t || /^\[\[page/.test(t)) continue;
      if (words > 2600 && /^##/.test(t)) break; // a few sections of each is plenty
      if (t.startsWith('### ')) html += `<h3>${esc(t.slice(4))}</h3>\n`;
      else if (t.startsWith('## ')) html += `<h2>${esc(t.slice(3))}</h2>\n`;
      else { html += `<p>${esc(t)}</p>\n`; words += t.split(/\s+/).length; }
    }
    return `<section>${html}</section>`;
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Biology — Sample Chapters</title><style>
    @page { size: A4; margin: 22mm 20mm; }
    body { font: 11pt/1.45 Georgia, 'Times New Roman', serif; color: #111; }
    .cover { height: 230mm; display: flex; flex-direction: column; justify-content: center; text-align: center; page-break-after: always; }
    .cover b { font-size: 34pt; } .cover span { font-size: 12pt; }
    section { page-break-before: always; }
    h1 { font: bold 24pt/1.2 Arial, sans-serif; margin: 0 0 14pt; }
    h2 { font: bold 16pt/1.25 Arial, sans-serif; margin: 16pt 0 6pt; }
    h3 { font: bold 14pt/1.25 Arial, sans-serif; margin: 12pt 0 4pt; }
    p { margin: 0 0 7pt; text-align: justify; }
  </style></head><body><div class="cover"><b>Biology</b><span>Sample chapters for testing HoloStudy</span></div>${parts.join('\n')}</body></html>`;
}
const scannedHTML = `<!doctype html><html><head><meta charset="utf-8"><title>Scanned page</title></head><body style="margin:0">
  <canvas id="c" width="1200" height="1600" style="width:190mm"></canvas><script>
  const g = document.getElementById('c').getContext('2d'); g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, 1200, 1600); g.strokeStyle = '#333'; g.lineWidth = 3;
  for (let y = 120; y < 1500; y += 46) { g.beginPath(); g.moveTo(100, y); for (let x = 100; x < 1100; x += 18) g.lineTo(x, y + Math.sin(x * 0.07 + y) * 6); g.stroke(); }
  </script></body></html>`;

// ───────── server: the build + the test files ─────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.pdf': 'application/pdf' };
const pages = { 'sample-book.html': sampleHTML(), 'scanned.html': scannedHTML };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u.startsWith('/__fixtures/')) {
    const name = u.slice(12);
    if (pages[name]) { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(pages[name]); }
    const f = path.join(FIX, path.basename(name));
    if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404); return res.end();
  }
  let p = path.join(WEB, u);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(WEB) || !fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ───────── the browser ─────────
const BROWSER = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!BROWSER) { console.error('No Edge/Chrome found — set BROWSER=<path>'); process.exit(1); }
const PORT = 9700 + Math.floor(Math.random() * 250), PROFILE = path.join(os.tmpdir(), 'holostudy-webtest-profile-' + Date.now());
const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-extensions', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=412,860', 'about:blank'], { stdio: 'ignore' });
let ws, seq = 0, fails = 0;
const W = new Map(), logs = [], events = [];
const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; W.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (e) => {
  const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result && r.result.result ? r.result.result.value : undefined;
};
const until = async (e, ms) => { const s = Date.now(); while (Date.now() - s < ms) { if (await ev(e).catch(() => false)) return true; await sleep(200); } return false; };
const pdfOf = async (url, file) => {
  await cdp('Page.navigate', { url });
  await until('document.readyState === "complete"', 15000);
  await sleep(300);
  const r = await cdp('Page.printToPDF', { displayHeaderFooter: true, generateDocumentOutline: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0,
    headerTemplate: '<div style="font:8px Arial;width:100%;text-align:center;color:#666">Biology · a HoloStudy test book</div>',
    footerTemplate: '<div style="font:8px Arial;width:100%;text-align:center;color:#666"><span class="pageNumber"></span></div>' });
  if (!r.result || !r.result.data) throw new Error('printToPDF failed: ' + JSON.stringify(r.error || r).slice(0, 200));
  fs.writeFileSync(path.join(FIX, file), Buffer.from(r.result.data, 'base64'));
};
try {
  for (let i = 0; i < 100 && !ws; i++) {
    try {
      const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page' && x.url === 'about:blank');
      if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); }
    } catch { /* starting */ }
    if (!ws) await sleep(300);
  }
  if (!ws) throw new Error('the browser did not start');
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (W.has(d.id)) { W.get(d.id)(d); W.delete(d.id); }
    else if (d.method) events.push(d);
    if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n')[0]);
    if (d.method === 'Runtime.consoleAPICalled' && /error|warn/.test(d.params.type)) logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  };
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('DOM.enable');

  // the test files
  await pdfOf(`${BASE}/__fixtures/sample-book.html`, 'sample-book.pdf');
  fs.copyFileSync(path.join(FIX, 'sample-book.pdf'), path.join(FIX, 'sample-copy.pdf'));
  await pdfOf(`${BASE}/__fixtures/scanned.html`, 'scanned.pdf');
  fs.writeFileSync(path.join(FIX, 'broken.pdf'), Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7919 + 13) % 251)));
  console.log(`test files: sample-book.pdf ${(fs.statSync(path.join(FIX, 'sample-book.pdf')).size / 1024).toFixed(0)} KB, scanned.pdf, broken.pdf`);

  // a phone
  await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 860, deviceScaleFactor: 2.625, mobile: true });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp('Page.setInterceptFileChooserDialog', { enabled: true });
  await cdp('Page.navigate', { url: `${BASE}/index.html?autotest&upload` });
  const t0 = Date.now();
  let lastShot = '', lastClick = -1, chooser = 0, done = false, sample = false;
  while (Date.now() - t0 < 900000) {
    // file pickers the page opened: answer with the file it asked for
    while (events.length) {
      const e = events.shift();
      if (e.method === 'Page.fileChooserOpened') {
        chooser++;
        const want = await ev('window.__pickFile || "sample-book.pdf"');
        await cdp('DOM.setFileInputFiles', { files: [path.join(FIX, path.basename(want))], backendNodeId: e.params.backendNodeId });
      }
    }
    const s = await ev('JSON.stringify({ shot: window.__shot || "", click: window.__click || null, done: !!(window.__holo && window.__holo.done), sample: !!window.__holoSamplePack })').then(JSON.parse).catch(() => ({}));
    if (s.click && s.click.n !== lastClick) { // a real tap where the page asked (CSS pixels)
      lastClick = s.click.n;
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
        await cdp('Input.dispatchMouseEvent', { type, x: s.click.x, y: s.click.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
        await sleep(40);
      }
      await ev(`window.__clickDone = ${lastClick}`);
    }
    if (s.shot && s.shot !== lastShot) {
      lastShot = s.shot;
      const img = await cdp('Page.captureScreenshot', { format: 'png' });
      if (img.result) fs.writeFileSync(path.join(OUT, s.shot + '.png'), Buffer.from(img.result.data, 'base64'));
      await ev(`window.__shotDone = ${JSON.stringify(s.shot)}`);
    }
    if (s.sample && !sample && argv.includes('--fixture')) {
      sample = true;
      const json = await ev('window.__holoSamplePack');
      fs.mkdirSync(path.join(ROOT, 'godot', 'tests'), { recursive: true });
      fs.writeFileSync(path.join(ROOT, 'godot', 'tests', 'sample-book.json'), json);
      console.log(`fixture: godot/tests/sample-book.json (${(json.length / 1024).toFixed(0)} KB)`);
    }
    if (s.done) { done = true; break; }
    await sleep(100);
  }
  const holo = await ev('window.__holo || {}');
  for (const st of holo.steps || []) { console.log(`${st.ok ? 'PASS' : 'FAIL'}  ${st.name}${st.detail ? ' — ' + st.detail : ''}`); if (!st.ok) fails++; }
  if (!done) { console.log('FAIL  the walk-through did not finish'); fails++; }
  console.log(`${holo.summary || ''} · ${((Date.now() - t0) / 1000).toFixed(0)} s · file pickers answered: ${chooser} · screenshots: ${OUT}`);
  const bad = logs.filter((l) => !/GPU stall|swiftshader|WebGL|Automatic fallback|deprecated/i.test(l));
  if (bad.length) { console.log('page errors and warnings:'); for (const l of bad.slice(0, 30)) console.log('  ' + l); }
} catch (e) {
  console.error(e); fails++;
} finally {
  browser.kill();
  server.close();
  await new Promise((r) => { browser.once('exit', r); setTimeout(r, 4000); });
  try { fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { /* the browser may still hold a file: the temp folder is cleaned later */ }
}
process.exit(fails);
