#!/usr/bin/env node
// How many books "Add a PDF" can hold: fills the library of the Godot web build in headless Edge/Chrome with the
// PDFs of a folder — each one several times under other names, so they are different books — through the real
// import sheet (godot/scripts/capacity_test.gd), then reloads the page and checks that every book is still there,
// opens, and feeds Practice, and finally deletes them all.
//   node tools/godot-capacity.mjs <folder of PDFs> [--copies 3] [--max 300] [--min-free-mb 600] [--json out.json]
// Prints a row per book (time, files kept, memory) and every 20 books how long Home and Practice take. Stops
// early if this computer runs low on memory (the browser is closed cleanly). Run tools/godot-build.mjs first.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'build', 'godot-web');
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const DIR = path.resolve(argv[0] || '.');
const COPIES = +opt('--copies', 3), MAX = +opt('--max', 300), MIN_FREE = +opt('--min-free-mb', 600), JSON_OUT = opt('--json', '');
const pdfs = fs.readdirSync(DIR).filter((f) => /\.pdf$/i.test(f)).sort();
const list = [];
for (let c = 0; c < COPIES && list.length < MAX; c++) for (const f of pdfs) if (list.length < MAX) list.push({ file: f, name: c ? `copy${c + 1}-${f}` : f });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freeMB = () => Math.round(os.freemem() / 1048576);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f;
  if (u.startsWith('/cap/')) { const item = list[+u.split('/')[2]]; f = item && path.join(DIR, item.file); }
  else { f = path.join(WEB, u); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!f.startsWith(WEB)) f = null; }
  if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const BROWSER = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const PORT = 9500 + Math.floor(Math.random() * 300), PROFILE = path.join(os.tmpdir(), 'holostudy-capacity-' + Date.now());
const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-extensions', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-precise-memory-info', 'about:blank'], { stdio: 'ignore' });
let ws, seq = 0;
const W = new Map(), report = { files: list.length, rows: [], verify: [] };
const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; W.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
const mb = (b) => (b / 1048576).toFixed(1);
try {
  for (let i = 0; i < 100 && !ws; i++) {
    try { const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); } } catch { /* starting */ }
    if (!ws) await sleep(300);
  }
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (W.has(d.id)) { W.get(d.id)(d); W.delete(d.id); } };
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 412, height: 860, deviceScaleFactor: 2.625, mobile: true });
  console.log(`adding ${list.length} PDFs (${pdfs.length} files × up to ${COPIES} names) — free memory ${freeMB()} MB`);
  console.log('  #  name                     ok    ms install books   kept MB  save KB  godot MB  js MB | home ms practice ms storage MB');
  const run = async (query, rowsOut, live) => {
    await cdp('Page.navigate', { url: `${BASE}/index.html?${query}` });
    await sleep(1500);
    if (query === 'capacity') await ev(`window.__capacityFiles = ${JSON.stringify(list.map((x, i) => [`cap/${i}/${encodeURIComponent(x.name)}`, x.name]))}`);
    let seen = 0, stopAsked = false;
    for (let t = 0; t < 7200; t++) { // up to 2 hours
      const st = await ev('JSON.stringify(window.__capacity || null)').then((s) => JSON.parse(s || 'null')).catch(() => null);
      if (st) {
        for (const r of st.rows.slice(seen)) { rowsOut.push(r); live(r); }
        seen = st.rows.length;
        if (st.done) return;
      }
      if (!stopAsked && freeMB() < MIN_FREE) { stopAsked = true; console.log(`  — this computer has ${freeMB()} MB free: asking the page to stop`); await ev('window.__capacityStop = true'); }
      await sleep(1000);
    }
  };
  await run('capacity', report.rows, (r) => {
    if (r.stopped || r.error) return console.log('  ' + (r.stopped || r.error));
    const ui = r.home_ms != null ? ` | ${String(r.home_ms).padStart(7)} ${String(r.practice_ms).padStart(11)} ${String(r.storage_mb).padStart(10)}` : '';
    console.log(`${String(r.n).padStart(3)}  ${r.name.slice(0, 24).padEnd(24)} ${r.ok ? 'yes' : 'NO '} ${String(r.ms).padStart(6)} ${String(r.install_ms).padStart(7)} ${String(r.books).padStart(5)} ${mb(r.bytes).padStart(8)} ${String(Math.round(r.save_bytes / 1024)).padStart(8)} ${String(r.godot_mb).padStart(9)} ${String(r.js_mb).padStart(6)}${ui}${r.ok ? '' : '  ' + r.error}`);
  });
  console.log('\nreloading the page …');
  await run('capacity=verify', report.verify, (r) => console.log('  ' + JSON.stringify(r)));
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1));
  const added = report.rows.filter((r) => r.ok).length, last = report.rows.filter((r) => r.books != null).pop() || {};
  console.log(`\n${added} of ${report.rows.filter((r) => r.n).length} added · library ${last.books} books, ${mb(last.bytes || 0)} MB kept · free memory now ${freeMB()} MB`);
} catch (e) {
  console.error(e);
} finally {
  browser.kill();
  server.close();
  await new Promise((r) => { browser.once('exit', r); setTimeout(r, 4000); });
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* still held */ }
}
