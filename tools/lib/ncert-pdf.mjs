// What the official NCERT chapter PDFs print, read with pdftotext (Poppler; comes with Git for Windows) — not with
// the app's own converter, so checks against it do not share the converter's blind spots. Shared by
// tools/ncert-repair.mjs (puts lost headings and page markers back into the built-in text) and
// tools/content-review.mjs (checks the study items made from it).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SOURCES = path.join(ROOT, 'data', 'ncert-sources.json');

// ───────── which file is which chapter (the converter's rule: driver.js NCERT_PACK / NCERT_PART1) ─────────
export const PREFIX = { physics11: 'keph', physics12: 'leph', chemistry11: 'kech', chemistry12: 'lech', biology11: 'kebo', biology12: 'lebo' };
export const PART1 = { keph: 7, leph: 8, kech: 6, lech: 5 };
export const codeOf = (pack, n) => { const p = PREFIX[pack], k = PART1[p]; return k && n > k ? `${p}2${String(n - k).padStart(2, '0')}` : `${p}1${String(n).padStart(2, '0')}`; };
export const sources = fs.existsSync(SOURCES) ? JSON.parse(fs.readFileSync(SOURCES, 'utf8')) : {
  roots: ['C:/Users/SSIG FAMILY/Documents/cbse/biology/biologyyy', 'C:/Users/SSIG FAMILY/Documents/cbse/chemistry/chem', 'C:/Users/SSIG FAMILY/Documents/cbse/physics/phy'],
  files: {},
};
export const findPdf = (code) => sources.roots.map((r) => path.join(r, code + '.pdf')).find((f) => fs.existsSync(f));

// ───────── words ─────────
export const norm = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const words = (s) => norm(s).split(' ').filter(Boolean);
const numKey = (n) => n.split('.').map(Number);
export const cmpNum = (a, b) => { const x = numKey(a), y = numKey(b); for (let i = 0; i < 3; i++) { const d = (x[i] ?? -1) - (y[i] ?? -1); if (d) return d; } return 0; };

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
export function pdfFacts(file, chapterNo) {
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
