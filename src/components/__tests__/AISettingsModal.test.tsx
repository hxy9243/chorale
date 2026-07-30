import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AIProviderState } from '../../agent/useAIProviders';
import { AISettingsModal } from '../AISettingsModal';

const zoomProps = {
  interfaceZoom: 100,
  onInterfaceZoomChange: vi.fn(),
};

const makeAIState = (overrides: Partial<AIProviderState> = {}): AIProviderState => ({
  desktopAvailable: true,
  loading: false,
  connections: [],
  selection: null,
  modelsByConnection: {},
  oauth: null,
  error: null,
  reload: vi.fn(),
  saveConnection: vi.fn(async (input) => ({
    id: 'saved-connection',
    name: input.name,
    kind: input.kind,
    authType: 'api-key' as const,
    persistence: 'encrypted' as const,
    status: 'ready' as const,
  })),
  deleteConnection: vi.fn(),
  refreshModels: vi.fn(),
  setSelection: vi.fn(),
  startCodexLogin: vi.fn(),
  cancelCodexLogin: vi.fn(),
  ...overrides,
});

describe('AISettingsModal', () => {
  it('shows desktop-required state without exposing provider forms in a browser', () => {
    render(
      <AISettingsModal
        open
        onClose={() => undefined}
        ai={makeAIState({ desktopAvailable: false })}
        {...zoomProps}
      />,
    );

    expect(screen.getByText('AI providers require the Chorale desktop app')).toBeDefined();
    expect(screen.queryByLabelText('API key')).toBeNull();
  });

  it('offers all provider types and saves an API-key connection', async () => {
    const ai = makeAIState();
    render(<AISettingsModal open onClose={() => undefined} ai={ai} {...zoomProps} />);

    const provider = screen.getByLabelText('Provider');
    expect([...provider.querySelectorAll('option')].map((option) => option.textContent)).toEqual([
      'OpenAI Codex',
      'OpenAI API',
      'Claude API',
      'Gemini API',
      'OpenRouter',
      'Custom OpenAI-compatible',
    ]);
    fireEvent.change(screen.getByLabelText('Connection name'), {
      target: { value: 'Team OpenAI' },
    });
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-renderer-transient' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save & test' }));

    await waitFor(() => expect(ai.saveConnection).toHaveBeenCalledWith({
      id: undefined,
      name: 'Team OpenAI',
      kind: 'openai',
      apiKey: 'sk-renderer-transient',
      baseUrl: undefined,
      headers: undefined,
    }));
    expect(screen.getByText('Connection saved and model access verified.')).toBeDefined();
  });

  it('moves focus into the dialog, closes on Escape, and restores focus', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Settings trigger';
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <AISettingsModal open onClose={onClose} ai={makeAIState()} {...zoomProps} />,
    );

    expect(screen.getByLabelText('Close AI settings')).toBe(document.activeElement);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toBe(document.activeElement);
    trigger.remove();
  });

  it('switches between provider, appearance, and about tabs', () => {
    const onInterfaceZoomChange = vi.fn();
    render(
      <AISettingsModal
        open
        onClose={() => undefined}
        ai={makeAIState()}
        interfaceZoom={130}
        onInterfaceZoomChange={onInterfaceZoomChange}
      />,
    );

    expect(screen.getByRole('tab', { name: 'API providers' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
    expect(screen.getByText('130%')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Interface scale'), { target: { value: '150' } });
    expect(onInterfaceZoomChange).toHaveBeenCalledWith(150);

    fireEvent.click(screen.getByRole('tab', { name: 'About' }));
    expect(screen.getAllByText('Chorale')).toHaveLength(2);
    expect(screen.getByText('Release')).toBeDefined();
    expect(screen.getByText('v0.0.0')).toBeDefined();
  });
});
