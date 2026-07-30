import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, KeyRound, RefreshCw, Trash2, X } from 'lucide-react';
import type { AIConnectionPublic, AIProviderKind, SaveAIConnectionInput } from '../agent/aiTypes';
import type { AIProviderState } from '../agent/useAIProviders';

type AISettingsModalProps = {
  open: boolean;
  onClose(): void;
  ai: AIProviderState;
  interfaceZoom: number;
  onInterfaceZoomChange(value: number): void;
};

type SettingsTab = 'providers' | 'appearance' | 'about';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'providers', label: 'API providers' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
];

const PROVIDER_LABELS: Record<AIProviderKind, string> = {
  'openai-codex': 'OpenAI Codex',
  openai: 'OpenAI API',
  anthropic: 'Claude API',
  google: 'Gemini API',
  openrouter: 'OpenRouter',
  custom: 'Custom OpenAI-compatible',
};

const readableAge = (value?: string) => {
  if (!value) return 'Models not loaded';
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return 'Models updated just now';
  if (seconds < 3600) return `Models updated ${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `Models updated ${Math.round(seconds / 3600)}h ago`;
  return `Models updated ${Math.round(seconds / 86_400)}d ago`;
};

const parseHeaders = (value: string) => {
  if (!value.trim()) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.values(parsed).some((item) => typeof item !== 'string')
  ) {
    throw new Error('Custom headers must be a JSON object containing string values.');
  }
  return parsed as Record<string, string>;
};

export const AISettingsModal: React.FC<AISettingsModalProps> = ({
  open,
  onClose,
  ai,
  interfaceZoom,
  onInterfaceZoomChange,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [kind, setKind] = useState<AIProviderKind>('openai');
  const [editing, setEditing] = useState<AIConnectionPublic | null>(null);
  const [name, setName] = useState('OpenAI');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [clearHeaders, setClearHeaders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('providers');

  const codexConnection = ai.connections.find((connection) => connection.kind === 'openai-codex');
  const isCodex = kind === 'openai-codex';

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose, open]);

  const resetForm = (nextKind: AIProviderKind) => {
    setEditing(null);
    setKind(nextKind);
    setName(PROVIDER_LABELS[nextKind].replace(' API', '').replace('OpenAI-compatible', 'provider'));
    setApiKey('');
    setBaseUrl(nextKind === 'custom' ? 'https://' : '');
    setHeaders('');
    setClearHeaders(false);
    setMessage(null);
  };

  const beginEdit = (connection: AIConnectionPublic) => {
    if (connection.kind === 'openai-codex') return;
    setEditing(connection);
    setKind(connection.kind);
    setName(connection.name);
    setBaseUrl(connection.baseUrl ?? '');
    setApiKey('');
    setHeaders('');
    setClearHeaders(false);
    setMessage(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isCodex) return;
    setBusy(true);
    setMessage(null);
    try {
      const input: SaveAIConnectionInput = {
        id: editing?.id,
        name,
        kind,
        apiKey: apiKey || undefined,
        baseUrl: kind === 'custom' ? baseUrl : undefined,
        headers: kind === 'custom' ? parseHeaders(headers) : undefined,
        clearHeaders: kind === 'custom' && clearHeaders,
      };
      await ai.saveConnection(input);
      resetForm(kind);
      setMessage('Connection saved and model access verified.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the connection.');
    } finally {
      setBusy(false);
    }
  };

  const startCodex = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await ai.startCodexLogin();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start Codex login.');
    } finally {
      setBusy(false);
    }
  };

  const providerOptions = useMemo(() => (
    Object.entries(PROVIDER_LABELS) as [AIProviderKind, string][]
  ), []);
  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % SETTINGS_TABS.length;
    if (event.key === 'ArrowUp') nextIndex = (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = SETTINGS_TABS.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextTab = SETTINGS_TABS[nextIndex];
    setActiveTab(nextTab.id);
    requestAnimationFrame(() => document.getElementById(`settings-tab-${nextTab.id}`)?.focus());
  };

  if (!open) return null;

  return (
    <div className="ai-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        className="ai-settings-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
      >
        <header className="ai-settings-header">
          <h2 id="ai-settings-title">Settings</h2>
          <button ref={closeRef} type="button" className="agent-icon-button" onClick={onClose} aria-label="Close settings">
            <X size={19} />
          </button>
        </header>

        <div className="ai-settings-body">
          <nav
            className="ai-settings-tabs"
            role="tablist"
            aria-label="Settings sections"
            aria-orientation="vertical"
          >
          {SETTINGS_TABS.map((tab, index) => (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {tab.label}
            </button>
          ))}
          </nav>

          <div className="ai-settings-content">
        {activeTab === 'providers' && (
          <div
            id="settings-panel-providers"
            role="tabpanel"
            aria-labelledby="settings-tab-providers"
          >
            {!ai.desktopAvailable ? (
              <div className="ai-desktop-required" role="status">
                <KeyRound size={20} aria-hidden="true" />
                <div>
                  <strong>AI providers require the Chorale desktop app</strong>
                  <p>The browser build still supports score editing, but does not accept provider credentials.</p>
                </div>
              </div>
            ) : (
              <div className="ai-settings-layout">
            <section className="ai-connections" aria-labelledby="connections-title">
              <div className="ai-section-heading">
                <h3 id="connections-title">Connections</h3>
                <span>{ai.connections.length}</span>
              </div>
              {ai.connections.length === 0 && <p className="ai-muted">No providers connected yet.</p>}
              {ai.connections.map((connection) => {
                const modelCount = ai.modelsByConnection[connection.id]?.length ?? 0;
                return (
                  <article className="ai-connection-card" key={connection.id}>
                    <div>
                      <strong>{connection.name}</strong>
                      <span>{PROVIDER_LABELS[connection.kind]}</span>
                    </div>
                    <div className="ai-connection-meta">
                      <span className={`ai-status ${connection.status}`}>{connection.status}</span>
                      <span>{modelCount} model{modelCount === 1 ? '' : 's'}</span>
                      <span>{readableAge(connection.modelsUpdatedAt)}</span>
                      <span>{connection.persistence === 'encrypted' ? 'Encrypted on disk' : 'Session only'}</span>
                    </div>
                    <div className="ai-card-actions">
                      {connection.authType === 'api-key' && (
                        <button type="button" onClick={() => beginEdit(connection)}>Edit</button>
                      )}
                      <button
                        type="button"
                        onClick={() => void ai.refreshModels(connection.id).catch((error) => {
                          setMessage(error instanceof Error ? error.message : 'Model refresh failed.');
                        })}
                      >
                        <RefreshCw size={13} /> Refresh
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void ai.deleteConnection(connection.id)}
                      >
                        <Trash2 size={13} /> {connection.authType === 'oauth' ? 'Logout' : 'Delete'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className="ai-add-connection" aria-labelledby="add-provider-title">
              <h3 id="add-provider-title">{editing ? 'Edit connection' : 'Add provider'}</h3>
              <label>
                Provider
                <select
                  value={kind}
                  disabled={Boolean(editing)}
                  onChange={(event) => resetForm(event.target.value as AIProviderKind)}
                >
                  {providerOptions.map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>

              {isCodex ? (
                <div className="ai-codex-login">
                  <p>Use your ChatGPT subscription through OpenAI’s device-code sign-in.</p>
                  {codexConnection && (
                    <div className="ai-connected-note">Codex is connected as “{codexConnection.name}”.</div>
                  )}
                  <button type="button" className="ai-primary-button" onClick={startCodex} disabled={busy}>
                    <ExternalLink size={15} /> {codexConnection ? 'Connect another Codex account' : 'Connect OpenAI Codex'}
                  </button>
                  {ai.oauth?.details?.verificationUri && (
                    <div className="ai-device-code" role="status">
                      <span>Browser opened for sign-in</span>
                      <strong>{ai.oauth.details.userCode}</strong>
                      <small>{ai.oauth.details.verificationUri}</small>
                    </div>
                  )}
                  {ai.oauth && ['starting', 'pending'].includes(ai.oauth.status) && (
                    <button type="button" onClick={() => void ai.cancelCodexLogin()}>Cancel sign-in</button>
                  )}
                  {ai.oauth?.details?.message && <p>{ai.oauth.details.message}</p>}
                </div>
              ) : (
                <form onSubmit={save}>
                  <label>
                    Connection name
                    <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
                  </label>
                  {kind === 'custom' && (
                    <>
                      <label>
                        OpenAI-compatible base URL
                        <input
                          type="url"
                          value={baseUrl}
                          onChange={(event) => setBaseUrl(event.target.value)}
                          placeholder="https://api.example.com/v1"
                          required
                        />
                      </label>
                      <label>
                        Secret headers (optional JSON)
                        <textarea
                          value={headers}
                          onChange={(event) => {
                            setHeaders(event.target.value);
                            if (event.target.value.trim()) setClearHeaders(false);
                          }}
                          placeholder={'{"X-Organization": "example"}'}
                          rows={3}
                          disabled={clearHeaders}
                        />
                      </label>
                      {editing && (
                        <label className="ai-clear-headers">
                          <span>
                            <input
                              type="checkbox"
                              checked={clearHeaders}
                              onChange={(event) => {
                                setClearHeaders(event.target.checked);
                                if (event.target.checked) setHeaders('');
                              }}
                            />
                            Remove all saved custom headers
                          </span>
                        </label>
                      )}
                    </>
                  )}
                  <label>
                    API key {editing && <span className="ai-optional">(leave blank to keep current key)</span>}
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      autoComplete="new-password"
                      placeholder={editing ? '•••••••• (unchanged)' : 'Paste API key'}
                      required={!editing}
                    />
                  </label>
                  <div className="ai-form-actions">
                    {editing && <button type="button" onClick={() => resetForm(kind)}>Cancel edit</button>}
                    <button className="ai-primary-button" type="submit" disabled={busy}>
                      {busy ? 'Testing…' : 'Save & test'}
                    </button>
                  </div>
                </form>
              )}
              {(message || ai.error) && <div className="ai-settings-message" role="status">{message || ai.error}</div>}
            </section>
          </div>
            )}
          </div>
        )}

        {activeTab === 'appearance' && (
          <section
            className="ai-settings-single-panel"
            id="settings-panel-appearance"
            role="tabpanel"
            aria-labelledby="settings-tab-appearance"
          >
            <h3>Interface scale</h3>
            <p>Increase text and controls throughout Chorale. You can also use Ctrl/Cmd + scroll.</p>
            <div className="ai-interface-scale-control">
              <label htmlFor="interface-scale">Interface scale</label>
              <output htmlFor="interface-scale">{interfaceZoom}%</output>
              <input
                id="interface-scale"
                type="range"
                min="80"
                max="160"
                step="10"
                value={interfaceZoom}
                onChange={(event) => onInterfaceZoomChange(Number(event.target.value))}
              />
              <button type="button" onClick={() => onInterfaceZoomChange(100)}>Reset to 100%</button>
            </div>
          </section>
        )}

        {activeTab === 'about' && (
          <section
            className="ai-settings-single-panel"
            id="settings-panel-about"
            role="tabpanel"
            aria-labelledby="settings-tab-about"
          >
            <div className="ai-about-brand">
              <div className="brand-mark" aria-hidden="true">C</div>
              <div>
                <h3>Chorale</h3>
                <p>Music score workspace and grounded AI assistant.</p>
              </div>
            </div>
            <dl className="ai-about-details">
              <div><dt>Name</dt><dd>Chorale</dd></div>
              <div><dt>Release</dt><dd>v{__APP_VERSION__}</dd></div>
              <div><dt>Runtime</dt><dd>{ai.desktopAvailable ? 'Desktop' : 'Browser'}</dd></div>
            </dl>
          </section>
        )}
          </div>
        </div>
      </div>
    </div>
  );
};
