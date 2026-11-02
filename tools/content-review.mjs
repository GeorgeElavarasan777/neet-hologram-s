#!/usr/bin/env node
// Checks the study items of the built-in NCERT books — key terms, key points (= the summary), the recall quiz and
// the practice MCQs — against the official chapter PDFs, as the study console's scanner makes them from
// engines/study/holostudy-demos.js. The scanner runs here through the "Add a PDF" bundle in Node (as
// tools/test-import.mjs does), so the items are exactly the app's.
//   Stage A, rules (no API):
//     A1 sections — every heading the PDF prints (tools/lib/ncert-pdf.mjs) is a section; a missing one is an
//        open failure
//     A2 leans on the sentence before — the converter's own LEANS / LEAD ("This kingdom…", "Hence the…") → remove
//     A3 question mechanics — one answer among distinct options, the blank there, no option in the question
//        (tools/test-import.mjs's rules) → remove
//   Stage B / C (TypeSafe judgments, keep / remove): Phase 2 of docs/egm/design_draft.md — not built yet.
//   node tools/content-review.mjs [--only <pack>] [--no-judge]   → data/content-review/REPORT.md
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { bundle } from './godot-import.mjs';
import { PREFIX, codeOf, findPdf, pdfFacts, cmpNum } from './lib/ncert-pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'godot', 'content');
const REPORT = path.join(ROOT, 'data', 'content-review', 'REPORT.md');
const argv = process.argv.slice(2);
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';
const MCQ_GOAL = 20, MCQ_FLOOR = 10; // G4: ≥ 20 per chapter in ≥ 70 of 79 chapters, every chapter ≥ 10
if (!fs.existsSync(path.join(CONTENT, 'holo', 'index.json'))) { console.error('godot/content is missing — run: node tools/godot-build.mjs --content'); process.exit(1); }
if (!argv.includes('--no-judge')) console.log('Stage B (TypeSafe) is not built yet — running Stage A only.\n');

// ───────── the scanner, through the bundle in a page-less browser (as tools/test-import.mjs) ─────────
const ctx = {
  console, setTimeout, clearTimeout, URL, Blob, File, TextDecoder, TextEncoder, DOMException, performance,
  navigator: { deviceMemory: 8 },
  requestAnimationFrame: (f) => setTimeout(f, 0),
  fetch: async (u) => {
    const f = path.join(CONTENT, decodeURIComponent(new URL(u).pathname).replace(/^.*\/content\//, ''));
    if (!fs.existsSync(f)) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(f, 'utf8')) };
  },
};
ctx.window = ctx;
ctx.document = { currentScript: { src: 'http://holo.test/import/holostudy-import.js' }, visibilityState: 'hidden', addEventListener() {}, createElement() { return {}; }, head: { appendChild() {} }, body: { appendChild() {} } };
vm.createContext(ctx);
vm.runInContext(bundle(), ctx, { filename: 'holostudy-import.js' });
const HI = ctx.HoloImport, { LEANS, LEAD } = HI._test;
const convert = (text, name) => new Promise((resolve) => {
  HI.convertBlob(new Blob([text], { type: 'text/plain' }), name, { onStarted() {}, onProgress() {}, onDone: (j) => resolve(JSON.parse(j)), onError: (m) => resolve({ error: m }), onCancelled: () => resolve({ error: 'cancelled' }) });
});

// ───────── Stage A ─────────
const leans = (t) => LEANS.test(String(t).trim()) || LEAD.test(String(t).trim());
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// tools/test-import.mjs's MCQ rules; the recall quiz has no after-answer hint
function mechanics(q, { needHint }) {
  const opts = q.o || [];
  if (!Array.isArray(opts) || opts.length < 3 || opts.length > 5) return 'options';
  if (new Set(opts.map((o) => String(o).toLowerCase())).size !== opts.length) return 'duplicate options';
  if (!(q.a >= 0 && q.a < opts.length)) return 'answer index';
  if (!String(q.q).includes('______')) return 'no blank';
  if (new RegExp('\\b' + esc(opts[q.a]) + '\\b', 'i').test(q.q)) return 'answer visible';
  if (opts.some((o, k) => k !== q.a && new RegExp('\\b' + esc(o) + '\\b', 'i').test(q.q))) return 'option visible';
  if (needHint && (!q.h || !(q.p > 0))) return 'hint/page';
  return '';
}
// a question opening on its blank ("______ are cosmopolitan…") is read for leaning without the blank
const leansQ = (q) => leans(String(q).replace(/^_+\s*/, 'X '));

const demo = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'engines', 'study', 'holostudy-demos.js'), 'utf8'), { window: demo });
const packs = Object.keys(PREFIX).filter((id) => !ONLY || id === ONLY);
const rows = [], open = [], removed = { term: [], point: [], quiz: [], mcq: [] };
const T = { chapters: 0, printed: 0, missing: 0, terms: 0, points: 0, quiz: 0, mcq: 0 };
for (const id of packs) {
  const src = demo.DEMO_PACK[id];
  const p = await convert(src.text, src.title + '.txt');
  if (p.error) { console.error(`${id}: ${p.error}`); process.exit(1); }
  for (const c of p.chapters) {
    const code = codeOf(id, c.n), file = findPdf(code);
    const facts = file ? pdfFacts(file, c.n) : { printed: new Map() };
    const have = new Set(c.sections.map((s) => (String(s.t).match(/^(\d{1,2}(?:\.\d{1,2}){1,2})\s/) || [])[1]).filter(Boolean));
    const missing = file ? [...facts.printed.keys()].filter((n) => !have.has(n)).sort(cmpNum) : ['(PDF not found)'];
    for (const n of missing) open.push(`${code} ${c.n}. ${c.title}: section ${n} ${facts.printed.get(n) || ''} not in the text`);
    const out = (kind, item, why) => removed[kind].push(`${code} p.${item.p || '?'} — ${why}: ${String(item.t || item.q).slice(0, 110)}`);
    const terms = c.terms.filter((t) => { if (leans(t.d)) { out('term', { t: `${t.t}: ${t.d}`, p: t.p }, 'definition leans on the sentence before'); return false; } return true; });
    const points = c.summary.filter((s) => { if (leans(s.t)) { out('point', s, 'leans on the sentence before'); return false; } return true; });
    const kept = new Set(terms.map((t) => String(t.t).toLowerCase()));
    const quiz = c.quiz.filter((q) => {
      const why = !kept.has(String(q.term).toLowerCase()) ? 'its key term was removed' : leansQ(q.q) ? 'leans on the sentence before' : mechanics(q, { needHint: false });
      if (why) { out('quiz', q, why); return false; } return true;
    });
    const mcq = c.mcq.filter((q) => {
      const why = leansQ(q.q) ? 'leans on the sentence before' : mechanics(q, { needHint: true });
      if (why) { out('mcq', q, why); return false; } return true;
    });
    rows.push({ id, code, n: c.n, title: c.title, printed: facts.printed.size, sections: c.sections.length, missing,
      terms: [terms.length, c.terms.length], points: [points.length, c.summary.length], quiz: [quiz.length, c.quiz.length], mcq: [mcq.length, c.mcq.length] });
    T.chapters++; T.printed += facts.printed.size; T.missing += missing.length;
    T.terms += c.terms.length - terms.length; T.points += c.summary.length - points.length; T.quiz += c.quiz.length - quiz.length; T.mcq += c.mcq.length - mcq.length;
    console.log(`${code.padEnd(8)} ${String(c.n).padStart(2)}. ${c.title.slice(0, 38).padEnd(38)} sections ${String(c.sections.length).padStart(3)} (missing ${missing.length}) · terms ${terms.length}/${c.terms.length} · points ${points.length}/${c.summary.length} · quiz ${quiz.length}/${c.quiz.length} · MCQs ${String(mcq.length).padStart(2)}/${c.mcq.length}`);
  }
}

// ───────── report ─────────
const atGoal = rows.filter((r) => r.mcq[0] >= MCQ_GOAL).length, belowFloor = rows.filter((r) => r.mcq[0] < MCQ_FLOOR);
const g4 = atGoal >= Math.ceil(rows.length * 70 / 79) && !belowFloor.length;
const lines = [
  '# Content review of the built-in NCERT books', '',
  `Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · Stage A (rules) only — Stage B/C (TypeSafe) is Phase 2`, '',
  `**${T.chapters} chapters** · open failures: **${open.length}** (sections the PDFs print that are not in the text) · removed by Stage A: ${T.terms} key terms, ${T.points} key points, ${T.quiz} recall quiz items, ${T.mcq} practice MCQs`, '',
  `**Practice MCQs (G4):** ${atGoal} of ${rows.length} chapters have ≥ ${MCQ_GOAL} after Stage A; ${belowFloor.length} below ${MCQ_FLOOR}${belowFloor.length ? ` (${belowFloor.map((r) => r.code).join(', ')})` : ''} → ${g4 ? 'met before Stage B' : '**not met**'}`, '',
  '| Chapter | Sections (printed) | Key terms | Key points | Recall quiz | Practice MCQs |', '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.code} ${r.n}. ${r.title} | ${r.sections} (${r.printed})${r.missing.length ? ` · missing ${r.missing.join(', ')}` : ''} | ${r.terms[0]}/${r.terms[1]} | ${r.points[0]}/${r.points[1]} | ${r.quiz[0]}/${r.quiz[1]} | ${r.mcq[0] < MCQ_GOAL ? `**${r.mcq[0]}**` : r.mcq[0]}/${r.mcq[1]} |`),
  '', '## Open failures', '', ...(open.length ? open.map((o) => `- ${o}`) : ['None.']),
  '', '## Removed by Stage A', '',
  ...Object.entries({ term: 'Key terms', point: 'Key points', quiz: 'Recall quiz items', mcq: 'Practice MCQs' }).flatMap(([k, h]) => [`### ${h} (${removed[k].length})`, '', ...(removed[k].length ? removed[k].map((x) => `- ${x}`) : ['None.']), '']),
];
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, lines.join('\n') + '\n');
console.log(`\n${T.chapters} chapters · open failures ${open.length} · removed: ${T.terms} terms, ${T.points} key points, ${T.quiz} quiz, ${T.mcq} MCQs`);
console.log(`practice MCQs: ${atGoal}/${rows.length} chapters ≥ ${MCQ_GOAL}, ${belowFloor.length} below ${MCQ_FLOOR} → G4 ${g4 ? 'met' : 'not met'} · report ${path.relative(ROOT, REPORT)}`);
