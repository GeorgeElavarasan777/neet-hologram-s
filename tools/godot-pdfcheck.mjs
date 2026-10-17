#!/usr/bin/env node
// What "Add a PDF" makes of a file, without the app: runs the built converter (build/godot-web/import) in
// headless Edge/Chrome on each PDF and prints the book — chapters, sections, voice notes, key terms, the
// first notes, sample MCQs and the holograms matched — plus the progress it reported.
//   node tools/godot-pdfcheck.mjs <file.pdf | folder> [more…]      (run tools/godot-build.mjs first)
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'build', 'godot-web');
const files = process.argv.slice(2).flatMap((a) => fs.statSync(a).isDirectory() ? fs.readdirSync(a).filter((f) => /\.(pdf|txt|md)$/i.test(f)).map((f) => path.join(a, f)) : [a]).map((f) => path.resolve(f));
if (!files.length) { console.error('usage: node tools/godot-pdfcheck.mjs <file.pdf | folder> …'); process.exit(1); }
if (!fs.existsSync(path.join(WEB, 'import', 'holostudy-import.js'))) { console.error('build/godot-web/import is missing — run: node tools/godot-build.mjs'); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/check.html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><meta charset="utf-8"><script src="import/holostudy-import.js"></script>'); }
  const f = u.startsWith('/file/') ? files[+u.slice(6)] : path.join(WEB, u);
  if (!f || (!u.startsWith('/file/') && !f.startsWith(WEB)) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const BROWSER = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
const PORT = 9300 + Math.floor(Math.random() * 300), PROFILE = path.join(os.tmpdir(), 'holostudy-pdfcheck-' + Date.now());
const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
let ws, seq = 0;
const W = new Map();
try {
  for (let i = 0; i < 60 && !ws; i++) {
    try { const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); } } catch { /* starting */ }
    if (!ws) await sleep(300);
  }
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (W.has(d.id)) { W.get(d.id)(d); W.delete(d.id); } };
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; W.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text); return r.result.result.value; };
  await cdp('Page.navigate', { url: BASE + '/check.html' });
  for (let i = 0; i < 50 && !(await ev('!!window.HoloImport').catch(() => false)); i++) await sleep(100);
  for (const [i, f] of files.entries()) {
    const t0 = Date.now(), name = path.basename(f);
    const out = await ev(`new Promise((res) => { const steps = []; HoloImport.convertUrl('/file/${i}', ${JSON.stringify(name)}, { onAsk: (n, lim) => HoloImport.answer(1, lim), onProgress: (s, p) => steps.push(Math.round(p * 100) + '% ' + s), onDone: (j) => res({ pack: JSON.parse(j), steps }), onError: (m) => res({ error: m, steps }), onCancelled: () => res({ error: 'cancelled', steps }) }); })`);
    console.log(`\n═══ ${name} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (out.error) { console.log('  could not be added:', out.error); continue; }
    const p = out.pack;
    console.log(`  "${p.title}" · ${p.subject} · ${p.source.pages || '–'} pages · ${p.words} words · ${p.notes} voice notes · ${p.chapters.reduce((a, c) => a + c.mcq.length, 0)} MCQs`);
    console.log('  progress:', out.steps.filter((s, k) => k % 5 === 0 || k === out.steps.length - 1).join(' → '));
    for (const c of p.chapters) {
      console.log(`  ${c.n}. ${c.title} — p. ${c.startPage}–${c.endPage} · ${c.sections.length} sections · ${c.notes.length} notes · ${c.summary.length} key points · ${c.quiz.length} quiz · ${c.mcq.length} MCQs`);
      if (c.sections.length) console.log('     sections:', c.sections.slice(0, 10).map((s) => s.t).join(' | '));
      console.log('     key terms:', c.terms.slice(0, 10).map((t) => t.t).join(', '));
      if (c.notes[0]) console.log('     first note:', c.notes[0].t.slice(0, 150));
      if (c.mcq[0]) console.log('     MCQ:', c.mcq[0].q.slice(0, 120), '→', c.mcq[0].o.map((o, k) => (k === c.mcq[0].a ? '✓' : '') + o).join(' / '));
      console.log('     holograms:', c.holograms.map((h) => `${h.title} (${h.why.slice(0, 3).join(', ')})`).join(' · ') || 'none');
    }
  }
} finally {
  browser.kill();
  server.close();
  await new Promise((r) => { browser.once('exit', r); setTimeout(r, 3000); });
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* still held */ }
}
