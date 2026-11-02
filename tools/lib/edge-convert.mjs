// The "Add a PDF" converter (build/godot-web/import/holostudy-import.js) in headless Edge/Chrome, for Node tools:
// a small static server for the converter plus the PDFs asked for, a browser, and HoloImport.convertUrl.
//   const conv = await openConverter();
//   const r = await conv.convert('C:/…/kebo102.pdf');   // { pack, steps, back } or { error }
//   await conv.close();
// The converter needs only build/godot-web/import/ — `node tools/godot-import.mjs` builds it without Godot.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openConverter({ webRoot = path.join(ROOT, 'build', 'godot-web'), name = 'convert' } = {}) {
  if (!fs.existsSync(path.join(webRoot, 'import', 'holostudy-import.js'))) throw new Error(`${path.join(webRoot, 'import')} is missing — run: node tools/godot-import.mjs`);
  const files = []; // /file/<i> → a PDF on disk
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/convert.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><script src="import/holostudy-import.js"></script>'); }
    const f = u.startsWith('/file/') ? files[+u.slice(6)] : path.join(webRoot, u);
    if (!f || (!u.startsWith('/file/') && !f.startsWith(webRoot)) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const BROWSER = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
  if (!BROWSER) { server.close(); throw new Error('no Edge or Chrome found — set BROWSER=<path>'); }
  const PORT = 9300 + Math.floor(Math.random() * 300), PROFILE = path.join(os.tmpdir(), `holostudy-${name}-${Date.now()}`);
  const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-extensions', '--js-flags=--max-old-space-size=2048', 'about:blank'], { stdio: 'ignore' });
  const close = async () => {
    browser.kill();
    server.close();
    await new Promise((r) => { browser.once('exit', r); setTimeout(r, 3000); });
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* still held */ }
  };
  let ws, seq = 0;
  const W = new Map();
  try {
    for (let i = 0; i < 60 && !ws; i++) {
      try { const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); } } catch { /* starting */ }
      if (!ws) await sleep(300);
    }
    if (!ws) throw new Error('the browser did not start');
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (W.has(d.id)) { W.get(d.id)(d); W.delete(d.id); } };
    const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; W.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text); return r.result.result.value; };
    await cdp('Page.navigate', { url: BASE + '/convert.html' });
    for (let i = 0; i < 50 && !(await evaluate('!!window.HoloImport').catch(() => false)); i++) await sleep(100);
    // one file → the converter's book; `back` = the progress ever went backwards, `last` = the final progress
    const convert = async (file, fileName = path.basename(file)) => {
      const i = files.push(path.resolve(file)) - 1;
      const out = await evaluate(`new Promise((res) => { const steps = []; let last = 0, back = false; HoloImport.convertUrl('/file/${i}', ${JSON.stringify(fileName)}, { onAsk: (n, lim) => HoloImport.answer(1, lim), onProgress: (s, p) => { if (p < last) back = true; last = p; steps.push(Math.round(p * 100) + '% ' + s); }, onDone: (j) => res({ json: j, steps, back, last }), onError: (m) => res({ error: m, steps }), onCancelled: () => res({ error: 'cancelled', steps }) }); })`);
      return out.error ? out : { pack: JSON.parse(out.json), steps: out.steps, back: out.back, last: out.last };
    };
    return { convert, evaluate, close };
  } catch (e) { await close(); throw e; }
}
