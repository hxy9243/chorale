import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileRail } from '../FileRail';
import { PRESET_SAMPLES } from '../../data/samples';
import { createDocumentFromAbc } from '../../utils/fileSession';

describe('FileRail Component', () => {
  const doc1 = createDocumentFromAbc('Bach Minuet.xml', 'musicxml', 'X:1\nK:G\nGAB');
  const doc2 = createDocumentFromAbc('Beethoven Ode.xml', 'musicxml', 'X:1\nK:C\nEDCD');

  const defaultProps = {
    documents: [doc1, doc2],
    activeFileId: doc1.id,
    onSelectDocument: vi.fn(),
    onFileLoaded: vi.fn(),
    onSampleSelected: vi.fn(),
    loading: false,
    error: null,
  };

  it('renders import score button, active files, and preset samples headers', () => {
    render(<FileRail {...defaultProps} />);

    expect(screen.getByText('Import Score')).toBeDefined();
    expect(screen.getByText('LIBRARY')).toBeDefined();
    expect(screen.getByText('ACTIVE FILES')).toBeDefined();
    expect(screen.getByText('PRESET SAMPLES')).toBeDefined();
  });

  it('renders active document names and preset sample list', () => {
    render(<FileRail {...defaultProps} />);

    expect(screen.getByText('Bach Minuet.xml')).toBeDefined();
    expect(screen.getByText('Beethoven Ode.xml')).toBeDefined();

    PRESET_SAMPLES.forEach((sample) => {
      expect(screen.getAllByText(sample.title).length).toBeGreaterThan(0);
    });
  });

  it('calls onSelectDocument when an active file item is clicked', () => {
    render(<FileRail {...defaultProps} />);

    const doc2Button = screen.getByText('Beethoven Ode.xml');
    fireEvent.click(doc2Button);

    expect(defaultProps.onSelectDocument).toHaveBeenCalledWith(doc2.id);
  });

  it('calls onSampleSelected when a preset sample item is clicked', () => {
    render(<FileRail {...defaultProps} />);

    const firstSampleButton = screen.getAllByText(PRESET_SAMPLES[0].title)[0];
    fireEvent.click(firstSampleButton);

    expect(defaultProps.onSampleSelected).toHaveBeenCalledWith(PRESET_SAMPLES[0]);
  });
});
