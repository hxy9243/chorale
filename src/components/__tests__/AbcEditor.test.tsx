import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AbcEditor } from '../AbcEditor';

describe('AbcEditor Component', () => {
  it('renders ABC text area and handles text changes', () => {
    const onAbcChange = vi.fn();
    const initialAbc = 'X:1\nT:Test Score\nK:C\nC D E F|';

    render(<AbcEditor abcCode={initialAbc} onAbcChange={onAbcChange} />);

    const textarea = screen.getByPlaceholderText(/Parsed ABC code will appear here/) as HTMLTextAreaElement;
    expect(textarea.value).toBe(initialAbc);

    fireEvent.change(textarea, { target: { value: 'X:1\nT:Modified\nK:C\nC4|' } });
    expect(onAbcChange).toHaveBeenCalledWith('X:1\nT:Modified\nK:C\nC4|');
  });

  it('provides a close button inside the editor window', () => {
    const onToggleVisibility = vi.fn();
    render(
      <AbcEditor
        abcCode={'X:1\nT:Test\nK:C\nC|'}
        onAbcChange={() => undefined}
        onToggleVisibility={onToggleVisibility}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close ABC editor' }));
    expect(onToggleVisibility).toHaveBeenCalledOnce();
  });
});
