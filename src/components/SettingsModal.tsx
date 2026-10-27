import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { McpIntegrationSettings } from './McpIntegrationSettings';
import { useAppearance } from '../hooks/useAppearance';
import { HALLS, THEMES, STUDIO_ACCENTS } from '../utils/appearance';
import choraleLogo from '../assets/chorale-logo.svg?inline';

export interface SettingsModalProps {
  open: boolean;
  initialTab?: 'integration';
  settingsRequestId?: number;
  onClose(): void;
  interfaceZoom: number;
  onInterfaceZoomChange(value: number): void;
}

type SettingsTab = 'appearance' | 'integration' | 'about';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'integration', label: 'Integration' },
  { id: 'about', label: 'About' },
];

const isDesktopRuntime = (): boolean => {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as { choraleAI?: unknown; electronBridge?: unknown };
  return Boolean(win.choraleAI || win.electronBridge);
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  initialTab,
  settingsRequestId,
  onClose,
  interfaceZoom,
  onInterfaceZoomChange,
}) => {
  const appearance = useAppearance();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  useEffect(() => {
    if (open && initialTab) setActiveTab(initialTab);
  }, [open, initialTab, settingsRequestId]);

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
            {activeTab === 'integration' && <McpIntegrationSettings />}
            {activeTab === 'appearance' && (
              <section
                className="ai-settings-single-panel"
                id="settings-panel-appearance"
                role="tabpanel"
                aria-labelledby="settings-tab-appearance"
              >
                <div className="appearance-preferences">
                  <div className="appearance-intro"><h3>Appearance</h3><p>Choose a theme and the color around your score.</p></div>
                  <fieldset className="appearance-theme-fieldset">
                    <legend>Theme</legend>
                    <div className="appearance-theme-options">
                      {THEMES.map((theme) => (
                        <label className="appearance-theme-option" key={theme}>
                          <input type="radio" name="chorale-theme" value={theme}
                            checked={appearance.theme === theme} onChange={() => appearance.changeTheme(theme)} />
                          <span><strong>{theme === 'recital' ? 'Recital' : theme === 'studio' ? 'Studio' : 'Match system'}</strong>
                            <small>{theme === 'recital' ? 'Dark hall' : theme === 'studio' ? 'Light workspace' : 'Follow your device'}</small></span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {appearance.resolvedTheme === 'studio' ? (
                    <fieldset aria-describedby="hall-color-help">
                      <legend>Accent color</legend>
                      <div className="appearance-hall-options">
                        {STUDIO_ACCENTS.map((accent) => (
                          <label className="appearance-hall-option appearance-accent-option" data-studio-accent={accent} key={accent}>
                            <input type="radio" name="chorale-studio-accent" value={accent}
                              checked={appearance.studioAccent === accent} onChange={() => appearance.changeStudioAccent(accent)} />
                            <span className="appearance-hall-swatch" aria-hidden="true"><i /><i /><i /></span>
                            <span>{accent[0].toUpperCase() + accent.slice(1)}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : (
                  <fieldset className="appearance-hall-fieldset" aria-describedby="hall-color-help">
                    <legend>Hall color</legend>
                    <div className="appearance-hall-options">
                      {HALLS.map((hall) => (
                        <label className="appearance-hall-option" data-hall={hall} key={hall}>
                          <input type="radio" name="chorale-hall" value={hall}
                            checked={appearance.hall === hall} onChange={() => appearance.changeHall(hall)} />
                          <span className="appearance-hall-swatch" aria-hidden="true"><i /><i /><i /></span>
                          <span>{hall[0].toUpperCase() + hall.slice(1)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  )}
                  <p className="appearance-help" id="hall-color-help">{appearance.resolvedTheme === 'studio'
                    ? 'Adds a subtle tint around the score. Sound and context colors stay consistent.'
                    : 'Changes the hall around the score. Sound and context colors stay consistent.'}</p>
                </div>
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
                  <img className="ai-about-logo" src={choraleLogo} alt="Chorale logo" />
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
