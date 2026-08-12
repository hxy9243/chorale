import path from 'node:path';

export type ChoraleDataPaths = Readonly<{
  root: string;
  agentTraces: string;
}>;

export const resolveChoraleDataPaths = (userDataDirectory: string): ChoraleDataPaths => {
  const root = path.join(userDataDirectory, 'chorale-data');
  return {
    root,
    agentTraces: path.join(root, 'agent-traces'),
  };
};
