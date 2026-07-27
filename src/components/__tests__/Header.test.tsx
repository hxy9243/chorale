import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../Header';

describe('Header Component', () => {
  it('renders brand logo title and active file name without Baroque Studies or Share button', () => {
    const onToggleChat = vi.fn();
    const { rerender } = render(
      <Header activeFileName="Test Score.xml" chatOpen onToggleChat={onToggleChat} saveState="Saved" />,
    );
    expect(screen.getByText('Chorale')).toBeDefined();
    expect(screen.getByText('Test Score.xml')).toBeDefined();
    expect(screen.queryByText('Baroque Studies')).toBeNull();
    expect(screen.queryByText('Share')).toBeNull();
    expect(screen.getByTitle('Hide score chat')).toBeDefined();
    expect(screen.getByText('Chat')).toBeDefined();
    expect(screen.getByText('Auto-saved')).toBeDefined();

    fireEvent.click(screen.getByTitle('Hide score chat'));
    expect(onToggleChat).toHaveBeenCalledOnce();

    rerender(<Header activeFileName="Test Score.xml" chatOpen={false} onToggleChat={onToggleChat} />);
    expect(screen.getByTitle('Show score chat')).toBeDefined();
  });

  it('triggers onToggleRail when sidebar toggle button is clicked', () => {
    const onToggleRail = vi.fn();
    render(<Header activeFileName="Test.xml" onToggleRail={onToggleRail} />);

    const toggleBtn = screen.getByTitle('Collapse sidebar');
    fireEvent.click(toggleBtn);
    expect(onToggleRail).toHaveBeenCalledOnce();
  });
});
