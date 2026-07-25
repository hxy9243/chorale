import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SheetMusicView } from '../SheetMusicView';
import abcjs from 'abcjs';

vi.mock('abcjs', () => ({
  default: {
    renderAbc: vi.fn().mockImplementation((element) => {
      if (element) {
        element.innerHTML = '<svg data-testid="mock-svg-paper"><path class="abcjs-note" /></svg>';
      }
      return [{ getBpm: () => 120 }];
    }),
  },
}));

describe('SheetMusicView Component', () => {
  const sampleAbc = 'X:1\nT:Test Melody\nM:4/4\nL:1/4\nK:C\nC D E F |';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders section title and sheet music SVG container', () => {
    render(<SheetMusicView abcCode={sampleAbc} />);

    expect(screen.getByText('Interactive Sheet Music')).toBeDefined();
    expect(screen.getByTestId('mock-svg-paper')).toBeDefined();
    expect(abcjs.renderAbc).toHaveBeenCalled();
  });

  it('handles transpose controls (+1, -1, reset)', () => {
    const { container } = render(<SheetMusicView abcCode={sampleAbc} />);

    const transposeUpBtn = screen.getByTitle('Transpose up 1 semitone');
    const transposeDownBtn = screen.getByTitle('Transpose down 1 semitone');
    const transposeValueEl = container.querySelector('.transpose-val');

    expect(transposeValueEl?.textContent).toBe('0');

    fireEvent.click(transposeUpBtn);
    expect(transposeValueEl?.textContent).toBe('+1');

    fireEvent.click(transposeDownBtn);
    expect(transposeValueEl?.textContent).toBe('0');

    fireEvent.click(transposeDownBtn);
    expect(transposeValueEl?.textContent).toBe('-1');

    const resetBtn = screen.getByTitle('Reset Transpose');
    fireEvent.click(resetBtn);
    expect(transposeValueEl?.textContent).toBe('0');
  });

  it('handles zoom scale controls (Zoom In, Zoom Out)', () => {
    render(<SheetMusicView abcCode={sampleAbc} />);

    const zoomInBtn = screen.getByTitle('Zoom In');
    const zoomOutBtn = screen.getByTitle('Zoom Out');

    expect(screen.getByText('100%')).toBeDefined();

    fireEvent.click(zoomInBtn);
    expect(screen.getByText('110%')).toBeDefined();

    fireEvent.click(zoomOutBtn);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('invokes onTuneRendered callback when tunes are rendered', () => {
    const onTuneRendered = vi.fn();
    render(<SheetMusicView abcCode={sampleAbc} onTuneRendered={onTuneRendered} />);

    expect(onTuneRendered).toHaveBeenCalled();
  });

  it('clears the rendered score and tune when ABC is emptied', () => {
    const onTuneRendered = vi.fn();
    const { rerender } = render(
      <SheetMusicView abcCode={sampleAbc} onTuneRendered={onTuneRendered} />,
    );

    expect(screen.getByTestId('mock-svg-paper')).toBeDefined();
    rerender(<SheetMusicView abcCode="" onTuneRendered={onTuneRendered} />);

    expect(screen.queryByTestId('mock-svg-paper')).toBeNull();
    expect(onTuneRendered).toHaveBeenLastCalledWith(null);
  });

  it('renders activeAnchor badge and clears selection on click', () => {
    const onSelectAnchor = vi.fn();
    render(
      <SheetMusicView
        abcCode={sampleAbc}
        activeAnchor={{ measure: 5, label: 'm. 5' }}
        onSelectAnchor={onSelectAnchor}
      />
    );

    expect(screen.getByText('Selected:')).toBeDefined();
    expect(screen.getByText('m. 5')).toBeDefined();

    const clearBtn = screen.getByTitle('Clear Selection');
    fireEvent.click(clearBtn);
    expect(onSelectAnchor).toHaveBeenCalledWith(null);
  });

  it('triggers onSelectAnchor when clickListener resolves an element', () => {
    const onSelectAnchor = vi.fn();
    let capturedOptions: any = null;
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((_element, _code, options) => {
      capturedOptions = options;
      return [{ getBpm: () => 120 }] as any;
    });


    render(<SheetMusicView abcCode={sampleAbc} onSelectAnchor={onSelectAnchor} />);

    expect(capturedOptions?.clickListener).toBeDefined();
    capturedOptions.clickListener({ measureNumber: 3, startChar: 24 });

    expect(onSelectAnchor).toHaveBeenCalledWith({
      measure: 4,
      abcOffset: 24,
      label: 'm. 4',
    });
  });
});

