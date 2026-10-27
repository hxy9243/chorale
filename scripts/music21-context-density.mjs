import { readFile, writeFile } from 'node:fs/promises';
import { analyzeMusic21Python, prepareMusic21Input } from '../server/music21-python.mjs';
const directory = new URL('../docs/reviews/music21-context-2026-10-24/', import.meta.url);
const existing = JSON.parse(await readFile(new URL('context-payloads.json', directory), 'utf8'));
const { code } = JSON.parse(await readFile(new URL('cases.json', directory), 'utf8'));
const rows = [];
for (const item of existing) {
  // Same pitch progression, four rearticulations per bar instead of one.
  const abc = item.abc.replace(/([_^=]?[A-Ga-g][,']*)4/g, (_, n) => `${n} ${n} ${n} ${n}`);
  const calls = [];
  for (let start = 1; start <= item.bars; start += 16) {
    const args = { abcSource: abc, documentId: `density-${item.bars}`, revision: 1, startMeasure: start, endMeasure: Math.min(item.bars, start + 15), code };
    calls.push({ arguments: { startMeasure: args.startMeasure, endMeasure: args.endMeasure, code }, result: await analyzeMusic21Python(args), rawInput: prepareMusic21Input(args) });
  }
  rows.push({ bars: item.bars, abc, calls });
  console.log(`Measured quarter-note rearticulations: ${item.bars} bars, ${calls.reduce((n,c)=>n+c.result.result.sonorities.length,0)} slices`);
}
await writeFile(new URL('density-payloads.json', directory), JSON.stringify(rows, null, 2) + '\n');
