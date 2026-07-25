import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileRail } from '../FileRail';
import { PRESET_SAMPLES } from '../../data/samples';

describe('FileRail Component', () => {
  const defaultProps = {
    activeFileName: 'Sample 1',
    onFileLoaded: vi.fn(),
    onSampleSelected: vi.fn(),
    loading: false,
    error: null,
  };

  it('renders import score button and project title headers', () => {
    render(<FileRail {...defaultProps} />);

    expect(screen.getByText('Import Score')).toBeDefined();
    expect(screen.getByText('LIBRARY')).toBeDefined();
    expect(screen.getByText('PROJECT FILES')).toBeDefined();
  });

  it('renders list of preset samples', () => {
    render(<FileRail {...defaultProps} />);

    PRESET_SAMPLES.forEach((sample) => {
      expect(screen.getByText(sample.title)).toBeDefined();
    });
  });


  it('calls onSampleSelected when a sample file is clicked', () => {
    render(<FileRail {...defaultProps} />);

    const firstSampleButton = screen.getByText(PRESET_SAMPLES[0].title);
    fireEvent.click(firstSampleButton);

    expect(defaultProps.onSampleSelected).toHaveBeenCalledWith(PRESET_SAMPLES[0]);
  });
});
