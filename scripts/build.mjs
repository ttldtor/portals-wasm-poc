// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const provenance = JSON.parse(await readFile('provenance.json', 'utf8'));
for (const [name, expected] of [
  ['portals-gallery.wasm', provenance.portals_gallery_wasm_sha256],
  ['portals-gallery.js', provenance.portals_gallery_loader_sha256]
]) {
  const actual = createHash('sha256').update(await readFile(name)).digest('hex');
  if (actual !== expected) throw new Error(`Runtime artifact hash mismatch: ${name}`);
}
await build({ entryPoints: ['src/main.js'], bundle: true, format: 'esm', outfile: 'main.js',
  external: ['./portals-gallery.js'], sourcemap: true });
