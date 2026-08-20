import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScoreMetadataHeader } from '../ScoreMetadataHeader';

describe('ScoreMetadataHeader Component', () => {
  it('renders single title, composer, and grouped metadata chips cleanly in view mode', () => {
    const onUpdate = vi.fn();
    render(
      <ScoreMetadataHeader
        title="Für Elise"
        composer="Ludwig van Beethoven"
        keySignature="Am"
        meter="3/8"
        tempoText="♩ = 45"
        tempoBpm={45}
        voices={['1', '2']}
        onUpdateMetadata={onUpdate}
      />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Für Elise');
    expect(screen.getByText('Ludwig van Beethoven')).toBeDefined();
    expect(screen.getByText('Key:')).toBeDefined();
    expect(screen.getByText('Am')).toBeDefined();
    expect(screen.getByText('Meter:')).toBeDefined();
    expect(screen.getByText('3/8')).toBeDefined();
    expect(screen.getByText('Tempo:')).toBeDefined();
    expect(screen.getByText('♩ = 45')).toBeDefined();
    expect(screen.getByText('Voices:')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();

    // In view mode, T and C tag badges are hidden to preserve clean engraving
    expect(screen.queryByText(/^T$/)).toBeNull();
    expect(screen.queryByText(/^C$/)).toBeNull();
  });

  it('enters edit mode on title double click, reveals T badge, and commits valid update on Enter', () => {
    const onUpdate = vi.fn();
    render(
      <ScoreMetadataHeader
        title="Old Title"
        composer="Beethoven"
        onUpdateMetadata={onUpdate}
      />,
    );

    const titleContainer = screen.getByRole('button', { name: /Score title: Old Title/i });
    fireEvent.doubleClick(titleContainer);

    const input = screen.getByRole('textbox', { name: 'Edit score title' }) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('Old Title');
    expect(screen.getByText(/^T$/)).toBeDefined();

    fireEvent.change(input, { target: { value: 'New Masterpiece' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith({ title: 'New Masterpiece' });
  });

  it('validates tempo BPM in range [20, 400] and shows error if invalid', () => {
    const onUpdate = vi.fn();
    render(
      <ScoreMetadataHeader
        title="Title"
        tempoBpm={120}
        onUpdateMetadata={onUpdate}
      />,
    );

    const tempoChip = screen.getByRole('button', { name: /Tempo:/i });
    fireEvent.doubleClick(tempoChip);

    const input = screen.getByRole('textbox', { name: 'Edit tempo BPM' }) as HTMLInputElement;
    expect(input).toBeDefined();

    // Out of bounds tempo
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeDefined();

    // Valid tempo
    fireEvent.change(input, { target: { value: '144' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith({
      tempoText: '♩ = 144',
      tempoBpm: 144,
      tempoUnit: '1/4',
    });
  });

  it('validates key signature and rejects invalid key format', () => {
    const onUpdate = vi.fn();
    render(
      <ScoreMetadataHeader
        title="Title"
        keySignature="C"
        onUpdateMetadata={onUpdate}
      />,
    );

    const keyChip = screen.getByRole('button', { name: /Key signature:/i });
    fireEvent.doubleClick(keyChip);

    const input = screen.getByRole('textbox', { name: 'Edit key signature' }) as HTMLInputElement;

    // Invalid key
    fireEvent.change(input, { target: { value: 'H#minor' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeDefined();

    // Valid key
    fireEvent.change(input, { target: { value: 'f#m' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith({ key: 'F#m' });
  });

  it('cancels edit mode without updating on Escape key', () => {
    const onUpdate = vi.fn();
    render(
      <ScoreMetadataHeader
        title="Original Title"
        onUpdateMetadata={onUpdate}
      />,
    );

    const titleContainer = screen.getByRole('button', { name: /Score title: Original Title/i });
    fireEvent.doubleClick(titleContainer);

    const input = screen.getByRole('textbox', { name: 'Edit score title' });
    fireEvent.change(input, { target: { value: 'Discarded Title' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Edit score title' })).toBeNull();
    expect(screen.getByText('Original Title')).toBeDefined();
  });
});
