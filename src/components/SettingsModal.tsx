import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export interface SettingsModalProps {
  open: boolean;
  onClose(): void;
  interfaceZoom: number;
  onInterfaceZoomChange(value: number): void;
}

type SettingsTab = 'appearance' | 'about';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'about', label: 'About' },
];

const isDesktopRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as { choraleAI?: unknown; electronBridge?: unknown };
  return Boolean(win.choraleAI || win.electronBridge);
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onClose,
  interfaceZoom,
  onInterfaceZoomChange,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

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
    <div
      className="ai-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="ai-settings-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="ai-settings-header">
          <h2 id="settings-title">Settings</h2>
          <button
            ref={closeRef}
            type="button"
            className="agent-icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={19} aria-hidden="true" />
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
                  <button type="button" onClick={() => onInterfaceZoomChange(100)}>
                    Reset to 100%
                  </button>
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
                    <p>Music score workspace and agent skill.</p>
                  </div>
                </div>
                <dl className="ai-about-details">
                  <div>
                    <dt>Name</dt>
                    <dd>Chorale</dd>
                  </div>
                  <div>
                    <dt>Release</dt>
                    <dd>v{__APP_VERSION__}</dd>
                  </div>
                  <div>
                    <dt>Runtime</dt>
                    <dd>{isDesktopRuntime() ? 'Desktop' : 'Browser'}</dd>
                  </div>
                </dl>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
