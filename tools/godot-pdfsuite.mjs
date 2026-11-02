#!/usr/bin/env node
// How cleanly "Add a PDF" divides real textbooks: converts every PDF in a folder with the built converter
// (build/godot-web/import) in headless Edge/Chrome and scores each result.
//   node tools/godot-pdfsuite.mjs <folder> [--json out.json]
// NCERT chapter files (kebo102.pdf …) are checked against the curriculum: one chapter, its NCERT title, its
// NCERT holograms. Every file is checked for what a clean book needs — sections, voice notes, MCQs — and for
// what printed textbooks leave behind: glued words, running heads, the contents list, fake-bold repeats.
// A whole book (several chapters in one PDF) named after a pack (biology11*.pdf …) is checked for chapters.
// Exit code = files that are not clean.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openConverter } from './lib/edge-convert.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'build', 'godot-web');
const argv = process.argv.slice(2);
const DIR = path.resolve(argv[0] || '.');
const JSON_OUT = argv.includes('--json') ? path.resolve(argv[argv.indexOf('--json') + 1]) : '';
const files = fs.readdirSync(DIR).filter((f) => /\.pdf$/i.test(f)).sort();
if (!fs.existsSync(path.join(WEB, 'import', 'holostudy-import.js'))) { console.error('run node tools/godot-build.mjs first'); process.exit(1); }
const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'godot', 'content', 'curriculum.json'), 'utf8'));
const dict = new Set(fs.readFileSync(path.join(WEB, 'import', 'words.txt'), 'utf8').split(/\s+/));

// NCERT file code → curriculum chapter (same rule as the converter)
const PACK = { keph: 'physics11', leph: 'physics12', kech: 'chemistry11', lech: 'chemistry12', kebo: 'biology11', lebo: 'biology12' };
const PART1 = { keph: 7, leph: 8, kech: 6, lech: 5 };
const chaptersOf = (pack) => cur.subjects.flatMap((s) => s.classes).find((c) => c.pack === pack)?.chapters || [];
function expected(name) {
  const m = name.toLowerCase().match(/^([kl]e(?:ph|ch|bo))([12])(\d{2})(?!\d)/);
  if (m) { const no = (m[2] === '2' ? PART1[m[1]] || 0 : 0) + +m[3]; const ch = chaptersOf(PACK[m[1]]).find((c) => c.no === no); return ch ? { kind: 'chapter', title: ch.title, holos: (ch.holograms || []).map((h) => h.hash) } : null; }
  const b = name.toLowerCase().match(/^(physics|chemistry|biology)(11|12)/);
  if (b) return { kind: 'book', chapters: chaptersOf(b[1] + b[2]).map((c) => c.title) };
  return null;
}
const norm = (s) => String(s).toLowerCase().replace(/[^a-z]+/g, ' ').trim();

const conv = await openConverter({ webRoot: WEB, name: 'pdfsuite' });
let unclean = 0;
const rows = [];
try {
  console.log('file              s  pages ch  sections notes mcq holo   glued heads toc dup  title / problems');
  for (const f of files) {
    const t0 = Date.now();
    const out = await conv.convert(path.join(DIR, f), f);
    const secs = (Date.now() - t0) / 1000, want = expected(f), problems = [];
    if (out.error) { rows.push({ file: f, error: out.error }); unclean++; console.log(`${f.padEnd(16)} could not be added: ${out.error}`); continue; }
    const p = out.pack;
    const notes = p.chapters.flatMap((c) => c.notes.map((n) => n.t));
    const text = notes.join(' ');
    const words = text.split(/\s+/).length || 1;
    // glued words: a long run the dictionary does not know with two little words inside ("thereactionmechanismsof"),
    // not a long name ("chloramphenicol", "tetrachloromethane")
    const glued = (text.match(/[A-Za-z]{15,}/g) || []).filter((w) => !dict.has(w.toLowerCase()) && (w.toLowerCase().match(/the|and|of|is|to|in|that|which|with|for|are|was|by|on/g) || []).length >= 3).length;
    // running heads: "MOTION IN A PLANE29", "195Alcohols, Phenols and Ethers", "10 B Since …" (not "ATP18" or "CH3")
    const headKeys = {};
    for (const m of text.matchAll(/\b([A-Z]{3,}(?: [A-Z]{2,})+) ?\d{1,3}\b|\b\d{2,3}([A-Z][a-z]{3,}(?:,? (?:and )?[A-Z][a-z]+)+)|(?:^|\. )\d{1,3} ([A-Z]) (?=[a-z])/g)) { const k = m[1] || m[2] || m[3]; headKeys[k] = (headKeys[k] || 0) + 1; }
    const heads = Object.values(headKeys).filter((n) => n >= 3).reduce((a, n) => a + n, 0); // a running head repeats page after page
    // contents left in the text: 3+ numbered titles in a row, each under 70 characters (before the exercises)
    let toc = 0;
    for (const c of p.chapters) {
      for (const b of c.blocks) {
        if (b.k !== 'p' && /exercises|questions/i.test(b.t)) break;
        const at = [...b.t.matchAll(/\b(\d{1,2})\.(\d{1,2})\s?[A-Z]/g)].map((m) => ({ i: m.index, n: +m[2] }));
        let run = 1;
        for (let k = 1; k < at.length; k++) { // (numbered questions — "2.7 Why does …?" — are not contents)
          run = at[k].n === at[k - 1].n + 1 && at[k].i - at[k - 1].i < 70 && !b.t.slice(at[k - 1].i, at[k].i).includes('?') ? run + 1 : 1;
          if (run >= 3) { toc++; break; }
        }
      }
    }
    const dup = (text.match(/(.{15,80}?)\1{2,}/g) || []).filter((m) => /[A-Za-z]{4}/.test(m)).length; // fake bold prints a phrase 3–5 times (a label twice is fine)
    const secs_ = p.chapters.reduce((a, c) => a + c.sections.length, 0);
    const mcq = p.chapters.reduce((a, c) => a + c.mcq.length, 0);
    const holos = [...new Set(p.chapters.flatMap((c) => c.holograms.map((h) => h.hash)))];
    let holoTxt = String(holos.length);
    if (want && want.kind === 'chapter') {
      if (p.chapters.length !== 1) problems.push(`${p.chapters.length} chapters`);
      if (norm(p.chapters[0].title) !== norm(want.title)) problems.push(`title "${p.chapters[0].title}" ≠ "${want.title}"`);
      const got = want.holos.filter((h) => holos.includes(h)).length;
      holoTxt = `${got}/${want.holos.length}`;
      if (got < want.holos.length) problems.push(`holograms ${got}/${want.holos.length}`);
    }
    if (want && want.kind === 'book') {
      const titles = p.chapters.map((c) => norm(c.title)), hit = want.chapters.filter((t) => titles.includes(norm(t))).length;
      if (p.chapters.length !== want.chapters.length) problems.push(`${p.chapters.length} chapters, the book has ${want.chapters.length}`);
      if (hit < want.chapters.length) problems.push(`${hit}/${want.chapters.length} chapter titles right`);
    }
    const perCh = secs_ / p.chapters.length;
    if (perCh < 3) problems.push('few sections');
    if (mcq < 10 * p.chapters.length * 0.8) problems.push('few MCQs');
    if (glued / words * 1000 > 2) problems.push('glued words');
    if (heads) problems.push('running heads left');
    if (toc) problems.push('contents left in the text');
    if (dup) problems.push('repeated text');
    if (out.back || out.last !== 1) problems.push('progress went back or did not end at 100 %');
    const empty = p.chapters.reduce((a, c) => a + c.sections.filter((s, k) => !c.notes.some((n) => n.s === k)).length, 0);
    if (problems.length) unclean++;
    rows.push({ file: f, secs, pages: p.source.pages, chapters: p.chapters.length, sections: secs_, empty, notes: notes.length, mcq, holos: holoTxt, glued, heads, toc, dup, title: p.title, chapterTitles: p.chapters.map((c) => c.title), sectionTitles: p.chapters.map((c) => c.sections.map((s) => s.t)), problems });
    console.log(`${f.padEnd(16)} ${secs.toFixed(1).padStart(4)} ${String(p.source.pages).padStart(4)} ${String(p.chapters.length).padStart(3)} ${String(secs_).padStart(5)}${empty ? `(${empty}∅)` : '    '} ${String(notes.length).padStart(5)} ${String(mcq).padStart(4)} ${holoTxt.padStart(5)} ${String(glued).padStart(6)} ${String(heads).padStart(5)} ${String(toc).padStart(3)} ${String(dup).padStart(3)}  ${problems.length ? '✗ ' + problems.join('; ') : '✓ ' + p.title}`);
  }
  const ok = rows.filter((r) => !r.error && !r.problems.length).length;
  console.log(`\n${ok} of ${rows.length} clean · ${rows.reduce((a, r) => a + (r.pages || 0), 0)} pages · ${rows.reduce((a, r) => a + (r.notes || 0), 0)} voice notes · ${rows.reduce((a, r) => a + (r.mcq || 0), 0)} MCQs · ${rows.reduce((a, r) => a + (r.secs || 0), 0).toFixed(0)} s`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
} finally {
  await conv.close();
}
process.exit(unclean);
