// ═══════════════════════════════ HoloImport: your own PDF → a HoloStudy book ═══════════════════════════════
// The Godot page (godot/scripts/import_flow.gd) calls window.HoloImport. Everything runs in this browser
// tab: the file never leaves the device. Steps, each reported to the page as (stage, 0…1):
//   pdf.js reads the text of every page → the study console's scanner above builds chapters, sections,
//   pages, voice notes, key points, key terms, formulas, a summary and a recall quiz (exactly as for the
//   NCERT books) → each chapter is matched to the hologram library → MCQs are written for Practice →
//   the book goes back to the page as one JSON string in the NCERT pack format (+ holograms, mcq, source).
const API = 1;
const SCAN = 1; // bump when the import changes: a re-added PDF then gets a fresh id instead of the older scan
const HERE = (document.currentScript && document.currentScript.src) || location.href;
const at = (p) => new URL(p, HERE).href;
const MAX_MB = 150;
const nextFrame = () => new Promise((r) => {
  let done = false; const go = () => { if (!done) { done = true; r(); } };
  if (document.visibilityState === 'visible') requestAnimationFrame(go);
  setTimeout(go, 40); // hidden tabs get no animation frames: keep going on timers
});
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class UserError extends Error {} // a message written for the student, shown as it is
const cancelled = () => new DOMException('Import cancelled', 'AbortError');

// ───────── text clean-up ─────────
const LIG = { 'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl', 'ﬅ': 'ft', 'ﬆ': 'st' };
// Symbol-font letters (U+F061 is α …), ligatures, soft hyphens, zero-width and odd spaces
const cleanText = (s) => String(s)
  .replace(/[\u0080-\u009F-]/g, fixChar)
  .replace(/[ﬀ-ﬆ]/g, (c) => LIG[c] || c)
  .replace(/[­​-‍⁠﻿�]/g, '')
  .replace(/[  -   　]/g, ' ');
// a character none of the app's fonts can draw: its plain form (é → e) or nothing, never an empty box
const COVER = typeof COVERAGE === 'string' && COVERAGE ? new Set(COVERAGE) : null;
const fitFonts = (s) => (!COVER ? s : s.replace(/[^\x00-\x7F]/gu, (c) => {
  if (COVER.has(c)) return c;
  const d = c.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return d && [...d].every((x) => x.charCodeAt(0) < 128 || COVER.has(x)) ? d : '';
}));
const deep = (x, f) => typeof x === 'string' ? f(x) : Array.isArray(x) ? x.map((v) => deep(v, f)) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, deep(v, f)])) : x;

// ───────── printed textbooks (NCERT above all): what reading a page line by line leaves behind ─────────
// Many textbook PDFs set section headings in body-size capitals, fake bold by printing a phrase 2–5 times,
// print the chapter's contents on its first page, glue words together (no space glyphs) and start each page
// with its number and a running head. The scanner finds headings by font size only, so this step:
//   1 strips running heads ("10 B …", "MOTION IN A PLANE29 …") and keeps the chapter title they give
//   2 reads the section list from the contents ("2.1 Kingdom Monera 2.2 …") and takes it out of the text
//   3 mends overprinted, glued and split words ("Five KingdomsFive Kingdoms", "2.4KINGDOMPLANTAE", "K ingdom")
//   4 when the scanner found no headings: turns recognisable headings back into headings — the contents'
//     titles, numbered CAPITALS or Title Case ("3.7.1 Position Vector and Displacement"), SUMMARY, EXERCISES
//   5 breaks each page's wall of text into paragraphs for Read
const SMALLW = new Set('a an and as at by for from in into of on or the to vs via with'.split(' '));
const capsTitle = (s) => s.toLowerCase().replace(/[a-z][a-z'’]*/g, (w, i) => (i > 0 && SMALLW.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
const ENDINGS = /\b(SUMMARY|ADDITIONAL EXERCISES|EXERCISES|POINTS TO PONDER|QUESTIONS)\b(?=\s|$)/g;
const NOT_HEADING = /^(which|what|how|why|when|where|who|find|show|explain|give|state|calculate|prove|derive|describe|discuss|the|a|an|this|these|that|if|in|for|on|it|we|is|are|as)$/i;

// real words made of other words: never split
const WHOLE = new Set(('throughout nevertheless nonetheless therefore furthermore whatsoever notwithstanding hereafter thereafter whereupon inasmuch ' +
  'insofar moreover however whenever wherever whichever whoever meanwhile otherwise altogether everywhere somewhere anywhere everything something ' +
  'anything nothing everyone someone anyone because before behind beside besides between beyond within without into onto upon cannot understand ' +
  'understanding understood overcome outside inside become becomes became whereas whereby thereby therein herein forever whatever wherein together hereby').split(' '));

// the cheapest split of a glued run into words: a word the book uses (or a common word) costs 1; in a long
// run — a line that lost all its spaces — an unknown piece of 4+ letters may sit between known ones
function splitGlued(low, known, loose) {
  const n = low.length, best = new Array(n + 1).fill(null);
  best[0] = { cost: 0, parts: [], unknown: 0 };
  for (let i = 1; i <= n; i++) for (let j = Math.max(0, i - 24); j < i; j++) {
    if (!best[j]) continue;
    const w = low.slice(j, i), k = (w.length >= 2 || w === 'a') && known(w);
    if (!k && !(loose && w.length >= 4)) continue;
    const cost = best[j].cost + (k ? 1 : 2 + w.length * 0.3);
    if (!best[i] || cost < best[i].cost) best[i] = { cost, parts: best[j].parts.concat(w), unknown: best[j].unknown + (k ? 0 : w.length) };
  }
  return best[n];
}

function mend(t, vocab, dict) {
  const known = (w) => (vocab.get(w) || 0) >= 2 || STOP.has(w) || dict.has(w);
  t = t.replace(/(.{8,90}?)\1+/g, (m, u) => (/[A-Za-z]{3}/.test(u) ? u : m)); // overprinted bold
  t = t.replace(/\b(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)(?=[A-Z])/g, '$1 '); // "2.4KINGDOM"
  t = t.replace(/(^|\s)(\d{1,2}\.)(?=[A-Z][a-z])/g, '$1$2 '); // "1.Discuss"
  t = t.replace(/([a-z]{2,}[.:;,?])(?=[A-Z][a-z])/g, '$1 '); // "clothing.Aristotle"
  t = t.replace(/([a-z]{2,}[,;])(?=[a-z]{2,})/g, '$1 ').replace(/([a-z]{2,}\.)(?=[A-Z]\s)/g, '$1 '); // "physics,we", "scalar.A scalar"
  t = t.replace(/(?<=[a-z]{3})(?=[A-Z][a-z]{2})/g, ' '); // "PlantaeMonera"
  t = t.replace(/(^|[\s(“‘])([A-Z]) ([a-z]{2,})\b/g, (m, a, c, w) => (!known(w) && known((c + w).toLowerCase()) ? a + c + w : m)); // a drop capital: "K ingdom"
  // glued words: "KINGDOMPLANTAE", "Inphysics,wecanclassifyquantities", "directionorintheoppositedirection". A run
  // squeezed against punctuation ("Thus,thetwomethods") is surely glued; elsewhere only a split into 3+ words
  // with common words among them counts — so "offspring" or "photosynthesis" stay whole
  t = t.replace(/[A-Za-z]{8,}/g, (w, at, all) => {
    const low = w.toLowerCase(), caps = w === w.toUpperCase(), capd = !caps && w[0] !== low[0] && w.slice(1) === low.slice(1);
    if ((vocab.get(low) || 0) > 1 || dict.has(low) || WHOLE.has(low) || STOP.has(low) || (!caps && !capd && w !== low)) return w;
    const before = all.slice(Math.max(0, at - 2), at), after = all.slice(at + w.length, at + w.length + 2);
    const squeezed = /[,.;:|)\]]$/.test(before) || /^[,.;:|(][A-Za-z(]/.test(after);
    const long = low.length >= 16;
    const r = splitGlued(low, known, long || squeezed);
    if (!r || r.parts.length < 2 || r.unknown > low.length * 0.4) return w;
    const stops = r.parts.filter((p) => STOP.has(p)).length;
    // a word the dictionary knows never gets here, so two known words are enough; without a dictionary (offline) be stricter
    const ok = caps || squeezed ? true : r.unknown > 0 ? long && r.parts.length >= 3 && stops >= 1 : dict.size > 0 || (r.parts.length >= 3 && stops >= 2);
    if (!ok) return w;
    const out = r.parts.map((p) => (caps ? p.toUpperCase() : p));
    if (capd) out[0] = out[0][0].toUpperCase() + out[0].slice(1);
    return out.join(' ');
  });
  return t.replace(/\s+/g, ' ').trim();
}

// headings inside a paragraph: [{start, end, title}]
function headingsIn(t, toc, chNo, state) {
  const found = [];
  const re = /(^|[\s.;:)])(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?\s?(?=[A-Z])/g;
  let m;
  while (!state.exercises && (m = re.exec(t))) {
    const at = m.index + m[1].length, num = m[0].slice(m[1].length).trim();
    if (/(fig(ure)?s?\.?|table|eq(uation)?s?\.?|example|section|chapter|exercise|problem|unit|\()\s*$/i.test(t.slice(Math.max(0, at - 12), at))) continue;
    if (chNo && +m[2] !== chNo) continue;
    const rest = t.slice(re.lastIndex);
    let title = '', len = 0;
    const entry = toc.find((e) => e.num === num);
    if (entry) { // the contents' title, whatever its spacing or case here
      const want = entry.title.toLowerCase().replace(/[^a-z]/g, '');
      let k = 0, i = 0;
      for (; i < rest.length && k < want.length; i++) { const c = rest[i].toLowerCase(); if (c === want[k]) k++; else if (/[a-z]/.test(c)) break; }
      if (k === want.length) { title = entry.title; len = i; }
    }
    if (!title) {
      const toks = rest.slice(0, 200).split(' '), words = [];
      if (/^[A-Z][A-Z]/.test(toks[0])) { // CAPITALS
        for (const w of toks) { if (/^[A-Z0-9][A-Z0-9,'’&():\-–]*$/.test(w) || /^[–\-&]$/.test(w)) words.push(w); else break; }
        if (words.length && /^[A-Z]$/.test(words[words.length - 1])) words.pop(); // the first letter of the next sentence
        title = capsTitle(words.join(' '));
      } else if (/^[A-Z][a-z]/.test(toks[0])) { // Title Case, up to the word that starts the sentence
        for (let i = 0; i < toks.length && words.length < 10; i++) {
          const w = toks[i], nx = toks[i + 1] || '', cap = /^[A-Z]/.test(w), small = SMALLW.has(w.toLowerCase());
          if (!cap && !small) break;
          if (cap && i > 0 && /^[a-z]/.test(nx) && !SMALLW.has(nx.toLowerCase())) break;
          if (cap && i > 0 && SMALLW.has(nx.toLowerCase()) && /^[a-z]/.test(toks[i + 2] || '') && !SMALLW.has((toks[i + 2] || '').toLowerCase())) break; // "… Euglenoids | Majority of them"
          words.push(w);
        }
        while (words.length && SMALLW.has(words[words.length - 1].toLowerCase())) words.pop();
        title = words.join(' ');
      }
      len = words.join(' ').length;
      if (!/[A-Za-z]{3}/.test(title) || NOT_HEADING.test(title.split(' ')[0]) || title.length > 90) continue;
    }
    found.push({ start: at, end: re.lastIndex + len, title: `${num} ${title.replace(/[\s,:;–\-]+$/, '')}` });
    re.lastIndex += len;
  }
  ENDINGS.lastIndex = 0;
  while ((m = ENDINGS.exec(t))) {
    if (found.some((f) => m.index >= f.start && m.index < f.end)) continue;
    found.push({ start: m.index, end: m.index + m[0].length, title: capsTitle(m[1]) });
    if (/EXERCISES|QUESTIONS/.test(m[1])) { state.exercises = true; break; } // numbers after this are questions, not sections
  }
  return found.sort((a, b) => a.start - b.start);
}

// a wall of text → paragraphs of ~80 words, cut only at sentence ends
function paragraphs(text) {
  const parts = text.split(/(?<=[.!?][”’")\]]?)\s+(?=[A-Z(“‘])/), out = [];
  let cur = '';
  for (const s of parts) {
    cur = cur ? cur + ' ' + s : s;
    if (wordCount(cur) >= 70) { out.push(cur); cur = ''; }
  }
  if (cur) { if (out.length && wordCount(cur) < 25) out[out.length - 1] += ' ' + cur; else out.push(cur); }
  return out;
}

function tidyBook(blocks, dict = new Set()) {
  // 1 · running heads at the top of a page, kept when the same letters start 2+ pages (3+ in longer files)
  const firstOf = new Map();
  for (const b of blocks) if (!firstOf.has(b.page)) firstOf.set(b.page, b);
  const HEADS = [/^(\d{1,3})\s+([A-Z])\s+(?=\S)/, /^([A-Z][A-Z ,&'’:\-–]{3,60}?)\s?(\d{1,3})\s+/, /^(\d{1,3})\s+([A-Z][A-Z ,&'’:\-–]{3,60}?)\s+(?=[A-Za-z(])/];
  const hits = [], count = new Map();
  for (const b of firstOf.values()) {
    if (b.kind !== 'p') continue;
    for (const re of HEADS) {
      const m = b.text.match(re);
      if (!m) continue;
      const letters = (/^\d/.test(m[1]) ? m[2] : m[1]).trim();
      hits.push({ b, len: m[0].length, letters });
      count.set(letters, (count.get(letters) || 0) + 1);
      break;
    }
  }
  const need = firstOf.size >= 8 ? 3 : 2;
  // a chapter opener whose big first letters are pictures: "HAPTER HREE" (CHAPTER THREE), "NIT" (UNIT)
  blocks = blocks.filter((b) => !(b.kind === 'p' && /^(C?HAPTER|U?NIT)(\s+[A-Z]+)?$/.test(b.text.trim())));
  let headTitle = '', most = 0;
  for (const h of hits) if (count.get(h.letters) >= need) h.b.text = h.b.text.slice(h.len).trim();
  for (const [l, c] of count) if (c >= need && c > most && l.length > 3 && !/^(physics|chemistry|biology|mathematics|science|part|unit)\b/i.test(l)) { most = c; headTitle = capsTitle(l); }
  // 2 · the contents on the first pages: 3+ entries in a row, numbered 1, 2, 3 … of one chapter
  const toc = [], first = blocks.length ? blocks[0].page : 1;
  for (const b of blocks) {
    if (b.kind !== 'p' || b.page > first + 1) continue;
    const re = /\b(\d{1,2})\.(\d{1,2})\s?([A-Z][A-Za-z0-9 ,'’&()\-–—:/]{2,80}?)(?=\s*\d{1,2}\.\d{1,2}\s?[A-Z]|\s*(?:Summary|Points to|Exercises|Additional|Appendix)\b|\s*$)/g;
    const ents = []; let m;
    while ((m = re.exec(b.text))) ents.push({ ch: +m[1], n: +m[2], title: m[3].trim(), start: m.index, end: m.index + m[0].length });
    const runs = []; let run = [];
    for (const e of ents) {
      const prev = run[run.length - 1];
      if (prev && e.ch === prev.ch && e.n === prev.n + 1 && !b.text.slice(prev.end, e.start).trim()) run.push(e);
      else { if (run.length >= 3) runs.push(run); run = [e]; }
    }
    if (run.length >= 3) runs.push(run);
    for (const r of runs.reverse()) {
      toc.unshift(...r.map((e) => ({ num: `${e.ch}.${e.n}`, title: e.title })));
      const tail = b.text.slice(r[r.length - 1].end).match(/^\s*(?:(?:Summary|Points to [Pp]onder|Exercises|Additional [Ee]xercises|Appendix)\s*)*/);
      b.text = (b.text.slice(0, r[0].start) + ' ' + b.text.slice(r[r.length - 1].end + (tail ? tail[0].length : 0))).replace(/\s+/g, ' ').trim();
    }
  }
  // 3 · mend the words (vocabulary: the book's own words)
  const vocab = new Map();
  for (const b of blocks) for (const w of b.text.toLowerCase().match(/[a-z]+/g) || []) vocab.set(w, (vocab.get(w) || 0) + 1);
  for (const b of blocks) b.text = mend(b.text, vocab, dict);
  // the scanner's own headings: sections numbered "3.4 …" are not chapters (a chapter file whose section
  // headings are set large); a heading's small-capital second line ("3.4 Addition" + "and subtraction of …") joins it
  const heads = blocks.filter((b) => b.kind !== 'p');
  if (heads.length >= 3 && heads.filter((b) => /^\d{1,2}\.\d{1,2}/.test(b.text)).length >= heads.length * 0.5) for (const b of heads) b.kind = 'h2';
  for (let i = 0; i + 1 < blocks.length; i++) {
    const h = blocks[i], nx = blocks[i + 1];
    if (h.kind !== 'p' && nx.kind === 'p' && nx.page === h.page && wordCount(nx.text) <= 12 && !/[.!?:]$/.test(nx.text) && (/^[a-z]/.test(nx.text) || nx.text === nx.text.toUpperCase())) {
      h.text += ' ' + nx.text;
      blocks.splice(i + 1, 1);
    }
  }
  for (const b of blocks) if (b.kind !== 'p' && !/[a-z]/.test(b.text)) b.text = capsTitle(b.text);
  // 4 · headings, when the scanner found (almost) none
  const structured = blocks.filter((b) => b.kind !== 'p').length >= Math.max(2, firstOf.size / 6);
  let out = blocks;
  if (!structured) {
    const nums = {};
    for (const e of toc) nums[e.num.split('.')[0]] = (nums[e.num.split('.')[0]] || 0) + 1;
    const chNo = +(Object.entries(nums).sort((a, b) => b[1] - a[1])[0] || [0])[0] || 0;
    const state = { exercises: false };
    out = [];
    for (const b of blocks) {
      if (b.kind !== 'p') { out.push(b); continue; }
      let at = 0;
      for (const h of headingsIn(b.text, toc, chNo, state)) {
        const before = b.text.slice(at, h.start).trim();
        if (before) out.push({ kind: 'p', page: b.page, text: before });
        out.push({ kind: 'h2', page: b.page, text: h.title });
        at = h.end;
      }
      const restText = b.text.slice(at).trim();
      if (restText) out.push({ kind: 'p', page: b.page, text: restText });
    }
  }
  // 5 · paragraphs
  const final = [];
  for (const b of out) {
    if (b.kind === 'p' && wordCount(b.text) > 130) for (const t of paragraphs(b.text)) final.push({ kind: 'p', page: b.page, text: t });
    else if (b.text) final.push(b);
  }
  return { blocks: final, headTitle, toc, structured };
}

// NCERT files are named by class, subject, part and chapter: kebo102 = Class 11 Biology chapter 2,
// keph201 = Class 11 Physics part II chapter 1 (= 8). Trusted only when most of that chapter's title is in the text.
const NCERT_PACK = { keph: 'physics11', leph: 'physics12', kech: 'chemistry11', lech: 'chemistry12', kebo: 'biology11', lebo: 'biology12' };
const NCERT_PART1 = { keph: 7, leph: 8, kech: 6, lech: 5 }; // chapters in part I
function ncertChapter(fileName, lib, text) {
  const m = String(fileName).toLowerCase().match(/^([kl]e(?:ph|ch|bo))([12])(\d{2})(?!\d)/);
  if (!m || !lib) return null;
  const no = (m[2] === '2' ? NCERT_PART1[m[1]] || 0 : 0) + parseInt(m[3], 10);
  const ch = lib.chapters.find((c) => c.pack === NCERT_PACK[m[1]] && c.no === no);
  if (!ch) return null;
  const low = text.toLowerCase();
  return ch.key.filter((w) => low.includes(w)).length >= Math.ceil(ch.key.length * 0.6) ? ch : null;
}
// a file name, path or typesetting file is not a title ("ch-2.pmd", "E:\Textbook\…\Chapter 3.pmd", "kebo102")
const fileLike = (t) => /[\\/]|\.(pmd|p65|indd|qxd|qxp|docx?|pdf|tex|rtf|odt)$|^[\w.-]+$/i.test(t) || /untitled|microsoft word|^document$/i.test(t);

// English as the NCERT books use it (import/words.txt, made by tools/godot-import.mjs from godot/content):
// tells glued words ("wecanclassify") from real ones ("offspring"). Fetched when a PDF is added; none offline.
let WORDS = null;
async function wordList() {
  if (WORDS) return WORDS;
  try { const r = await fetch(at('words.txt')); WORDS = new Set(r.ok ? (await r.text()).split(/\s+/).filter(Boolean) : []); } catch (e) { WORDS = new Set(); }
  return WORDS;
}

// ───────── reading the file ─────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load failed ' + src)); document.head.appendChild(s);
  });
}
async function ensurePdf() {
  if (!window.pdfjsLib) {
    try { await loadScript(at('pdf.min.js')); } catch (e) { throw new UserError('The PDF reader could not load. Check the connection and try again.'); }
  }
  if (!window.pdfjsLib) throw new UserError('The PDF reader could not load. Reload the page and try again.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = at('pdf.worker.min.js');
}
// the largest page count to scan without asking (memory caps it on small phones; same as the study console)
const pageLimit = () => { const m = navigator.deviceMemory || 4; return m <= 2 ? 200 : m <= 4 ? 400 : 600; };
const kindOf = (name, type) => {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (/^(txt|text)$/.test(ext)) return 'txt';
  if (/^(md|markdown)$/.test(ext)) return 'md';
  return /^text\//.test(type || '') ? 'txt' : '';
};
const englishCheck = (text) => {
  const letters = (text.match(/\p{L}/gu) || []).length, latin = (text.match(/[A-Za-zÀ-ɏ]/g) || []).length;
  if (letters > 200 && latin / letters < 0.5) throw new UserError('This file is not in English. HoloStudy’s scanner reads English textbooks for now.');
};

async function fromPDF(job, buf) {
  const { report } = job;
  await ensurePdf();
  report('Opening the PDF', 0.02);
  let pdf;
  // isEvalSupported: false — fonts are never compiled to code (pdf.js 3.x advisory CVE-2024-4367)
  try { pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise; }
  catch (e) {
    if (e && e.name === 'PasswordException') throw new UserError('This PDF is password-protected. Remove the password (or print it to a new PDF) and add it again.');
    throw new UserError('This file could not be opened as a PDF. It may be damaged, or not really a PDF.');
  }
  try {
    report.check();
    let pageList = null, range = null;
    const limit = pageLimit();
    if (pdf.numPages > limit) {
      report(`${pdf.numPages} pages · choose the pages to scan`, 0.03);
      range = await job.ask(pdf.numPages, limit);
      if (!range) throw cancelled();
      pageList = []; for (let p = range[0]; p <= range[1]; p++) pageList.push(p);
      job.id = 'u' + hashStr(`v${SCAN}|${job.name}|${job.size}|p${range[0]}-${range[1]}`);
    }
    const read = await pdfToPages(pdf, report, pageList);
    const pageCount = read.pageCount;
    for (const b of read.blocks) b.text = cleanText(b.text).replace(/\s+/g, ' ').trim();
    const all = read.blocks.map((b) => b.text).join(' ');
    englishCheck(all);
    if (read.blocks.reduce((a, b) => a + wordCount(b.text), 0) < 40) throw new UserError(range ? 'Those pages have no readable text. Choose other pages, or check that the PDF is not a scan.' : 'This PDF has no text to read — it looks like scanned photos of pages. HoloStudy needs a text-based PDF (NCERT PDFs are).');
    report('Finding the chapters', 0.64);
    const tidy = tidyBook(read.blocks.filter((b) => b.text), await wordList());
    const blocks = tidy.blocks;
    let outline = await pdfOutlineChapters(pdf);
    if (outline && pageList) outline = clipOutline(outline, pageList, pageCount);
    if (outline) outline.forEach((c) => { c.title = cleanText(c.title); (c.sections || []).forEach((s) => (s.title = cleanText(s.title))); });
    // one chapter whose title the scanner could not see (NCERT chapter files): its title from the file's NCERT
    // code or the running head, its sections from the headings found above
    let lib = null;
    try { lib = await holoLibrary(); } catch (e) { /* offline: no NCERT titles */ }
    const ncert = ncertChapter(job.name, lib, all);
    const words = blocks.reduce((a, b) => a + wordCount(b.text), 0);
    let chapterTitle = '';
    // (the scanner would make every section a chapter when it sees one chapter heading and many section headings)
    const h1s = blocks.filter((b) => b.kind === 'h1');
    if (!outline && h1s.length <= 1 && (ncert || tidy.headTitle || h1s.length === 1 || words < 15000)) {
      chapterTitle = ncert ? ncert.title : (h1s[0] && h1s[0].text) || tidy.headTitle || capsTitle(job.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
      outline = [{ title: chapterTitle, page: blocks.length ? blocks[0].page : 1, sections: blocks.filter((b) => b.kind === 'h2').map((b) => ({ title: b.text, page: b.page })) }];
    }
    const meta = await pdf.getMetadata().catch(() => null);
    const metaTitle = meta && meta.info && typeof meta.info.Title === 'string' ? cleanText(meta.info.Title).replace(/\s+/g, ' ').trim() : '';
    let title = metaTitle.length > 3 && !fileLike(metaTitle) ? metaTitle : chapterTitle || job.name.replace(/\.[^.]+$/, '');
    if (range) title += ` · p. ${range[0]}–${range[1]}`;
    const built = buildChapters(blocks, outline, pageList ? pageList[pageList.length - 1] : pageCount);
    // bookmark titles: "Chapter 1: Biological Classification" → "Biological Classification" (the app numbers
    // chapters itself), words a wrapped bookmark glued ("Flowers andSeeds") apart; and a bookmarked section is
    // named exactly as its heading in the text ("2.1 Kingdom Monera"), so the voice notes find their section
    const fixTitle = (t) => {
      const s = String(t).replace(/(?<=[a-z]{2})(?=[A-Z][a-z])/g, ' ');
      const bare = s.replace(/^(chapter|unit|lesson|module)\s+(\d{1,3}|[ivxlc]{1,6})\s*[:.\-–—]\s*/i, '');
      return bare.length >= 3 ? bare : s;
    };
    for (const c of built.chapters) {
      c.title = fixTitle(c.title);
      const heads = c.blocks.filter((b) => b.kind !== 'p');
      const same = (b, s) => cleanTitle(b.text).toLowerCase() === cleanTitle(s.title).toLowerCase();
      c.sections = c.sections.map((s) => {
        const h = heads.find((b) => b.page === s.page && same(b, s)) || heads.find((b) => same(b, s));
        return { title: h ? h.text : fixTitle(s.title), page: s.page };
      });
    }
    return await finishDoc(job, { title, kind: 'pdf', pages: pageCount, scanned: pageList ? pageList.length : pageCount, range }, built);
  } finally { pdf.destroy(); }
}

async function fromText(job, text, kind) {
  const { report } = job;
  report('Reading the text', 0.1);
  await nextFrame();
  text = cleanText(text);
  englishCheck(text);
  const blocks = paginate(textToBlocks(text));
  if (blocks.reduce((a, b) => a + wordCount(b.text), 0) < 30) throw new UserError('That is too short to study — use a file with at least a few paragraphs.');
  report('Finding the chapters', 0.5);
  const built = buildChapters(blocks, null, 0);
  return finishDoc(job, { title: job.name.replace(/\.[^.]+$/, ''), kind, pages: 0, scanned: 0, range: null }, built);
}

// the study console's finishDoc (study.html §02) without its IndexedDB library, figure search and wireframes
async function finishDoc(job, meta, built) {
  const { report } = job;
  const chapters = built.chapters;
  const fullText = chapters.map((c) => c.blocks.map((b) => b.text).join('\n')).join('\n');
  report('Working out the subject', 0.7);
  const subject = detectSubject(fullText);
  report('Finding key terms and formulas', 0.76);
  await nextFrame();
  const docStats = Analytics.docStats(chapters);
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    c.notes = buildNotes(c);
    Analytics.analyseChapter(c, docStats, subject);
    const secNames = c.sections.slice(0, 4).map((s) => s.title);
    const ideas = c.terms.slice(0, 5).map((t) => t.t);
    c.intro = `Chapter ${c.n}: ${c.title}. ${c.notes.length} voice notes${c.sections.length ? ` across ${c.sections.length} sections` : ''}. ` +
      (ideas.length ? `Key ideas: ${ideas.join(', ')}. ` : '') + (secNames.length ? `We begin with ${secNames[0]}.` : 'Let us begin.');
    c.keyNotes = c.summary.map((s) => ({ text: s.text, page: s.page, sec: 0, words: wordCount(s.text) }));
    c.figures = countRefs(c.text, /\bfig(?:ure)?s?\.?\s*(\d+(?:\.\d+)?)/gi);
    c.tables = countRefs(c.text, /\btables?\s+(\d+(?:\.\d+)?)/gi);
    c.examples = countRefs(c.text, /\bexamples?\s+(\d+(?:\.\d+)?)/gi);
    report(`Building chapter ${i + 1} of ${chapters.length}`, 0.78 + 0.17 * ((i + 1) / chapters.length));
    await nextFrame();
  }
  return Object.assign(meta, { subject, chapters, totalWords: built.totalWords, noteCount: chapters.reduce((a, c) => a + c.notes.length, 0) });
}

// ───────── holograms: the library's 3-D figures that belong with each chapter ─────────
// 1. a chapter titled like an NCERT chapter gets that chapter's own figures;
// 2. otherwise figures whose title words and labels the chapter's text keeps using (tuned on the NCERT
//    books: ~70 % of picks are the chapter's own figures, most others are related figures of a
//    neighbouring chapter). Same subject only when the subject is physics, chemistry or biology.
const H_STOP = new Set('a an the and or of to in on at by for with from as is are its into onto via vs per their this that these those'.split(' '));
const H_FIG = new Set('diagram diagrams structure structures model models view views section sections showing shapes shape types type parts part process processes formation experiment setup apparatus arrangement simple various different representation schematic graph graphs plot curve curves figure example examples stages stage cycle general typical labelled'.split(' '));
const H_GEN = new Set(('motion time body point value case position direction distance system object process part change form type way number result quantity unit thing effect region place level amount material substance surface line area size shape state kind method means order period term terms word words ' +
  'water light heat energy force mass length cell cells layer layers wall top bottom side front back left right inner outer upper lower central end ends base head tail axis center centre').split(' '));
const H_SUB = { physics: 'phy', chemistry: 'chem', biology: 'bio' };
const hWords = (s) => (String(s).toLowerCase().match(/[a-z][a-z'-]*[a-z]|[a-z]/g) || []);
let LIB = null;
async function holoLibrary() {
  if (LIB) return LIB;
  const get = async (p) => { const r = await fetch(at('../content/' + p)); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
  const [idx, cur] = await Promise.all([get('holo/index.json'), get('curriculum.json')]);
  const figs = idx.map((f) => {
    const title = [];
    for (const p of String(f.title).split(/[,&;:/()]| and | vs\.? | – | — /i)) {
      const w = hWords(p).filter((x) => x.length >= 4 && !H_STOP.has(x) && !H_FIG.has(x));
      if (w.length) title.push(w);
    }
    const labels = [], seen = new Set();
    for (const v of f.variants || []) for (const lb of v.labels || []) {
      const raw = String(lb.t || '');
      const alts = [raw.replace(/\([^)]*\)/g, ' '), ...(raw.match(/\(([^)]*)\)/g) || []).map((x) => x.slice(1, -1))]
        .map((x) => x.replace(/[^A-Za-z' -]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase())
        .filter((x) => x.replace(/[^a-z]/g, '').length >= 4 && !H_GEN.has(x) && !hWords(x).every((w) => H_GEN.has(w) || H_STOP.has(w) || w.length < 3));
      if (!alts.length || seen.has(alts[0])) continue;
      seen.add(alts[0]); labels.push(alts);
    }
    return { f, title, labels };
  });
  const df = new Map();
  for (const p of figs) for (const a of p.labels) df.set(a[0], (df.get(a[0]) || 0) + 1);
  const chapters = [];
  for (const s of cur.subjects || []) for (const cl of s.classes || []) for (const ch of cl.chapters || []) chapters.push({ sub: H_SUB[s.key], key: titleKey(ch.title), holos: ch.holograms || [], title: ch.title, pack: cl.pack, no: ch.no });
  LIB = { figs, df, chapters, byId: new Map(idx.map((f) => [f.id, f])) };
  return LIB;
}
function titleKey(t) { return hWords(String(t).replace(/^\s*(chapter|unit)\s+\S+\s*[:.\-–—]?\s*/i, '')).filter((w) => w.length >= 3 && !H_STOP.has(w)); }
const countIn = (text, phrase) => (text.match(new RegExp('\\b' + escRe(phrase).replace(/ /g, '[\\s-]+') + '(?:s|es)?\\b', 'g')) || []).length;
function matchHolograms(lib, c, subject) {
  const sub = H_SUB[subject] || '';
  const out = [], have = new Set();
  const add = (f, why) => { if (!have.has(f.id) && out.length < 8) { have.add(f.id); out.push({ hash: f.id, title: f.title, fig: f.fig || '', why }); } };
  // 1 · an NCERT chapter of the same name
  const key = titleKey(c.title);
  if (key.length) {
    let best = null, bestJ = 0;
    for (const ch of lib.chapters) {
      if (sub && ch.sub !== sub) continue;
      const a = new Set(key), b = new Set(ch.key); let inter = 0; for (const w of a) if (b.has(w)) inter++;
      const j = inter / (a.size + b.size - inter || 1);
      if (j > bestJ) { bestJ = j; best = ch; }
    }
    if (best && (bestJ >= 0.75 || (bestJ === 1 && key.length === 1))) for (const h of best.holos) { const f = lib.byId.get(h.hash); if (f) add(f, ['NCERT chapter']); }
  }
  // 2 · figures the text keeps talking about
  const text = String(c.text || '').toLowerCase();
  const scored = [];
  for (const p of lib.figs) {
    if (sub && p.f.sub !== sub) continue;
    let tw = 0; const why = [];
    for (const w of p.title) if (w.every((x) => countIn(text, x) >= 2)) { tw++; why.push(w.join(' ')); }
    let ln = 0, lw = 0;
    for (const a of p.labels) if (a.some((x) => countIn(text, x) >= 1)) { ln++; lw += 1 / Math.sqrt(lib.df.get(a[0]) || 1); why.push(a[0]); }
    const tf = p.title.length ? tw / p.title.length : 0;
    const v = 2 * tf + 4 * (ln / Math.max(4, p.labels.length)) + 0.3 * lw;
    if (v >= (sub ? 3.5 : 4.5)) scored.push({ f: p.f, v, why: [...new Set(why)].slice(0, 4) });
  }
  scored.sort((a, b) => b.v - a.v);
  const top = scored.length ? scored[0].v : 0;
  for (const s of scored.slice(0, 4)) if (s.v >= top * 0.5) add(s.f, s.why);
  return out;
}

// ───────── MCQs for Practice: fill the blank from the chapter's own sentences ─────────
// Answers are the chapter's key terms; wrong options are other key terms of the same chapter (then of the
// book) of a similar shape that do not appear in the question. Definitions first, then key points, then
// other sentences that use a term. A sentence that leans on the one before it ("This kingdom…", "It is…")
// or is mostly symbols is never used: the question has to make sense on its own.
const LEANS = /^(this|these|that|those|it|its|they|their|such|he|she|here|there|both|the former|the latter|the above|the same|in this|in these|in that|on the other hand|similarly|likewise|also|again|let us|let's|we will|we shall|we have|as we|recall|consider)\b/i;
const LEAD = /^(hence|thus|so|therefore|however|now|then|further|furthermore|moreover|also|in addition|in fact|in general|as a result|consequently|finally|clearly|note that)\s*,?\s+/i;
const MATHY = /[=→←⇒∆Δ∑∫√±×÷<>≈∝≤≥]|\blim\b/;
// how the book writes a term mid-sentence: "Monera", "DNA" keep their capitals; "Kingdom" at a sentence start does not
function termForms(doc) {
  const forms = new Map();
  for (const c of doc.chapters) for (const t of c.terms) {
    const k = t.t.toLowerCase();
    if (forms.has(k)) continue;
    let f = t.t;
    if (/^[A-Z][a-z]/.test(t.t)) {
      const first = t.t.split(' ')[0];
      const mids = String(c.text).match(new RegExp('[a-z,;] ' + escRe(first) + '\\b', 'gi')) || [];
      const caps = mids.filter((m) => /[A-Z]/.test(m[m.length - first.length])).length;
      if (!mids.length || caps / mids.length < 0.6) f = t.t[0].toLowerCase() + t.t.slice(1);
    }
    forms.set(k, f);
  }
  return forms;
}
// the section a sentence sits in (the heading above its paragraph)
function sectionOf(c, text, page) {
  const probe = text.slice(0, 50);
  let head = '';
  for (const b of c.blocks) {
    if (b.kind !== 'p') { head = b.text; continue; }
    if (b.text.includes(probe)) return head;
  }
  let s = ''; for (const x of c.sections) if (x.page <= page) s = x.title;
  return s;
}
function makeMCQs(c, bookTerms, forms) {
  const fine = (t) => t.length >= 3 && !GENERIC.has(t.toLowerCase()) && /[a-z]/i.test(t) && !/[a-z][A-Z]/.test(t); // "PlantaeMonera": words glued in a table
  const terms = c.terms.filter((t) => fine(t.t)).slice(0, 24);
  if (terms.length < 2) return [];
  const own = new Set(c.terms.map((t) => t.t.toLowerCase()));
  const pool = [], seenPool = new Set();
  for (const t of [...c.terms.map((x) => x.t), ...bookTerms]) { const k = t.toLowerCase(); if (!seenPool.has(k) && fine(t)) { seenPool.add(k); pool.push(t); } }
  const reFor = (t) => new RegExp('\\b' + escRe(t) + '(s|es)?\\b', 'gi');
  const form = (t) => forms.get(t.toLowerCase()) || t;
  const usable = (text) => {
    const wc = wordCount(text);
    return wc >= 7 && wc <= 45 && isSpeakable(text) && !MATHY.test(text) && !text.includes('?') && (text.match(/\d/g) || []).length <= 8 &&
      !/\b(fig|figure|table|exercise|example|question)s?\b/i.test(text);
  };
  const cands = [];
  for (const t of terms) if (t.def && t.defScore >= 1) cands.push({ t, s: { text: t.def, page: t.defPage || c.startPage }, w: 3 });
  for (const s of c.summary) for (const t of terms) if (reFor(t.t).test(s.text)) cands.push({ t, s, w: 2 });
  for (const s of c.sentences || []) for (const t of terms.slice(0, 16)) if (reFor(t.t).test(s.text)) cands.push({ t, s, w: 1 });
  cands.sort((a, b) => b.w - a.w || b.t.score - a.t.score);
  const out = [], usedS = new Set(), perTerm = new Map();
  for (const k of cands) {
    if (out.length >= 30) break;
    if (usedS.has(k.s.text) || (perTerm.get(k.t.t) || 0) >= 2) continue;
    let text = k.s.text.trim().replace(LEAD, '');
    text = text[0].toUpperCase() + text.slice(1);
    if (!usable(text) || LEANS.test(text)) continue;
    const q = text.replace(reFor(k.t.t), '______');
    const blanks = (q.match(/______/g) || []).length;
    if (blanks < 1 || blanks > 2 || q.length < 40 || q.length > 300) continue;
    const ans = k.t.t.toLowerCase(), nW = k.t.t.split(' ').length;
    const low = q.toLowerCase();
    const others = pool.filter((d) => {
      const dl = d.toLowerCase();
      return dl !== ans && !dl.includes(ans) && !ans.includes(dl) && !reFor(d).test(low) && Analytics.stem(dl) !== Analytics.stem(ans);
    });
    if (others.length < 3) continue;
    const seed = hashStr(q);
    // same chapter first, then the shape of the answer (one word vs a phrase)
    const rank = (d) => (own.has(d.toLowerCase()) ? 0 : 10) + Math.abs(d.split(' ').length - nW);
    const picks = shuffle(others, seed).sort((a, b) => rank(a) - rank(b)).slice(0, 4);
    const right = form(k.t.t);
    const opts = shuffle([right, ...picks.map(form)], seed + 'o');
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) continue;
    const sec = sectionOf(c, k.s.text, k.s.page);
    if (/exercise|questions|problems|answers/i.test(sec)) continue; // the book's own exam questions
    usedS.add(k.s.text); perTerm.set(k.t.t, (perTerm.get(k.t.t) || 0) + 1);
    out.push({ q, o: opts, a: opts.indexOf(right), h: `Page ${k.s.page}: ${text}`, t: sec || right, p: k.s.page });
  }
  return out;
}

// ───────── one import ─────────
function toPack(job, doc) {
  return {
    id: job.id, title: doc.title, subject: doc.subject, words: doc.totalWords, notes: doc.noteCount, api: API,
    source: { name: job.name, size: job.size, kind: doc.kind, pages: doc.pages, scanned: doc.scanned, range: doc.range, added: Date.now() },
    chapters: doc.chapters.map((c) => ({
      n: c.n, title: c.title, startPage: c.startPage, endPage: c.endPage, intro: c.intro,
      sections: c.sections.map((s) => ({ t: s.title, p: s.page })),
      blocks: c.blocks.map((b) => ({ k: b.kind, t: b.text, p: b.page })),
      notes: c.notes.map((x) => ({ t: x.text, p: x.page, s: x.sec, w: x.words })),
      keyNotes: c.keyNotes.map((x) => ({ t: x.text, p: x.page, s: x.sec, w: x.words })),
      terms: c.terms.map((x) => ({ t: x.t, d: x.def || '', p: x.defPage || 0, n: x.count })),
      formulas: c.formulas || [],
      summary: c.summary.map((x) => ({ t: x.text, p: x.page })),
      quiz: c.quiz.map((q) => ({ q: q.text, o: q.options, a: q.answer, term: q.term || '', p: q.page || 0 })),
      figures: c.figures || 0, tables: c.tables || 0, examples: c.examples || 0,
      holograms: c.holos || [], mcq: c.mcq || [],
    })),
  };
}

let current = null; // the import in progress (one at a time)
const call = (h, name, ...args) => { try { if (h && typeof h[name] === 'function') h[name](...args); } catch (e) { console.error('HoloImport handler', name, e); } };

async function run(h, getFile) {
  if (current) current.cancel = true;
  const job = { cancel: false, h, name: '', size: 0, id: '', waiting: null };
  current = job;
  let last = 0;
  job.report = (stage, frac) => {
    if (job.cancel) throw cancelled();
    last = Math.max(last, Math.min(0.99, +frac || 0)); // never goes backwards, never says 100 % before it is done
    call(h, 'onProgress', String(stage), last);
  };
  job.report.check = () => { if (job.cancel) throw cancelled(); };
  job.ask = (pages, limit) => new Promise((resolve) => { job.waiting = resolve; call(h, 'onAsk', pages, limit); });
  try {
    const file = await getFile();
    job.name = String(file.name || 'document.pdf'); job.size = +file.size || 0;
    const kind = kindOf(job.name, file.type);
    job.id = 'u' + hashStr(`v${SCAN}|${job.name}|${job.size}`);
    call(h, 'onStarted', job.name, job.size, job.id);
    if (!kind) throw new UserError(`“${job.name}” is not a PDF. Choose a PDF (or a .txt / .md text file).`);
    if (job.size > MAX_MB * 1048576) throw new UserError(`This file is ${(job.size / 1048576).toFixed(0)} MB — too big to scan on this device. Use a PDF under ${MAX_MB} MB (one chapter or part of the book).`);
    if (job.size === 0) throw new UserError('This file is empty.');
    job.report('Reading the file', 0.01);
    const doc = kind === 'pdf' ? await fromPDF(job, await file.arrayBuffer()) : await fromText(job, await file.text(), kind);
    job.report('Matching holograms', 0.96);
    let lib = null;
    try { lib = await holoLibrary(); } catch (e) { console.warn('hologram library not available', e); } // offline: a book without holograms
    job.report.check();
    const bookTerms = doc.chapters.flatMap((c) => c.terms.slice(0, 12).map((t) => t.t));
    doc.chapters.forEach((c) => { c.holos = lib ? matchHolograms(lib, c, doc.subject) : []; });
    job.report('Writing practice questions', 0.98);
    await nextFrame();
    const forms = termForms(doc);
    doc.chapters.forEach((c) => { c.mcq = makeMCQs(c, bookTerms, forms); });
    const pack = deep(toPack(job, doc), fitFonts);
    job.report('Saving', 0.99);
    await nextFrame();
    job.report.check();
    const json = JSON.stringify(pack);
    HoloImport.lastPack = json;
    if (current === job) current = null;
    call(h, 'onProgress', 'Done', 1);
    call(h, 'onDone', json);
  } catch (e) {
    if (current === job) current = null;
    if (job.cancel || (e && e.name === 'AbortError')) return call(h, 'onCancelled');
    if (!(e instanceof UserError)) console.error('HoloImport', e);
    call(h, 'onError', e instanceof UserError ? e.message : `Something went wrong while reading this file (${(e && e.message) || e}). Try again, or try another PDF.`);
  }
}

// ───────── the API ─────────
let dropped = null, dropHandler = null;
const HoloImport = {
  version: API,
  accept: '.pdf,.txt,.md,application/pdf,text/plain,text/markdown',
  // open the file picker (call it from a tap: browsers only open pickers right after one)
  pick(h) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = this.accept; input.style.display = 'none';
    document.body.appendChild(input);
    const gone = () => { if (input.parentNode) input.remove(); };
    input.addEventListener('change', () => {
      const f = input.files && input.files[0]; gone();
      if (f) run(h, async () => f); else call(h, 'onPickCancelled');
    }, { once: true });
    input.addEventListener('cancel', () => { gone(); call(h, 'onPickCancelled'); }, { once: true });
    input.click();
  },
  // a file dropped on the page earlier (see onDrop)
  convertDropped(h) { const f = dropped; dropped = null; if (f) run(h, async () => f); else call(h, 'onError', 'The dropped file is no longer available. Drop it again.'); },
  // tests: a file the page can fetch
  convertUrl(url, name, h) {
    run(h, async () => { const r = await fetch(url); if (!r.ok) throw new UserError('Could not download ' + name); const b = await r.blob(); return new File([b], name, { type: b.type }); });
  },
  convertBlob(blob, name, h) { run(h, async () => new File([blob], name, { type: blob.type })); },
  cancel() { if (current) { current.cancel = true; if (current.waiting) { const w = current.waiting; current.waiting = null; w(null); } } },
  // the page's answer to onAsk: scan pages from…to (1-based, inclusive)
  answer(from, to) {
    if (!current || !current.waiting) return;
    const w = current.waiting; current.waiting = null;
    from = Math.max(1, Math.round(+from || 1)); to = Math.max(from, Math.round(+to || from));
    w([from, to]);
  },
  busy() { return !!current; },
  // the page registers a handler; a PDF dropped anywhere on it calls h.onDropped(name, size)
  onDrop(h) { dropHandler = h; },
  lastPack: '',
  _test: {
    matchHolograms, makeMCQs, termForms, holoLibrary, cleanText, fitFonts, tidyBook,
    // what the scanner reads from a PDF, before the textbook clean-up (for looking into odd files)
    async read(url, pages) {
      await ensurePdf();
      const pdf = await pdfjsLib.getDocument({ data: await (await fetch(url)).arrayBuffer(), isEvalSupported: false }).promise;
      try { return (await pdfToPages(pdf, null, pages || null)).blocks.map((b) => ({ k: b.kind, p: b.page, size: b.size, t: cleanText(b.text) })); } finally { pdf.destroy(); }
    },
  },
};
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
document.addEventListener('dragover', (e) => { if (dropHandler && hasFiles(e)) { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; } }, true);
document.addEventListener('drop', (e) => {
  if (!dropHandler || !hasFiles(e)) return;
  e.preventDefault(); e.stopPropagation();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) { dropped = f; call(dropHandler, 'onDropped', String(f.name), +f.size || 0); }
}, true);
window.HoloImport = HoloImport;
