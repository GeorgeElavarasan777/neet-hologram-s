/* Custom figures for the Hologram Room: a Claude hologram made from the student's own PDF is shown
   exactly like the 124 built-in NCERT holograms — lit 3-D parts, numbered callouts in the side
   columns, explode slider, 2-D view, quiz mode, zoom and fullscreen.
   Open with  index.html?custom=<localStorage key>  (the key holds { spec, meta } saved by
   engines/study/claude-holo.js). Uses window.HOLO (holo.js) and ConceptLayout (../shared). */
(function () {
  'use strict';
  const key = new URLSearchParams(location.search).get('custom');
  if (!key) return;
  document.documentElement.classList.add('custom-fig');

  // in custom mode the NCERT browsing controls would jump to unrelated figures, so hide them
  const css = document.createElement('style');
  css.textContent = `.custom-fig #topbar, .custom-fig #prevBtn, .custom-fig #nextBtn, .custom-fig #figCounter, .custom-fig #listBtn { display: none !important; }
    .custom-fig #figNav { justify-content: center; }
    .custom-fig body:not(.mobile) #figNav { left: 50%; right: auto; transform: translateX(-50%); max-width: min(520px, calc(100vw - 280px)); }
    .custom-fig body:not(.mobile) #figTitleMini { max-width: min(480px, calc(100vw - 300px)); }`;
  document.head.appendChild(css);

  const PALETTE = ['#22d3ee', '#a78bfa', '#2dd4bf', '#fb923c', '#f472b6', '#facc15', '#60a5fa', '#4ade80', '#f87171', '#e5e7eb'];
  // spread parts more than the preview does (the engine's shapes are larger); less on a tall, narrow screen
  const spread = () => (innerWidth < innerHeight ? 1.2 : 1.6);

  function shapeMesh(H, kind, s, color) {
    const o = [0, 0, 0];
    switch (kind) {
      case 'cube': return H.box(s * 1.6, s * 1.6, s * 1.6, color, o);
      case 'cylinder': return H.cyl(s * 0.8, s * 0.8, s * 1.8, color, o);
      case 'ring': return H.torus(s, s * 0.26, color, o, [Math.PI / 2, 0, 0]);
      case 'cone': return H.cone(s, s * 2, color, o);
      case 'octahedron': return H.icosa(s * 1.05, color, o);
      case 'torus': return H.torus(s * 0.9, s * 0.36, color, o, [Math.PI / 2, 0, 0]);
      case 'plane': return H.box(s * 2.2, s * 0.14, s * 2.2, color, o);
      default: return H.sphere(s, color, o);
    }
  }

  function build(spec, mode) {
    const { H } = window.HOLO, g = H.grp(), labels = [], K = spread();
    const raw = ConceptLayout.layout(spec), P = (id) => raw.get(id).map((v) => v * K);
    const sizeOf = { small: 0.2, medium: 0.28, large: 0.38 }, T = spec.concept_type;
    const grey = '#6b7280';
    // guides that show the teaching pattern
    if (T === 'cycle') g.add(H.torus(1.15 * K, 0.012, grey, [0, 0, 0], [Math.PI / 2, 0, 0]));
    if (T === 'timeline') g.add(H.rod([-1.6 * K, -0.45, 0], [1.6 * K, -0.45, 0], 0.016, grey));
    if (T === 'structure') { g.add(H.torus(1.2 * K, 0.01, grey, [0, 0, 0], [Math.PI / 2 + 0.3, 0, 0])); g.add(H.torus(0.55 * K, 0.01, grey, [0, 0, 0], [Math.PI / 2 - 0.4, 0.3, 0])); }
    if (T === 'comparison' && spec.parts.some((p) => p.group === 'b')) g.add(H.rod([0, 1.1 * K, 0], [0, -1.1 * K, 0], 0.012, grey));
    // parts: each is its own group so the explode slider pulls it outward from the centre
    spec.parts.forEach((p, i) => {
      const c = P(p.id), s = sizeOf[p.size] || 0.28, color = PALETTE[i % PALETTE.length];
      const part = H.grp([shapeMesh(H, p.shape, s, color)], c);
      const len = Math.hypot(...c) || 1, dir = len > 0.05 ? c.map((v) => v / len) : [0, 1, 0];
      H.ex(part, dir[0] * 0.9, dir[1] * 0.9 + 0.15, dir[2] * 0.9);
      g.add(part);
      labels.push({ t: p.label, n: p.detail, a: [c[0], c[1] + s * 0.85, c[2]], side: c[0] < -0.15 ? 'L' : c[0] > 0.15 ? 'R' : undefined });
    });
    const trim = (a, b, sa, sb) => {
      const d = b.map((v, k) => v - a[k]), len = Math.hypot(...d) || 1, u = d.map((v) => v / len);
      return [a.map((v, k) => v + u[k] * sa * 1.15), b.map((v, k) => v - u[k] * sb * 1.3)];
    };
    const sizeOfId = (id) => sizeOf[(spec.parts.find((p) => p.id === id) || {}).size] || 0.28;
    if (mode === 'walk') {
      // the walkthrough order as one glowing path from part to part
      const pts = spec.steps.map((st) => P(st.part)).filter(Boolean);
      if (pts.length >= 2) g.add(H.tube(pts, 0.022, '#e5e7eb'));
    } else {
      for (const l of spec.links) {
        const [a, b] = trim(P(l.from), P(l.to), sizeOfId(l.from), sizeOfId(l.to));
        if (Math.hypot(...b.map((v, k) => v - a[k])) > 0.12) g.add(H.arrow(a, b, '#cbd5e1', { r: 0.018, head: 0.16 }));
      }
    }
    return { g, labels };
  }

  function run() {
    let rec = null; try { rec = JSON.parse(localStorage.getItem(key)); } catch (e) { /* unreadable */ }
    const HOLO = window.HOLO;
    if (!rec || !rec.spec || !rec.spec.parts) { document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:auto 16px 40% 16px;text-align:center;color:#e8eaed;font:15px system-ui">This hologram is no longer saved on this device. Build it again from the chapter.</div>'); return; }
    const spec = rec.spec, meta = rec.meta || {};
    HOLO.SUBJECTS.doc = HOLO.SUBJECTS.doc || { name: 'Your document', color: '#a78bfa', icon: '✦' };
    if (HOLO.ACC && !HOLO.ACC.doc) HOLO.ACC.doc = '#a78bfa'; // leader lines + number badges use the subject accent
    const fig = {
      id: 'custom-' + key, sub: 'doc', cls: '', custom: true,
      unit: meta.docTitle || 'Your document', ch: meta.chapter || meta.focus || '', fig: `Claude hologram · ${spec.concept_type}`,
      title: spec.title, desc: spec.summary,
      points: spec.parts.map((p, i) => `${i + 1}. ${p.label}: ${p.detail}`).slice(0, 8),
      variants: [
        { name: 'Concept model', build: () => build(spec, 'model') },
        { name: 'Walkthrough path', build: () => build(spec, 'walk') },
      ],
    };
    HOLO.FIGS.push(fig);
    HOLO.loadFigure(HOLO.FIGS.length - 1);
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = `drag · orbit  |  pinch or wheel · zoom  |  Claude hologram · ${meta.docTitle || 'your document'}`;
    window.CustomFigure = { fig, spec, meta };
    // turning the phone changes the best spread: rebuild the model for the new shape
    let shape = spread();
    addEventListener('resize', () => { clearTimeout(run._t); run._t = setTimeout(() => { if (spread() !== shape) { shape = spread(); HOLO.loadFigure(HOLO.FIGS.indexOf(fig)); } }, 250); });
  }
  const wait = (n = 0) => (window.HOLO && window.HOLO.H && window.ConceptLayout ? run() : n < 200 && setTimeout(() => wait(n + 1), 50));
  wait();
})();
