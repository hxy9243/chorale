import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveChoraleDataPaths } from '../../../electron/dataPaths';

describe('resolveChoraleDataPaths', () => {
  it('keeps desktop-owned data beneath one OS user-data root', () => {
    const userData = path.join(path.sep, 'users', 'listener', 'Chorale');

    expect(resolveChoraleDataPaths(userData)).toEqual({
      root: path.join(userData, 'chorale-data'),
      agentTraces: path.join(userData, 'chorale-data', 'agent-traces'),
    });
  });
});
