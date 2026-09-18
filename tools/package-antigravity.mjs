import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function packageAntigravity(output = join(root, 'plugins/antigravity')) {
  const targetSkills = join(output, 'skills');
  await rm(targetSkills, { recursive: true, force: true });
  await mkdir(targetSkills, { recursive: true });
  await cp(join(root, 'skills'), targetSkills, { recursive: true });
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await packageAntigravity());
}
