#!/usr/bin/env node
// Checks the "add your own PDF" converter (tools/godot-import.mjs) without a browser:
//  1. the bundle runs the study console's scanner exactly: each NCERT book's text, imported as a text file,
//     gives the same chapters, voice notes, key terms, summary and quiz as godot/content/packs/<book>.json
//  2. every chapter gets MCQs that are well formed (one right answer among 4–5 distinct options, the answer
//     blanked out of the question, no option visible in the question) and holograms from the library
//  3. the progress it reports only goes up and ends at 1; bad files give a message, not a crash
//   node tools/test-import.mjs            (exit code = failures)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { bundle } from './godot-import.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'godot', 'content');
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

// a page-less browser: enough of window/document for the bundle; fetch reads godot/content
const ctx = {
  console, setTimeout, clearTimeout, URL, Blob, File, TextDecoder, TextEncoder, DOMException, performance,
  navigator: { deviceMemory: 8 },
  requestAnimationFrame: (f) => setTimeout(f, 0),
  fetch: async (u) => {
    const rel = decodeURIComponent(new URL(u).pathname).replace(/^.*\/content\//, '');
    const f = path.join(CONTENT, rel);
    if (!fs.existsSync(f)) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
  },
};
ctx.window = ctx;
ctx.document = { currentScript: { src: 'http://holo.test/import/holostudy-import.js' }, visibilityState: 'hidden', addEventListener() {}, createElement() { return {}; }, head: { appendChild() {} }, body: { appendChild() {} } };
vm.createContext(ctx);
vm.runInContext(bundle(), ctx, { filename: 'holostudy-import.js' });
const HI = ctx.HoloImport;

const convert = (blob, name) => new Promise((resolve) => {
  const steps = [];
  HI.convertBlob(blob, name, {
    onStarted() {}, onProgress: (s, f) => steps.push(f),
    onDone: (json) => resolve({ pack: JSON.parse(json), steps }), onError: (m) => resolve({ error: m, steps }), onCancelled: () => resolve({ cancelled: true, steps }),
  });
});

// ───────── 1 · same results as the NCERT packs ─────────
const demoSrc = fs.readFileSync(path.join(ROOT, 'engines', 'study', 'holostudy-demos.js'), 'utf8');
const demo = {}; vm.runInNewContext(demoSrc, { window: demo });
const strip = (s) => String(s).replace(/[^A-Za-z0-9]+/g, ''); // compare words only (the packs had Symbol letters mapped afterwards)
for (const id of Object.keys(demo.DEMO_PACK)) {
  const t0 = Date.now();
  const ref = JSON.parse(fs.readFileSync(path.join(CONTENT, 'packs', id + '.json'), 'utf8'));
  const r = await convert(new Blob([demo.DEMO_PACK[id].text], { type: 'text/plain' }), demo.DEMO_PACK[id].title + '.txt');
  if (!r.pack) { check(`${id} converts`, false, r.error); continue; }
  const p = r.pack;
  // The converter cleans the text before scanning (Symbol-font letters mapped, stray control codes such as
  // U+009D removed); the packs were cleaned afterwards. So a sentence next to such a character can fall
  // into a different voice note: ≥ 99 % of the notes must be word-for-word the same, and the chapters,
  // sections, key terms, summary and quiz must match in every chapter (one exception allowed per book).
  const fail = [];
  if (p.chapters.length !== ref.chapters.length) fail.push(`chapters ${p.chapters.length} ≠ ${ref.chapters.length}`);
  const notesA = new Map(), notesB = new Map();
  let diffCh = 0;
  if (!fail.length) p.chapters.forEach((c, i) => {
    const rc = ref.chapters[i];
    for (const x of c.notes) notesA.set(c.n + strip(x.t), 1);
    for (const x of rc.notes) notesB.set(c.n + strip(x.t), 1);
    const d = [];
    if (strip(c.title) !== strip(rc.title)) d.push('title');
    if (c.sections.length !== rc.sections.length) d.push('sections');
    if (`${c.startPage}-${c.endPage}` !== `${rc.startPage}-${rc.endPage}`) d.push('pages');
    if (c.terms.map((x) => x.t).join('|') !== rc.terms.map((x) => x.t).join('|')) d.push('terms');
    if (c.summary.map((x) => strip(x.t)).join('|') !== rc.summary.map((x) => strip(x.t)).join('|')) d.push('summary');
    if (c.quiz.map((x) => strip(x.q) + x.a).join('|') !== rc.quiz.map((x) => strip(x.q) + x.a).join('|')) d.push('quiz');
    if (d.length) { diffCh++; if (diffCh > 1 || d.includes('title') || d.includes('pages')) fail.push(`ch ${c.n}: ${d.join(', ')}`); }
  });
  let both = 0; for (const k of notesA.keys()) if (notesB.has(k)) both++;
  const shared = both / Math.max(notesA.size, notesB.size, 1);
  if (shared < 0.99) fail.push(`only ${(shared * 100).toFixed(1)} % of notes the same`);
  const ok = !fail.length;
  check(`${id}: same chapters, notes, terms, summary and quiz as the NCERT pack`, ok, fail.join(' · ') || `${p.chapters.length} chapters · ${p.notes} notes (${(shared * 100).toFixed(2)} % identical) · ${Date.now() - t0} ms`);

  // ───────── 2 · MCQs and holograms ─────────
  let bad = [], mcqs = 0, holoCh = 0, own = 0, holos = 0;
  const cur = JSON.parse(fs.readFileSync(path.join(CONTENT, 'curriculum.json'), 'utf8'));
  const cl = cur.subjects.flatMap((s) => s.classes).find((c) => c.pack === id);
  for (const c of p.chapters) {
    for (const q of c.mcq) {
      mcqs++;
      const low = q.q.toLowerCase();
      const why = !Array.isArray(q.o) || q.o.length < 4 || q.o.length > 5 ? 'options' :
        new Set(q.o.map((o) => o.toLowerCase())).size !== q.o.length ? 'duplicate options' :
        !(q.a >= 0 && q.a < q.o.length) ? 'answer index' :
        !q.q.includes('______') ? 'no blank' :
        new RegExp('\\b' + q.o[q.a].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(q.q) ? 'answer visible' :
        q.o.some((o, k) => k !== q.a && new RegExp('\\b' + o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(low)) ? 'option visible' :
        !q.h || !(q.p > 0) ? 'hint/page' : '';
      if (why) bad.push(`ch ${c.n}: ${why}: ${q.q.slice(0, 60)}`);
    }
    if (c.holograms.length) holoCh++;
    holos += c.holograms.length;
    const truth = new Set((cl.chapters.find((x) => x.no === c.n) || { holograms: [] }).holograms.map((h) => h.hash));
    own += c.holograms.filter((h) => truth.has(h.hash)).length;
    const want = truth.size;
    if (want && !c.holograms.some((h) => truth.has(h.hash))) bad.push(`ch ${c.n}: none of its ${want} NCERT holograms`);
  }
  check(`${id}: ${mcqs} MCQs well formed, holograms matched`, bad.length === 0 && mcqs >= p.chapters.length * 5, bad.slice(0, 6).join(' · ') || `${holoCh}/${p.chapters.length} chapters with holograms, ${own}/${holos} the chapter's own`);
  const up = r.steps.every((f, i) => i === 0 || f >= r.steps[i - 1]);
  check(`${id}: progress only goes up and ends at 1`, up && r.steps[r.steps.length - 1] === 1, `${r.steps.length} steps`);
}

// ───────── 3 · files that cannot become a book ─────────
const err = async (what, blob, name, want) => { const r = await convert(blob, name); check(`${what} → a message`, !!r.error && want.test(r.error), r.error || 'no error'); };
await err('a picture', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'photo.png', /not a PDF/);
await err('an empty file', new Blob([], { type: 'text/plain' }), 'empty.txt', /empty/);
await err('two lines of text', new Blob(['Just a short note.\nNothing else.'], { type: 'text/plain' }), 'note.txt', /too short/);
await err('Hindi text', new Blob(['प्रकाश का परावर्तन तथा अपवर्तन '.repeat(80)], { type: 'text/plain' }), 'hindi.txt', /not in English/);
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails);
