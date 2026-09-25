/* "What's inside": finds the figures, tables, graphs, diagrams and pictures in an uploaded document, pulls
   out the labels printed inside each one, and shows them as a browsable gallery (the Inside tab) with a
   pop-up for every item.
   · PDF  — each page's drawing operations (vector paths + images, with the transform stack tracked) are
            clustered into regions; text that falls inside a region becomes its labels; rows of aligned
            text become tables; "Figure 3.2 …" / "Table 4 …" captions name and classify what they touch.
            Runs in the background after a scan and is saved with the document (resumes if interrupted).
   · DOCX — Word tables and embedded pictures (with their captions) are collected during the scan.
   · Text / Markdown — pipe tables and captions.
   Depends on study.html globals (HS, UI, DB, esc, toast, $, $$, SFX, Player, Voice, Agent) and on
   window.StudyDialog / window.ClaudeHolo from claude-holo.js. */
(function () {
  'use strict';
  const V = 7; // bump when detection changes, so saved results are rebuilt
  const KINDS = {
    figure: { label: 'Figures', one: 'Figure', icon: '🖼' },
    diagram: { label: 'Diagrams', one: 'Diagram', icon: '◇' },
    graph: { label: 'Graphs & charts', one: 'Graph', icon: '📈' },
    table: { label: 'Tables', one: 'Table', icon: '▦' },
    image: { label: 'Pictures', one: 'Picture', icon: '▣' },
  };
  const ORDER = ['figure', 'diagram', 'graph', 'table', 'image'];
  const CAP_RE = /^(fig(?:ure)?s?\.?|table|exhibit|chart|graph|diagram|illustration|plate|map|flowchart|flow chart)\s*(\d+(?:[.\-–]\d+)*[a-z]?|[IVX]{1,5})\b[\s:.\-–—)]*(.*)$/i;
  const REF_WORDS = /^(shows?|illustrates?|gives?|lists?|presents?|summari[sz]es?|below|above|represents?|depicts?|is |are |was |in |of |and |to |for |on |at |the (?:following|above|below))/i;
  const capKind = (w) => { w = w.toLowerCase(); return /^tab/.test(w) || w === 'exhibit' ? 'table' : /^(chart|graph)/.test(w) ? 'graph' : /^(diagram|flow)/.test(w) ? 'diagram' : 'figure'; };
  const numeric = (s) => /^[\s$€£₹(+\-–−]*[\d.,]+%?\)?$/.test(s);
  const sentence = (s) => (s.split(' ').length > 5 && (/[.,;]$/.test(s) || /^[a-z]/.test(s))) || (/^[a-z]/.test(s) && /[.:;,]$/.test(s) && s.split(' ').length > 1);
  const tick = (s) => /^[-−]?\d{1,4}(\.\d{1,2})?%?$/.test(s.trim());
  const graphish = (lab) => { const t = lab.filter(tick).length; return t >= 4 && t >= lab.length * 0.3 && !lab.some((x) => /[$€£₹]/.test(x)); };
  const $ = (s, r = document) => r.querySelector(s);
  const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ───────────────────────── PDF page analysis ─────────────────────────
  function mul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; }
  function boxOf(x0, y0, x1, y1, m) {
    const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  const area = (b) => Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0);
  const touch = (a, b, pad) => a.x0 - pad <= b.x1 && b.x0 - pad <= a.x1 && a.y0 - pad <= b.y1 && b.y0 - pad <= a.y1;
  const inside = (l, b, pad = 4) => { const cx = (l.x0 + l.x1) / 2, cy = (l.y0 + l.y1) / 2; return cx >= b.x0 - pad && cx <= b.x1 + pad && cy >= b.y0 - pad && cy <= b.y1 + pad; };
  const overlap = (a, b) => { const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0); return w > 0 && h > 0 ? (w * h) / Math.min(area(a) || 1, area(b) || 1) : 0; };

  // text → lines with cells (a wide gap between words starts a new cell: table columns, graph ticks)
  function textLines(tc, vpT) {
    const runs = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const m = mul(vpT, it.transform); if (Math.abs(m[1]) > 0.01 && Math.abs(m[0]) < 0.01) continue; // skip rotated text
      const h = Math.hypot(m[2], m[3]) || 8, x = m[4], y = m[5];
      runs.push({ s: it.str.replace(/\s+/g, ' ').trim(), x0: x, x1: x + (it.width || it.str.length * h * 0.5), y0: y - h, y1: y, h });
    }
    runs.sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
    const lines = [];
    for (const r of runs) {
      const l = lines.find((L) => Math.abs(L.y1 - r.y1) < Math.max(L.h, r.h) * 0.45);
      if (l) { l.runs.push(r); l.x0 = Math.min(l.x0, r.x0); l.x1 = Math.max(l.x1, r.x1); l.y0 = Math.min(l.y0, r.y0); l.h = Math.max(l.h, r.h); }
      else lines.push({ runs: [r], x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1, h: r.h });
    }
    for (const l of lines) {
      l.runs.sort((a, b) => a.x0 - b.x0);
      l.cells = []; let cur = null;
      for (const r of l.runs) {
        if (cur && r.x0 - cur.x1 <= Math.max(l.h * 0.8, 6)) { cur.s += (r.x0 - cur.x1 > l.h * 0.12 ? ' ' : '') + r.s; cur.x1 = Math.max(cur.x1, r.x1); }
        else { cur = { s: r.s, x0: r.x0, x1: r.x1 }; l.cells.push(cur); }
      }
      l.text = l.cells.map((c) => c.s).join(' ').replace(/\s+/g, ' ').trim();
    }
    return lines.sort((a, b) => a.y0 - b.y0);
  }

  // drawing operations → boxes on the page (top-left origin, PDF points)
  function drawnShapes(ops, vpT, W, H) {
    const O = pdfjsLib.OPS, shapes = [];
    const paint = new Set([O.fill, O.eoFill, O.stroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke, O.closeStroke].filter((x) => x != null));
    const fills = new Set([O.fill, O.eoFill].filter((x) => x != null));
    const imgs = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject, O.paintJpegXObject, O.paintImageXObjectRepeat].filter((x) => x != null));
    let ctm = [1, 0, 0, 1, 0, 0], pending = null, fill = null; const stack = [];
    const white = () => { if (!fill) return false; if (typeof fill === 'string') return /^#(f[a-f0-9]){3}$/i.test(fill); return fill.length >= 3 && fill.slice(0, 3).every((v) => v >= 240); };
    const n = Math.min(ops.fnArray.length, 60000);
    for (let i = 0; i < n; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === O.save) stack.push(ctm);
      else if (fn === O.restore) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mul(ctm, a);
      else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (a && a[0]) ctm = mul(ctm, a[0]); }
      else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === O.setFillRGBColor) fill = a && a.length === 1 ? a[0] : a;
      else if (fn === O.setFillGray) fill = a && [a[0] * 255, a[0] * 255, a[0] * 255];
      else if (fn === O.constructPath) {
        const mm = a && a[2];
        // pdf.js 3.x keeps the path's bounds as [minX, maxX, minY, maxY]
        if (mm && mm.length === 4 && mm.every(Number.isFinite)) pending = { b: boxOf(mm[0], mm[2], mm[1], mm[3], mul(vpT, ctm)), segs: (a[0] || []).length };
      } else if (paint.has(fn)) {
        if (pending) { const b = pending.b; if (!(fills.has(fn) && white())) shapes.push({ ...b, img: false, segs: pending.segs }); }
        pending = null;
      } else if (fn === O.endPath) pending = null;
      else if (imgs.has(fn)) { const b = boxOf(0, 0, 1, 1, mul(vpT, ctm)); if (area(b) > 64) shapes.push({ ...b, img: true, segs: 1 }); }
    }
    const pageA = W * H;
    return shapes.filter((s) => {
      const w = s.x1 - s.x0, h = s.y1 - s.y0;
      if (area(s) >= pageA * 0.8 || s.x1 <= 0 || s.y1 <= 0 || s.x0 >= W || s.y0 >= H) return false;
      if (!s.img && w < 8 && h < 8) return false; // bullets, dots, check-boxes in running text
      // running headers / footers / side tabs: bands hugging the page edge
      if (w > W * 0.55 && h < H * 0.14 && (s.y1 < H * 0.16 || s.y0 > H * 0.88)) return false;
      if (h > H * 0.5 && w < W * 0.12 && (s.x1 < W * 0.1 || s.x0 > W * 0.9)) return false;
      return true;
    });
  }

  // nearby boxes → regions
  function cluster(shapes, pad) {
    const out = [];
    for (const s of shapes.slice(0, 5000)) {
      let hit = null;
      for (const c of out) if (touch(c, s, pad)) { hit = c; break; }
      if (hit) { hit.x0 = Math.min(hit.x0, s.x0); hit.y0 = Math.min(hit.y0, s.y0); hit.x1 = Math.max(hit.x1, s.x1); hit.y1 = Math.max(hit.y1, s.y1); hit.n += s.segs; hit.cnt++; if (s.img) hit.imgA += area(s); hit.thin += (s.x1 - s.x0 < 2.5 || s.y1 - s.y0 < 2.5) ? 1 : 0; }
      else out.push({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, n: s.segs, cnt: 1, imgA: s.img ? area(s) : 0, thin: (s.x1 - s.x0 < 2.5 || s.y1 - s.y0 < 2.5) ? 1 : 0 });
    }
    // growing regions can now touch each other: merge until stable
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < out.length && !changed; i++) for (let j = i + 1; j < out.length; j++) {
        if (!touch(out[i], out[j], pad)) continue;
        const a = out[i], b = out.splice(j, 1)[0];
        a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1); a.n += b.n; a.cnt += b.cnt; a.imgA += b.imgA; a.thin += b.thin;
        changed = true; break;
      }
    }
    return out;
  }

  // a ruled table: its vertical rules are the true column edges
  function splitByRules(lines, shapes, b) {
    const xs = [];
    for (const s of shapes) if (s.x1 - s.x0 < 2.5 && s.y1 - s.y0 > 10 && inside({ x0: s.x0, x1: s.x1, y0: s.y0, y1: s.y1 }, b, 2)) { const x = (s.x0 + s.x1) / 2; if (!xs.some((v) => Math.abs(v - x) < 3)) xs.push(x); }
    if (xs.length < 3) return lines;
    xs.sort((a, c) => a - c);
    return lines.map((l) => {
      const cols = new Map();
      for (const r of l.runs || []) { const cx = (r.x0 + r.x1) / 2; let k = xs.findIndex((x) => x > cx); if (k < 0) k = xs.length; if (!cols.has(k)) cols.set(k, []); cols.get(k).push(r); }
      const cells = [...cols.keys()].sort((a, c) => a - c).map((k) => { const rs = cols.get(k); return { s: rs.map((r) => r.s).join(' ').replace(/\s+/g, ' ').trim(), x0: rs[0].x0, x1: rs[rs.length - 1].x1 }; });
      return { ...l, cells };
    });
  }
  const gridRows = (lines) => lines.filter((l) => l.cells.length >= 2);
  function looksTable(lines) {
    const rows = gridRows(lines); if (rows.length < 3) return false;
    const wide = rows.filter((l) => l.cells.length >= 3).length;
    const avgCell = rows.reduce((a, l) => a + l.cells.reduce((x, c) => x + c.s.length, 0) / l.cells.length, 0) / rows.length;
    return (wide >= 2 || rows.length >= 4) && avgCell < 42 && rows.length >= lines.length * 0.5;
  }
  // a table of contents (title … page number) is navigation, not study content
  const isToc = (lines) => { const rows = gridRows(lines); return rows.length >= 3 && rows.filter((l) => /^\d{1,3}$/.test(l.cells[l.cells.length - 1].s) && Math.max(...l.cells.map((c) => c.s.length)) > 12 && l.cells.length <= 3).length >= rows.length * 0.6; };
  const tableRows = (lines) => lines.slice(0, 60).map((l) => l.cells.slice(0, 12).map((c) => c.s));
  const labelsOf = (lines) => {
    const seen = new Set(), out = [];
    for (const l of lines) for (const c of l.cells) {
      const s = c.s.replace(/\s+/g, ' ').trim();
      if (!s || s.length > 60 || seen.has(s.toLowerCase())) continue;
      // fragments of running sentences are not labels
      if (sentence(s)) continue;
      seen.add(s.toLowerCase()); out.push(s); if (out.length >= 48) return out;
    }
    return out;
  };

  async function analysePage(pdf, p) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 }), W = vp.width, H = vp.height, pageA = W * H;
    const [tc, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
    const lines = textLines(tc, vp.transform);
    const shapes = drawnShapes(ops, vp.transform, W, H);
    const regions = cluster(shapes, 6).filter((r) => {
      const w = r.x1 - r.x0, h = r.y1 - r.y0, A = area(r);
      if (w < 40 || h < 28) return false;
      if (r.imgA > pageA * 0.012) return true;
      return r.n >= 6 && A >= pageA * 0.025;
    });
    const items = [], used = new Set();
    const caps = lines.map((l, i) => ({ l, i, m: l.text.length <= 220 && l.cells.length <= 3 ? l.text.match(CAP_RE) : null }))
      .filter((c) => c.m && !REF_WORDS.test(c.m[3] || '') && !/^[,;]/.test(c.m[3] || ''));
    const nearestCap = (b) => {
      let best = null, bd = 90;
      for (const c of caps) {
        if (c.used) continue;
        const l = c.l, hOver = Math.min(l.x1, b.x1) - Math.max(l.x0, b.x0) > -20;
        const d = l.y0 >= b.y1 - 4 ? l.y0 - b.y1 : l.y1 <= b.y0 + 4 ? b.y0 - l.y1 : inside(l, b) ? 0 : 999;
        if (hOver && d < bd) { bd = d; best = c; }
      }
      return best;
    };
    const make = (kind, b, inLines, cap) => {
      const box = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
      if (cap) { box.x0 = Math.min(box.x0, cap.l.x0); box.x1 = Math.max(box.x1, cap.l.x1); box.y0 = Math.min(box.y0, cap.l.y0); box.y1 = Math.max(box.y1, cap.l.y1); }
      const pad = 6; box.x0 = Math.max(0, box.x0 - pad); box.y0 = Math.max(0, box.y0 - pad); box.x1 = Math.min(W, box.x1 + pad); box.y1 = Math.min(H, box.y1 + pad);
      const capText = cap ? cap.l.text : '';
      const it = {
        id: `p${p}-${items.length}`, kind, page: p, caption: capText,
        num: cap ? cap.m[2] : '', title: cap ? (cap.m[3] || '').trim() : '',
        labels: labelsOf(inLines.filter((l) => !cap || l !== cap.l)),
        box: [box.x0 / W, box.y0 / H, box.x1 / W, box.y1 / H].map((v) => Math.round(v * 1000) / 1000),
      };
      if (kind === 'table') it.rows = tableRows(inLines.filter((l) => (!cap || l !== cap.l) && l.cells.length >= 1));
      items.push(it); return it;
    };
    // 1) drawn regions
    const isCap = (l) => caps.some((c) => c.l === l);
    const hs = lines.map((l) => l.h).sort((a, b) => a - b), medH = hs.length ? hs[Math.floor(hs.length / 2)] : 10;
    for (const r of regions) {
      // short text hugging the drawing (tick values under an axis, a label above a box) is part of it
      const m = 20, near = (l) => !isCap(l) && l.text.length <= 40 && l.h <= medH * 1.15 && !sentence(l.text) && l.x1 > r.x0 - m && l.x0 < r.x1 + m && l.y1 > r.y0 - m && l.y0 < r.y1 + m;
      const inL0 = lines.filter((l) => inside(l, r) || near(l));
      let inL = inL0;
      if (inL.length) { r.x0 = Math.min(r.x0, ...inL.map((l) => l.x0)); r.x1 = Math.max(r.x1, ...inL.map((l) => l.x1)); r.y0 = Math.min(r.y0, ...inL.map((l) => l.y0)); r.y1 = Math.max(r.y1, ...inL.map((l) => l.y1)); }
      inL = splitByRules(inL, shapes, r);
      const long = inL.filter((l) => l.text.length > 70).length;
      const cap = nearestCap(r);
      // a bordered box of running text (a "Note" sidebar) is not a figure
      if (!cap && r.imgA < area(r) * 0.3 && inL.length >= 5 && long >= inL.length * 0.5) continue;
      // a frame around most of the page with prose inside is page decoration
      if (!cap && area(r) > pageA * 0.5 && r.imgA < area(r) * 0.3 && long >= 4) continue;
      if (isToc(inL)) continue;
      // chapter banners and side tabs: bands that run along a page edge
      const w = r.x1 - r.x0, h = r.y1 - r.y0;
      if (!cap && ((w > W * 0.8 && (r.y0 < H * 0.03 || r.y1 > H * 0.97) && h < H * 0.3) || (h > H * 0.85 && (r.x0 < W * 0.03 || r.x1 > W * 0.97) && w < W * 0.4))) continue;
      let kind;
      if (cap) kind = capKind(cap.m[1]);
      else if (looksTable(inL) && r.imgA < area(r) * 0.3) kind = 'table';
      else if (r.imgA > area(r) * 0.55 && inL.length <= 2) kind = 'image';
      else {
        const lab = labelsOf(inL), nums = lab.filter(numeric).length;
        kind = graphish(lab) ? 'graph' : gridRows(inL).length >= 4 && nums >= lab.length * 0.25 ? 'table' : r.imgA > area(r) * 0.55 ? 'figure' : 'diagram';
        // a shaded call-out ("Pass Key", "Note") holds a sentence or two, not a drawing
        if (kind === 'diagram' && r.imgA < area(r) * 0.3 && lab.length < 3 && r.n < 40) continue;
      }
      if (cap && kind === 'figure' && r.imgA < area(r) * 0.3) { // "Figure 2" drawn from lines: a diagram, or a graph if it has scales
        kind = graphish(labelsOf(inL)) ? 'graph' : 'diagram';
      }
      if (cap) cap.used = true;
      inL0.forEach((l) => used.add(l));
      make(kind, r, inL, cap);
    }
    // 2) tables set as plain aligned text (no ruling lines)
    let run = [];
    const flush = () => {
      if (run.length >= 4 && looksTable(run) && !isToc(run)) {
        const b = { x0: Math.min(...run.map((l) => l.x0)), y0: run[0].y0, x1: Math.max(...run.map((l) => l.x1)), y1: run[run.length - 1].y1 };
        if (!items.some((it) => overlap(b, { x0: it.box[0] * W, y0: it.box[1] * H, x1: it.box[2] * W, y1: it.box[3] * H }) > 0.4)) {
          const cap = nearestCap(b); if (cap) cap.used = true;
          make(cap ? capKind(cap.m[1]) === 'figure' ? 'table' : capKind(cap.m[1]) : 'table', b, run, cap);
        }
      }
      run = [];
    };
    for (const l of lines) {
      if (used.has(l) || caps.some((c) => c.l === l)) { flush(); continue; }
      const prev = run[run.length - 1];
      const gridish = l.cells.length >= 2 && l.cells.every((c) => c.s.length <= 60);
      if (gridish && (!prev || l.y0 - prev.y1 < prev.h * 2.2)) run.push(l); else { flush(); if (gridish) run.push(l); }
    }
    flush();
    // 3) a caption with nothing detected next to it: keep it when the page has real drawing on it
    for (const c of caps) {
      if (c.used || c.l.text.length > 160) continue;
      const any = regions.length || c.l.cells.length === 1;
      if (!any) continue;
      const b = { x0: 0, y0: Math.max(0, c.l.y0 - H * 0.35), x1: W, y1: Math.min(H, c.l.y1 + 8) };
      c.used = true; make(capKind(c.m[1]), b, [], c).loose = true;
    }
    page.cleanup && page.cleanup();
    return items;
  }

  // ───────────────────────── DOCX / text extraction (runs during the scan) ─────────────────────────
  async function fromDocx(zip, xmlDoc, blockFor) {
    const items = [], W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const relsXml = zip.file('word/_rels/document.xml.rels');
    const rels = new Map();
    if (relsXml) { const r = new DOMParser().parseFromString(await relsXml.async('string'), 'application/xml'); for (const el of Array.from(r.getElementsByTagName('Relationship'))) rels.set(el.getAttribute('Id'), el.getAttribute('Target')); }
    const textOf = (el) => Array.from(el.getElementsByTagName('w:t')).map((t) => t.textContent).join('').replace(/\s+/g, ' ').trim();
    const body = xmlDoc.getElementsByTagName('w:body')[0]; if (!body) return items;
    const kids = Array.from(body.childNodes).filter((n) => n.nodeType === 1);
    const capNear = (i) => { for (const j of [i + 1, i - 1]) { const k = kids[j]; if (k && k.nodeName === 'w:p') { const t = textOf(k), m = t.match(CAP_RE); if (m) return { t, m }; } } return null; };
    let imgs = 0;
    for (let i = 0; i < kids.length; i++) {
      const el = kids[i];
      if (el.nodeName === 'w:tbl') {
        const rows = Array.from(el.getElementsByTagName('w:tr')).slice(0, 60).map((tr) => Array.from(tr.getElementsByTagName('w:tc')).slice(0, 12).map(textOf));
        if (rows.length < 2) continue;
        const cap = capNear(i);
        items.push({ id: `t${items.length}`, kind: 'table', anchor: blockFor(el), caption: cap ? cap.t : '', num: cap ? cap.m[2] : '', title: cap ? cap.m[3] : '', rows, labels: labelsOf(rows.map((r) => ({ cells: r.map((s) => ({ s })) }))) });
      } else if (el.nodeName === 'w:p' && imgs < 40) {
        const blips = Array.from(el.getElementsByTagName('a:blip'));
        for (const bl of blips) {
          const target = rels.get(bl.getAttribute('r:embed')); if (!target || !/\.(png|jpe?g|gif|bmp|webp)$/i.test(target)) continue;
          const f = zip.file('word/' + target.replace(/^\.?\//, '').replace(/^word\//, '')); if (!f) continue;
          let img = null;
          try { img = await thumbFromBlob(await f.async('blob'), 720); } catch (e) { /* unreadable picture */ }
          if (!img) continue;
          const cap = capNear(i); imgs++;
          items.push({ id: `i${items.length}`, kind: cap ? capKind(cap.m[1]) === 'table' ? 'figure' : capKind(cap.m[1]) : 'image', anchor: blockFor(el), caption: cap ? cap.t : '', num: cap ? cap.m[2] : '', title: cap ? cap.m[3] : '', labels: [], img });
        }
      }
    }
    return items;
  }
  async function thumbFromBlob(blob, max) {
    const bmp = await createImageBitmap(blob);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (bmp.width < 48 || bmp.height < 48) return null;
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close && bmp.close();
    return cv.toDataURL('image/jpeg', 0.82);
  }
  // Markdown pipe tables and caption lines in plain text
  function fromText(text) {
    const items = [], lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*\|.*\|\s*$/.test(lines[i])) continue;
      const block = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) block.push(lines[i++]);
      const rows = block.filter((l) => !/^\s*\|?[\s:\-|]+\|?\s*$/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      if (rows.length < 2) continue;
      const before = (lines.slice(Math.max(0, i - block.length - 3), i - block.length).reverse().find((l) => l.trim()) || '').trim(), cap = before.match(CAP_RE);
      items.push({ id: `t${items.length}`, kind: 'table', anchorText: rows[0].join(' '), caption: cap ? before : '', num: cap ? cap[2] : '', title: cap ? cap[3] : '', rows: rows.slice(0, 60), labels: labelsOf(rows.map((r) => ({ cells: r.map((s) => ({ s })) }))) });
    }
    return items;
  }

  // ───────────────────────── the feature ─────────────────────────
  const Inside = {
    V, KINDS, CAP_RE, fromDocx, fromText,
    filter: 'all', scope: 'chapter', job: null, thumbs: new Map(),

    // chapter index for an item
    chapterOf(doc, it) {
      const chs = doc.chapters;
      if (it.page != null && doc.kind === 'pdf') { const i = chs.findIndex((c) => it.page >= c.startPage && it.page <= c.endPage); return i >= 0 ? i : chs.findIndex((c) => c.startPage > it.page) - 1; }
      if (it.anchorText) { const k = it.anchorText.slice(0, 40); const i = chs.findIndex((c) => (c.text || '').includes(k) || c.blocks.some((b) => b.text.includes(k))); if (i >= 0) return i; }
      return it.ch != null ? it.ch : 0;
    },
    items(doc = HS.doc) { return doc && doc.inside && doc.inside.items ? doc.inside.items : []; },
    counts(list) { const c = { total: list.length }; for (const k of ORDER) c[k] = 0; for (const it of list) c[it.kind] = (c[it.kind] || 0) + 1; return c; },
    running() { return !!(this.job && !this.job.done); },

    // attach docx / text items to chapters right after the scan (they carry a block reference)
    attach(doc, items) {
      for (const it of items) {
        if (it.anchor) { const i = doc.chapters.findIndex((c) => c.blocks.includes(it.anchor)); it.page = it.anchor.page; it.ch = i >= 0 ? i : 0; delete it.anchor; }
        else it.ch = this.chapterOf(doc, it);
      }
      doc.inside = { v: V, done: true, items };
    },

    // PDF: analyse in the background (resumable), saving as it goes
    ensure(doc) {
      if (!doc || doc.kind !== 'pdf' || !HS.pdf) return;
      if (doc.inside && doc.inside.v === V && doc.inside.done) return;
      if (this.job && this.job.doc === doc && !this.job.done) return;
      if (!doc.inside || doc.inside.v !== V) doc.inside = { v: V, done: false, next: 1, items: [] };
      // a partial scan (large PDF, chosen chapters) only searches its own pages; `next` is a position in that list
      const list = doc.scanPages && window.PageBudget ? PageBudget.pagesOf(doc.scanPages, HS.pdf.numPages) : null;
      const job = this.job = { doc, done: false, p: doc.inside.next || 1, n: list ? list.length : HS.pdf.numPages, cancel: false };
      (async () => {
        const pdf = HS.pdf, t0 = performance.now(); let lastSave = performance.now(), lastPaint = 0;
        for (; job.p <= job.n; job.p++) {
          if (job.cancel || HS.doc !== doc || HS.pdf !== pdf) return;
          try {
            const found = await analysePage(pdf, list ? list[job.p - 1] : job.p);
            for (const it of found) { it.ch = this.chapterOf(doc, it); doc.inside.items.push(it); }
          } catch (e) { /* one unreadable page is skipped */ }
          doc.inside.next = job.p + 1;
          const now = performance.now();
          if (now - lastPaint > 700) { lastPaint = now; this.progress(); }
          if (now - lastSave > 8000) { lastSave = now; DB.put('docs', doc); }
          // stay out of the way: yield to the UI (and speech) between pages
          await new Promise((r) => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 120 }) : setTimeout(r, 16)));
        }
        doc.inside.done = true; delete doc.inside.next; job.done = true; job.ms = performance.now() - t0;
        await DB.put('docs', doc);
        this.progress(true);
      })();
    },
    progress(final) {
      if (HS.tab === 'inside') this.render(true); else UI.dirty.inside = true;
      this.updateTabBadge();
      if (this.summaryOpen) this.renderSummaryCounts();
      if (final && !this.summaryOpen && HS.tab !== 'inside') {
        const c = this.counts(this.items());
        if (c.total) toast(`What's inside: ${c.total} figures, tables & diagrams found — open the Inside tab.`);
      }
    },
    updateTabBadge() {
      const b = document.querySelector('#tabs [data-tab="inside"] .cnt'); if (!b) return;
      const n = this.items().length; b.textContent = n ? String(n) : ''; b.hidden = !n;
    },

    // ── thumbnails: render only the item's region of the page
    async crop(it, width) {
      const key = it.id + '@' + width; if (this.thumbs.has(key)) return this.thumbs.get(key);
      if (it.img) return it.img;
      if (!HS.pdf || it.page == null || !it.box) return null;
      const job = (this._q = (this._q || Promise.resolve()).then(async () => {
        const page = await HS.pdf.getPage(it.page), vp1 = page.getViewport({ scale: 1 });
        const [x0, y0, x1, y1] = it.box, bw = (x1 - x0) * vp1.width, bh = (y1 - y0) * vp1.height;
        const dpr = Math.min(2, window.devicePixelRatio || 1), s = Math.min(4, (width * dpr) / Math.max(bw, 1));
        const vp = page.getViewport({ scale: s });
        const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bw * s)); cv.height = Math.max(1, Math.round(bh * s));
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: g, viewport: vp, transform: [1, 0, 0, 1, -x0 * vp.width, -y0 * vp.height] }).promise;
        const url = cv.toDataURL('image/jpeg', 0.85); cv.width = cv.height = 0; return url;
      }).catch(() => null));
      const url = await job; if (url) { this.thumbs.set(key, url); if (this.thumbs.size > 220) this.thumbs.delete(this.thumbs.keys().next().value); }
      return url;
    },
    titleOf(it) {
      const k = KINDS[it.kind] || KINDS.figure;
      if (it.caption) return it.title ? `${it.caption.match(CAP_RE) ? it.caption.match(CAP_RE)[1].replace(/\.$/, '') : k.one} ${it.num} · ${it.title}` : it.caption;
      const lead = (it.labels || []).find((s) => s.length > 3 && s.length < 60 && !numeric(s) && !/^\(?(continued|cont'?d\.?)\)?$/i.test(s) && !/[.:]$/.test(s) && /[A-Za-z]{3}/.test(s));
      return `${k.one}${it.page ? ` on page ${it.page}` : ''}${lead ? ` · ${lead}` : ''}`;
    },

    // ── the Inside tab
    visible() {
      const all = this.items(); let list = this.scope === 'chapter' ? all.filter((it) => it.ch === HS.chapterIdx) : all;
      if (this.filter !== 'all' && this.filter !== 'labels') list = list.filter((it) => it.kind === this.filter);
      return list;
    },
    render(keepScroll) {
      const pane = $('#pane-inside'); if (!pane || !HS.doc) return;
      const d = HS.doc, c = UI.chapter(), all = this.items();
      const scoped = this.scope === 'chapter' ? all.filter((it) => it.ch === HS.chapterIdx) : all;
      const counts = this.counts(scoped), list = this.visible();
      const grid = $('.in-grid', pane), scroll = keepScroll && grid ? grid.scrollTop : 0;
      const job = this.job && this.job.doc === d ? this.job : null;
      const busy = d.kind === 'pdf' && !(d.inside && d.inside.done);
      const progress = busy ? `<div class="in-prog"><div class="bar"><i style="width:${job ? Math.round((job.p / job.n) * 100) : 0}%"></i></div><span>${job ? `Looking through page ${Math.min(job.p, job.n)} of ${job.n} for figures, tables and diagrams…` : HS.pdf ? 'Starting…' : 'The original PDF is not stored on this device, so figures cannot be found.'}</span></div>` : '';
      const chips = [['all', `All ${counts.total}`], ...ORDER.filter((k) => counts[k]).map((k) => [k, `${KINDS[k].icon} ${KINDS[k].label} ${counts[k]}`]), ['labels', `🏷 Labels ${scoped.reduce((a, it) => a + (it.labels || []).length, 0)}`]];
      let bodyHtml;
      if (this.filter === 'labels') bodyHtml = this.labelIndex(scoped);
      else if (!list.length) bodyHtml = `<div class="in-empty">${busy ? 'Nothing found yet in this part — still looking.' : this.scope === 'chapter' && all.length ? `No ${this.filter === 'all' ? 'figures or tables' : KINDS[this.filter].label.toLowerCase()} in this chapter. <button class="btn sm" data-scope="doc">Show the whole document (${all.length})</button>` : d.kind === 'pdf' ? 'No figures, tables or diagrams were found in this document.' : d.kind === 'docx' ? 'This Word file has no tables or pictures.' : 'Plain text has no pictures. Markdown tables (| a | b |) are listed here when present.'}</div>`;
      else bodyHtml = `<div class="in-cards">${list.map((it) => this.card(it)).join('')}</div>`;
      pane.innerHTML = `
        <div class="pane-head"><h2>▦ What's inside · ${this.scope === 'chapter' ? `Chapter ${c.n}` : 'Whole document'} <small>${counts.total} item${counts.total === 1 ? '' : 's'}${busy ? ' so far' : ''}</small></h2>
          <div class="chips"><div class="seg" role="group" aria-label="Scope"><button class="${this.scope === 'chapter' ? 'on' : ''}" data-scope="chapter">This chapter</button><button class="${this.scope === 'doc' ? 'on' : ''}" data-scope="doc">Whole document</button></div></div></div>
        ${progress}
        <div class="in-filters" role="tablist">${chips.map(([k, l]) => `<button class="chip ${this.filter === k ? 'on' : ''}" data-filter="${k}">${escH(l)}</button>`).join('')}</div>
        <div class="in-grid">${bodyHtml}</div>`;
      pane.onclick = (e) => {
        const s = e.target.closest('[data-scope]'); if (s) { this.scope = s.dataset.scope; this.render(); return; }
        const f = e.target.closest('[data-filter]'); if (f) { this.filter = f.dataset.filter; this.render(); return; }
        const card = e.target.closest('[data-item]'); if (card) { this.open(card.dataset.item); return; }
        const lab = e.target.closest('[data-label-of]'); if (lab) this.open(lab.dataset.labelOf, lab.dataset.label);
      };
      $('.in-grid', pane).scrollTop = scroll;
      this.lazyThumbs(pane);
    },
    card(it) {
      const k = KINDS[it.kind] || KINDS.figure, labs = (it.labels || []).filter((s) => !numeric(s)).slice(0, 5);
      return `<button class="in-card" data-item="${escH(it.id)}"><div class="in-thumb${it.kind === 'table' && !it.box && !it.img ? ' in-thumb-table' : ''}" data-thumb="${escH(it.id)}">${it.kind === 'table' && !it.box && !it.img ? this.miniTable(it.rows, 4) : `<span class="in-ph">${k.icon}</span>`}</div>
        <div class="in-meta"><span class="in-kind k-${it.kind}">${k.icon} ${k.one}</span>${it.page && HS.doc.kind === 'pdf' ? `<span class="in-page">p. ${it.page}</span>` : ''}</div>
        <b class="in-title">${escH(this.titleOf(it))}</b>${labs.length ? `<span class="in-labs">${labs.map(escH).join(' · ')}</span>` : ''}</button>`;
    },
    miniTable(rows, max) { return `<table class="in-table">${(rows || []).slice(0, max).map((r, i) => `<tr>${r.map((c) => (i ? `<td>${escH(c)}</td>` : `<th>${escH(c)}</th>`)).join('')}</tr>`).join('')}</table>`; },
    labelIndex(list) {
      const map = new Map();
      for (const it of list) for (const l of it.labels || []) { if (numeric(l) || l.length < 3) continue; const k = l.toLowerCase(); if (!map.has(k)) map.set(k, { l, it }); }
      if (!map.size) return '<div class="in-empty">No labels found yet. Labels are the words printed inside figures, diagrams and tables.</div>';
      const arr = [...map.values()].sort((a, b) => a.l.localeCompare(b.l));
      return `<p class="note in-note">Every label printed inside this ${this.scope === 'chapter' ? 'chapter' : 'document'}'s figures, diagrams and tables. Tap one to see where it appears.</p><div class="in-labels">${arr.map((x) => `<button class="chip" data-label-of="${escH(x.it.id)}" data-label="${escH(x.l)}">${escH(x.l)}</button>`).join('')}</div>`;
    },
    lazyThumbs(pane) {
      const els = Array.from(pane.querySelectorAll('[data-thumb]'));
      if (this._io) this._io.disconnect();
      const load = async (el) => {
        const it = this.items().find((x) => x.id === el.dataset.thumb); if (!it || (it.kind === 'table' && !it.box && !it.img)) return;
        const url = await this.crop(it, 300); if (url && el.isConnected) el.innerHTML = `<img alt="" src="${url}">`;
      };
      if (!('IntersectionObserver' in window)) { els.forEach(load); return; }
      this._io = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { this._io.unobserve(e.target); load(e.target); } }), { root: $('.in-grid', pane), rootMargin: '300px' });
      els.forEach((el) => this._io.observe(el));
    },

    // ── pop-up for one item (← → browse through the current list)
    async open(id, highlight) {
      const list = this.filter === 'labels' || !this.visible().some((x) => x.id === id) ? this.items() : this.visible();
      const i = list.findIndex((x) => x.id === id); if (i < 0) return;
      const it = list[i], k = KINDS[it.kind] || KINDS.figure, ch = HS.doc.chapters[it.ch] || UI.chapter();
      const labs = it.labels || [];
      const linkList = labs.map((l) => `<span class="cx-link${highlight && l === highlight ? ' on' : ''}">${escH(l)}</span>`).join('');
      const table = it.rows && it.rows.length ? `<div class="in-sub">Extracted table <span class="note">— read from the page, so check odd cells against the picture</span></div><div class="in-tablewrap">${this.miniTable(it.rows, 60)}</div>` : '';
      const body = `
        <div class="in-view" id="inView">${it.box || it.img ? '<div class="in-loading">Rendering…</div>' : ''}</div>
        ${it.loose ? '<p class="note">Found from its caption; the picture shows the part of the page above it.</p>' : ''}
        ${table}
        ${labs.length ? (table && !highlight ? `<details class="in-more"><summary class="in-sub">Labels inside (${labs.length})</summary><div class="cx-links">${linkList}</div></details>` : `<div class="in-sub">Labels inside (${labs.length})</div><div class="cx-links">${linkList}</div>`) : it.kind !== 'table' ? '<p class="note">No printed labels were found inside this one (it may be a photo or a drawing without text).</p>' : ''}
        <div class="in-nav"><button class="btn sm ghost" data-nav="-1" ${i ? '' : 'disabled'}>‹ Previous</button><span class="note">${i + 1} of ${list.length}</span><button class="btn sm ghost" data-nav="1" ${i < list.length - 1 ? '' : 'disabled'}>Next ›</button></div>`;
      const acts = [];
      if (it.page) acts.push({ label: HS.doc.kind === 'pdf' ? `📄 Open page ${it.page}` : '📄 Open in Read', primary: true, onClick: () => this.goRead(it) });
      acts.push({ label: '🔊 Hear it', keepOpen: true, onClick: () => this.hear(it) });
      acts.push({ label: '🤖 Ask the Agent', onClick: () => this.ask(it) });
      if (window.ClaudeHolo && HS.pdf && it.box) acts.push({ label: '✦ Claude hologram of this', onClick: () => this.holo(it) });
      const el = window.StudyDialog.open({ title: this.titleOf(it), eyebrow: `${k.icon} ${k.one}${it.page && HS.doc.kind === 'pdf' ? ` · page ${it.page}` : ''} · Chapter ${ch ? ch.n : ''}`, body, actions: acts, wide: true });
      el.querySelector('.cx-sheet').classList.add('in-sheet', 'in-item');
      el.addEventListener('click', (e) => { const n = e.target.closest('[data-nav]'); if (n && !n.disabled) { const nx = list[i + +n.dataset.nav]; if (nx) this.open(nx.id); } });
      el.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' && list[i + 1]) this.open(list[i + 1].id); else if (e.key === 'ArrowLeft' && i) this.open(list[i - 1].id); });
      if (it.box || it.img) {
        const w = Math.min(860, window.innerWidth - 40);
        const url = await this.crop(it, w); const v = el.querySelector('#inView');
        if (v && el.isConnected) v.innerHTML = url ? `<img alt="${escH(this.titleOf(it))}" src="${url}">` : '<div class="in-loading">This page could not be drawn.</div>';
      }
    },
    goRead(it) {
      if (it.ch != null && it.ch !== HS.chapterIdx) UI.selectChapter(it.ch, { keepPage: true });
      HS.page = it.page; UI.dirty.read = true; UI.setTab('read', true);
    },
    describe(it) {
      const k = KINDS[it.kind] || KINDS.figure, labs = (it.labels || []).filter((s) => !numeric(s)).slice(0, 14);
      let t = `${this.titleOf(it)}. This ${k.one.toLowerCase()} is on page ${it.page || 1}.`;
      if (it.rows && it.rows.length) t += ` It has ${it.rows.length} rows. The columns are: ${it.rows[0].filter(Boolean).join(', ')}.`;
      else if (labs.length) t += ` Its labels are: ${labs.join(', ')}.`;
      return t;
    },
    hear(it) { if (window.ClaudeHolo && ClaudeHolo.say) ClaudeHolo.say(this.describe(it)); },
    ask(it) {
      const q = `Explain the ${(KINDS[it.kind] || KINDS.figure).one.toLowerCase()} "${this.titleOf(it)}" on page ${it.page || 1}. ${it.rows ? `Its rows begin: ${it.rows.slice(0, 6).map((r) => r.join(' | ')).join(' / ')}.` : (it.labels || []).length ? `Its labels are: ${it.labels.slice(0, 20).join(', ')}.` : ''} What should I understand from it?`;
      if (it.ch != null && it.ch !== HS.chapterIdx) UI.selectChapter(it.ch, { keepPage: true });
      UI.setTab('agent', true); setTimeout(() => Agent.send(q), 60);
    },
    holo(it) {
      if (it.ch != null && it.ch !== HS.chapterIdx) UI.selectChapter(it.ch, { keepPage: true });
      UI.setTab('holo', true); ClaudeHolo.buildFromFigure(it);
    },

    // ── post-scan pop-up: what the scan found, with live figure counts
    summary(doc) {
      const secs = doc.chapters.reduce((a, c) => a + (c.sections || []).length, 0), terms = doc.chapters.reduce((a, c) => a + c.terms.length, 0), formulas = doc.chapters.reduce((a, c) => a + c.formulas.length, 0);
      const stat = (n, l) => `<div class="in-stat"><b>${n}</b><span>${l}</span></div>`;
      const body = `<div class="in-stats">${[doc.pageCount ? stat(doc.scanPages ? `${doc.scanned}/${doc.pageCount}` : doc.pageCount, doc.scanPages ? 'pages scanned' : 'pages') : '', stat(doc.chapters.length, 'chapters'), stat(secs, 'sections'), stat(doc.noteCount, 'voice notes'), stat(terms, 'key terms'), stat(formulas, 'formulas')].join('')}</div>
        <div class="in-sub">Figures, tables & diagrams</div><div id="inSumCounts" class="in-stats"></div><div id="inSumNote" class="note"></div>
        <div class="in-sub">Chapters</div><ol class="in-chlist">${doc.chapters.slice(0, 60).map((c, i) => `<li><button data-ch="${i}"><span>${escH(c.title)}</span><i>${c.notes.length} notes${c.startPage ? ` · p. ${c.startPage}` : ''}</i></button></li>`).join('')}</ol>`;
      this.summaryOpen = true;
      const el = window.StudyDialog.open({
        title: doc.title, eyebrow: `Scan complete · ${(doc.kind || '').toUpperCase()}`, body, wide: true, onClose: () => { this.summaryOpen = false; },
        actions: [
          { label: "▦ Explore what's inside", primary: true, onClick: () => { this.summaryOpen = false; this.scope = 'doc'; this.filter = 'all'; UI.setTab('inside', true); } },
          { label: '🎧 Start listening', onClick: () => { this.summaryOpen = false; UI.setTab('listen', true); } },
          { label: '◎ Holograms', onClick: () => { this.summaryOpen = false; UI.setTab('holo', true); } },
        ],
      });
      el.querySelector('.cx-sheet').classList.add('in-sheet');
      el.querySelector('.in-chlist').addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (b) { window.StudyDialog.close(); UI.selectChapter(+b.dataset.ch); } });
      this.renderSummaryCounts();
    },
    renderSummaryCounts() {
      const box = $('#inSumCounts'), note = $('#inSumNote'); if (!box) { this.summaryOpen = false; return; }
      const d = HS.doc, c = this.counts(this.items()), busy = d.kind === 'pdf' && !(d.inside && d.inside.done), job = this.job;
      box.innerHTML = ORDER.map((k) => `<div class="in-stat${c[k] ? '' : ' zero'}"><b>${c[k]}</b><span>${KINDS[k].icon} ${KINDS[k].label.toLowerCase()}</span></div>`).join('') + `<div class="in-stat"><b>${this.items().reduce((a, it) => a + (it.labels || []).length, 0)}</b><span>🏷 labels</span></div>`;
      note.textContent = busy ? (job ? `Still looking… page ${Math.min(job.p, job.n)} of ${job.n}. You can start studying; this keeps running in the background.` : '') : c.total ? 'Open any of them from the Inside tab.' : d.kind === 'pdf' ? 'No figures or tables were found in this PDF.' : '';
    },
  };
  window.Inside = Inside;

  // styles for the tab and its pop-ups
  const css = document.createElement('style');
  css.textContent = `
  #pane-inside .pane-head { flex-shrink: 0; }
  .in-prog { display: flex; flex-direction: column; gap: 5px; padding: 0 16px 8px; font-size: 12px; color: var(--muted); }
  .in-filters { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 16px 10px; flex-shrink: 0; }
  .in-filters .chip.on, .in-labels .chip:hover { color: var(--chrome); border-color: rgba(79, 209, 232, .5); background: var(--chrome-soft); }
  .in-grid { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 16px; }
  .in-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
  .in-card { display: flex; flex-direction: column; gap: 6px; text-align: left; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 8px 8px 10px; transition: .15s; min-width: 0; }
  .in-card:hover, .in-card:focus-visible { border-color: var(--border-2); background: var(--card-2); transform: translateY(-1px); }
  .in-thumb { height: 132px; border-radius: 8px; background: #f4f6fa; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .in-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .in-thumb-table { background: var(--bg-2); align-items: flex-start; padding: 6px; }
  .in-ph { font-size: 30px; opacity: .35; color: #0b1120; }
  .in-meta { display: flex; justify-content: space-between; gap: 6px; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; }
  .in-kind { color: var(--chrome); } .in-kind.k-table { color: var(--good); } .in-kind.k-graph { color: var(--warn); } .in-kind.k-diagram { color: var(--subject); }
  .in-page { color: var(--muted); }
  .in-title { font-size: 13px; line-height: 1.35; color: var(--text); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-weight: 600; }
  .in-labs { font-size: 11.5px; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .in-empty { padding: 30px 10px; text-align: center; color: var(--muted); display: flex; flex-direction: column; gap: 12px; align-items: center; }
  .in-note { margin-bottom: 10px; }
  .in-labels { display: flex; flex-wrap: wrap; gap: 6px; }
  .in-table { border-collapse: collapse; font-size: 12px; width: 100%; }
  .in-table th, .in-table td { border: 1px solid var(--border); padding: 3px 6px; text-align: left; vertical-align: top; color: var(--text-2); }
  .in-table th { color: var(--text); background: var(--card-2); font-weight: 600; }
  .in-thumb-table .in-table { font-size: 9.5px; } .in-thumb-table .in-table td, .in-thumb-table .in-table th { padding: 1px 3px; white-space: nowrap; max-width: 90px; overflow: hidden; text-overflow: ellipsis; }
  .in-tablewrap { max-height: 280px; overflow: auto; border-radius: 8px; }
  .in-view { background: #f4f6fa; border-radius: 10px; min-height: 60px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .in-view:empty { display: none; }
  .in-view img { max-width: 100%; max-height: min(52vh, 560px); display: block; object-fit: contain; }
  .in-loading { color: #475569; font-size: 12px; padding: 20px; }
  .in-sub { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
  .in-more summary { cursor: pointer; margin-bottom: 6px; }
  .in-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .cx-link.on { border-color: var(--chrome); color: var(--chrome); }
  .in-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
  .in-stat { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; }
  .in-stat b { font-size: 20px; font-family: var(--font-display); color: var(--text); line-height: 1.1; }
  .in-stat span { font-size: 11.5px; color: var(--muted); }
  .in-stat.zero { opacity: .45; }
  .in-sheet { overflow-x: hidden; }
  /* pop-up buttons stay in reach while the sheet scrolls */
  .in-sheet > .cx-actions { position: sticky; bottom: -16px; margin: 0 -18px -16px; padding: 10px 18px 14px; background: linear-gradient(180deg, transparent, var(--panel) 30%); }
  .in-chlist { list-style: none; display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; counter-reset: ch; }
  .in-chlist li { counter-increment: ch; }
  .in-chlist button { width: 100%; display: flex; justify-content: space-between; gap: 10px; text-align: left; padding: 6px 8px; border-radius: 8px; color: var(--text-2); font-size: 13px; }
  .in-chlist button::before { content: counter(ch); font-family: var(--font-mono); color: var(--subject); min-width: 20px; }
  .in-chlist button span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .in-chlist button i { font-style: normal; font-size: 11.5px; color: var(--muted); white-space: nowrap; }
  .in-chlist button:hover { background: var(--card); color: var(--text); }
  .seg { display: inline-flex; border: 1px solid var(--border-2); border-radius: 9px; overflow: hidden; }
  .seg button { padding: 5px 10px; font-size: 12px; color: var(--text-2); }
  .seg button.on { background: var(--chrome-soft); color: var(--chrome); }
  #tabs .cnt { font-family: var(--font-mono); font-size: 10px; padding: 0 6px; border-radius: 10px; background: var(--chrome-soft); color: var(--chrome); }
  @media (max-width: 560px) { .in-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } .in-thumb { height: 100px; } .in-grid, .in-filters { padding-left: 10px; padding-right: 10px; } }
  @media (orientation: landscape) and (max-height: 560px) {
    .in-cards { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; } .in-thumb { height: 104px; }
    .in-filters { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 6px; scrollbar-width: none; } .in-filters .chip { flex-shrink: 0; }
    .in-prog { padding-bottom: 4px; }
    /* pop-up: picture on the left, labels / table on the right */
    .in-sheet { width: min(1100px, 100%) !important; max-height: calc(100dvh - 16px) !important; padding: 10px 14px !important; gap: 8px !important; }
    .in-item .cx-body { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 8px 14px; align-content: start; }
    .in-item .cx-body > .in-view { grid-row: 1 / span 12; grid-column: 1; align-self: start; }
    .in-item .cx-body > :not(.in-view) { grid-column: 2; }
    .in-item .cx-body > .in-view:empty ~ * { grid-column: 1 / -1; }
    .in-view img { max-height: calc(100dvh - 150px); }
    .in-sheet .in-stats { grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); }
    .in-sheet .in-stat b { font-size: 17px; }
  }
  `;
  document.head.appendChild(css);
})();
