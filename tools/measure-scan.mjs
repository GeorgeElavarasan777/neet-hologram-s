#!/usr/bin/env node
// Times the REAL in-app scan of a PDF, to tune the page budget in engines/study/page-budget.js (TUNE).
// Runs the study console in headless Edge on its own throw-away profile (only that browser is closed),
// uploads the PDF with the page pop-up switched off, and reports scan time per page, the background
// figure search, stored document size, memory and the device benchmark (PageBudget.bench).
//   1. serve the repo:   python -m http.server 8765 --bind 127.0.0.1      (from the repo root)
//   2. run:              node tools/measure-scan.mjs <file.pdf> [cpuSlowdown=1]
// cpuSlowdown 4 ≈ a mid-range phone, 8 ≈ a low-end phone (Chrome throttles the page's main thread).
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { rmSync } from 'node:fs';
const [pdfPath, slow = '1'] = process.argv.slice(2);
const prof = path.join(os.tmpdir(), 'holostudy-measure-profile');
rmSync(prof, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); // start empty, so the PDF is really scanned
const edge = spawn(process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--remote-debugging-port=9455', `--user-data-dir=${prof}`, '--no-first-run', '--disable-gpu', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=700', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0; const W = new Map();
try {
  for (let i = 0; i < 50 && !ws; i++) { try { const t = (await (await fetch('http://127.0.0.1:9455/json')).json()).find((x) => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); } } catch { } await sleep(300); }
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (W.has(d.id)) { W.get(d.id)(d); W.delete(d.id); } };
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; W.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => { const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
  await cdp('Page.navigate', { url: 'http://127.0.0.1:8765/engines/study/study.html' });
  for (let i = 0; i < 60; i++) { if (await ev('typeof UI !== "undefined" && !!window.PageBudget').catch(() => false)) break; await sleep(300); }
  if (+slow > 1) await cdp('Emulation.setCPUThrottlingRate', { rate: +slow });
  // log every scan step with a timestamp; skip the pop-up so the whole file is timed
  await ev(`window.__steps = []; const st = UI.scan.step.bind(UI.scan); UI.scan.step = (l, p) => { __steps.push([Math.round(performance.now()), l]); return st(l, p); }; PageBudget.ask = async () => ({ all: true }); true`);
  const d = await cdp('DOM.getDocument'); const q = await cdp('DOM.querySelector', { nodeId: d.result.root.nodeId, selector: '#fileInput' });
  const t0 = await ev('performance.now()');
  await cdp('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [pdfPath] });
  for (let i = 0; i < 1200; i++) { if (await ev('!!(HS.doc && !document.getElementById("app").hidden)').catch(() => false)) break; await sleep(500); }
  const t1 = await ev('performance.now()');
  for (let i = 0; i < 2400; i++) { if (await ev('!!(HS.doc.inside && HS.doc.inside.done)').catch(() => false)) break; await sleep(500); }
  const t2 = await ev('performance.now()');
  const info = await ev(`(async () => { const s = await PageBudget.sample(HS.pdf); const plan = PageBudget.plan(HS.pdf, s); return { pages: HS.doc.pageCount, notes: HS.doc.noteCount, docMB: +(JSON.stringify(HS.doc).length / 1e6).toFixed(2), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, bench: +s.bench.toFixed(1), charsPerPage: Math.round(s.chars), predictedMsPerPage: +(plan.perPage * 1000).toFixed(1), budgetPages: plan.limit }; })()`);
  const scan = (t1 - t0) / 1000, fig = (t2 - t1) / 1000;
  console.log(JSON.stringify({ cpuSlowdown: +slow, scanSec: +scan.toFixed(1), measuredMsPerPage: +(scan * 1000 / info.pages).toFixed(1), figureSearchSec: +fig.toFixed(1), ...info }, null, 1));
} finally { edge.kill(); await new Promise((r) => { edge.once("exit", r); setTimeout(r, 4000); }); }
process.exit(0);
