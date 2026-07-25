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
    });

    unmount();
    render(
      <AgentChatPanel
        open
        onClose={() => undefined}
        abcCode={'X:1\nT:Different state\nK:G\nGABc|'}
        activeFileName="Another score.abc"
        revision={13}
      />,
    );

    expect(screen.getByText('What changed?')).toBeDefined();
    expect(screen.getByText('Grounded mock response')).toBeDefined();
    expect(screen.getByText('Local edit.abc · ABC rev 12')).toBeDefined();
  });
});
