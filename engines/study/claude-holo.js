/* Claude holograms — turn a chapter of the student's own document into a teaching hologram.
   Claude reads the chapter (plus its figure pages, for PDFs) and returns a small concept model as
   structured JSON: numbered parts, how they connect, a narrated walkthrough and quick-check questions.
   This file lays the parts out in 3-D, draws them with the console's hologram engine, narrates the
   walkthrough with the device's voice, and caches each hologram so it is paid for once.
   Also: ClaudeSetup — the step-by-step popup that shows how to get and enter a Claude API key.
   Loaded after study.html's main script; uses its globals (HS, UI, Holo, Voice, Player, ClaudeAPI…). */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ───────────────────────── the hologram spec Claude returns ─────────────────────────
  const CONCEPTS = ['process', 'cycle', 'structure', 'hierarchy', 'comparison', 'timeline', 'relationship', 'formula'];
  const SHAPES = ['sphere', 'cube', 'cylinder', 'ring', 'cone', 'octahedron', 'torus', 'plane'];
  const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const str = (description) => ({ type: 'string', description });
  const SCHEMA = obj({
    title: str('Short title for the hologram (at most 8 words)'),
    concept_type: { type: 'string', enum: CONCEPTS, description: 'The teaching pattern the chapter uses for this material' },
    summary: str('One or two sentences: what the student should understand from the model'),
    parts: {
      type: 'array', description: '3 to 9 parts of the concept, in teaching order',
      items: obj({
        id: str('Short unique id, e.g. "p1"'),
        label: str('Name of the part, at most 4 words'),
        detail: str('One sentence explaining the part, faithful to the chapter'),
        shape: { type: 'string', enum: SHAPES, description: 'A shape that suits the part' },
        size: { type: 'string', enum: ['small', 'medium', 'large'], description: 'Relative importance' },
        group: { type: 'string', enum: ['a', 'b', 'c'], description: 'For comparisons: side a, side b, or c for shared; otherwise "a"' },
      }),
    },
    links: {
      type: 'array', description: 'How parts connect (flow, cause, contains, equals…)',
      items: obj({ from: str('id of the source part'), to: str('id of the target part'), label: str('Relationship in 1 to 4 words') }),
    },
    steps: {
      type: 'array', description: 'Guided walkthrough, one step per part or idea, in the order a teacher would explain it',
      items: obj({ part: str('id of the part to highlight'), narration: str('1 or 2 plain spoken sentences, no symbols or markdown') }),
    },
    check: {
      type: 'array', description: '2 or 3 multiple-choice questions that test understanding of the model',
      items: obj({
        question: str('The question'),
        options: { type: 'array', items: { type: 'string' }, description: 'Exactly 4 answer options' },
        answer_index: { type: 'integer', description: 'Index (0 to 3) of the correct option' },
        explanation: str('One sentence on why that answer is right'),
      }),
    },
  });

  const SYSTEM = `You design teaching holograms for HoloStudy, a study app. A student uploaded their own textbook; you get one chapter (or one section) of it, sometimes with images of its figure pages. Turn how the book teaches this material into a small 3-D concept model the student can rotate and walk through.

Choose the concept_type that matches the material: "cycle" for repeating loops, "process" for ordered steps, "timeline" for dated sequences, "hierarchy" for classifications and parent/child structures, "comparison" for two things set side by side (use group a and b, and c for what they share), "structure" for the components of one thing (the first part is the core), "relationship" or "formula" for how quantities or ideas combine (the first part is the central idea or result).

Use 3 to 9 parts with short labels. Base every detail, link and narration on the provided text and figures. The narration is read aloud by a speech engine, so write plain spoken sentences without symbols, markdown or abbreviations that read badly. Check questions should test understanding of the model, with four plausible options.`;

  // ───────────────────────── cache (one hologram per chapter/section, paid for once) ─────────────────────────
  const Store = {
    key: (docId, chN, focus) => `hs.claudeholo.v1.${docId}.${chN}.${focus}`,
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ───────────────────────── validate what came back (never trust shape blindly) ─────────────────────────
  function validate(s) {
    if (!s || !Array.isArray(s.parts)) throw new Error('Claude returned an unexpected answer. Try building again.');
    const ids = new Set(), parts = [];
    for (const p of s.parts) {
      if (!p || !p.id || ids.has(String(p.id))) continue;
      ids.add(String(p.id));
      parts.push({
        id: String(p.id), label: String(p.label || p.id).slice(0, 48), detail: String(p.detail || '').slice(0, 400),
        shape: SHAPES.includes(p.shape) ? p.shape : 'sphere', size: ['small', 'medium', 'large'].includes(p.size) ? p.size : 'medium',
        group: ['a', 'b', 'c'].includes(p.group) ? p.group : 'a',
      });
      if (parts.length >= 10) break;
    }
    if (parts.length < 2) throw new Error('Claude returned too few parts to build a hologram. Try a longer chapter or section.');
    const links = (s.links || []).filter((l) => l && ids.has(String(l.from)) && ids.has(String(l.to)) && l.from !== l.to).slice(0, 18)
      .map((l) => ({ from: String(l.from), to: String(l.to), label: String(l.label || '').slice(0, 40) }));
    let steps = (s.steps || []).filter((st) => st && ids.has(String(st.part)) && st.narration).slice(0, 14)
      .map((st) => ({ part: String(st.part), narration: String(st.narration).slice(0, 600) }));
    if (!steps.length) steps = parts.map((p) => ({ part: p.id, narration: `${p.label}. ${p.detail}` }));
    const check = (s.check || []).filter((q) => q && q.question && Array.isArray(q.options) && q.options.length >= 2 && Number.isInteger(q.answer_index) && q.answer_index >= 0 && q.answer_index < q.options.length).slice(0, 4)
      .map((q) => ({ question: String(q.question), options: q.options.slice(0, 4).map(String), answer_index: q.answer_index, explanation: String(q.explanation || '') }));
    return { title: String(s.title || 'Concept model').slice(0, 80), concept_type: CONCEPTS.includes(s.concept_type) ? s.concept_type : 'relationship', summary: String(s.summary || ''), parts, links, steps, check };
  }

  // ───────────────────────── 3-D layout + wireframe scene ─────────────────────────
  function layout(spec) {
    const ps = spec.parts, n = ps.length, pos = new Map(), T = spec.concept_type;
    if (T === 'cycle') ps.forEach((p, i) => { const a = -Math.PI / 2 + (i / n) * TAU; pos.set(p.id, [1.15 * Math.cos(a), 0.08 * Math.sin(i * 1.7), 1.15 * Math.sin(a)]); });
    else if (T === 'process' || T === 'timeline') ps.forEach((p, i) => { const u = n === 1 ? 0.5 : i / (n - 1); pos.set(p.id, [-1.35 + 2.7 * u, T === 'timeline' ? 0 : 0.32 * Math.sin(u * Math.PI) - 0.12, T === 'timeline' ? 0 : i % 2 ? 0.28 : -0.28]); });
    else if (T === 'hierarchy') {
      const incoming = new Map(ps.map((p) => [p.id, 0])); spec.links.forEach((l) => incoming.set(l.to, incoming.get(l.to) + 1));
      const level = new Map(); let queue = ps.filter((p) => !incoming.get(p.id)).map((p) => p.id); if (!queue.length) queue = [ps[0].id];
      queue.forEach((id) => level.set(id, 0));
      while (queue.length) { const id = queue.shift(); for (const l of spec.links) if (l.from === id && !level.has(l.to)) { level.set(l.to, level.get(id) + 1); queue.push(l.to); } }
      const maxL = Math.max(0, ...level.values()); ps.forEach((p) => { if (!level.has(p.id)) level.set(p.id, maxL + 1); });
      const rows = new Map(); ps.forEach((p) => { const L = Math.min(3, level.get(p.id)); if (!rows.has(L)) rows.set(L, []); rows.get(L).push(p.id); });
      const nRows = rows.size; [...rows.keys()].sort().forEach((L, ri) => { const row = rows.get(L); row.forEach((id, k) => { const u = row.length === 1 ? 0.5 : k / (row.length - 1); pos.set(id, [(-1.25 + 2.5 * u) * Math.min(1, 0.45 + row.length * 0.2), 0.95 - ri * (1.9 / Math.max(1, nRows - 1 || 1)), k % 2 ? 0.2 : -0.2]); }); });
    } else if (T === 'comparison') {
      const cols = { a: [], b: [], c: [] }; ps.forEach((p) => cols[p.group].push(p.id));
      Object.entries({ a: -0.95, b: 0.95, c: 0 }).forEach(([g, x]) => cols[g].forEach((id, k) => pos.set(id, [x, 0.85 - k * (1.7 / Math.max(1, cols[g].length - 1 || 1)), 0])));
    } else { // structure / relationship / formula: hub and spoke around the core idea
      pos.set(ps[0].id, [0, 0, 0]);
      ps.slice(1).forEach((p, i, rest) => { const a = (i / rest.length) * TAU; pos.set(p.id, [1.2 * Math.cos(a), i % 2 ? 0.3 : -0.3, 1.2 * Math.sin(a)]); });
    }
    return pos;
  }

  function scene(spec) {
    const { V, sphere, ring, octa } = Holo.shapes;
    const verts = [], edges = [], points = [], labels = [], ranges = [];
    const add = (g) => { const off = verts.length; verts.push(...g.verts); g.edges.forEach((e) => edges.push([e[0] + off, e[1] + off])); return [off, verts.length]; };
    const sizeOf = { small: 0.12, medium: 0.17, large: 0.24 };
    const pos = layout(spec);
    const shape = (kind, [x, y, z], s) => {
      switch (kind) {
        case 'cube': { const v = []; for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) v.push(V(x + a * s, y + b * s, z + c * s)); return { verts: v, edges: [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]] }; }
        case 'cylinder': { const top = ring(x, y + s * 0.8, z, s, 12), bot = ring(x, y - s * 0.8, z, s, 12); const v = [...top.verts, ...bot.verts], e = [...top.edges, ...bot.edges.map((q) => [q[0] + 12, q[1] + 12])]; for (let i = 0; i < 12; i += 3) e.push([i, i + 12]); return { verts: v, edges: e }; }
        case 'ring': { const a = ring(x, y, z, s * 1.2, 20), b = ring(x, y, z, s * 0.75, 16); return { verts: [...a.verts, ...b.verts], edges: [...a.edges, ...b.edges.map((q) => [q[0] + 20, q[1] + 20])] }; }
        case 'cone': { const b = ring(x, y - s * 0.7, z, s, 12); const v = [...b.verts, V(x, y + s * 1.1, z)]; const e = [...b.edges]; for (let i = 0; i < 12; i += 2) e.push([i, 12]); return { verts: v, edges: e }; }
        case 'octahedron': return octa(x, y, z, s * 1.2);
        case 'torus': { const v = [], e = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, cx = x + s * Math.cos(a), cz = z + s * Math.sin(a); for (let j = 0; j < 6; j++) { const b = (j / 6) * TAU; v.push(V(cx + s * 0.35 * Math.cos(b) * Math.cos(a), y + s * 0.35 * Math.sin(b), cz + s * 0.35 * Math.cos(b) * Math.sin(a))); e.push([i * 6 + j, i * 6 + ((j + 1) % 6)], [i * 6 + j, ((i + 1) % 10) * 6 + j]); } } return { verts: v, edges: e }; }
        case 'plane': { const v = [], e = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { v.push(V(x - s + (2 * s * i) / 3, y, z - s + (2 * s * j) / 3)); if (j < 3) e.push([i * 4 + j, i * 4 + j + 1]); if (i < 3) e.push([i * 4 + j, (i + 1) * 4 + j]); } return { verts: v, edges: e }; }
        default: return sphere(x, y, z, s, 6, 10);
      }
    };
    // guides that show the teaching pattern
    const T = spec.concept_type;
    if (T === 'cycle') add(ring(0, 0, 0, 1.15, 64));
    if (T === 'timeline') { add({ verts: [V(-1.55, -0.3, 0), V(1.55, -0.3, 0)], edges: [[0, 1]] }); spec.parts.forEach((p) => { const [x] = pos.get(p.id); add({ verts: [V(x, -0.3, 0), V(x, -0.16, 0)], edges: [[0, 1]] }); }); }
    if (T === 'structure') { add(ring(0, 0, 0, 1.2, 56, 0.3)); add(ring(0, 0, 0, 0.55, 32, -0.4, 0.3)); }
    if (T === 'comparison' && spec.parts.some((p) => p.group === 'b')) add({ verts: [V(0, 1.1, 0), V(0, -1.1, 0)], edges: [[0, 1]] });
    // parts, each with a label point above it
    spec.parts.forEach((p, i) => {
      const c = pos.get(p.id), s = sizeOf[p.size];
      ranges.push({ range: add(shape(p.shape, c, s)), center: c });
      const top = verts.length; verts.push(V(c[0], c[1] + s * 1.35, c[2])); points.push(top);
      labels.push({ v: top, n: i + 1, text: p.label });
    });
    // links: straight arrows, or arcs around a cycle, trimmed so they stop at each shape
    for (const l of spec.links) {
      const a = pos.get(l.from), b = pos.get(l.to), sa = sizeOf[spec.parts.find((p) => p.id === l.from).size], sb = sizeOf[spec.parts.find((p) => p.id === l.to).size];
      const pts = [];
      // around a cycle, arrows arc outward: the Bezier control point is the chord's midpoint pushed out
      const ctrl = T === 'cycle' ? [(a[0] + b[0]) / 2 * 1.3, (a[1] + b[1]) / 2 + 0.15, (a[2] + b[2]) / 2 * 1.3] : null;
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        pts.push(ctrl ? [0, 1, 2].map((d) => (1 - t) * (1 - t) * a[d] + 2 * (1 - t) * t * ctrl[d] + t * t * b[d]) : [0, 1, 2].map((d) => a[d] + (b[d] - a[d]) * t));
      }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, cut0 = Math.min(0.45, (sa * 1.3) / len), cut1 = Math.max(0.55, 1 - (sb * 1.4) / len);
      const trimmed = pts.filter((_, k) => k / 12 >= cut0 && k / 12 <= cut1);
      if (trimmed.length < 2) continue;
      const g = { verts: trimmed.map((q) => V(...q)), edges: trimmed.slice(1).map((_, k) => [k, k + 1]) };
      // arrow head at the end
      const tip = trimmed[trimmed.length - 1], prev = trimmed[trimmed.length - 2];
      let d = [tip[0] - prev[0], tip[1] - prev[1], tip[2] - prev[2]]; const dl = Math.hypot(...d) || 1; d = d.map((q) => q / dl);
      const up = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      let side = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]]; const sl = Math.hypot(...side) || 1; side = side.map((q) => q / sl);
      const up2 = [d[1] * side[2] - d[2] * side[1], d[2] * side[0] - d[0] * side[2], d[0] * side[1] - d[1] * side[0]];
      const base = tip.map((q, k) => q - d[k] * 0.09), tipI = g.verts.length - 1;
      for (const w of [side, side.map((q) => -q), up2, up2.map((q) => -q)]) { g.verts.push(V(...base.map((q, k) => q + w[k] * 0.045))); g.edges.push([tipI, g.verts.length - 1]); }
      add(g);
    }
    const base = verts.map((v) => v.slice());
    const mesh = {
      id: 'claude', label: 'Claude hologram', verts, edges, points, labels, active: 0,
      // the highlighted part gently pulses
      animate(t, vs) {
        for (let i = 0; i < ranges.length; i++) {
          const { range: [a, b], center: c } = ranges[i], k = mesh.active === i + 1 ? 1 + 0.14 * Math.sin(t * 4.2) : 1;
          for (let j = a; j < b; j++) vs[j] = [c[0] + (base[j][0] - c[0]) * k, c[1] + (base[j][1] - c[1]) * k, c[2] + (base[j][2] - c[2]) * k];
        }
      },
    };
    mesh.partPos = (n) => pos.get(spec.parts[n - 1].id);
    return mesh;
  }

  // ───────────────────────── a built-in sample, so students see what they get before setting anything up ─────────────────────────
  const SAMPLE = {
    title: 'The water cycle', concept_type: 'cycle',
    summary: 'Water moves in a loop between the oceans, the air and the land, driven by the Sun\'s heat and by gravity.',
    parts: [
      { id: 'evap', label: 'Evaporation', detail: 'The Sun heats water in oceans, lakes and rivers, turning it into water vapour that rises.', shape: 'sphere', size: 'large', group: 'a' },
      { id: 'cond', label: 'Condensation', detail: 'Rising vapour cools and condenses into tiny droplets that form clouds.', shape: 'torus', size: 'medium', group: 'a' },
      { id: 'prec', label: 'Precipitation', detail: 'Droplets join and fall back to Earth as rain, snow or hail.', shape: 'cone', size: 'medium', group: 'a' },
      { id: 'coll', label: 'Collection', detail: 'Water gathers in oceans, lakes and underground, or runs off the land into rivers.', shape: 'plane', size: 'large', group: 'a' },
      { id: 'tran', label: 'Transpiration', detail: 'Plants release water vapour from their leaves, adding moisture to the air.', shape: 'cylinder', size: 'small', group: 'a' },
    ],
    links: [
      { from: 'evap', to: 'cond', label: 'vapour rises' }, { from: 'cond', to: 'prec', label: 'droplets grow' },
      { from: 'prec', to: 'coll', label: 'falls to Earth' }, { from: 'coll', to: 'tran', label: 'plants absorb' }, { from: 'tran', to: 'evap', label: 'vapour joins' },
    ],
    steps: [
      { part: 'evap', narration: 'It starts with the Sun. Its heat turns surface water into water vapour, which rises into the air.' },
      { part: 'cond', narration: 'High up, the vapour cools and condenses into tiny droplets. Billions of them together make a cloud.' },
      { part: 'prec', narration: 'When droplets grow heavy enough, they fall as rain, snow or hail. This is precipitation.' },
      { part: 'coll', narration: 'The water collects in oceans, lakes and underground, or runs off into rivers.' },
      { part: 'tran', narration: 'Plants take up some of that water and release vapour from their leaves, feeding the loop again.' },
    ],
    check: [
      { question: 'What provides the energy that drives evaporation?', options: ['The Moon\'s gravity', 'Heat from the Sun', 'Wind over the ocean', 'Earth\'s magnetic field'], answer_index: 1, explanation: 'Solar heat gives water molecules the energy to escape as vapour.' },
      { question: 'Clouds form mainly during which stage?', options: ['Collection', 'Transpiration', 'Condensation', 'Precipitation'], answer_index: 2, explanation: 'Cooling vapour condenses into droplets, and many droplets together form a cloud.' },
    ],
  };

  // ───────────────────────── the Hologram-tab feature ─────────────────────────
  const CX = {
    spec: null, meta: null, mesh: null, on: false, step: -1, playing: false, focus: 'all', figures: true, busy: null,

    install() {
      // panel under the 3-D stage
      const pane = $('#pane-holo'); if (!pane || $('#cxPanel')) return;
      const panel = document.createElement('section'); panel.id = 'cxPanel'; panel.className = 'cx-panel'; panel.setAttribute('aria-label', 'Claude hologram');
      pane.appendChild(panel);
      // a "Claude hologram" chip next to the built-in models
      const orig = UI.renderModelChips.bind(UI);
      UI.renderModelChips = function () {
        orig();
        const el = $('#modelChips'); if (!el) return;
        const b = document.createElement('button'); b.className = 'chip' + (CX.on ? ' on' : ''); b.textContent = '✦ Claude hologram';
        b.addEventListener('click', () => CX.toggle()); el.prepend(b);
        if (CX.on) { // keep the stage clear: the built-in models collapse into one chip while a Claude scene is open
          el.querySelectorAll('[data-model]').forEach((x) => x.remove());
          const back = document.createElement('button'); back.className = 'chip'; back.textContent = 'Built-in models';
          back.addEventListener('click', () => { CX.leave(); UI.renderHolo(); }); el.appendChild(back);
        }
      };
      // switching to a built-in model or another chapter leaves the Claude scene
      const origSet = UI.holoMain.setModel; UI.holoMain.setModel = (id) => { CX.leave(); return origSet(id); };
      // re-rendering the tab keeps an open Claude scene (it would otherwise reset to a built-in model)
      const origRender = UI.renderHolo.bind(UI);
      UI.renderHolo = function () {
        CX.onChapter();
        if (CX.on && CX.mesh) { if (UI.holoMain.mesh !== CX.mesh) UI.holoMain.setMesh(CX.mesh); UI.renderModelChips(); return; }
        origRender();
      };
      this.render();
    },
    key() { const c = UI.chapter(); return HS.doc && c ? Store.key(HS.doc.id, c.n, this.focus) : null; },
    onChapter() {
      const c = UI.chapter(); const id = HS.doc && c ? HS.doc.id + ':' + c.n : '';
      if (id !== this._chapterId) { this._chapterId = id; this.focus = 'all'; this.leave(); this.spec = null; this.render(); }
    },
    toggle() { if (this.on) { this.leave(); UI.renderHolo(); } else { this.open(); } },
    open() {
      const saved = this.key() && Store.get(this.key());
      if (saved) this.show(saved.spec, saved.meta); else { this.spec = null; this.render(); $('#cxPanel').scrollIntoView({ block: 'nearest' }); }
    },
    leave() {
      if (!this.on) return;
      this.stop(); this.on = false; UI.holoMain.dist = 3.2;
      if (this._cardWas !== undefined) { $('#mainCard').hidden = !this._cardWas; this._cardWas = undefined; }
      this.render();
    },

    // ── build with Claude
    async build() {
      if (this.busy) return;
      if (!HS.settings.apiKey) return ClaudeSetup.open({ then: () => HS.settings.apiKey && this.build() });
      const c = UI.chapter(); if (!c) return;
      const model = ClaudeAPI.model(), ctl = new AbortController(), key = this.key();
      this.busy = { ctl, lines: ['Preparing the chapter…'], chars: 0 }; this.render();
      const note = (s) => { this.busy.lines.push(s); this.render(); };
      try {
        const { text, pages, focusLabel, truncated } = this.chapterText(c);
        const images = [];
        if (this.figures && HS.pdf && window.pdfjsLib) {
          note('Finding figure pages…');
          for (const p of await this.figurePages(pages[0], pages[1], 3)) { if (ctl.signal.aborted) break; images.push({ p, data: await this.pageJpeg(p) }); }
          if (images.length) note(`Attaching ${images.length} figure page${images.length > 1 ? 's' : ''} (p. ${images.map((i) => i.p).join(', ')})`);
        }
        note(`Sending to ${(MODELS.find((m) => m.id === model) || { label: model }).label.replace(' (default)', '')}…`);
        const content = [
          ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: im.data } })),
          { type: 'text', text: `Document: "${HS.doc.title}"\nChapter ${c.n}: ${c.title}\nFocus: ${focusLabel}${images.length ? `\nFigure pages attached above: ${images.map((i) => i.p).join(', ')}` : ''}${truncated ? '\n(The text below is the first part of a long chapter.)' : ''}\n\n${text}` },
        ];
        const client = await ClaudeAPI.client();
        const stream = client.beta.messages.stream({
          ...ClaudeAPI.params(model, { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } }),
          max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content }],
        }, { signal: ctl.signal });
        let started = false;
        stream.on('text', (d) => { if (!started) { started = true; note('Designing the hologram…'); } this.busy.chars += d.length; this.renderBusy(); });
        const msg = await stream.finalMessage();
        if (msg.stop_reason === 'refusal') throw new Error('Claude declined to build a hologram for this text.');
        if (msg.stop_reason === 'max_tokens') throw new Error('The answer was cut off. Try a single section instead of the whole chapter.');
        const raw = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        let parsed; try { parsed = JSON.parse(raw); } catch (e) { throw new Error('Claude\'s answer was not valid JSON. Try building again.'); }
        const spec = validate(parsed);
        const meta = { model: msg.model || model, focus: focusLabel, figures: images.map((i) => i.p), at: Date.now(), usage: msg.usage, cost: ClaudeAPI.cost(model, msg.usage) };
        if (!Store.set(key, { spec, meta })) toast('Built, but there was no space to save it on this device.', true);
        this.busy = null; this.show(spec, meta); SFX.play('ok');
      } catch (e) {
        // SDK errors map to advice; errors raised above already carry a readable message
        const A = await ClaudeAPI.sdk();
        const code = e instanceof A.APIError || e instanceof A.APIUserAbortError ? await ClaudeAPI.errorCode(e) : null;
        this.busy = null; this.render();
        const copy = this.errorCopy(code, e);
        if (code !== 'cancelled') toast(copy, true); else toast('Stopped. Nothing was charged beyond what Claude had already written.');
        if (code === 'http_401' || code === 'http_403') ClaudeSetup.open({ step: 4, then: () => HS.settings.apiKey && this.build() });
      }
    },
    errorCopy(code, e) {
      return ({
        http_401: 'Your API key was rejected. Check it in the setup guide.', http_403: 'This API key is not allowed to use that model.',
        http_404: 'That model is not available to your API key. Pick another model in the setup guide.', http_429: 'Claude is busy (rate limit). Wait a few seconds and try again.',
        no_credit: 'Your Anthropic account has no API credit. Add credit at console.anthropic.com → Billing.', prompt_too_large: 'This chapter is too long for one hologram. Pick a single section.',
        network: 'Could not reach Claude. Check your internet connection.', server: 'Claude had a temporary problem. Try again in a minute.',
      })[code] || (e && e.message) || 'Something went wrong while building the hologram.';
    },
    chapterText(c) {
      const secs = c.sections || [];
      let blocks = c.blocks, focusLabel = 'Whole chapter', pages = [c.startPage, c.endPage];
      if (this.focus !== 'all' && secs[+this.focus]) {
        const s = secs[+this.focus], next = secs[+this.focus + 1];
        const i0 = c.blocks.findIndex((b) => b.kind !== 'p' && b.text === s.title);
        const i1 = next ? c.blocks.findIndex((b, i) => i > i0 && b.kind !== 'p' && b.text === next.title) : -1;
        blocks = i0 >= 0 ? c.blocks.slice(i0, i1 > i0 ? i1 : undefined) : c.blocks.filter((b) => b.page >= s.page && b.page <= (next ? next.page : c.endPage));
        focusLabel = `Section: ${s.title}`; pages = [s.page, next ? next.page : c.endPage];
      }
      const out = []; let used = 0, truncated = false;
      for (const b of blocks) { const line = (b.kind === 'p' ? `[p.${b.page}] ` : '## ') + b.text; if (used + line.length > 60000) { truncated = true; break; } out.push(line); used += line.length + 1; }
      return { text: out.join('\n'), pages, focusLabel, truncated };
    },
    // Pages with figures or tables: textbooks draw most diagrams as vector paths, not pictures, so score
    // each page by its drawing operations (plus images) and keep the pages that clearly stand out from
    // the chapter's typical page. The chapter's first page is skipped (usually a decorative title banner).
    async figurePages(from, to, max) {
      const O = pdfjsLib.OPS;
      const draw = new Set([O.constructPath, O.fill, O.eoFill, O.stroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke, O.closeStroke, O.shadingFill].filter((x) => x != null));
      const img = new Set([O.paintImageXObject, O.paintInlineImageXObject, O.paintImageMaskXObject, O.paintJpegXObject].filter((x) => x != null));
      const first = to - from >= 3 ? from + 1 : from, scored = [];
      for (let p = Math.max(1, first); p <= Math.min(HS.pdf.numPages, to, first + 30); p++) {
        try {
          const ops = await (await HS.pdf.getPage(p)).getOperatorList(); let s = 0;
          for (const fn of ops.fnArray) { if (draw.has(fn)) s++; else if (img.has(fn)) s += 25; }
          scored.push({ p, s });
        } catch (e) { /* skip an unreadable page */ }
      }
      if (!scored.length) return [];
      const median = scored.map((x) => x.s).sort((a, b) => a - b)[Math.floor(scored.length / 2)];
      return scored.filter((x) => x.s >= Math.max(20, median * 1.6)).sort((a, b) => b.s - a.s || a.p - b.p).slice(0, max).map((x) => x.p).sort((a, b) => a - b);
    },
    async pageJpeg(p) {
      const page = await HS.pdf.getPage(p), vp = page.getViewport({ scale: Math.min(2, 1100 / page.getViewport({ scale: 1 }).width) });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      const data = cv.toDataURL('image/jpeg', 0.72).split(',')[1]; cv.width = cv.height = 0; return data;
    },

    // ── show a hologram
    show(spec, meta) {
      this.stop(); this.spec = spec; this.meta = meta || null; this.on = true; this.step = -1;
      this.mesh = scene(spec);
      const view = UI.holoMain; view.setMesh(this.mesh); view.spin = true; view.dist = 3.9; $('#holoSpin').classList.toggle('on', true);
      // the mini-textbook card would cover the model; hide it while a Claude hologram is open
      if (this._cardWas === undefined) this._cardWas = !$('#mainCard').hidden;
      $('#mainCard').hidden = true;
      $('#mainHud').innerHTML = `<span class="l1">◈ CLAUDE HOLOGRAM</span><span class="l2">${esc(spec.title)}</span><span class="l2">PATTERN: ${esc(spec.concept_type.toUpperCase())}</span>`;
      UI.renderModelChips(); this.render();
    },
    highlight(n) {
      if (!this.mesh) return;
      this.mesh.active = n; const view = UI.holoMain, p = n ? this.mesh.partPos(n) : null;
      if (p) { view.spin = false; const target = Math.atan2(p[0], p[2]); let from = view.az; const d = ((target - from + Math.PI * 3) % TAU) - Math.PI, t0 = performance.now(); const ease = (now) => { const k = Math.min(1, (now - t0) / 700); view.az = from + d * (1 - Math.pow(1 - k, 3)); if (k < 1 && this.mesh && this.mesh.active === n) requestAnimationFrame(ease); }; requestAnimationFrame(ease); }
      this.render();
    },

    // ── narrated walkthrough
    play(from = 0) {
      if (!this.spec) return;
      if (typeof Player !== 'undefined' && Player.playing) Player.stop();
      this.playing = true; this.step = from; this.speakStep();
    },
    speakStep() {
      const st = this.spec && this.spec.steps[this.step];
      if (!this.playing || !st) { this.stop(); return; }
      const n = this.spec.parts.findIndex((p) => p.id === st.part) + 1;
      this.highlight(n);
      const next = () => { if (!this.playing) return; this.step++; setTimeout(() => this.speakStep(), 450); };
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(st.narration), v = Voice.current && Voice.current();
        if (v) { u.voice = v; u.lang = v.lang; }
        u.rate = HS.settings.rate || 1; u.onend = next; u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled') this._timer = setTimeout(next, st.narration.split(/\s+/).length * 380); };
        this._utt = u; speechSynthesis.speak(u);
      } else this._timer = setTimeout(next, st.narration.split(/\s+/).length * 380);
    },
    stop() {
      clearTimeout(this._timer); this.playing = false;
      if ('speechSynthesis' in window && this._utt) { speechSynthesis.cancel(); this._utt = null; }
      if (this.mesh) { this.mesh.active = 0; if (UI.holoMain) UI.holoMain.spin = true; }
      if (this.on) this.render();
    },

    // ── panel
    renderBusy() { const el = $('#cxChars'); if (el && this.busy) el.textContent = this.busy.chars ? `${this.busy.chars.toLocaleString()} characters received` : 'Claude is reading and thinking…'; },
    render() {
      const el = $('#cxPanel'); if (!el) return;
      const c = UI.chapter(); if (!c || !HS.doc) { el.innerHTML = ''; return; }
      if (this.busy) {
        el.innerHTML = `<div class="cx-card"><div class="cx-row"><b class="cx-title">✦ Building a Claude hologram</b><button class="btn sm" id="cxCancel">Cancel</button></div>
          <div class="cx-bar"><i></i></div><ul class="cx-steps">${this.busy.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><div class="cx-note" id="cxChars"></div></div>`;
        $('#cxCancel').addEventListener('click', () => this.busy && this.busy.ctl.abort()); this.renderBusy(); return;
      }
      if (this.on && this.spec) {
        const s = this.spec, m = this.meta, st = this.playing ? s.steps[this.step] : null;
        const cost = m && m.cost != null ? ` · about $${m.cost < 0.01 ? '<0.01' : m.cost.toFixed(2)}` : '';
        el.innerHTML = `<div class="cx-card">
          <div class="cx-row"><b class="cx-title">✦ ${esc(s.title)}</b><span class="cx-tag">${esc(s.concept_type)}</span></div>
          <p class="cx-sum">${esc(s.summary)}</p>
          ${st ? `<div class="cx-caption" aria-live="polite"><b>${this.step + 1}/${s.steps.length}</b> ${esc(st.narration)}</div>` : ''}
          <div class="cx-actions">
            <button class="btn sm primary" id="cxPlay">${this.playing ? '■ Stop walkthrough' : '▶ Walkthrough'}</button>
            ${s.check.length ? '<button class="btn sm" id="cxCheck">Quick check</button>' : ''}
            ${m && m.sample ? '<button class="btn sm" id="cxBuild">Build one for this chapter</button>' : '<button class="btn sm" id="cxRebuild">Rebuild</button>'}
            <button class="btn sm ghost" id="cxClose">Close</button>
          </div>
          <ol class="cx-legend">${s.parts.map((p, i) => {
            const out = s.links.filter((l) => l.from === p.id).map((l) => `${esc(l.label || 'leads to')} → ${esc((s.parts.find((q) => q.id === l.to) || {}).label || '')}`);
            return `<li data-n="${i + 1}" class="${this.mesh && this.mesh.active === i + 1 ? 'on' : ''}"><b>${esc(p.label)}</b><span>${esc(p.detail)}</span>${out.length ? `<small>${out.join(' · ')}</small>` : ''}</li>`;
          }).join('')}</ol>
          <div id="cxQuiz"></div>
          <div class="cx-note">${m && m.sample ? 'Sample hologram, built in: no API key used.' : `Made by ${esc(m ? m.model : 'Claude')} from ${esc(m ? m.focus.toLowerCase() : 'this chapter')}${m && m.figures && m.figures.length ? ` + figure pages ${m.figures.join(', ')}` : ''}${cost}. Saved on this device, so reopening it is free.`}</div>
        </div>`;
        $('#cxPlay').addEventListener('click', () => (this.playing ? this.stop() : this.play(0)));
        const chk = $('#cxCheck'); if (chk) chk.addEventListener('click', () => this.renderQuiz());
        const rb = $('#cxRebuild'); if (rb) rb.addEventListener('click', () => { Store.del(this.key()); this.build(); });
        const bd = $('#cxBuild'); if (bd) bd.addEventListener('click', () => { this.leave(); this.build(); });
        $('#cxClose').addEventListener('click', () => { this.leave(); UI.renderHolo(); });
        el.querySelectorAll('.cx-legend li').forEach((li) => li.addEventListener('click', () => { this.stop(); const n = +li.dataset.n; this.highlight(this.mesh.active === n ? 0 : n); }));
        return;
      }
      // idle: offer to build one
      const secs = c.sections || [], saved = this.key() && Store.get(this.key());
      el.innerHTML = `<div class="cx-card">
        <div class="cx-row"><b class="cx-title">✦ Turn this chapter into a Claude hologram</b></div>
        <p class="cx-sum">Claude reads ${HS.pdf ? 'the chapter and its figure pages' : 'the chapter'} and builds a 3-D concept model with numbered parts, a narrated walkthrough and quick-check questions.</p>
        <div class="cx-form">
          <label>Focus<select class="sel" id="cxFocus"><option value="all">Whole chapter ${c.n}: ${esc(c.title)}</option>${secs.map((s, i) => `<option value="${i}" ${String(i) === this.focus ? 'selected' : ''}>Section: ${esc(s.title)}</option>`).join('')}</select></label>
          ${HS.pdf ? `<label class="cx-check"><input type="checkbox" id="cxFig" ${this.figures ? 'checked' : ''}> Include up to 3 figure pages (better diagrams, costs a little more)</label>` : ''}
        </div>
        <div class="cx-actions">
          ${saved ? '<button class="btn sm primary" id="cxOpen">Open saved hologram</button><button class="btn sm" id="cxGo">Rebuild</button>' : `<button class="btn sm primary" id="cxGo">${HS.settings.apiKey ? '✦ Build hologram' : '✦ Set up & build'}</button>`}
          <button class="btn sm" id="cxSample">See a sample</button>
          <button class="btn sm ghost" id="cxHelp">How to set up</button>
        </div>
        <div class="cx-note">${HS.settings.apiKey ? `Uses your Claude API key · model ${esc(ClaudeAPI.model())} · typically a few cents per hologram.` : 'Needs your own Claude API key. The setup guide shows how to get one in a few minutes.'}</div>
      </div>`;
      $('#cxFocus').addEventListener('change', (e) => { this.focus = e.target.value; this.render(); });
      const fig = $('#cxFig'); if (fig) fig.addEventListener('change', (e) => { this.figures = e.target.checked; });
      $('#cxGo').addEventListener('click', () => { if (saved) Store.del(this.key()); this.build(); });
      const op = $('#cxOpen'); if (op) op.addEventListener('click', () => this.show(saved.spec, saved.meta));
      $('#cxSample').addEventListener('click', () => this.show(validate(SAMPLE), { sample: true }));
      $('#cxHelp').addEventListener('click', () => ClaudeSetup.open({ then: () => this.render() }));
    },
    renderQuiz() {
      const box = $('#cxQuiz'); if (!box || !this.spec) return;
      box.innerHTML = `<div class="cx-quiz">${this.spec.check.map((q, qi) => `<div class="cx-q" data-q="${qi}"><b>${qi + 1}. ${esc(q.question)}</b>${q.options.map((o, oi) => `<button class="cx-opt" data-o="${oi}">${esc(o)}</button>`).join('')}<div class="cx-exp" hidden></div></div>`).join('')}</div>`;
      box.querySelectorAll('.cx-q').forEach((qEl) => qEl.querySelectorAll('.cx-opt').forEach((b) => b.addEventListener('click', () => {
        const q = this.spec.check[+qEl.dataset.q], pick = +b.dataset.o;
        qEl.querySelectorAll('.cx-opt').forEach((x, i) => { x.disabled = true; if (i === q.answer_index) x.classList.add('right'); else if (i === pick) x.classList.add('wrong'); });
        const ex = qEl.querySelector('.cx-exp'); ex.hidden = false; ex.textContent = (pick === q.answer_index ? 'Correct. ' : 'Not quite. ') + q.explanation;
        SFX.play(pick === q.answer_index ? 'ok' : 'err');
      })));
      box.scrollIntoView({ block: 'nearest' });
    },
  };

  // ───────────────────────── setup guide popup ─────────────────────────
  const STEPS = [
    { t: 'What Claude holograms do', body: () => `
      <div class="cx-flow" aria-hidden="true"><span class="cx-node">📄<small>Your chapter</small></span><span class="cx-pipe"><i></i></span><span class="cx-node cx-claude">✦<small>Claude</small></span><span class="cx-pipe"><i></i></span><span class="cx-node">◈<small>Hologram</small></span></div>
      <p>Claude reads a chapter of <b>your own</b> PDF, including its figures, and turns the way the book teaches it (a cycle, a process, a comparison…) into a 3-D model you can rotate. It adds a narrated walkthrough and quick-check questions.</p>
      <p>It runs on <b>your own Claude API key</b> from Anthropic. API use is pay-as-you-go and separate from a Claude.ai subscription. A hologram typically costs a few cents (Opus 5, the best quality: about $0.10–0.25; Sonnet 5 or Haiku 4.5: less). Each one is saved, so reopening it is free.</p>
      <button class="btn sm" data-sample>See a sample first (free)</button>` },
    { t: 'Step 1 · Open the Anthropic Console', body: () => `
      <div class="cx-mock"><div class="cx-mock-bar"><i></i><i></i><i></i><span>console.anthropic.com</span></div><div class="cx-mock-body"><div class="cx-mock-center"><b>Sign in or sign up</b><span class="cx-mock-btn">Continue with Google</span><span class="cx-mock-btn ghost">Continue with email</span></div></div></div>
      <p>Open <b>console.anthropic.com</b> and sign in, or create a free account with your email or Google account.</p>
      <button class="btn sm primary" data-link="https://console.anthropic.com/">Open console.anthropic.com ↗</button>` },
    { t: 'Step 2 · Add a little credit', body: () => `
      <div class="cx-mock"><div class="cx-mock-bar"><i></i><i></i><i></i><span>Settings › Billing</span></div><div class="cx-mock-body cx-mock-split"><ul class="cx-mock-side"><li>Workspaces</li><li class="on">Billing</li><li>API keys</li></ul><div><b>Credit balance</b><span class="cx-mock-big">$0.00</span><span class="cx-mock-btn hl">Buy credits</span></div></div></div>
      <p>In the Console go to <b>Settings → Billing</b> and buy some credit. A small amount goes a long way: $5 covers roughly 20–50 Opus 5 holograms, or many more with Sonnet 5.</p>
      <p class="cx-note">You can set a monthly spend limit there too.</p>` },
    { t: 'Step 3 · Create an API key', body: () => `
      <div class="cx-mock"><div class="cx-mock-bar"><i></i><i></i><i></i><span>Settings › API keys</span></div><div class="cx-mock-body cx-mock-split"><ul class="cx-mock-side"><li>Workspaces</li><li>Billing</li><li class="on">API keys</li></ul><div><b>API keys</b><span class="cx-mock-btn hl">+ Create key</span><span class="cx-mock-key">sk-ant-api03-••••••••••••</span></div></div></div>
      <p>Go to <b>Settings → API keys</b>, press <b>Create key</b>, name it <i>HoloStudy</i>, and <b>copy</b> the key. It starts with <code>sk-ant-</code>.</p>
      <p class="cx-note">The key is shown only once. Treat it like a password: don't share it or post it anywhere.</p>` },
    { t: 'Step 4 · Paste your key here', body: () => `
      <label class="cx-field">Claude API key<input class="inp" id="cxKey" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" value="${esc(HS.settings.apiKey || '')}"></label>
      <label class="cx-field">Model<select class="sel" id="cxModel">${MODELS.map((m) => `<option value="${m.id}" ${ClaudeAPI.model() === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
      <div class="cx-actions"><button class="btn sm primary" id="cxTest">Test & save key</button><button class="btn sm ghost" id="cxShow" type="button">Show key</button></div>
      <div class="cx-result" id="cxResult" role="status"></div>
      <p class="cx-note">Your key is stored only on this device. Chapters you turn into holograms are sent from this device to Anthropic's API; nothing goes anywhere else.</p>` },
  ];
  const ClaudeSetup = {
    i: 0, then: null,
    open(opts = {}) {
      this.then = opts.then || null; this.i = opts.step != null ? opts.step : (HS.settings.apiKey ? 4 : 0);
      let el = $('#cxSetup');
      if (!el) {
        el = document.createElement('div'); el.id = 'cxSetup'; el.className = 'cx-modal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'cxSetupTitle');
        el.innerHTML = '<div class="cx-sheet"><div class="cx-row"><b id="cxSetupTitle" class="cx-title"></b><button class="btn sm ghost" data-close aria-label="Close">✕</button></div><div class="cx-dots"></div><div class="cx-body"></div><div class="cx-nav"><button class="btn sm" data-back>Back</button><button class="btn sm primary" data-next>Next</button></div></div>';
        document.body.appendChild(el);
        el.addEventListener('click', (e) => {
          if (e.target === el || e.target.closest('[data-close]')) return this.close();
          if (e.target.closest('[data-back]')) { this.i = Math.max(0, this.i - 1); return this.render(); }
          if (e.target.closest('[data-next]')) { if (this.i < STEPS.length - 1) { this.i++; return this.render(); } return this.close(true); }
          if (e.target.closest('[data-sample]')) { this.close(); CX.show(validate(SAMPLE), { sample: true }); if (HS.tab !== 'holo') UI.setTab('holo'); return; }
          const link = e.target.closest('[data-link]'); if (link) window.open(link.dataset.link, '_blank', 'noopener');
          const dot = e.target.closest('[data-dot]'); if (dot) { this.i = +dot.dataset.dot; this.render(); }
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#cxSetup').hidden) this.close(); });
      }
      el.hidden = false; this.render();
    },
    render() {
      const el = $('#cxSetup'), s = STEPS[this.i];
      $('#cxSetupTitle').textContent = s.t;
      el.querySelector('.cx-dots').innerHTML = STEPS.map((_, k) => `<button data-dot="${k}" class="${k === this.i ? 'on' : ''}" aria-label="Step ${k + 1}"></button>`).join('');
      el.querySelector('.cx-body').innerHTML = s.body();
      el.querySelector('[data-back]').disabled = this.i === 0;
      el.querySelector('[data-next]').textContent = this.i === STEPS.length - 1 ? (HS.settings.apiKey ? 'Done' : 'Close') : 'Next';
      if (this.i === STEPS.length - 1) this.bindKeyStep();
    },
    bindKeyStep() {
      const key = $('#cxKey'), res = $('#cxResult');
      $('#cxShow').addEventListener('click', () => { key.type = key.type === 'password' ? 'text' : 'password'; $('#cxShow').textContent = key.type === 'password' ? 'Show key' : 'Hide key'; });
      $('#cxTest').addEventListener('click', async () => {
        const k = key.value.trim(), model = $('#cxModel').value;
        if (!/^sk-ant-/.test(k)) { res.className = 'cx-result bad'; res.textContent = 'That does not look like a Claude API key. It should start with sk-ant-.'; return; }
        res.className = 'cx-result'; res.textContent = 'Checking with Anthropic…'; $('#cxTest').disabled = true;
        try {
          const client = await ClaudeAPI.client(k);
          const info = await client.models.retrieve(model); // free: checks the key and that the model is available
          HS.settings.apiKey = k; HS.settings.model = model; if (HS.settings.provider === 'local') HS.settings.provider = 'auto'; saveSettings();
          res.className = 'cx-result ok'; res.textContent = `✓ Key works. ${info.display_name || model} is ready. Saved on this device.`;
          this.render(); $('#cxResult').className = 'cx-result ok'; $('#cxResult').textContent = `✓ Key works. ${info.display_name || model} is ready. Saved on this device.`;
        } catch (e) {
          const code = await ClaudeAPI.errorCode(e);
          res.className = 'cx-result bad';
          res.textContent = code === 'http_401' ? 'Anthropic rejected this key. Copy it again from Settings → API keys.' : code === 'http_404' ? 'This key cannot use that model. Try another model.' : code === 'network' ? 'Could not reach Anthropic. Check your internet connection.' : `Could not check the key (${e && e.message ? e.message : code}).`;
        } finally { const t = $('#cxTest'); if (t) t.disabled = false; }
      });
    },
    close(finished) { const el = $('#cxSetup'); if (el) el.hidden = true; const cb = this.then; this.then = null; if (cb && (finished || HS.settings.apiKey)) cb(); },
  };

  // ───────────────────────── styles (use the console's theme variables) ─────────────────────────
  const css = document.createElement('style'); css.textContent = `
  .cx-panel { flex: 0 0 auto; max-height: 46%; overflow-y: auto; border-top: 1px solid var(--border); padding: 10px 12px 14px; }
  .cx-card { display: flex; flex-direction: column; gap: 8px; }
  .cx-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .cx-title { font-size: 15px; color: var(--text); }
  .cx-tag { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; }
  .cx-sum, .cx-note { margin: 0; color: var(--text-2); font-size: 13px; line-height: 1.5; }
  .cx-note { color: var(--muted); font-size: 12px; }
  .cx-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .cx-form { display: flex; flex-direction: column; gap: 8px; }
  .cx-form label, .cx-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .cx-check { flex-direction: row !important; align-items: center; gap: 8px !important; color: var(--text-2) !important; }
  .cx-caption { padding: 8px 10px; border-left: 2px solid var(--chrome); background: var(--card); border-radius: 6px; font-size: 13.5px; line-height: 1.5; color: var(--text); }
  .cx-caption b { font-family: var(--font-mono); color: var(--muted); margin-right: 6px; font-weight: 400; }
  .cx-legend { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 6px; }
  .cx-legend li { cursor: pointer; font-size: 13px; color: var(--text-2); padding: 4px 6px; border-radius: 6px; }
  .cx-legend li.on { background: var(--card-2); }
  .cx-legend li b { color: var(--text); display: block; }
  .cx-legend li small { display: block; color: var(--muted); font-size: 11.5px; margin-top: 2px; }
  .cx-bar { height: 3px; border-radius: 2px; background: var(--border); overflow: hidden; }
  .cx-bar i { display: block; height: 100%; width: 35%; background: var(--chrome); animation: cxSlide 1.4s ease-in-out infinite; }
  @keyframes cxSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
  .cx-steps { margin: 0; padding-left: 18px; font-size: 12.5px; color: var(--text-2); display: flex; flex-direction: column; gap: 2px; }
  .cx-quiz { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
  .cx-q { display: flex; flex-direction: column; gap: 6px; }
  .cx-q b { font-size: 13.5px; color: var(--text); }
  .cx-opt { text-align: left; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--text); font-size: 13px; min-height: 40px; }
  .cx-opt.right { border-color: var(--good); } .cx-opt.wrong { border-color: var(--bad); opacity: .8; }
  .cx-exp { font-size: 12.5px; color: var(--text-2); }
  .cx-modal { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .cx-modal[hidden] { display: none; }
  .cx-sheet { width: min(520px, 100%); max-height: min(88vh, 720px); overflow-y: auto; background: var(--panel); border: 1px solid var(--border-2); border-radius: 16px; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; color: var(--text); }
  .cx-sheet p { margin: 0; font-size: 14px; line-height: 1.55; color: var(--text-2); }
  .cx-sheet code { font-family: var(--font-mono); background: var(--card); padding: 1px 5px; border-radius: 4px; }
  .cx-body { display: flex; flex-direction: column; gap: 12px; }
  .cx-dots { display: flex; gap: 6px; }
  .cx-dots button { width: 22px; height: 4px; border-radius: 2px; border: 0; background: var(--border-2); padding: 0; }
  .cx-dots button.on { background: var(--chrome); }
  .cx-nav { display: flex; justify-content: space-between; gap: 8px; }
  .cx-result { font-size: 13px; min-height: 18px; color: var(--text-2); }
  .cx-result.ok { color: var(--good); } .cx-result.bad { color: var(--bad); }
  .cx-flow { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 0; }
  .cx-node { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 26px; width: 84px; padding: 10px 4px; border: 1px solid var(--border-2); border-radius: 12px; background: var(--card); }
  .cx-node small { font-size: 11px; color: var(--muted); }
  .cx-claude { border-color: var(--chrome); }
  .cx-pipe { flex: 1; max-width: 60px; height: 2px; background: var(--border-2); position: relative; overflow: hidden; }
  .cx-pipe i { position: absolute; top: 0; left: 0; width: 30%; height: 100%; background: var(--chrome); animation: cxSlide 1.6s linear infinite; }
  .cx-mock { border: 1px solid var(--border-2); border-radius: 10px; overflow: hidden; background: var(--card); font-size: 12px; }
  .cx-mock-bar { display: flex; align-items: center; gap: 5px; padding: 6px 8px; border-bottom: 1px solid var(--border); color: var(--muted); font-family: var(--font-mono); font-size: 10.5px; }
  .cx-mock-bar i { width: 7px; height: 7px; border-radius: 50%; background: var(--border-2); }
  .cx-mock-bar span { margin-left: 6px; }
  .cx-mock-body { padding: 12px; color: var(--text-2); }
  .cx-mock-center { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .cx-mock-split { display: grid; grid-template-columns: 96px 1fr; gap: 12px; }
  .cx-mock-split > div { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .cx-mock-side { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; color: var(--muted); }
  .cx-mock-side li.on { color: var(--text); font-weight: 600; }
  .cx-mock-btn { display: inline-block; padding: 4px 10px; border-radius: 6px; background: var(--card-2); border: 1px solid var(--border-2); color: var(--text); }
  .cx-mock-btn.ghost { background: transparent; }
  .cx-mock-btn.hl { border-color: var(--chrome); box-shadow: 0 0 0 3px color-mix(in srgb, var(--chrome) 25%, transparent); animation: cxPulse 1.6s ease-in-out infinite; }
  @keyframes cxPulse { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--chrome) 10%, transparent); } }
  .cx-mock-big { font-size: 18px; color: var(--text); }
  .cx-mock-key { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
  @media (prefers-reduced-motion: reduce) { .cx-bar i, .cx-pipe i, .cx-mock-btn.hl { animation: none; } }
  `;
  document.head.appendChild(css);

  window.ClaudeSetup = ClaudeSetup;
  window.ClaudeHolo = CX;
  // UI is a top-level const of study.html's script: a global binding, but not a property of window
  const boot = () => { if (typeof UI !== 'undefined' && UI.holoMain) CX.install(); else setTimeout(boot, 200); };
  boot();
})();
