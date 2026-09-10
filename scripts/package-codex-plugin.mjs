import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = resolve(repositoryRoot, 'plugins/chorale-codex-plugin');

await rm(packageRoot, { recursive: true, force: true });
await mkdir(resolve(packageRoot, '.codex-plugin'), { recursive: true });
await mkdir(resolve(packageRoot, 'skills/chorale-score'), { recursive: true });
await mkdir(resolve(packageRoot, 'scripts'), { recursive: true });

await Promise.all([
  cp(resolve(repositoryRoot, '.codex-plugin/plugin.json'), resolve(packageRoot, '.codex-plugin/plugin.json')),
  cp(resolve(repositoryRoot, '.mcp.json'), resolve(packageRoot, '.mcp.json')),
  cp(resolve(repositoryRoot, 'scripts/launch_chorale_mcp'), resolve(packageRoot, 'scripts/launch_chorale_mcp')),
  cp(resolve(repositoryRoot, 'skills/chorale-score/SKILL.md'), resolve(packageRoot, 'skills/chorale-score/SKILL.md')),
  cp(resolve(repositoryRoot, 'dist'), resolve(packageRoot, 'dist'), { recursive: true }),
]);

await build({
  entryPoints: [resolve(repositoryRoot, 'server.mjs')],
  outfile: resolve(packageRoot, 'server.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
});

console.log(`Packaged Chorale Codex plugin at ${packageRoot}`);
