import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RightRail } from '../RightRail';

describe('RightRail Component', () => {
  it('renders a persistent chat tab that toggles the chat panel', () => {
    const onToggleChat = vi.fn();
    const { rerender } = render(
      <RightRail chatOpen onToggleChat={onToggleChat} />,
    );

    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    expect(chatTab).toBeDefined();
    expect(chatTab.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(chatTab);
    expect(onToggleChat).toHaveBeenCalledOnce();

    rerender(<RightRail chatOpen={false} onToggleChat={onToggleChat} />);
    expect(screen.getByRole('tab', { name: 'Chat' }).getAttribute('aria-selected')).toBe('false');
  });
});
