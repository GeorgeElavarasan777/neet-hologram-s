#!/usr/bin/env node
/* WCAG AA check for all ten themes x three contrast modes.
   Run: node tools/check-contrast.js   (exits 1 if anything drops below 4.5:1) */
const T = require('../studyspace/themes.js');

let failed = 0;
const rows = [];
for (const theme of T.THEMES) {
  for (const mode of ['soft', 'standard', 'high']) {
    const { tok } = T.resolve(theme.id, mode);
    const r = tok.report;
    const bad = Object.entries(r).filter(([, v]) => v < T.AA);
    if (bad.length) failed++;
    rows.push({ theme: theme.name, mode, text: r.text, muted: r.muted, accent: r.accent, onAccent: r.onAccent, ok: bad.length ? 'FAIL ' + bad.map(([k]) => k).join(',') : 'AA' });
  }
}
console.table(rows);
console.log(failed ? `\n${failed} theme/mode combination(s) below 4.5:1` : '\nAll 30 theme/mode combinations meet WCAG AA (>= 4.5:1).');
process.exit(failed ? 1 : 0);
