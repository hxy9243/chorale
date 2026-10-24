import assert from 'node:assert/strict';
import test from 'node:test';
import { describeDesktopExit } from '../scripts/electron-lifecycle.mjs';

const root = '/tmp/Chorale workspace';
const fatal = '[123:FATAL:sandbox/linux/suid/client/setuid_sandbox_host.cc:166] The SUID sandbox helper binary was found, but is not configured correctly.';

test('an Electron signal abort fails the launcher instead of reporting success', () => {
  const result = describeDesktopExit(null, 'SIGABRT', fatal, root);
  assert.notEqual(result.exitCode, 0);
  assert.match(result.message, /SIGABRT/);
  assert.match(result.message, /sudo chown root/);
  assert.match(result.message, /sudo chmod 4755/);
  assert.ok(result.message.includes("'/tmp/Chorale workspace/node_modules/electron/dist/chrome-sandbox'"));
  assert.ok(!result.message.includes('--no-sandbox'));
});

test('normal window closure remains successful', () => {
  assert.deepEqual(describeDesktopExit(0, null, '', root), { exitCode: 0, message: '' });
});

test('other desktop failures preserve their exit code without blaming sandbox permissions', () => {
  const result = describeDesktopExit(7, null, 'Could not open the score database', root);
  assert.equal(result.exitCode, 7);
  assert.match(result.message, /7/);
  assert.ok(!result.message.includes('sudo'));
});
