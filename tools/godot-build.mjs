#!/usr/bin/env node
// Builds the Godot edition of HoloStudy for the browser:  build/godot-web/  (index.html + engine + content/)
//   node tools/godot-build.mjs            export the Web preset and copy the content next to it
//   node tools/godot-build.mjs --content  first regenerate godot/content from the web app (tools/godot-content.mjs)
//   node tools/godot-build.mjs --serve    then serve build/godot-web on http://127.0.0.1:8060 (Ctrl+C to stop)
// Needs Godot 4.7 with its Web export templates. Set GODOT=<path to Godot console exe> if it is not in
// E:\tools\godot or on PATH. The single-threaded Web build needs no special server headers, so the folder
// can go on any static host (GitHub Pages, Netlify, a school server) and works in Safari on iPhone/iPad.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.join(ROOT, 'godot');
const OUT = path.join(ROOT, 'build', 'godot-web');
const args = new Set(process.argv.slice(2));

const godot = process.env.GODOT || ['E:/tools/godot/Godot_v4.7.2-stable_win64_console.exe', 'godot', 'godot4'].find((g) => {
  if (g.includes('/')) return fs.existsSync(g);
  return spawnSync(g, ['--version'], { encoding: 'utf8' }).status === 0;
});
if (!godot) { console.error('Godot not found — set GODOT=<path to the Godot 4.7 console executable>'); process.exit(1); }

if (args.has('--content')) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'godot-content.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

// empty the folder (not remove it: a preview server may be running inside it)
fs.mkdirSync(OUT, { recursive: true });
for (const e of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, e), { recursive: true, force: true });
console.log('exporting the Web build…');
const t0 = Date.now();
const r = spawnSync(godot, ['--headless', '--path', PROJECT, '--export-release', 'Web', path.join(OUT, 'index.html')], { encoding: 'utf8' });
const log = (r.stdout || '') + (r.stderr || '');
if (r.status !== 0 || !fs.existsSync(path.join(OUT, 'index.html'))) {
  console.error(log.split('\n').filter((l) => /error|fail/i.test(l)).slice(0, 30).join('\n') || log.slice(-3000));
  process.exit(1);
}
// the books, holograms and practice bank are fetched on demand from content/ next to index.html
const copy = (src, dst) => {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copy(s, d); } else fs.copyFileSync(s, d);
  }
};
fs.mkdirSync(path.join(OUT, 'content'), { recursive: true });
copy(path.join(PROJECT, 'content'), path.join(OUT, 'content'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // GitHub Pages: serve files as they are
const size = (dir) => fs.readdirSync(dir, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
const engine = ['index.wasm', 'index.pck', 'index.js'].reduce((a, f) => a + (fs.existsSync(path.join(OUT, f)) ? fs.statSync(path.join(OUT, f)).size : 0), 0);
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${path.relative(ROOT, OUT)}  (engine ${mb(engine)} · content ${mb(size(path.join(OUT, 'content')))} loaded on demand)`);

if (args.has('--serve')) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
  http.createServer((req, res) => {
    let p = path.join(OUT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!p.startsWith(OUT) || !fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(p).pipe(res);
  }).listen(8060, '127.0.0.1', () => console.log('serving on http://127.0.0.1:8060  (Ctrl+C to stop)'));
}
