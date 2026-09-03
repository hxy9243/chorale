import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ChevronDown, Send, Square, X } from 'lucide-react';
import type { AIProviderState } from '../../agent/useAIProviders';
import {
  type AIThinkingLevel,
  isAIThinkingLevel,
} from '../../agent/aiTypes';

const DEFAULT_TEXTAREA_HEIGHT = 80;
const COMPOSER_MAX_PANEL_RATIO = 0.35;
const KEYBOARD_RESIZE_STEP = 24;

const THINKING_LEVEL_LABELS: Record<AIThinkingLevel, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
  xhigh: 'Extra High',
};

export interface ChoraleComposerRef {
  setDraft: (text: string) => void;
  focus: () => void;
}

export interface ChoraleComposerProps {
  abcCode: string;
  isStreaming: boolean;
  providerReady: boolean;
  ai: AIProviderState;
  selectedConnection?: any;
  selectedModel?: any;
  selectedModels: any[];
  effectiveThinkingLevel: AIThinkingLevel;
  supportedThinkingLevels: AIThinkingLevel[];
  modelSupportsThinking: boolean;
  anchorLabel: string | null;
  onClearAnchor?: () => void;
  onOpenSettings: () => void;
  onSend: (text: string) => void;
  onPrioritySteer: (text: string) => void;
  onEnqueue: (text: string) => void;
  onStop: () => void;
  onThinkingLevelChange: (level: AIThinkingLevel) => void;
  onConnectionChange: (connectionId: string) => Promise<void>;
  onModelChange: (modelId: string) => Promise<void>;
}

export const ChoraleComposer = forwardRef<ChoraleComposerRef, ChoraleComposerProps>(function ChoraleComposer({
  abcCode,
  isStreaming,
  providerReady,
  ai,
  selectedConnection,
  selectedModel,
  selectedModels,
  effectiveThinkingLevel,
  supportedThinkingLevels,
  modelSupportsThinking,
  anchorLabel,
  onClearAnchor,
  onOpenSettings,
  onSend,
  onPrioritySteer,
  onEnqueue,
  onStop,
  onThinkingLevelChange,
  onConnectionChange,
  onModelChange,
}, ref) {
  const [draft, setDraft] = useState('');
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const providerTriggerRef = useRef<HTMLButtonElement>(null);
  const providerPickerRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ pointerId: number; pointerY: number; height: number } | null>(null);

  useImperativeHandle(ref, () => ({
    setDraft: (text: string) => {
      setDraft(text);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    focus: () => {
      textareaRef.current?.focus();
    },
  }), []);

  const getTextareaBounds = useCallback(() => {
    const panel = composerRef.current?.closest('.agent-panel') as HTMLElement | null;
    const panelHeight = panel?.getBoundingClientRect().height || window.innerHeight;
    const composerHeight = composerRef.current?.getBoundingClientRect().height || 0;
    const currentTextareaHeight = textareaRef.current?.getBoundingClientRect().height || DEFAULT_TEXTAREA_HEIGHT;
    const composerOverhead = Math.max(0, composerHeight - currentTextareaHeight);
    const maxComposerHeight = panelHeight * COMPOSER_MAX_PANEL_RATIO;
    const maxHeight = Math.max(DEFAULT_TEXTAREA_HEIGHT, Math.floor(maxComposerHeight - composerOverhead));
    return { minHeight: DEFAULT_TEXTAREA_HEIGHT, maxHeight };
  }, []);

  const setBoundedTextareaHeight = useCallback((targetHeight: number) => {
    const { minHeight, maxHeight } = getTextareaBounds();
    const bounded = Math.min(maxHeight, Math.max(minHeight, targetHeight));
    setTextareaHeight(bounded);
    if (textareaRef.current) {
      textareaRef.current.style.height = `${bounded}px`;
      textareaRef.current.style.overflowY = targetHeight > maxHeight ? 'auto' : 'hidden';
    }
  }, [getTextareaBounds]);

  const growTextareaToContent = useCallback((textarea: HTMLTextAreaElement) => {
    const overflow = textarea.scrollHeight - textarea.clientHeight;
    if (overflow <= 1) {
      textarea.style.overflowY = 'hidden';
      return;
    }

    const { minHeight, maxHeight } = getTextareaBounds();
    const currentHeight = textarea.getBoundingClientRect().height || DEFAULT_TEXTAREA_HEIGHT;
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, currentHeight + overflow));
    setTextareaHeight(nextHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = currentHeight + overflow > maxHeight ? 'auto' : 'hidden';
  }, [getTextareaBounds]);

  useEffect(() => {
    if (draft) return;
    setTextareaHeight(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = '';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }, [draft]);

  useEffect(() => {
    if (!providerPickerOpen) return;
    const handleOutsideInteraction = (event: Event) => {
      const target = event.target as Node | null;
      if (!providerPickerRef.current?.contains(target)) {
        setProviderPickerOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProviderPickerOpen(false);
        providerTriggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handleOutsideInteraction, true);
    document.addEventListener('focusin', handleOutsideInteraction, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideInteraction, true);
      document.removeEventListener('focusin', handleOutsideInteraction, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [providerPickerOpen]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;

    if (event.key === 'Enter') {
      if (isStreaming && event.shiftKey && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        const text = draft.trim();
        if (text) {
          setDraft('');
          onPrioritySteer(text);
        }
        return;
      }

      if (!event.shiftKey) {
        event.preventDefault();
        const text = draft.trim();
        if (!text) return;

        if (isStreaming) {
          setDraft('');
          onEnqueue(text);
        } else {
          setDraft('');
          onSend(text);
        }
      }
    } else if (event.key === 'Escape') {
      if (isStreaming) {
        event.preventDefault();
        onStop();
      }
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !abcCode.trim() || !providerReady) return;
    setDraft('');
    onSend(text);
  };

  return (
    <form className="agent-composer" onSubmit={handleSubmit} ref={composerRef}>
      {!ai.desktopAvailable && (
        <div className="agent-provider-required">
          <span>AI providers require the Chorale desktop app.</span>
        </div>
      )}
      {ai.desktopAvailable && (
        <div className="agent-provider-picker" ref={providerPickerRef}>
          <button
            ref={providerTriggerRef}
            type="button"
            className="agent-provider-trigger"
            aria-label="Choose AI provider, model, and thinking level"
            aria-haspopup="dialog"
            aria-expanded={providerPickerOpen}
            aria-controls="agent-provider-popover"
            onClick={() => {
              setProviderPickerOpen((current) => !current);
            }}
          >
            <span>{selectedConnection?.name || 'Select provider'}</span>
            <strong>{selectedModel?.name || 'No model'}</strong>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          {providerPickerOpen && (
            <div className="agent-provider-popover" id="agent-provider-popover" role="dialog" aria-label="AI chat configuration">
              <label>
                Provider
                <select
                  aria-label="AI provider"
                  value={selectedConnection?.id ?? ''}
                  onChange={(event) => void onConnectionChange(event.target.value)}
                >
                  <option value="">Select provider…</option>
                  {ai.connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name} ({connection.status})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Model
                <select
                  aria-label="AI model"
                  value={selectedModel?.id ?? ''}
                  disabled={!selectedConnection}
                  onChange={(event) => {
                    if (selectedConnection) {
                      void onModelChange(event.target.value);
                      setProviderPickerOpen(false);
                    }
                  }}
                >
                  <option value="">Select model…</option>
                  {selectedModels.map((model) => (
                    <option key={model.id} value={model.id}>{model.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Thinking level
                <select
                  aria-label="Thinking level"
                  value={effectiveThinkingLevel}
                  disabled={!modelSupportsThinking}
                  onChange={(event) => {
                    if (isAIThinkingLevel(event.target.value)) {
                      onThinkingLevelChange(event.target.value);
                    }
                  }}
                >
                  {supportedThinkingLevels.map((level) => (
                    <option key={level} value={level}>{THINKING_LEVEL_LABELS[level]}</option>
                  ))}
                </select>
              </label>
              {!modelSupportsThinking && selectedModel && (
                <p className="agent-provider-note">This model does not advertise thinking support.</p>
              )}
              <button type="button" onClick={() => {
                setProviderPickerOpen(false);
                onOpenSettings();
              }}>Manage providers</button>
            </div>
          )}
        </div>
      )}
      {anchorLabel && (
        <div className="agent-composer-anchor">
          <span>Selected {anchorLabel}</span>
          {onClearAnchor && (
            <button
              type="button"
              className="agent-anchor-clear-btn"
              onClick={onClearAnchor}
              title="Clear selection"
              aria-label={`Deselect ${anchorLabel} from chat context`}
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
      <label htmlFor="agent-question" className="sr-only">Ask about the current sheet</label>
      <div className="agent-composer-input">
        <textarea
          ref={textareaRef}
          id="agent-question"
          value={draft}
          style={textareaHeight === null ? undefined : { height: `${textareaHeight}px` }}
          onChange={(event) => {
            const val = event.target.value;
            setDraft(val);
            if (val.includes('\n') || val.length > 80 || textareaHeight !== null) {
              growTextareaToContent(event.currentTarget);
            }
          }}
          placeholder={!ai.desktopAvailable
            ? 'Open Chorale desktop to use AI'
            : !providerReady
              ? 'Select a provider and model'
              : abcCode.trim()
                ? 'Ask about the current sheet…'
                : 'Load a score to start chatting'}
          disabled={!abcCode.trim() || !providerReady}
          rows={3}
          onKeyDown={handleKeyDown}
          aria-label="Ask about the current sheet"
        />
        <button
          className="agent-composer-resize-handle"
          type="button"
          aria-label="Resize chat input"
          aria-controls="agent-question"
          title="Drag vertically or use the arrow keys to resize"
          disabled={!abcCode.trim() || !providerReady}
          onPointerDown={(event) => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            resizeStartRef.current = {
              pointerId: event.pointerId,
              pointerY: event.clientY,
              height: textarea.getBoundingClientRect().height || DEFAULT_TEXTAREA_HEIGHT,
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = resizeStartRef.current;
            if (!start || start.pointerId !== event.pointerId) return;
            setBoundedTextareaHeight(start.height + start.pointerY - event.clientY);
          }}
          onPointerUp={(event) => {
            if (resizeStartRef.current?.pointerId === event.pointerId) {
              resizeStartRef.current = null;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            resizeStartRef.current = null;
          }}
          onKeyDown={(event) => {
            const textarea = textareaRef.current;
            if (!textarea || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
            event.preventDefault();
            const currentHeight = textarea.getBoundingClientRect().height || DEFAULT_TEXTAREA_HEIGHT;
            setBoundedTextareaHeight(
              currentHeight + (event.key === 'ArrowUp' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP),
            );
          }}
        >
          <svg
            className="agent-composer-resize-icon"
            viewBox="0 0 16 16"
            aria-hidden="true"
          >
            <path d="M3 1 15 13" />
            <path d="M8 1 15 8" />
            <path d="M13 1 15 3" />
          </svg>
        </button>
      </div>
      {isStreaming && (
        <div className="agent-composer-stream-hint" aria-live="polite">
          <span className="agent-stream-hint-item">
            <kbd className="agent-kbd">Enter</kbd> to queue
          </span>
          <span className="agent-stream-hint-item">
            <kbd className="agent-kbd">{typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '') ? '⌘' : 'Ctrl'}+Shift+Enter</kbd> to steer
          </span>
        </div>
      )}
      {isStreaming ? (
        <button
          className="agent-send-button"
          type="button"
          onClick={onStop}
          aria-label="Stop"
        >
          <Square size={16} />
        </button>
      ) : (
        <button
          className="agent-send-button"
          type="submit"
          disabled={!draft.trim() || !abcCode.trim() || !providerReady}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      )}
    </form>
  );
});
