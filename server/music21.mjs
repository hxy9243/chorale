import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChoraleHome } from './runtime.mjs';

export const MUSIC21_REQUIREMENT = 'music21==9.9.1';
export const MUSIC21_SETUP_COMMAND = 'chorale setup music21';

const PYTHON_DIR = fileURLToPath(new URL('./python/', import.meta.url));
const DEFAULT_SCRIPT_PATH = join(PYTHON_DIR, 'music21_harmony.py');
const DEFAULT_REQUIREMENTS_PATH = join(PYTHON_DIR, 'requirements-music21.txt');
const MAX_PROCESS_OUTPUT = 5 * 1024 * 1024;

export class Music21Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'Music21Error';
    this.code = code;
  }
}

export const managedMusic21Paths = (choraleHome = resolveChoraleHome()) => {
  const environment = join(choraleHome, 'music21-venv');
  const python = process.platform === 'win32'
    ? join(environment, 'Scripts', 'python.exe')
    : join(environment, 'bin', 'python');
  return { environment, python };
};

export const runProcess = (command, args = [], options = {}) => new Promise((resolve, reject) => {
  const child = (options.spawnImpl || spawn)(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  let outputSize = 0;
  let settled = false;
  let timer;

  const finish = (callback, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    callback(value);
  };

  const append = (target, chunk) => {
    outputSize += chunk.length;
    if (outputSize > (options.maxOutputBytes || MAX_PROCESS_OUTPUT)) {
      child.kill?.('SIGKILL');
      finish(reject, new Music21Error('MUSIC21_OUTPUT_TOO_LARGE', 'music21 produced more output than Chorale can safely accept.'));
      return;
    }
    target.push(chunk);
  };

  child.stdout?.on('data', (chunk) => append(stdout, chunk));
  child.stderr?.on('data', (chunk) => append(stderr, chunk));
  child.on('error', (error) => finish(reject, error));
  child.on('close', (code) => {
    const result = {
      code,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    };
    if (code === 0) finish(resolve, result);
    else finish(reject, Object.assign(new Error(result.stderr.trim() || `${command} exited with status ${code}.`), { result }));
  });

  const timeoutMs = options.timeoutMs || 20_000;
  timer = setTimeout(() => {
    child.kill?.('SIGKILL');
    finish(reject, new Music21Error('MUSIC21_TIMEOUT', `music21 did not finish within ${Math.ceil(timeoutMs / 1000)} seconds.`));
  }, timeoutMs);
  timer.unref?.();

  if (options.input !== undefined) child.stdin?.end(options.input);
  else child.stdin?.end();
});

const pythonCandidates = (options = {}) => {
  const environment = options.environment || process.env;
  const managed = managedMusic21Paths(options.choraleHome).python;
  return [
    ...(environment.CHORALE_MUSIC21_PYTHON
      ? [{ command: environment.CHORALE_MUSIC21_PYTHON, prefixArgs: [], source: 'environment' }]
      : []),
    { command: managed, prefixArgs: [], source: 'managed' },
    { command: 'python3', prefixArgs: [], source: 'system' },
    { command: 'python', prefixArgs: [], source: 'system' },
    ...(process.platform === 'win32' ? [{ command: 'py', prefixArgs: ['-3'], source: 'system' }] : []),
  ];
};

export const inspectMusic21Python = async (candidate, options = {}) => {
  const execute = options.runProcess || runProcess;
  const probe = [
    ...candidate.prefixArgs,
    '-c',
    'import json,platform,music21; print(json.dumps({"music21":music21.__version__,"python":platform.python_version()}))',
  ];
  const result = await execute(candidate.command, probe, { timeoutMs: 5_000 });
  const details = JSON.parse(result.stdout.trim());
  return { ...candidate, version: details.music21, pythonVersion: details.python };
};

export const resolveMusic21Python = async (options = {}) => {
  const candidates = options.candidates || pythonCandidates(options);
  for (const candidate of candidates) {
    try {
      return await inspectMusic21Python(candidate, options);
    } catch {}
  }
  throw new Music21Error(
    'MUSIC21_UNAVAILABLE',
    `music21 is unavailable. Run \`${MUSIC21_SETUP_COMMAND}\` with Python 3.10 or newer, then retry.`,
  );
};

const resolveBootstrapPython = async (options = {}) => {
  const configured = options.bootstrapPython || (options.environment || process.env).CHORALE_PYTHON;
  const candidates = configured
    ? [{ command: configured, prefixArgs: [] }]
    : [
        { command: 'python3', prefixArgs: [] },
        { command: 'python', prefixArgs: [] },
        ...(process.platform === 'win32' ? [{ command: 'py', prefixArgs: ['-3'] }] : []),
      ];
  const execute = options.runProcess || runProcess;
  for (const candidate of candidates) {
    try {
      const result = await execute(candidate.command, [
        ...candidate.prefixArgs,
        '-c',
        'import json,sys; print(json.dumps(list(sys.version_info[:2])))',
      ], { timeoutMs: 5_000 });
      const [major, minor] = JSON.parse(result.stdout.trim());
      if (major > 3 || (major === 3 && minor >= 10)) return candidate;
    } catch {}
  }
  throw new Music21Error('PYTHON_UNAVAILABLE', 'Python 3.10 or newer is required to install music21.');
};

export const installMusic21 = async (options = {}) => {
  const choraleHome = options.choraleHome || resolveChoraleHome(options.environment);
  const paths = managedMusic21Paths(choraleHome);
  const requirementsPath = options.requirementsPath || DEFAULT_REQUIREMENTS_PATH;
  const execute = options.runProcess || runProcess;
  const bootstrap = await resolveBootstrapPython({ ...options, runProcess: execute });
  await mkdir(choraleHome, { recursive: true });
  await execute(bootstrap.command, [...bootstrap.prefixArgs, '-m', 'venv', paths.environment], { timeoutMs: 60_000 });
  await execute(paths.python, [
    '-m', 'pip', 'install', '--disable-pip-version-check', '--requirement', requirementsPath,
  ], { timeoutMs: options.timeoutMs || 300_000 });
  return inspectMusic21Python({ command: paths.python, prefixArgs: [], source: 'managed' }, { runProcess: execute });
};

export const analyzeHarmonyWithMusic21 = async (payload, options = {}) => {
  const runtime = options.runtime || await resolveMusic21Python(options);
  const execute = options.runProcess || runProcess;
  let result;
  try {
    result = await execute(runtime.command, [
      ...runtime.prefixArgs,
      options.scriptPath || DEFAULT_SCRIPT_PATH,
    ], {
      input: JSON.stringify(payload),
      timeoutMs: options.timeoutMs || 20_000,
    });
  } catch (error) {
    if (error instanceof Music21Error) throw error;
    throw new Music21Error('MUSIC21_ANALYSIS_FAILED', error instanceof Error ? error.message : 'music21 analysis failed.');
  }
  try {
    const analysis = JSON.parse(result.stdout);
    return {
      ...analysis,
      engine: {
        ...analysis.engine,
        pythonVersion: runtime.pythonVersion,
        source: runtime.source,
      },
    };
  } catch {
    throw new Music21Error('MUSIC21_INVALID_OUTPUT', 'music21 returned invalid analysis output.');
  }
};
