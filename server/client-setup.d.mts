export type ClientId = 'claude-desktop' | 'claude-code' | 'antigravity' | 'codex' | 'chatgpt';
export const CLIENTS: Record<ClientId, string>;
export const CHATGPT_SETUP_URL: string;
export function hasConfiguredClient(): Promise<boolean>;
export interface ClientPlan {
  client: ClientId;
  label: string;
  kind: 'json' | 'command' | 'manual';
  summary: string;
  url?: string;
  alreadyConnected?: boolean;
}
export function planClientSetup(options: { client: ClientId; entrypoint?: string; nodeExecutable?: string }): Promise<ClientPlan>;
export function applyClientSetup(plan: ClientPlan, options: { confirm: (plan: ClientPlan) => Promise<boolean> }): Promise<{ status: string; message: string }>;
