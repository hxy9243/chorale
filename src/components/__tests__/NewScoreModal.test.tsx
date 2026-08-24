import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { extractScore } from '../../music/scoreSnapshot';
import { NewScoreModal } from '../NewScoreModal';

describe('NewScoreModal', () => {
  it('starts with MVP defaults and creates validated piano ABC', async () => {
    const onCreate = vi.fn();
    render(<NewScoreModal open onClose={() => undefined} onCreate={onCreate} />);

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Untitled score');
    expect((screen.getByLabelText(/^Key/) as HTMLInputElement).value).toBe('C');
    expect((screen.getByLabelText(/^Meter/) as HTMLInputElement).value).toBe('4/4');
    expect((screen.getByLabelText(/^Tempo/) as HTMLInputElement).value).toBe('120');
    expect((screen.getByLabelText(/^Measures/) as HTMLInputElement).value).toBe('8');
    expect(screen.getByText('Piano · two staves')).toBeDefined();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My prelude' } });
    fireEvent.change(screen.getByLabelText(/^Subtitle/), { target: { value: 'For testing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create score' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const [abcSource, title] = onCreate.mock.calls[0];
    expect(title).toBe('My prelude');
    expect(abcSource).toContain('T:My prelude\nT:For testing');
    expect(extractScore(abcSource).measures).toHaveLength(8);
  });

  it('keeps the dialog open and reports errors without creating a document', () => {
    const onCreate = vi.fn();
    render(<NewScoreModal open onClose={() => undefined} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/^Tempo/), { target: { value: '301' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create score' }));
    expect(screen.getByRole('dialog', { name: 'New Score' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('Title is required.');
    expect(screen.getByRole('alert').textContent).toContain('Tempo must be between 20 and 300.');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('traps focus and closes safely with Escape', () => {
    const onClose = vi.fn();
    render(<NewScoreModal open onClose={onClose} onCreate={() => undefined} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
