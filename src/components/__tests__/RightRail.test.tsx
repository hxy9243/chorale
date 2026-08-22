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

  it('renders a top-anchored toggle icon that mirrors the chat open state', () => {
    const onToggleChat = vi.fn();
    const { rerender } = render(
      <RightRail chatOpen={false} onToggleChat={onToggleChat} />,
    );

    const toggle = screen.getByRole('button', { name: 'Expand chat panel' });
    expect(toggle.classList.contains('rail-toggle')).toBe(true);

    fireEvent.click(toggle);
    expect(onToggleChat).toHaveBeenCalledOnce();

    rerender(<RightRail chatOpen onToggleChat={onToggleChat} />);
    expect(screen.getByRole('button', { name: 'Collapse chat panel' })).toBeDefined();
  });
});
