export type McpClientId = 'claude-desktop' | 'claude-code' | 'antigravity' | 'codex' | 'chatgpt';

export interface McpSetupPreview {
  id: string;
  label: string;
  kind: 'json' | 'command' | 'manual';
  summary: string;
  alreadyConnected?: boolean;
  hasGuide: boolean;
}

export interface McpIntegrationBridge {
  offerSetup(): Promise<'open-settings' | 'declined' | 'none'>;
  preview(client: McpClientId): Promise<McpSetupPreview>;
  connect(previewId: string): Promise<{ status: string; message: string }>;
  openGuide(): Promise<void>;
  onOpenSettings(listener: () => void): () => void;
}
