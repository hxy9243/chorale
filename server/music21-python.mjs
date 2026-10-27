import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Music21Error, resolveMusic21Python, runProcess } from './music21.mjs';
import { extractScoreEvents, addRational, subRational, compareRational, rationalToText } from './music/score-semantics.mjs';

// This module also bundles into dist-electron/main.js and server/cli.mjs.
const RUNNER = fileURLToPath(new URL('../server/python/music21_analysis.py', import.meta.url));
const CORE = fileURLToPath(new URL('../server/python/music21_core.py', import.meta.url));
export const MUSIC21_CODE_LIMIT = 16000;

export function prepareMusic21Input({ abcSource, startMeasure = 1, endMeasure = startMeasure }) {
  if (!Number.isInteger(startMeasure) || !Number.isInteger(endMeasure) || startMeasure < 0 || endMeasure < startMeasure || endMeasure - startMeasure >= 16) {
    throw new Music21Error('INVALID_RANGE', 'Choose an ordered range of at most 16 written measures.');
  }
  const parsed = extractScoreEvents(abcSource);
  const selected = parsed.measures.filter(m => m.measure >= startMeasure && m.measure <= endMeasure);
  if (selected.length !== endMeasure - startMeasure + 1) throw new Music21Error('INVALID_RANGE', 'The requested measures are not present in the score.');
  const start = selected[0].start;
  const end = addRational(selected.at(-1).start, selected.at(-1).duration);
  const events = parsed.events.filter(e => compareRational(e.start, end) < 0 && compareRational(e.end, start) > 0).map(event => {
    const onset = compareRational(event.start, start) < 0 ? start : event.start;
    const release = compareRational(event.end, end) > 0 ? end : event.end;
    const measure = selected.findLast(m => compareRational(m.start, onset) <= 0);
    return { id: event.id, voiceId: event.voiceId, pitch: event.pitch,
      measure: measure.measure, offsetQuarterLength: rationalToText(subRational(onset, start)),
      measureOffsetQuarterLength: rationalToText(subRational(onset, measure.start)),
      durationQuarterLength: rationalToText(subRational(release, onset)),
      carryIn: compareRational(event.start, start) < 0,
      sourceEventIds: event.sourceEventIds };
  });
  if (events.length > 8192) throw new Music21Error('ANALYSIS_TOO_COMPLEX', 'The passage exceeds the Python analysis event budget.');
  const boundaries = [...new Set(parsed.voices.flatMap(voice => voice.entries
    .filter(entry => entry.element.el_type === 'bar'
      && (/repeat/.test(entry.element.type || '') || entry.element.startEnding || entry.element.endEnding)
      && compareRational(entry.absoluteOffset, start) >= 0 && compareRational(entry.absoluteOffset, end) <= 0)
    .map(entry => rationalToText(subRational(entry.absoluteOffset, start)))))]
    .map(offsetQuarterLength => ({ offsetQuarterLength }));
  return { events, boundaries, measures: selected.map(m => ({ number: m.measure,
    offsetQuarterLength: rationalToText(subRational(m.start, start)), durationQuarterLength: rationalToText(m.duration) })) };
}

export async function analyzeMusic21Python(payload, options = {}) {
  if (typeof payload.code !== 'string' || !payload.code.trim() || Buffer.byteLength(payload.code) > MUSIC21_CODE_LIMIT) {
    throw new Music21Error('INVALID_CODE', `Supply a non-empty Python snippet of at most ${MUSIC21_CODE_LIMIT} bytes.`);
  }
  if ((options.platform || process.platform) !== 'linux') throw new Music21Error('MUSIC21_SANDBOX_UNAVAILABLE', 'Custom Python analysis currently requires Linux with Bubblewrap. The predefined analyze_harmony tool remains available on other platforms.');
  const input = prepareMusic21Input(payload);
  const runtime = options.runtime || await resolveMusic21Python(options);
  const execute = options.runProcess || runProcess;
  const probe = await execute(runtime.command, [...runtime.prefixArgs, '-c',
    'import json,sys,music21; print(json.dumps({"executable":sys.executable,"prefix":sys.prefix,"paths":[p for p in sys.path if p and ("site-packages" in p or "dist-packages" in p)]}))'],
  { timeoutMs: 5000, signal: options.signal });
  const layout = JSON.parse(probe.stdout);
  if (!isAbsolute(layout.executable) || !isAbsolute(layout.prefix) || !Array.isArray(layout.paths)) throw new Music21Error('MUSIC21_INVALID_OUTPUT', 'Could not identify the Python runtime for sandboxing.');
  const mounts = new Set(['/usr']);
  if (layout.prefix !== '/usr' && !layout.prefix.startsWith('/usr/')) mounts.add(layout.prefix);
  for (const path of layout.paths) if (isAbsolute(path) && !path.startsWith('/usr/')) mounts.add(path);
  const args = ['--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv'];
  for (const [key, value] of Object.entries({ PATH: '/usr/bin:/bin', HOME: '/tmp', LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', MKL_NUM_THREADS: '1', MPLCONFIGDIR: '/tmp/matplotlib' })) args.push('--setenv', key, value);
  for (const path of mounts) { await stat(path); args.push('--ro-bind', path, path); }
  for (const path of ['/lib', '/lib64']) {
    try { const target = await realpath(path); args.push('--ro-bind', target, path); } catch { /* Not every distribution has both. */ }
  }
  args.push('--dir', '/etc', '--ro-bind-try', '/etc/ld.so.cache', '/etc/ld.so.cache',
    '--proc', '/proc', '--remount-ro', '/proc', '--dev', '/dev', '--remount-ro', '/dev',
    '--size', '67108864', '--tmpfs', '/tmp', '--chdir', '/tmp',
    '--ro-bind', options.scriptPath || RUNNER, '/runner.py',
    '--ro-bind', CORE, '/core.py',
    '--remount-ro', '/',
    layout.executable, '-I', '/runner.py', JSON.stringify(layout.paths));
  const started = performance.now();
  let output;
  try {
    output = await execute(options.bubblewrap || 'bwrap', args, {
      input: JSON.stringify({ ...input, code: payload.code }), env: { PATH: '/usr/bin:/bin' },
      timeoutMs: options.timeoutMs ?? 12000, maxOutputBytes: 300000, signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Music21Error) throw error;
    if (error.code === 'ENOENT' || /bwrap:|namespace|Operation not permitted/.test(error.result?.stderr || '')) {
      throw new Music21Error('MUSIC21_SANDBOX_UNAVAILABLE', 'Bubblewrap could not create the Python sandbox. Install bubblewrap and enable unprivileged user namespaces; Chorale will not run the snippet unsandboxed.');
    }
    throw new Music21Error('MUSIC21_CODE_FAILED', 'The sandboxed Python process failed or exceeded its CPU/memory limit.');
  }
  let value;
  try { value = JSON.parse(output.stdout); } catch { throw new Music21Error('MUSIC21_INVALID_OUTPUT', 'The Python sandbox did not return valid JSON.'); }
  if (value.error) throw new Music21Error(value.errorCode === 'MUSIC21_SANDBOX_UNAVAILABLE' ? value.errorCode : 'MUSIC21_CODE_FAILED', String(value.error).slice(0, 1000));
  if (!Object.hasOwn(value, 'result') || typeof value.stdout !== 'string') throw new Music21Error('MUSIC21_INVALID_OUTPUT', 'The Python sandbox returned an invalid result.');
  return { documentId: payload.documentId, revision: payload.revision,
    range: { startMeasure: payload.startMeasure ?? 1, endMeasure: payload.endMeasure ?? payload.startMeasure ?? 1 },
    engine: { name: 'music21', version: runtime.version, pythonVersion: runtime.pythonVersion },
    sandbox: { backend: 'bubblewrap', network: 'isolated', hostHome: 'unmounted', runtime: 'read-only', syscalls: 'seccomp', childProcesses: 'blocked', scratchMiB: 64, cpuSeconds: 5, memoryMiB: 768 },
    durationMs: Math.round(performance.now() - started),
    inputSummary: { pitchedEvents: input.events.length, measures: input.measures.length, voices: [...new Set(input.events.map(e => e.voiceId))] },
    result: value.result, stdout: value.stdout,
    warning: 'Read-only computed evidence; verify interpretation against the written score. Rest gaps are silence, and tied notes are merged pitched events.' };
}
