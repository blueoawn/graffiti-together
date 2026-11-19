import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'graffiti-runtime-smoke-'));
const outputFile = join(temporaryDirectory, 'smoke.mjs');

try {
  await build({
    entryPoints: [resolve(root, 'scripts/test-runtime.mjs')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: outputFile,
    logLevel: 'silent',
  });
  const result = spawnSync(process.execPath, [outputFile], { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
