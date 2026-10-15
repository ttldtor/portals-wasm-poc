// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
// Run with npm run build from the repository root. Verify runtime provenance,
// bundle src/, and refresh index.html cache keys; missing files or mismatches fail the build.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const provenance = JSON.parse(await readFile('provenance.json', 'utf8'));
for (const [name, expected] of [
  ['portals-gallery.wasm', provenance.portals_gallery_wasm_sha256],
  ['portals-gallery.js', provenance.portals_gallery_loader_sha256]
]) {
  const actual = createHash('sha256').update(await readFile(name)).digest('hex');
  if (actual !== expected) throw new Error(`Runtime artifact hash mismatch: ${name}`);
}
const runtimeVersion = createHash('sha256').update(provenance.portals_gallery_loader_sha256 + provenance.portals_gallery_wasm_sha256).digest('hex');
await build({ entryPoints: ['src/main.js'], bundle: true, format: 'esm', outfile: 'main.js',
  define: { __PORTALS_RUNTIME_VERSION__: JSON.stringify(runtimeVersion) },
  external: ['./portals-gallery.js'], sourcemap: true });

let html = await readFile('index.html', 'utf8');
for (const [file, attribute] of [['main.js', 'src'], ['main.css', 'href']]) {
  const hash = createHash('sha256').update(await readFile(file)).digest('hex');
  const reference = new RegExp(`${attribute}="\\./${file.replaceAll('.', '\\.')}(?:\\?v=[a-f0-9]+)?"`);
  html = html.replace(reference, `${attribute}="./${file}?v=${hash}"`);
}
await writeFile('index.html', html);
