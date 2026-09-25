/* Page budget for large PDFs.
   Scanning cost grows with every page (text layout, chapters, voice notes, then the background figure
   search), and a phone has far less time and memory than a desktop. Before a big PDF is scanned, a few
   spread-out pages are timed on THIS device; from that the recommended page budget is worked out. Only a
   PDF with more pages than the budget gets the pop-up, which lets the student pick chapters (from the
   PDF's bookmarks) or a page range, reopen a part scanned earlier, or scan everything anyway.
   Depends on study.html globals (pdfOutlineChapters, DB, esc) and window.StudyDialog (claude-holo.js). */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  // Tuned on the 398-page FAR textbook (its 5 sampled pages average 1,062 characters), timed in the real app:
  //   desktop  15.3 ms/page (bench 13.9 ms) → 398 pages in 6 s
  //   4× slower CPU (mid-range phone) 62 ms/page → 398 pages in 25 s, then ~10 s of background figure search
  // The scan is almost all main-thread work (pdf.js text extraction is only ~2 ms/page), so a page costs
  // about PAGE_PER_BENCH × this device's bench() time, scaled by how much text its pages carry.
  // TARGET: a scan the student waits for should finish within ~30 s; memory caps it on small phones.
  // Result on typical devices: low-end 2 GB phone ≈ 200 pages, mid-range 4 GB ≈ 400, 6 GB+ ≈ 600.
  const TUNE = { target: 30, pagePerBench: 15.3 / 13.9, refChars: 1062, min: 100, max: 600 };
  const fmt = (s) => (s < 60 ? `about ${Math.max(5, Math.round(s / 5) * 5)} s` : `about ${Math.round(s / 60)} min`);

  const PageBudget = {
    TUNE,
    // largest page count a device should scan without asking (memory caps it on small phones)
    memoryCap() { const m = navigator.deviceMemory || 4; return m <= 2 ? 200 : m <= 4 ? 400 : TUNE.max; },
    // time 5 spread-out pages: text extraction (the scan) and drawing operations (the figure search)
    async sample(pdf) {
      const n = pdf.numPages;
      const picks = [...new Set([2, 0.25, 0.5, 0.75, 0.95].map((f) => (f > 1 ? Math.min(n, f) : Math.max(1, Math.round(n * f)))))];
      let text = 0, chars = 0;
      for (const p of picks) {
        const t0 = performance.now(), page = await pdf.getPage(p), tc = await page.getTextContent();
        text += performance.now() - t0; chars += tc.items.reduce((a, it) => a + (it.str ? it.str.length : 0), 0);
        page.cleanup && page.cleanup();
      }
      const bench = [this.bench(), this.bench(), this.bench()].sort((a, b) => a - b)[1];
      return { textMs: text / picks.length, chars: chars / picks.length, bench };
    },
    // a fixed piece of main-thread work like the scanner's line building: how fast is THIS device's CPU?
    bench() {
      const t = performance.now(); let n = 0;
      for (let i = 0; i < 40000; i++) { const line = `Section ${i} of the chapter, page ${i % 400}`; if (/\d{3}/.test(line)) n += line.length; n += line.split(' ').length; }
      this._sink = n; return performance.now() - t;
    },
    plan(pdf, s) {
      const density = Math.min(4, Math.max(0.5, s.chars / TUNE.refChars)); // text-heavy pages cost more
      const perPage = (s.bench * TUNE.pagePerBench * density + s.textMs) / 1000; // seconds per page
      const limit = Math.max(TUNE.min, Math.min(this.memoryCap(), Math.floor(TUNE.target / Math.max(perPage, 0.001))));
      return { limit, perPage, total: pdf.numPages };
    },
    est(pages, p) { return fmt(pages * p.perPage); },

    // ranges ↔ page lists
    pagesOf(ranges, n) { const out = []; for (const [a, b] of ranges || [[1, n]]) for (let p = Math.max(1, a); p <= Math.min(n, b); p++) out.push(p); return [...new Set(out)].sort((x, y) => x - y); },
    toRanges(pages) { const r = []; for (const p of pages) { const last = r[r.length - 1]; if (last && p === last[1] + 1) last[1] = p; else r.push([p, p]); } return r; },
    label(ranges) { return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', '); },
    key(ranges) { return ranges ? ranges.map((r) => r.join('-')).join(',') : 'all'; },

    // No bookmarks? Find chapter titles quickly from text sizes alone (text extraction is the cheap part
    // of a scan, ~2 ms a page): on each page take its largest text; the chapter tier is the largest size
    // that starts between 2 and 90 pages (like the full scanner), and titles repeated as running headers drop out.
    async quickChapters(pdf, progress) {
      const n = pdf.numPages, tops = [], sizeW = new Map();
      for (let p = 1; p <= n; p++) {
        const page = await pdf.getPage(p), tc = await page.getTextContent(); page.cleanup && page.cleanup();
        const lines = []; let cur = null;
        for (const it of tc.items) {
          if (!it.str) continue;
          const sz = Math.round(Math.hypot(it.transform[0], it.transform[1]) * 2) / 2, y = it.transform[5];
          if (it.str.trim()) sizeW.set(sz, (sizeW.get(sz) || 0) + it.str.length);
          if (cur && Math.abs(cur.y - y) < sz * 0.5 && Math.abs(cur.s - sz) < 0.6) cur.t += (/\s$/.test(cur.t) || /^\s/.test(it.str) ? '' : ' ') + it.str;
          else { if (cur) lines.push(cur); cur = { t: it.str, s: sz, y }; }
        }
        if (cur) lines.push(cur);
        const words = lines.filter((l) => /[A-Za-z]{3}/.test(l.t) && l.t.trim().length <= 120);
        if (words.length) { const top = Math.max(...words.map((l) => l.s)); tops.push({ p, s: top, t: words.filter((l) => l.s === top).slice(0, 3).map((l) => l.t.trim()).join(' ').replace(/\s+/g, ' ') }); }
        if (p % 10 === 0 || p === n) { progress && progress(p, n); await new Promise((r) => setTimeout(r)); }
      }
      let body = 10, bw = 0; for (const [sz, w] of sizeW) if (w > bw) { bw = w; body = sz; }
      const count = new Map(); for (const x of tops) if (x.s >= body * 1.3) count.set(x.s, (count.get(x.s) || 0) + 1);
      const tier = [...count.entries()].sort((a, b) => b[0] - a[0]).find(([, c]) => c >= 2 && c <= Math.min(90, n / 2));
      if (!tier) return null;
      const seen = new Map(); for (const x of tops) if (x.s >= tier[0] * 0.98) seen.set(x.t, (seen.get(x.t) || 0) + 1);
      const list = []; let last = '';
      for (const x of tops) if (x.s >= tier[0] * 0.98 && seen.get(x.t) <= 3 && x.t !== last) { list.push({ title: x.t.slice(0, 90), page: x.p }); last = x.t; }
      return list.length >= 2 ? list : null;
    },

    // the pop-up: resolves { ranges } | { all: true } | { saved: doc }, or null when cancelled
    async ask(pdf, file, plan, progress) {
      const n = pdf.numPages;
      let outline = null; try { outline = await pdfOutlineChapters(pdf); } catch (e) { /* no bookmarks */ }
      if (!outline && n <= 2000) outline = await this.quickChapters(pdf, progress);
      const chs = (outline || []).filter((c) => c.page >= 1 && c.page <= n).sort((a, b) => a.page - b.page)
        .map((c, i, arr) => ({ title: c.title, a: c.page, b: i + 1 < arr.length ? Math.max(c.page, arr[i + 1].page - 1) : n }));
      const saved = (await DB.all('docs')).filter((d) => d.name === file.name && d.size === file.size && d.scanPages);
      // default: whole chapters from the start that fit the budget (at least one), else pages 1…limit
      const pick = new Set(); let used = 0;
      for (let i = 0; i < chs.length; i++) { const len = chs[i].b - chs[i].a + 1; if (pick.size && used + len > plan.limit) break; pick.add(i); used += len; }
      let mode = chs.length >= 2 ? 'chapters' : 'range';
      return new Promise((resolve) => {
        let done = false; const finish = (v) => { if (done) return; done = true; resolve(v); };
        const body = `
          <p class="cx-sum">Scanning is quick up to <b>${plan.limit} pages</b> on this device (${this.est(plan.limit, plan)}). All ${n} pages would take ${this.est(n, plan)} and use more storage, so pick the part you are studying now. You can scan other parts later.</p>
          ${saved.length ? `<div class="in-sub">Already scanned on this device</div><div class="pb-saved">${saved.map((d) => `<button class="btn sm" data-saved="${esc(d.id)}">📄 Pages ${esc(this.label(d.scanPages))} · open</button>`).join('')}</div>` : ''}
          ${chs.length >= 2 ? `<div class="seg pb-seg" role="group"><button data-mode="chapters">Chapters</button><button data-mode="range">Page range</button></div>` : ''}
          <div class="pb-chapters">${chs.map((c, i) => `<label class="pb-ch"><input type="checkbox" data-ch="${i}" ${pick.has(i) ? 'checked' : ''}><span>${esc(c.title)}</span><i>p. ${c.a}–${c.b} · ${c.b - c.a + 1}</i></label>`).join('')}</div>
          <div class="pb-range"><label>From page <input class="inp" type="number" id="pbFrom" min="1" max="${n}" value="1"></label><label>to <input class="inp" type="number" id="pbTo" min="1" max="${n}" value="${Math.min(n, plan.limit)}"></label>
            <div class="pb-quick">${[0, 1, 2, 3].map((k) => k * plan.limit + 1).filter((a) => a <= n).map((a) => `<button class="chip" data-quick="${a}">${a}–${Math.min(n, a + plan.limit - 1)}</button>`).join('')}</div></div>
          <div class="pb-total" id="pbTotal"></div>`;
        const el = window.StudyDialog.open({
          title: 'Which pages should HoloStudy scan?', eyebrow: `Large PDF · ${n} pages`, body, wide: true, onClose: () => finish(null),
          actions: [
            { label: 'Scan selected pages', primary: true, keepOpen: true, onClick: () => { const r = selection(); if (!r.length) return; window.StudyDialog.close(true); finish({ ranges: this.toRanges(r) }); } },
            { label: `Scan all ${n} pages (${this.est(n, plan)})`, onClick: () => finish({ all: true }) },
            { label: 'Cancel', ghost: true, onClick: () => finish(null) },
          ],
        });
        el.querySelector('.cx-sheet').classList.add('in-sheet', 'pb-sheet');
        const selection = () => {
          if (mode === 'chapters') { const out = []; el.querySelectorAll('[data-ch]:checked').forEach((cb) => { const c = chs[+cb.dataset.ch]; for (let p = c.a; p <= c.b; p++) out.push(p); }); return [...new Set(out)].sort((a, b) => a - b); }
          let a = parseInt($('#pbFrom', el).value, 10), b = parseInt($('#pbTo', el).value, 10);
          if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
          a = Math.max(1, Math.min(n, a)); b = Math.max(1, Math.min(n, b)); if (a > b) [a, b] = [b, a];
          return this.pagesOf([[a, b]], n);
        };
        const update = () => {
          el.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
          $('.pb-chapters', el).hidden = mode !== 'chapters'; $('.pb-range', el).hidden = mode !== 'range';
          const k = selection().length, over = k > plan.limit;
          $('#pbTotal', el).innerHTML = k ? `Selected <b>${k} page${k === 1 ? '' : 's'}</b> · scan ${this.est(k, plan)}${over ? ` · <span class="pb-warn">more than the ${plan.limit} recommended, so it will be slower</span>` : ''}` : '<span class="pb-warn">Pick at least one chapter or page.</span>';
          const go = el.querySelector('.cx-actions [data-i="0"]'); if (go) go.disabled = !k;
        };
        el.addEventListener('click', (e) => {
          const m = e.target.closest('[data-mode]'); if (m) { mode = m.dataset.mode; update(); return; }
          const q = e.target.closest('[data-quick]'); if (q) { const a = +q.dataset.quick; $('#pbFrom', el).value = a; $('#pbTo', el).value = Math.min(n, a + plan.limit - 1); update(); return; }
          const s = e.target.closest('[data-saved]'); if (s) { const d = saved.find((x) => x.id === s.dataset.saved); window.StudyDialog.close(true); finish({ saved: d }); }
        });
        el.addEventListener('input', update); el.addEventListener('change', update);
        update();
      });
    },
  };
  window.PageBudget = PageBudget;

  const css = document.createElement('style');
  css.textContent = `
  .pb-sheet .cx-body { display: flex; flex-direction: column; gap: 10px; }
  .pb-saved, .pb-quick { display: flex; flex-wrap: wrap; gap: 6px; }
  .pb-seg { align-self: flex-start; }
  .pb-chapters { display: flex; flex-direction: column; gap: 2px; max-height: min(44vh, 320px); overflow-y: auto; border: 1px solid var(--border); border-radius: 10px; padding: 4px; }
  .pb-ch { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; font-size: 13px; color: var(--text-2); cursor: pointer; }
  .pb-ch:hover { background: var(--card); }
  .pb-ch input { width: 18px; height: 18px; accent-color: var(--chrome); flex-shrink: 0; }
  .pb-ch span { flex: 1; min-width: 0; }
  .pb-ch i { font-style: normal; font-family: var(--font-mono); font-size: 11px; color: var(--muted); white-space: nowrap; }
  .pb-range { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
  .pb-range label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2); }
  .pb-range .inp { width: 90px; }
  .pb-quick { width: 100%; }
  .pb-total { font-size: 13px; color: var(--text-2); }
  .pb-warn { color: var(--warn); }
  `;
  document.head.appendChild(css);
})();
