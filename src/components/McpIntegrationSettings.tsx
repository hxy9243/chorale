import { useRef, useState } from 'react';
import type { McpClientId, McpSetupPreview } from '../types/mcpIntegration';
import '../styles/mcp-integration.css';

const CLIENTS: Array<{ id: McpClientId; label: string }> = [
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'codex', label: 'Codex' },
  { id: 'chatgpt', label: 'ChatGPT' },
];

export function McpIntegrationSettings() {
  const bridge = window.choraleMcp;
  const [client, setClient] = useState<McpClientId>('claude-desktop');
  const [preview, setPreview] = useState<McpSetupPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'MCP integration could not be configured.'); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return (
    <section className="ai-settings-single-panel mcp-integration-settings" id="settings-panel-integration" role="tabpanel" aria-labelledby="settings-tab-integration">
      <h3>MCP integration</h3>
      <p>Use this MCP integration helper to connect external AI apps to your Chorale scores through the Model Context Protocol.</p>
      {bridge ? <>
        <p>Choose an app, review the connection, then confirm. Connected apps can read and edit scores in your Chorale library.</p>
        <div className="mcp-integration-client">
          <label htmlFor="mcp-client">AI app for MCP integration</label>
          <select id="mcp-client" value={client} disabled={busy} onChange={(event) => {
            setClient(event.target.value as McpClientId);
            setPreview(null);
            setMessage(null);
            setError(null);
          }}>
            {CLIENTS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
        <button
          type="button"
          className="mcp-action-btn mcp-review-btn"
          disabled={busy}
          onClick={() => void run(async () => {
            setPreview(null);
            setMessage(null);
            setPreview(await bridge.preview(client));
          })}
        >
          {busy ? 'Working…' : 'Review MCP connection'}
        </button>
        {preview && <div className="mcp-connection-preview">
          <h4>{preview.label} MCP connection</h4>
          <pre>{preview.summary}</pre>
          {preview.alreadyConnected ? <p role="status">{preview.label} is already configured for MCP integration.</p>
            : preview.kind !== 'manual' && <div className="mcp-integration-actions">
              <button
                type="button"
                className="mcp-action-btn mcp-connect-btn"
                disabled={busy}
                onClick={() => void run(async () => {
                  // Consume the preview even after an error; retry requires a fresh review.
                  setPreview(null);
                  const result = await bridge.connect(preview.id);
                  setMessage(result.message);
                })}
              >
                Connect {preview.label}
              </button>
              <button
                type="button"
                className="mcp-action-btn mcp-cancel-btn"
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                  setMessage('No MCP connection settings were changed.');
                }}
              >
                Cancel
              </button>
            </div>}
          {preview.hasGuide && (
            <button
              type="button"
              className="mcp-action-btn mcp-guide-btn"
              disabled={busy}
              onClick={() => void run(() => bridge.openGuide())}
            >
              View MCP setup guide
            </button>
          )}
        </div>}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </> : <p>Use the Chorale desktop app to configure MCP integration. In a terminal, you can also run <code>chorale setup mcp</code>.</p>}
    </section>
  );
}
