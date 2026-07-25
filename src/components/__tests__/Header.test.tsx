import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../Header';

describe('Header Component', () => {
  it('renders brand logo title and action buttons', () => {
    const onToggleChat = vi.fn();
    const { rerender } = render(
      <Header activeFileName="Test Score.xml" chatOpen onToggleChat={onToggleChat} />,
    );
    expect(screen.getByText('Chorale')).toBeDefined();
    expect(screen.getByText('Test Score.xml')).toBeDefined();
    expect(screen.getByText('Share')).toBeDefined();
    expect(screen.getByTitle('Hide score chat')).toBeDefined();
    expect(screen.getByText('Chat')).toBeDefined();
    expect(screen.getByText('Saved just now')).toBeDefined();

    fireEvent.click(screen.getByTitle('Hide score chat'));
    expect(onToggleChat).toHaveBeenCalledOnce();

    rerender(<Header activeFileName="Test Score.xml" chatOpen={false} onToggleChat={onToggleChat} />);
    expect(screen.getByTitle('Show score chat')).toBeDefined();
  });
});
