import assert from 'node:assert/strict';
import test from 'node:test';
import { configureElectronSandbox } from '../server/electron-sandbox.mjs';

const helper = '/tmp/Chorale workspace/electron/chrome-sandbox';
function fixture(overrides = {}) {
  let info = { uid: 1000, mode: 0o100755, isFile: () => true };
  const calls = [];
  const options = {
    platform: 'linux', uid: 1000, interactive: false,
    electronPath: () => '/tmp/Chorale workspace/electron/electron',
    stat: (path) => { assert.equal(path, helper); return info; },
    run: (command, args) => {
      calls.push([command, args]);
      // Model chown clearing setuid, so the order matters.
      if (args.includes('chown') || command === 'chown') info = { ...info, uid: 0, mode: 0o100755 };
      if (args.includes('chmod') || command === 'chmod') info = { ...info, mode: 0o104755 };
      return { status: 0 };
    },
    ...overrides,
  };
  return { options, calls };
}

test('repairs ownership before setuid permissions without shell interpolation, then becomes a no-op', () => {
  const { options, calls } = fixture();
  assert.equal(configureElectronSandbox(options), 'configured');
  assert.deepEqual(calls, [
    ['sudo', ['-n', 'chown', 'root', helper]],
    ['sudo', ['-n', 'chmod', '4755', helper]],
  ]);
  assert.equal(configureElectronSandbox(options), 'ready');
  assert.equal(calls.length, 2);
});

test('allows a sudo password prompt only with an interactive terminal', () => {
  const { options, calls } = fixture({ interactive: true });
  configureElectronSandbox(options);
  assert.deepEqual(calls[0], ['sudo', ['chown', 'root', helper]]);
});

test('root installations configure permissions directly', () => {
  const { options, calls } = fixture({ uid: 0 });
  configureElectronSandbox(options);
  assert.deepEqual(calls, [['chown', ['root', helper]], ['chmod', ['4755', helper]]]);
});

test('other platforms never resolve Electron or invoke sudo', () => {
  const { options, calls } = fixture({ platform: 'darwin', electronPath: () => assert.fail('resolved Electron') });
  assert.equal(configureElectronSandbox(options), 'skipped');
  assert.deepEqual(calls, []);
});

test('failed elevation stops before chmod and gives an explicit retry command', () => {
  let calls = 0;
  const { options } = fixture({ run: () => { calls++; return { status: 1 }; } });
  assert.throws(() => configureElectronSandbox(options), /npm run setup:electron-sandbox/);
  assert.equal(calls, 1);
});

test('rejects symlinks and detects permissions that did not persist', () => {
  assert.throws(() => configureElectronSandbox(fixture({ stat: () => ({ isFile: () => false }) }).options), /not a regular file/);
  assert.throws(() => configureElectronSandbox(fixture({ run: () => ({ status: 0 }) }).options), /did not persist/);
});
