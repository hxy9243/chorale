import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Header } from '../Header';

describe('Header Component', () => {
  it('renders the title and current score without a brand icon', () => {
    const onToggleChat = vi.fn();
    const { rerender } = render(
      <Header activeFileName="Test Score.xml" chatOpen onToggleChat={onToggleChat} />,
    );
    expect(screen.getByText('Chorale')).toBeDefined();
    expect(screen.getByText('Test Score.xml')).toBeDefined();
    expect(document.querySelector('.brand-mark')).toBeNull();
    expect(screen.queryByText('Baroque Studies')).toBeNull();
    expect(screen.queryByText('Share')).toBeNull();
    expect(screen.getByTitle('Hide score chat')).toBeDefined();
    expect(screen.getByText('Chat')).toBeDefined();

    fireEvent.click(screen.getByTitle('Hide score chat'));
    expect(onToggleChat).toHaveBeenCalledOnce();

    rerender(<Header activeFileName="Test Score.xml" chatOpen={false} onToggleChat={onToggleChat} />);
    expect(screen.getByTitle('Show score chat')).toBeDefined();
  });

  it('leaves save state, settings, and sidebar navigation to their owning panels', () => {
    render(<Header activeFileName="Test.xml" />);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull();
    expect(screen.queryByTitle('Collapse sidebar')).toBeNull();
    expect(screen.queryByTitle('Expand sidebar')).toBeNull();
  });
});
