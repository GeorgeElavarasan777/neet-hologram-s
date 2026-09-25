/* Shared 3-D layout for concept models (Claude holograms). Used by the study console's quick preview
   (engines/study/claude-holo.js) and by the Hologram Room (engines/holograms/custom-figure.js), so a
   model is arranged identically in both. Pure maths: spec in, part positions out. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const SIZE = { small: 0.12, medium: 0.17, large: 0.24 };

  // spec.concept_type decides the arrangement; positions are roughly within ±1.5 units
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
      const nRows = rows.size;
      [...rows.keys()].sort().forEach((L, ri) => { const row = rows.get(L); row.forEach((id, k) => { const u = row.length === 1 ? 0.5 : k / (row.length - 1); pos.set(id, [(-1.25 + 2.5 * u) * Math.min(1, 0.45 + row.length * 0.2), 0.95 - ri * (1.9 / Math.max(1, nRows - 1 || 1)), k % 2 ? 0.2 : -0.2]); }); });
    } else if (T === 'comparison') {
      const cols = { a: [], b: [], c: [] }; ps.forEach((p) => cols[p.group].push(p.id));
      Object.entries({ a: -0.95, b: 0.95, c: 0 }).forEach(([g, x]) => cols[g].forEach((id, k) => pos.set(id, [x, 0.85 - k * (1.7 / Math.max(1, cols[g].length - 1 || 1)), 0])));
    } else { // structure / relationship / formula: hub and spoke around the core idea
      pos.set(ps[0].id, [0, 0, 0]);
      ps.slice(1).forEach((p, i, rest) => { const a = (i / rest.length) * TAU; pos.set(p.id, [1.2 * Math.cos(a), i % 2 ? 0.3 : -0.3, 1.2 * Math.sin(a)]); });
    }
    return pos;
  }

  root.ConceptLayout = { layout, SIZE };
})(typeof window !== 'undefined' ? window : globalThis);
