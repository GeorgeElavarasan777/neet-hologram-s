#!/usr/bin/env node
// Vendors the official Anthropic TypeScript SDK (browser ESM build from jsDelivr) into
// vendor/anthropic-sdk/, following every static and dynamic `/npm/...` import and rewriting it to a
// local relative path, so the app loads the SDK from its own files (no CDN at runtime).
// Usage: node tools/vendor-anthropic-sdk.mjs [version]
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'vendor', 'anthropic-sdk');
const version = process.argv[2] || (await (await fetch('https://data.jsdelivr.com/v1/packages/npm/@anthropic-ai/sdk/resolved?specifier=latest')).json()).version;
const entry = `/npm/@anthropic-ai/sdk@${version}/+esm`;

const fileFor = (spec) => spec.replace(/^\/npm\//, '').replace(/\/\+esm$/, '').replace(/[@/]/g, '_').replace(/[^A-Za-z0-9_.-]/g, '') + '.mjs';
const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])(\/npm\/[^"']+)\2/g;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const done = new Set(), queue = [entry];
while (queue.length) {
  const spec = queue.shift();
  if (done.has(spec)) continue;
  done.add(spec);
  const res = await fetch('https://cdn.jsdelivr.net' + spec);
  if (!res.ok) throw new Error(`${spec}: HTTP ${res.status}`);
  let code = await res.text();
  code = code.replace(IMPORT_RE, (m, pre, q, dep) => { queue.push(dep); return `${pre}${q}./${fileFor(dep)}${q}`; });
  code = code.replace(/\/\/# sourceMappingURL=.*$/m, '');
  await writeFile(path.join(outDir, fileFor(spec)), code);
  console.log(`vendored ${spec} -> ${fileFor(spec)} (${Math.round(code.length / 1024)} KB)`);
}
await writeFile(path.join(outDir, 'sdk.mjs'), `// Entry point: the official Anthropic TypeScript SDK v${version} (browser build, vendored).\nexport * from './${fileFor(entry)}';\nexport { default } from './${fileFor(entry)}';\n`);
await writeFile(path.join(outDir, 'VERSION'), version + '\n');
console.log(`\nAnthropic SDK ${version}: ${done.size} files in vendor/anthropic-sdk/`);
