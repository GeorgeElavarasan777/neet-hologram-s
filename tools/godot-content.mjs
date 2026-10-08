#!/usr/bin/env node
// Exports the HoloStudy content for the Godot app into godot/content/ — produced by the web app's OWN code,
// so the Godot version shows exactly what the web version shows:
//   curriculum.json         subjects → classes → chapters (+ the holograms of each chapter)
//   packs/<id>.json         each NCERT book parsed by the study console: chapters, sections, pages (blocks),
//                           voice notes, key points, key terms, formulas, summary, recall quiz
//   practice.json           the practice bank: 150 checked MCQs per question generator (5 options each)
//   holo/index.json + holo/<figure>__<variant>.glb
//                           every hologram built by holo.js and saved as glTF: the slider ("explode" or
//                           the figure's own slide) becomes an animation called "slider" (11 keyframes),
//                           callout labels and in-scene text become empty nodes lbl_<i> / txt_<i> whose
//                           words are in index.json (Godot draws them with Label3D)
//   node tools/godot-content.mjs [curriculum] [packs] [practice] [holo]      (default: all four)
// Needs Microsoft Edge or Chrome (set BROWSER=<path> to choose). Starts its own static server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'godot', 'content');
const want = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['curriculum', 'packs', 'practice', 'holo']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const write = (rel, data) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
const kb = (n) => (n / 1024).toFixed(0) + ' KB';

// Text pulled from the NCERT PDFs keeps Symbol-font letters as private-use codes (U+F061 is α, U+F0B4 is ×…).
// Browsers draw them as empty boxes; map them to real Unicode (Adobe Symbol encoding) and drop stray C1 controls.
const SYMBOL = ' !∀#∃%&∋()∗+,−./0123456789:;<=>?≅ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ[∴]⊥_‾αβχδεφγηιϕκλμνοπθρστυϖωξψζ{|}∼';
const SYMBOL_HI = '€ϒ′≤⁄∞ƒ♣♦♥♠↔←↑→↓°±″≥×∝∂•÷≠≡≈…⏐⎯↵ℵℑℜ℘⊗⊕∅∩∪⊃⊇⊄⊂⊆∈∉∠∇®©™∏√⋅¬∧∨⇔⇐⇑⇒⇓◊〈®©™∑⎛⎜⎝⎡⎢⎣⎧⎨⎩⎪ 〉∫⌠⎮⌡⎞⎟⎠⎤⎥⎦⎫⎬⎭ ';
const SYMBOL_PUA = { 0xF8E5: '‾', 0xF8E6: '⏐', 0xF8E7: '⎯', 0xF8E8: '®', 0xF8E9: '©', 0xF8EA: '™', 0xF8EB: '⎛', 0xF8EC: '⎜', 0xF8ED: '⎝', 0xF8EE: '⎡', 0xF8EF: '⎢', 0xF8F0: '⎣', 0xF8F1: '⎧', 0xF8F2: '⎨', 0xF8F3: '⎩', 0xF8F4: '⎪', 0xF8F5: '⎮', 0xF8F6: '⎞', 0xF8F7: '⎟', 0xF8F8: '⎠', 0xF8F9: '⎤', 0xF8FA: '⎥', 0xF8FB: '⎦', 0xF8FC: '⎫', 0xF8FD: '⎬', 0xF8FE: '⎭', 0xF001: 'fi', 0xF002: 'fl' };
const fixChar = (c) => {
  const u = c.codePointAt(0);
  if (u >= 0xF020 && u <= 0xF07E) return SYMBOL[u - 0xF020];
  if (u >= 0xF0A0 && u <= 0xF0FF) return SYMBOL_HI[u - 0xF0A0].trim();
  if (SYMBOL_PUA[u]) return SYMBOL_PUA[u];
  return ''; // other private-use codes and C1 controls carry nothing readable
};
const fixText = (s) => s.replace(/[\u0080-\u009F-]/g, fixChar);
const fixAll = (x) => typeof x === 'string' ? fixText(x) : Array.isArray(x) ? x.map(fixAll) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fixAll(v)])) : x;

// ───────── curriculum ─────────
if (want.has('curriculum')) {
  const src = fs.readFileSync(path.join(ROOT, 'data', 'curriculum.js'), 'utf8');
  const json = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1);
  const cur = JSON.parse(json);
  write('curriculum.json', JSON.stringify(fixAll(cur)));
  console.log(`curriculum: ${cur.subjects.length} subjects, ${cur.subjects.reduce((a, s) => a + s.classes.reduce((b, c) => b + c.chapters.length, 0), 0)} chapters`);
}

// ───────── practice bank ─────────
if (want.has('practice')) {
  const B = createRequire(import.meta.url)('../engines/practice/bank.js');
  const PER = 150, out = { groups: B.GROUPS.map((g) => ({ id: g.id, title: g.title })), chapters: [] };
  let total = 0;
  for (const ch of B.CHAPTERS) {
    const gens = ch.gens.map((g) => {
      const seen = new Set(), qs = [];
      for (let k = 0; k < PER * 6 && qs.length < PER; k++) {
        let m; try { m = B.build(g(), 5, {}); } catch (e) { continue; }
        if (m.options.length < 2 || seen.has(m.q)) continue;
        seen.add(m.q); qs.push({ q: m.q, o: m.options, a: m.answer, h: m.hint || '', t: m.topic || '', b: m.book ? 1 : 0 });
      }
      total += qs.length; return qs;
    });
    out.chapters.push({ id: ch.id, title: ch.title, color: ch.color, group: ch.group, gens });
  }
  const f = write('practice.json', JSON.stringify(fixAll(out)));
  console.log(`practice: ${out.chapters.length} chapters, ${total} questions, ${kb(fs.statSync(f).size)}`);
}

if (!want.has('packs') && !want.has('holo')) process.exit(0);

// ───────── a static server + headless browser for the parts that run the web app ─────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const BROWSER = process.env.BROWSER || ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!BROWSER) { console.error('No Edge/Chrome found — set BROWSER=<path>'); process.exit(1); }
const PORT = 9600 + Math.floor(Math.random() * 300), PROFILE = path.join(ROOT, 'tools', '.godot-content-profile');
const browser = spawn(BROWSER, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-extensions', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
let ws, seq = 0; const W = new Map();
try {
  for (let i = 0; i < 100 && !ws; i++) {
    try {
      const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page' && x.url === 'about:blank');
      if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); }
    } catch { /* not up yet */ }
    if (!ws) await sleep(300);
  }
  const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data); if (W.has(d.id)) { W.get(d.id)(d); W.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('error: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n')[0]);
    if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  };
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; W.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => {
    const r = await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  const until = async (e, ms = 60000) => { const s = Date.now(); while (Date.now() - s < ms) { if (await ev(e).catch(() => false)) return true; await sleep(250); } return false; };
  await cdp('Runtime.enable');

  // ───────── NCERT packs: parsed by the study console itself ─────────
  if (want.has('packs')) {
    await cdp('Page.navigate', { url: `${BASE}/engines/study/study.html` });
    await until(`typeof DemoPack === 'object' && typeof HS === 'object'`);
    const ids = await ev(`DemoPack.ensure().then((p) => Object.keys(p))`);
    for (const id of ids) {
      const t0 = Date.now();
      await cdp('Page.navigate', { url: `${BASE}/engines/study/study.html` });
      await until(`typeof DemoPack === 'object' && typeof UI === 'object' && document.readyState === 'complete'`);
      const opened = await ev(`Promise.race([DemoPack.open(${JSON.stringify(id)}).then(() => 'ok'), new Promise((r) => setTimeout(() => r('timeout'), 90000))])`);
      if (opened !== 'ok') logs.push('DemoPack.open: ' + opened);
      const ok = await until(`(() => { try { return !!(HS.doc && HS.doc.chapters && HS.doc.chapters.length && HS.doc.noteCount && HS.doc.title === window.DEMO_PACK[${JSON.stringify(id)}].title); } catch (e) { return false; } })()`, 120000);
      if (!ok) throw new Error('pack did not open: ' + id + ' · ' + logs.slice(-8).join(' | ') + ' · ' + await ev(`(() => { try { return JSON.stringify({ url: location.href, ready: document.readyState, demo: typeof DemoPack, doc: HS.doc && HS.doc.title, ch: HS.doc && HS.doc.chapters && HS.doc.chapters.length, notes: HS.doc && HS.doc.noteCount, pack: !!window.DEMO_PACK, text: document.body.innerText.slice(0, 300) }); } catch (e) { return String(e); } })()`).catch((e) => String(e)));
      const json = await ev(`JSON.stringify((() => { const d = HS.doc; return { id: ${JSON.stringify(id)}, title: d.title, subject: d.subject, words: d.totalWords, notes: d.noteCount,
        chapters: d.chapters.map((c) => ({ n: c.n, title: c.title, startPage: c.startPage, endPage: c.endPage, intro: c.intro,
          sections: c.sections.map((s) => ({ t: s.title, p: s.page })),
          blocks: c.blocks.map((b) => ({ k: b.kind, t: b.text, p: b.page })),
          notes: c.notes.map((x) => ({ t: x.text, p: x.page, s: x.sec, w: x.words })),
          keyNotes: c.keyNotes.map((x) => ({ t: x.text, p: x.page, s: x.sec, w: x.words })),
          terms: c.terms.map((x) => ({ t: x.t, d: x.def || '', p: x.defPage || 0, n: x.count })),
          formulas: c.formulas || [],
          summary: c.summary.map((x) => ({ t: x.text, p: x.page })),
          quiz: c.quiz.map((q) => ({ q: q.text, o: q.options, a: q.answer, term: q.term || '', p: q.page || 0 })),
          figures: c.figures || 0, tables: c.tables || 0, examples: c.examples || 0 })) }; })())`);
      const p = fixAll(JSON.parse(json));
      const f = write(`packs/${id}.json`, JSON.stringify(p));
      console.log(`pack ${id}: ${p.chapters.length} chapters, ${p.notes} notes, ${kb(fs.statSync(f).size)} (${Date.now() - t0} ms)`);
    }
  }

  // ───────── holograms → GLB ─────────
  if (want.has('holo')) {
    await cdp('Page.navigate', { url: `${BASE}/engines/holograms/index.html` });
    await until(`!!(window.HOLO && window.HOLO.FIGS && window.HOLO.FIGS.length)`);
    await ev(`new Promise((r, j) => { const s = document.createElement('script'); s.src = '/tools/vendor/GLTFExporter.r128.js'; s.onload = r; s.onerror = j; document.head.appendChild(s); })`);
    await ev(`(() => {
      const HO = window.HOLO, H = HO.H;
      // remember what every text sprite says (sprites are not part of glTF; Godot redraws them as Label3D)
      const text = H.text;
      H.text = (str, o = {}) => { const s = text(str, o); s.userData.txt = { s: String(str), size: o.size ?? 0.22, color: o.color ?? '#e8f4ff', top: !!o.top, bold: !!o.bold, bg: o.bg || '' }; return s; };
      const b64 = (buf) => { const u8 = new Uint8Array(buf); let s = ''; for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000)); return btoa(s); };
      const close = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-5);
      window.__export = async (fi, vi) => {
        HO.loadFigure(fi, vi, { noHash: true });
        const S = HO.S, root = S.root, fig = S.fig, variant = S.variant, warn = [];
        root.name = 'holo';
        const slider = (S.exParts.length || (S.res && S.res.slide)) && (fig.explode || variant.slide || fig.slide || (S.res && S.res.slide)) ? (variant.slide || fig.slide || fig.explode || 'Explode') : '';
        // sample the slider 0 → 1 (11 steps) and keep every node's transform + visibility
        const nodes = []; root.traverse((o) => nodes.push(o));
        const N = slider ? 11 : 1, times = Array.from({ length: N }, (_, k) => N > 1 ? k / (N - 1) : 0), sm = nodes.map(() => []);
        for (let k = 0; k < N; k++) {
          if (slider) HO.setExplode(times[k]);
          root.updateMatrixWorld(true);
          let count = 0; root.traverse(() => count++);
          if (count !== nodes.length) warn.push('slider rebuilds the model at t=' + times[k]);
          nodes.forEach((o, j) => sm[j].push({ p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray(), v: o.visible }));
        }
        if (slider) HO.setExplode(0);
        root.updateMatrixWorld(true);
        // text sprites → empty nodes txt_<i> (same uuid, so their animation tracks still apply)
        const texts = [], sprites = []; root.traverse((o) => { if (o.isSprite) sprites.push(o); });
        const swap = new Map();
        for (const s of sprites) {
          const m = new THREE.Object3D(); m.name = 'txt_' + texts.length; m.uuid = s.uuid; m.position.copy(s.position); m.quaternion.copy(s.quaternion); m.visible = s.visible;
          texts.push(s.userData.txt || { s: '', size: 0.22, color: '#e8f4ff', top: false, bold: false, bg: '' });
          if (!s.userData.txt) warn.push('a text sprite without words');
          s.parent.add(m); s.parent.remove(s); swap.set(s, m);
        }
        // animation tracks for nodes that move, turn, grow or appear along the slider
        const tracks = [];
        nodes.forEach((o0, j) => {
          const o = swap.get(o0) || o0, a = sm[j], spr = swap.has(o0);
          const everVisible = a.some((x) => x.v);
          if (!everVisible && o !== root) { if (o.parent) o.parent.remove(o); return; }
          const scl = a.map((x) => x.v ? (spr ? [1, 1, 1] : x.s) : [1e-4, 1e-4, 1e-4]);
          if (!a[0].v) { o.visible = true; o.scale.set(1e-4, 1e-4, 1e-4); } else if (spr) o.scale.set(1, 1, 1);
          if (N < 2) return;
          if (a.some((x) => !close(x.p, a[0].p))) tracks.push(new THREE.VectorKeyframeTrack(o.uuid + '.position', times, a.flatMap((x) => x.p)));
          if (a.some((x) => !close(x.q, a[0].q))) tracks.push(new THREE.QuaternionKeyframeTrack(o.uuid + '.quaternion', times, a.flatMap((x) => x.q)));
          if (scl.some((x) => !close(x, scl[0]))) tracks.push(new THREE.VectorKeyframeTrack(o.uuid + '.scale', times, scl.flat()));
        });
        if (slider && !tracks.length) warn.push('slider changes nothing that glTF can store (materials/geometry only)');
        // callout labels → empty nodes lbl_<i>, riding on the part they point at
        const labels = (S.labels || []).map((lb, k) => {
          const m = new THREE.Object3D(); m.name = 'lbl_' + k;
          if (lb.part && lb.local && lb.part.parent) { m.position.copy(lb.local); lb.part.add(m); }
          else if (lb.a && lb.a.isObject3D && lb.a.parent) lb.a.add(m);
          else { if (Array.isArray(lb.a)) m.position.fromArray(lb.a); root.add(m); }
          return { t: lb.t, n: lb.n || '', side: lb.side || '', off: lb.off || null };
        });
        const clip = tracks.length ? new THREE.AnimationClip('slider', 1, tracks) : null;
        const glb = await new Promise((res) => new THREE.GLTFExporter().parse(root, res, { binary: true, onlyVisible: false, trs: true, animations: clip ? [clip] : [] }));
        return { glb: b64(glb), meta: { name: variant.name, slider, labels, texts, radius: S.modelRadius, warn } };
      };
      return true;
    })()`);
    const figs = await ev(`HOLO.FIGS.map((f) => ({ id: f.id, sub: f.sub, cls: f.cls, unit: f.unit || '', ch: f.ch || '', fig: f.fig || '', title: f.title, desc: f.desc || '', points: f.points || [], variants: f.variants.length }))`);
    const index = []; let bytes = 0, warns = 0; const t0 = Date.now();
    for (let fi = 0; fi < figs.length; fi++) {
      const f = figs[fi], vs = [];
      for (let vi = 0; vi < f.variants; vi++) {
        const r = await ev(`window.__export(${fi}, ${vi})`);
        const file = `${f.id}__${vi}.glb`, buf = Buffer.from(r.glb, 'base64');
        write('holo/' + file, buf); bytes += buf.length;
        if (r.meta.warn.length) { warns++; console.log(`  ! ${f.id} v${vi}: ${[...new Set(r.meta.warn)].join('; ')}`); }
        vs.push({ file, ...r.meta, warn: undefined });
      }
      index.push({ ...f, variants: vs });
      if ((fi + 1) % 20 === 0) console.log(`  holograms ${fi + 1}/${figs.length}…`);
    }
    write('holo/index.json', JSON.stringify(fixAll(index)));
    console.log(`holo: ${index.length} figures, ${index.reduce((a, f) => a + f.variants.length, 0)} models, ${(bytes / 1048576).toFixed(1)} MB, ${warns} with notes (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
} finally {
  try { ws && ws.close(); } catch { /* closed */ }
  browser.kill(); server.close();
}
process.exit(0);
