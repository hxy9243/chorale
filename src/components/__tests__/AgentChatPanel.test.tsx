import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentChatPanel } from '../AgentChatPanel';
import { CONVERSATION_STORAGE_KEY } from '../../agent/conversationStore';

vi.mock('../../agent/PiSheetAgent', () => ({
  PiSheetAgent: class {
    async send(
      _history: unknown,
      _question: string,
      _snapshot: unknown,
      callbacks: { onDelta: (delta: string) => void },
    ) {
      callbacks.onDelta('Grounded mock response');
      return 'Grounded mock response';
    }

    abort() {}
  },
}));

describe('AgentChatPanel', () => {
  beforeEach(() => localStorage.clear());

  it('sends the current ABC revision and persists the conversation', async () => {
    const { unmount } = render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-local-edit"
        abcCode={'X:1\nT:Edited in memory\nM:4/4\nK:C\nCDEF|'}
        activeFileName="Local edit.abc"
        revision={12}
      />,
    );

    fireEvent.change(screen.getByLabelText('Ask about the current sheet'), {
      target: { value: 'What changed?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByText('Grounded mock response');
    expect(screen.getByText('Local edit.abc · ABC rev 12')).toBeDefined();

    await waitFor(() => {
      const saved = localStorage.getItem(CONVERSATION_STORAGE_KEY);
      expect(saved).toContain('Edited in memory');
      expect(saved).toContain('What changed?');
      expect(saved).toContain('doc-local-edit');
    });

    unmount();
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-local-edit"
        abcCode={'X:1\nT:Different state\nK:G\nGABc|'}
        activeFileName="Another score.abc"
        revision={13}
      />,
    );

    expect(screen.getAllByText('What changed?').length).toBeGreaterThan(0);
    expect(screen.getByText('Grounded mock response')).toBeDefined();
    expect(screen.getByText('Local edit.abc · ABC rev 12')).toBeDefined();
  });

  it('disables start new thread button when conversation is empty and does not create empty threads', () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-test"
        abcCode={'X:1\nT:Test\nK:C\nCDEF|'}
        activeFileName="Test.abc"
        revision={1}
      />,
    );

    const newThreadBtn = screen.getByTitle('Start new thread') as HTMLButtonElement;
    expect(newThreadBtn.disabled).toBe(true);

    fireEvent.click(newThreadBtn);
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(1);
  });

  it('does not render analyze, edit, compose buttons or tools disclosure', () => {
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        fileId="doc-test"
        abcCode={'X:1\nT:Test\nK:C\nCDEF|'}
        activeFileName="Test.abc"
        revision={1}
      />,
    );

    expect(screen.queryByText('Analyze')).toBeNull();
    expect(screen.queryByText('Compose')).toBeNull();
    expect(screen.queryByText('Tools')).toBeNull();
  });
});
