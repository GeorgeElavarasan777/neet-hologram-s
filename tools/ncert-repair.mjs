#!/usr/bin/env node
// Repairs the built-in books' text (engines/study/holostudy-demos.js) against the official NCERT chapter PDFs,
// without changing a word of it:
//   1 section headings the PDF prints but the text lost are put back — where the text has the number on its
//     own ("8.5.1", then "Cell Membrane The detailed…") the two are joined into "### 8.5.1 Cell Membrane";
//     where it has no number ("Dinoflagellates These organisms…") the heading goes before that paragraph
//   2 a "[[page N]]" marker on every page (the text had one per chapter, so pages inside a chapter were
//     estimated): N = the earlier chapters' PDF pages + the page in this PDF, where that page's words begin
//   3 checks: the words are the same as before (headings and markers aside); printed headings still missing;
//     page numbers the PDF prints that disagree with N
// The PDFs are read with pdftotext (Poppler; comes with Git for Windows), not with the app's own converter, so
// the check does not share the converter's blind spots. They are found under the "roots" of
// data/ncert-sources.json, which records each file's SHA-256 and pages; a changed file stops the run (--rehash).
//   node tools/ncert-repair.mjs [--only <pack>] [--rehash]  → holostudy-demos.new.js + data/content-review/repair.md
//   node tools/ncert-repair.mjs --accept                      → the .new.js replaces holostudy-demos.js
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMOS = path.join(ROOT, 'engines', 'study', 'holostudy-demos.js');
const NEW = DEMOS.replace(/\.js$/, '.new.js');
const SOURCES = path.join(ROOT, 'data', 'ncert-sources.json');
const REPORT = path.join(ROOT, 'data', 'content-review', 'repair.md');
const argv = process.argv.slice(2);
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '';

const readDemos = (file) => { const w = {}; new Function('window', fs.readFileSync(file, 'utf8'))(w); return w.DEMO_PACK; };
if (argv.includes('--accept')) {
  if (!fs.existsSync(NEW)) { console.error('nothing to accept — run node tools/ncert-repair.mjs first'); process.exit(1); }
  fs.renameSync(NEW, DEMOS);
  console.log('engines/study/holostudy-demos.js replaced. Next: node tools/godot-build.mjs --content, then python tools/godot-fonts.py');
  process.exit(0);
}

// ───────── which file is which chapter (the converter's rule: driver.js NCERT_PACK / NCERT_PART1) ─────────
const PREFIX = { physics11: 'keph', physics12: 'leph', chemistry11: 'kech', chemistry12: 'lech', biology11: 'kebo', biology12: 'lebo' };
const PART1 = { keph: 7, leph: 8, kech: 6, lech: 5 };
const codeOf = (pack, n) => { const p = PREFIX[pack], k = PART1[p]; return k && n > k ? `${p}2${String(n - k).padStart(2, '0')}` : `${p}1${String(n).padStart(2, '0')}`; };
const sources = fs.existsSync(SOURCES) ? JSON.parse(fs.readFileSync(SOURCES, 'utf8')) : {
  roots: ['C:/Users/SSIG FAMILY/Documents/cbse/biology/biologyyy', 'C:/Users/SSIG FAMILY/Documents/cbse/chemistry/chem', 'C:/Users/SSIG FAMILY/Documents/cbse/physics/phy'],
  files: {},
};
const findPdf = (code) => sources.roots.map((r) => path.join(r, code + '.pdf')).find((f) => fs.existsSync(f));

// ───────── words ─────────
const norm = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);
const numKey = (n) => n.split('.').map(Number);
const cmpNum = (a, b) => { const x = numKey(a), y = numKey(b); for (let i = 0; i < 3; i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; } return 0; };

// ───────── what the PDF prints (pdftotext, reading order and layout) ─────────
const ENDS = /^\s*(additional exercises|exercises|points to ponder|summary)\s*$/i;
// questions and formulas numbered like sections (in-text questions, exercises) are not headings
const NOT_TITLE = /^(which|what|how|why|when|where|who|whose|find|show|explain|give|state|calculate|prove|derive|describe|discuss|define|draw|write|predict|arrange|name|identify|comment|suggest|differentiate|distinguish|compare|use|complete|illustrate|based|amongst|among|consider|plot|list|mention|account|out of|in which|is|are|does|do|can|will|would|if|a|an|the following|assuming|assume|at|for the|from|given|on|using|estimate|determine|obtain|answer|choose|match|fill|read|look|two|three|one)\b/i;
function headingAt(num, title, chapterNo) {
  if (+num.split('.')[0] !== chapterNo) return null;
  const t = title.replace(/\s+/g, ' ').trim();
  if (!/^[A-Z]/.test(t) || /=|→|⎯|\.\s*$/.test(t) || /^[A-Z][a-z]?\d|^\S*[\d(\[]/.test(t) || t.split(' ').length > 14) return null;
  // a heading is set in capitals or Title Case ("HOW MANY TYPES OF PIGMENTS…?", "How do Enzymes bring about such
  // High Rates…?"); a question in sentence case ("What is the effect of…?") is an exercise
  const big = t.split(' ').filter((w) => /^[A-Za-z]{4,}/.test(w));
  const titleLike = !/[a-z]/.test(t) || (big.length && big.filter((w) => /^[A-Z]/.test(w)).length / big.length >= 0.6);
  if (!titleLike && (/\?/.test(t) || NOT_TITLE.test(t))) return null;
  return t;
}
function pdfFacts(file, chapterNo) {
  const run = (args) => execFileSync('pdftotext', [...args, '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const raw = run([]).split('\f'), layout = run(['-layout']).split('\f');
  // every "2.2.2 Title" in reading order; a contents line can hold several ("5.2 The Stem 5.3 The Leaf"), and a
  // title can carry a figure's labels after it ("Dinoflagellates (a)")
  const scan = (pages, cutColumns) => {
    const found = [];
    let stop = false;
    for (const pg of pages) {
      const ls = pg.split('\n');
      for (let i = 0; i < ls.length; i++) {
        const line = cutColumns ? ls[i].replace(/\s{2,}.*$/, '') : ls[i];
        if (ENDS.test(line)) { stop = true; break; }
        if (/\b(Figure|Fig\.|Table)\s*$/i.test((ls[i - 1] || '').trim())) continue; // "Figure" ⏎ "11.4 The light harvesting complex" is a caption
        let pieces = [], next = i + 1;
        if (/^\s*\d{1,2}(?:\.\d{1,2}){1,2}\s*$/.test(line)) { // number and title on separate lines
          while (next < ls.length && !ls[next].trim()) next++;
          if (next < ls.length) pieces = [[line.trim(), ls[next].trim()]];
          next++;
        } else if (/^\s*\d{1,2}(?:\.\d{1,2}){1,2}\s+\S/.test(line)) pieces = [...line.matchAll(/(\d{1,2}(?:\.\d{1,2}){1,2})\s+(.+?)(?=\s+\d{1,2}(?:\.\d{1,2}){1,2}\s+[A-Z]|\s*$)/g)].map((m) => [m[1], m[2]]);
        for (const [num, title] of pieces) {
          const t = headingAt(num, title.replace(/(\s+\([a-z]\))+\s*$|\s+(Figure|Fig\.|Table)\s+\d.*$/, ''), chapterNo);
          if (!t) continue;
          // the words that follow the heading (where it goes when the text lost it altogether)
          const after = [];
          for (let j = next; j < ls.length && after.length < 8; j++) { const w = words(ls[j]); if (w.length >= 6) after.push(...w); }
          found.push({ num, title: t, after: after.slice(0, 8) });
        }
      }
      if (stop) break;
    }
    return found;
  };
  // the body's headings: the longest run of numbers that go up in reading order — the contents box at the start
  // (2.1 … 2.6) and in-text questions (numbered 2.1, 2.2 … again) fall outside it
  const lis = (seq) => {
    const tails = [], prev = new Array(seq.length);
    seq.forEach((s, i) => {
      let lo = 0, hi = tails.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cmpNum(seq[tails[mid]].num, s.num) < 0) lo = mid + 1; else hi = mid; }
      prev[i] = lo ? tails[lo - 1] : -1;
      tails[lo] = i;
    });
    const out = [];
    for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) out.push(seq[i]);
    return out.reverse();
  };
  const body = lis(scan(raw, false));
  const printed = new Map(body.map((f) => [f.num, f.title]));
  const after = new Map(body.map((f) => [f.num, f.after]));
  for (const f of lis(scan(layout, true))) if (!printed.has(f.num)) printed.set(f.num, f.title); // read only side by side
  const sorted = [...printed].sort((a, b) => cmpNum(a[0], b[0]));
  printed.clear();
  for (const [n, t] of sorted) printed.set(n, t);
  // each page's opening words (6-word runs from its prose lines) and the page number it prints
  const pages = raw.slice(0, raw.length - (raw[raw.length - 1].trim() ? 0 : 1)).map((pg) => {
    const ls = pg.split('\n').map((l) => l.trim()).filter(Boolean);
    const runs = [];
    for (const l of ls) {
      const w = words(l);
      if (w.length < 8 || /^reprint/i.test(l)) continue;
      for (let i = 0; i + 6 <= Math.min(w.length, 30) && runs.length < 6; i += 6) runs.push(w.slice(i, i + 6).join(' '));
      if (runs.length >= 6) break;
    }
    let num = null;
    for (const l of [ls[0], ls[ls.length - 1], ls[ls.length - 2]]) { const m = l && l.match(/^(\d{1,3})$/); if (m) { num = +m[1]; break; } }
    return { runs, num };
  });
  return { printed, after, pages };
}

// ───────── repair one chapter ─────────
const HEAD_LINE = /^(#{2,3}) (\d{1,2}(?:\.\d{1,2}){1,2}) (.*)$/;
// headings printed in capitals read like the text's other headings: "TRANSPORT OF GASES" → "Transport of Gases"
const SMALL = new Set('a an and as at by for from in into of on or the to via with'.split(' '));
const pretty = (t) => (/[a-z]/.test(t) ? t : t.split(' ').map((w, i) => (i && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.split('-').map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join('-'))).join(' '));
// what study.html textToBlocks reads as a heading or chapter (CHAPTER_RE, NUMBERED_RE, a short line in capitals)
const CHAPTER_RE = /^(chapter|unit|lesson|module|part|section)\s+(\d{1,3}|[ivxlc]{1,6}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i;
const NUMBERED_RE = /^(\d{1,2})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\s+([A-Z][^.]{2,80})$/;
const misreadAsHeading = (l) => (CHAPTER_RE.test(l) && l.length < 90) || (NUMBERED_RE.test(l) && l.length < 80) || (/^[A-Z][A-Z0-9 ,'&\-–:]{5,60}$/.test(l) && /[A-Z]{3}/.test(l));
const BARE_NUM = /^\d{1,2}(?:\.\d{1,2}){1,2}$/;
const marker = (d) => '#'.repeat(d === 3 ? 3 : 2);
function titleAtStart(para, title) { // the paragraph starts with the title's words → [title as written, rest] or null
  const want = words(title);
  if (!want.length) return null;
  const toks = para.split(/\s+/);
  const got = [];
  let i = 0;
  for (; i < toks.length && got.length < want.length; i++) { const w = words(toks[i]); if (!w.length) continue; got.push(...w); }
  if (got.slice(0, want.length).join(' ') !== want.join(' ') || got.length !== want.length) return null;
  const rest = toks.slice(i).join(' ').trim();
  if (rest.split(/\s+/).length < 4) return null;
  return [toks.slice(0, i).join(' '), rest];
}
function repairChapter(chText, firstPage, facts, rep, added) {
  let paras = chText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const before = new Set(paras);
  // drop the old in-chapter page markers (the first one stays): new ones are placed from the PDF
  paras = paras.filter((p, i) => !/^\[\[page \d+\]\]$/.test(p) || i === 0);
  if (/^\[\[page \d+\]\]\nChapter /.test(paras[0])) { const [pm, ...rest] = paras[0].split('\n'); paras.splice(0, 1, pm, rest.join('\n')); }
  if (/^\[\[page \d+\]\]$/.test(paras[0])) paras[0] = `[[page ${firstPage}]]`;
  const have = () => new Set(paras.map((p) => (p.match(HEAD_LINE) || [])[2]).filter(Boolean));
  // 1a  a number on its own + the title opening the next paragraph
  for (let i = 0; i < paras.length - 1; i++) {
    if (!BARE_NUM.test(paras[i]) || have().has(paras[i])) continue;
    const num = paras[i], title = facts.printed.get(num);
    const hit = title && titleAtStart(paras[i + 1], title);
    if (!hit) { rep.unplaced.push(`${num} (number on its own; next paragraph does not start with “${title || '?'}”)`); continue; }
    paras.splice(i, 2, `${marker(num.split('.').length)} ${num} ${pretty(title)}`, hit[1]);
    rep.joined.push(`${num} ${pretty(title)}`);
  }
  // 1b  printed headings with no number in the text: before the paragraph that opens with the title,
  //     between the headings around it
  for (const [num, title] of facts.printed) {
    if (have().has(num)) continue;
    const heads = paras.map((p, i) => ({ i, n: (p.match(HEAD_LINE) || [])[2] })).filter((h) => h.n);
    const before = heads.filter((h) => cmpNum(h.n, num) < 0).pop(), after = heads.find((h) => cmpNum(h.n, num) > 0);
    const from = before ? before.i + 1 : 1, to = after ? after.i : paras.length;
    if (words(title).join('').length < 6) { rep.unplaced.push(`${num} ${title} (title too short to place safely)`); continue; }
    const head = (t) => `${marker(num.split('.').length)} ${num} ${t}`;
    let placed = false;
    // a paragraph that opens with the title
    for (let i = from; i < to && !placed; i++) {
      const hit = titleAtStart(paras[i], title);
      if (!hit) continue;
      paras.splice(i, 1, head(pretty(title)), hit[1]);
      rep.inserted.push(`${num} ${pretty(title)}`);
      placed = true;
    }
    // the heading inside a paragraph, after its number or the number's last part ("…not covered. 5ANGIOSPERMS Unlike…")
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // (its spaces may be gone: "…from the soil. 2THESTEM"; or a space follows: "…some clarity. 7 HARDY-Weinberg principle In…")
    const re = new RegExp(`(^|[\\s.;:,)])(?:${esc(num)}\\s*|${num.split('.').pop()} ?(?=[A-Za-z]))(${title.split(/\s+/).map(esc).join('\\s*')})(?=\\s|$)`, 'i');
    for (let i = from; i < to && !placed; i++) {
      const m = /^#|^\[\[/.test(paras[i]) ? null : paras[i].match(re);
      if (!m) continue;
      const before = paras[i].slice(0, m.index + m[1].length).trim(), rest = paras[i].slice(m.index + m[0].length).trim();
      if (rest && rest.split(/\s+/).length < 4) continue;
      paras.splice(i, 1, ...(before ? [before] : []), head(pretty(title)), ...(rest ? [rest] : []));
      rep.inserted.push(`${num} ${pretty(title)}`);
      placed = true;
    }
    // lost altogether: before the words the PDF prints right after the heading
    const next = facts.after.get(num) || [];
    if (!placed && next.length >= 6) {
      const want = next.slice(0, 6);
      for (let i = from; i < to && !placed; i++) {
        if (/^#|^\[\[/.test(paras[i])) continue;
        const toks = paras[i].split(/\s+/), flat = [];
        toks.forEach((tk, k) => { for (const w of words(tk)) flat.push({ w, k }); });
        for (let j = 0; j + want.length <= flat.length && !placed; j++) {
          if (!want.every((w, q) => flat[j + q].w === w)) continue;
          const k = flat[j].k, before = toks.slice(0, k).join(' ').trim(), rest = toks.slice(k).join(' ').trim();
          const h = head(pretty(title));
          paras.splice(i, 1, ...(before ? [before] : []), h, rest);
          added.add(h);
          rep.inserted.push(`${num} ${title} (from the PDF)`);
          placed = true;
        }
      }
    }
    if (!placed) rep.unplaced.push(`${num} ${title}`);
  }
  // 1c  a piece the repair cut off that the study console would read as a heading or a chapter ("7 HARDY-Weinberg
  //     principle" on its own line is a chapter to it) goes back onto the paragraph before it
  for (let i = paras.length - 1; i > 0; i--) {
    if (before.has(paras[i]) || HEAD_LINE.test(paras[i]) || /^\[\[/.test(paras[i]) || !misreadAsHeading(paras[i])) continue;
    const j = [...Array(i).keys()].reverse().find((k) => !HEAD_LINE.test(paras[k]) && !/^\[\[|^Chapter /.test(paras[k]));
    if (j == null) continue;
    paras[j] += ' ' + paras[i];
    paras.splice(i, 1);
    rep.rejoined.push(paras[j].slice(-60));
  }
  // 2  page markers where each page's words begin (monotonic; a page with no prose shares the previous one)
  const flat = []; // word → paragraph index
  paras.forEach((p, i) => { if (/^\[\[page/.test(p)) return; for (const w of words(p)) flat.push({ w, i }); });
  const text = flat.map((x) => x.w), paraStart = new Map();
  flat.forEach((x, k) => { if (!paraStart.has(x.i)) paraStart.set(x.i, k); });
  const paraLen = (i) => flat.filter((x) => x.i === i).length;
  const marks = new Map(); // paragraph index → book page
  let pos = 0, lastPara = 0;
  facts.pages.forEach((pg, k) => {
    if (k === 0) return;
    for (const run of pg.runs) {
      const r = run.split(' ');
      let at = -1;
      for (let j = pos; j + r.length <= text.length && at < 0; j++) { let ok = true; for (let q = 0; q < r.length && ok; q++) ok = text[j + q] === r[q]; if (ok) at = j; }
      if (at < 0) continue;
      const p = flat[at].i, off = (at - paraStart.get(p)) / Math.max(1, paraLen(p));
      const target = off < 0.4 ? p : p + 1;
      if (target > lastPara && target < paras.length) { marks.set(target, firstPage + k); lastPara = target; }
      pos = at + 1;
      break;
    }
  });
  // a page that begins with a heading: the marker goes before the heading, not between it and its text
  for (const [i, pg] of [...marks]) if (i > 1 && HEAD_LINE.test(paras[i - 1]) && !marks.has(i - 1)) { marks.delete(i); marks.set(i - 1, pg); }
  rep.pagesMarked = marks.size;
  rep.pages = facts.pages.length;
  const out = [];
  paras.forEach((p, i) => { if (marks.has(i)) out.push(`[[page ${marks.get(i)}]]`); out.push(p); });
  // printed page numbers against the book pages
  facts.pages.forEach((pg, k) => { if (pg.num != null && pg.num !== firstPage + k) rep.pageBad.push(`PDF page ${k + 1} prints ${pg.num}, book page ${firstPage + k}`); });
  return out.join('\n\n');
}
// the text's words without section numbers (numbers, or a number's last part glued to a title, are what the
// repair removes), page markers and the headings taken from the PDF: must not change
// — compared letter by letter, so a title whose spaces were lost ("THESTEM") may become "The Stem"
const bodyWords = (t, added = new Set()) => t.split(/\n\s*\n/).filter((p) => !added.has(p.trim())).join('\n\n')
  .replace(/^\[\[page \d+\]\]$/gm, ' ').replace(/^#{2,3} \d{1,2}(?:\.\d{1,2}){1,2} /gm, ' ').toLowerCase().replace(/[^a-z]+/g, '');

const splitChapters = (text) => {
  const at = [...text.matchAll(/(?:^|\n)(\[\[page \d+\]\]\n)?Chapter (\d+):/g)].map((m) => ({ i: m.index + (m[0].startsWith('\n') ? 1 : 0), n: +m[2] }));
  return at.map((a, k) => ({ n: a.n, text: text.slice(a.i, k + 1 < at.length ? at[k + 1].i : text.length).trim() }));
};

// ───────── run ─────────
const old = readDemos(DEMOS);
const packs = Object.keys(PREFIX).filter((id) => !ONLY || id === ONLY);
if (ONLY && !packs.length) { console.error(`unknown pack ${ONLY} — one of ${Object.keys(PREFIX).join(', ')}`); process.exit(1); }
const next = JSON.parse(JSON.stringify(old));
const report = ['# Repair of the built-in NCERT text against the NCERT PDFs', '', `Run ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · PDFs from ${sources.roots.join(', ')}`, ''];
const tally = { chapters: 0, joined: 0, inserted: 0, unplaced: 0, pageBad: 0, pages: 0, pagesMarked: 0, changedWords: 0 };
let stop = false;
for (const id of packs) {
  const o = old[id], chapters = splitChapters(o.text), parts = [];
  let firstPage = 1;
  report.push(`## ${o.title}`, '');
  for (const ch of chapters) {
    const code = codeOf(id, ch.n), file = findPdf(code);
    const title = (ch.text.match(/Chapter \d+: (.*)/) || [])[1] || '';
    if (!file) { report.push(`- **${code}** ${ch.n}. ${title}: PDF not found — STOP`); stop = true; parts.push(ch.text); continue; }
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), known = sources.files[code];
    if (known && known.sha256 !== sha256 && !argv.includes('--rehash')) { report.push(`- **${code}**: the PDF changed since it was recorded — STOP; check it, then rerun with --rehash`); stop = true; parts.push(ch.text); continue; }
    const facts = pdfFacts(file, ch.n);
    // the printed numbers: a book in two parts numbers part 2 on from part 1's appendices and answers, so its
    // pages are the counted ones + a fixed offset; use the printed numbering where the PDF shows one clearly
    const diffs = new Map();
    facts.pages.forEach((pg, k) => { if (pg.num != null) { const d = pg.num - (firstPage + k); diffs.set(d, (diffs.get(d) || 0) + 1); } });
    const numbered = [...diffs.values()].reduce((a, n) => a + n, 0);
    const [offset, votes] = [...diffs].sort((a, b) => b[1] - a[1])[0] || [0, 0];
    const start = firstPage + (votes >= 3 && votes / numbered >= 0.6 ? offset : 0);
    const rep = { joined: [], inserted: [], unplaced: [], pageBad: [], rejoined: [] }, added = new Set();
    const fixed = repairChapter(ch.text, start, facts, rep, added);
    const same = bodyWords(ch.text) === bodyWords(fixed, added);
    if (!same) { tally.changedWords++; report.push(`- **${code}**: the repair changed the text's words — old text kept (a bug in the repair; see the code)`); }
    const headsNow = new Set([...fixed.matchAll(/^#{2,3} (\d+(?:\.\d+){1,2}) /gm)].map((m) => m[1]));
    const missing = [...facts.printed.keys()].filter((n) => !headsNow.has(n));
    sources.files[code] = { sha256, pages: facts.pages.length, pack: id, chapter: ch.n, firstPage: start };
    report.push(`- **${code}** · ${ch.n}. ${title} · book pages ${start}–${start + facts.pages.length - 1}${start !== firstPage ? ` (printed numbering, +${start - firstPage})` : ""} · page markers ${rep.pagesMarked + 1}/${facts.pages.length}`);
    report.push(`  - headings: ${headsNow.size} in the text, ${facts.printed.size} printed${rep.joined.length ? ` · joined: ${rep.joined.join('; ')}` : ''}${rep.inserted.length ? ` · inserted: ${rep.inserted.join('; ')}` : ''}${missing.length ? ` · **still missing: ${missing.map((n) => n + ' ' + facts.printed.get(n)).join('; ')}**` : ''}`);
    if (rep.unplaced.length) report.push(`  - could not place: ${rep.unplaced.join('; ')}`);
    if (rep.pageBad.length) report.push(`  - **printed page numbers disagree:** ${rep.pageBad.slice(0, 4).join('; ')}${rep.pageBad.length > 4 ? ` … (${rep.pageBad.length})` : ''}`);
    tally.chapters++; tally.joined += rep.joined.length; tally.inserted += rep.inserted.length; tally.unplaced += missing.length; tally.pageBad += rep.pageBad.length; tally.pages += facts.pages.length; tally.pagesMarked += rep.pagesMarked + 1;
    console.log(`${code.padEnd(8)} ${String(ch.n).padStart(2)}. ${title.slice(0, 40).padEnd(40)} headings ${String(headsNow.size).padStart(3)}/${String(facts.printed.size).padEnd(3)} +${rep.joined.length + rep.inserted.length} missing ${missing.length} pages ${rep.pagesMarked + 1}/${facts.pages.length}${rep.pageBad.length ? ' PRINTED≠ ' + rep.pageBad.length : ''}${same ? '' : ' WORDS CHANGED'}`);
    parts.push(same ? fixed : ch.text);
    firstPage += facts.pages.length;
  }
  report.push('');
  next[id] = { ...o, text: parts.join('\n\n\n') };
}
report.splice(4, 0, `**${tally.chapters} chapters** · headings put back: ${tally.joined} joined + ${tally.inserted} inserted · printed headings still missing: ${tally.unplaced} · page markers: ${tally.pagesMarked} of ${tally.pages} pages · printed page numbers that disagree: ${tally.pageBad} · chapters whose words changed (kept old): ${tally.changedWords}${stop ? ' · **STOPPED**' : ''}`, '');
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, report.join('\n') + '\n');
fs.writeFileSync(SOURCES, JSON.stringify(sources, null, 1) + '\n');
if (stop) { console.error(`\nstopped — see ${path.relative(ROOT, REPORT)}`); process.exit(1); }
fs.writeFileSync(NEW, `// Generated by demo-src/build-demos.js, repaired against the NCERT PDFs by tools/ncert-repair.mjs — NCERT Class 11 & 12 demo pack (text from ncert.nic.in, for personal study).\nwindow.DEMO_PACK = ${JSON.stringify(next)};\n`);
console.log(`\n${tally.chapters} chapters → ${path.relative(ROOT, NEW)} · report ${path.relative(ROOT, REPORT)}`);
console.log(`headings put back ${tally.joined + tally.inserted} · still missing ${tally.unplaced} · page markers ${tally.pagesMarked}/${tally.pages} · printed page numbers disagree ${tally.pageBad} · words changed in ${tally.changedWords} chapters`);
