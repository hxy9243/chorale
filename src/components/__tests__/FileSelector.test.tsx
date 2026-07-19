import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileSelector } from '../FileSelector';

describe('FileSelector Component', () => {
  it('renders drag-and-drop zone and preset dropdown', () => {
    const onFileLoaded = vi.fn();
    const onSampleSelected = vi.fn();

    render(
      <FileSelector
        onFileLoaded={onFileLoaded}
        onSampleSelected={onSampleSelected}
        activeFileName="twinkle.xml"
        loading={false}
        error={null}
      />
    );

    expect(screen.getByText('MusicXML Source')).toBeDefined();
    expect(screen.getByText('Loaded: twinkle.xml')).toBeDefined();
  });

  it('triggers onSampleSelected when preset dropdown changes', () => {
    const onFileLoaded = vi.fn();
    const onSampleSelected = vi.fn();

    render(
      <FileSelector
        onFileLoaded={onFileLoaded}
        onSampleSelected={onSampleSelected}
        activeFileName=""
        loading={false}
        error={null}
      />
    );

    const select = screen.getByLabelText('Sample:');
    fireEvent.change(select, { target: { value: 'fur-elise-xml' } });

    expect(onSampleSelected).toHaveBeenCalled();
  });
});
