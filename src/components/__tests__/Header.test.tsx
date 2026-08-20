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

  it('renders SVG ready, Music ready, and save status indicators in the header', () => {
    render(
      <Header
        activeFileName="Test.xml"
        saveStatus="saved"
        canRenderScore={true}
        hasPlayback={true}
      />,
    );

    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByText('Auto-saved')).toBeDefined();
    expect(screen.getByText('SVG ready')).toBeDefined();
    expect(screen.getByText('Music ready')).toBeDefined();
  });

  it('renders pending status when score or audio is not ready', () => {
    render(
      <Header
        activeFileName="Test.xml"
        saveStatus="saving"
        canRenderScore={false}
        hasPlayback={false}
      />,
    );

    expect(screen.getByText('Saving…')).toBeDefined();
    expect(screen.getByText('SVG pending')).toBeDefined();
    expect(screen.getByText('Music pending')).toBeDefined();
  });
});
