import { build } from 'esbuild';
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function packageCodex(output = join(root, 'plugins/chorale-codex-plugin'), { distDir = join(root, 'dist') } = {}) {
  await mkdir(dirname(output), { recursive: true });
  const staging = await mkdtemp(join(dirname(output), '.chorale-package-'));
  try {
    await mkdir(join(staging, 'mcp'));
    await build({
      entryPoints: [join(root, 'mcp/cli.mjs')],
      outfile: join(staging, 'mcp/cli.mjs'),
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      banner: { js: "import { createRequire as packageCreateRequire } from 'node:module'; const require = packageCreateRequire(import.meta.url);" },
    });
    await cp(join(root, 'bin'), join(staging, 'bin'), { recursive: true });
    await cp(join(root, 'package.json'), join(staging, 'package.json'));
    await cp(distDir, join(staging, 'dist'), { recursive: true });
    await cp(join(root, 'skills'), join(staging, 'skills'), { recursive: true });
    await mkdir(join(staging, 'scripts'));
    await cp(join(root, 'tools/launch_chorale_mcp'), join(staging, 'scripts/launch_chorale_mcp'));
    await chmod(join(staging, 'scripts/launch_chorale_mcp'), 0o755);
    await mkdir(join(staging, '.codex-plugin'));
    const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
    manifest.mcpServers = './.mcp.json';
    await writeFile(join(staging, '.codex-plugin/plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(join(staging, '.mcp.json'), JSON.stringify({ mcpServers: { chorale: {
      command: './scripts/launch_chorale_mcp', args: [], cwd: '.',
      env_vars: ['CODEX_MCP_NODE_PATH', 'CODEX_BROWSER_USE_NODE_PATH', 'CODEX_ELECTRON_RESOURCES_PATH', 'CODEX_CLI_PATH', 'XDG_CACHE_HOME', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'PATH'],
    } } }, null, 2) + '\n');
    // Replace the complete generated package so obsolete server files cannot survive a rebuild.
    await rm(output, { recursive: true, force: true });
    await rename(staging, output);
    return output;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await packageCodex());
}
