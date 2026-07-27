import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SheetMusicView } from '../SheetMusicView';
import abcjs from 'abcjs';

vi.mock('abcjs', () => ({
  default: {
    renderAbc: vi.fn().mockImplementation((element) => {
      if (element && typeof element !== 'string') {
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

  it('resolves the global measure class instead of falling back to measure one', () => {
    const onSelectAnchor = vi.fn();
    let capturedOptions: any = null;
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((_element, _code, options) => {
      capturedOptions = options;
      return [{ getBpm: () => 120 }] as any;
    });


    render(<SheetMusicView abcCode={sampleAbc} onSelectAnchor={onSelectAnchor} />);

    expect(capturedOptions?.clickListener).toBeDefined();
    capturedOptions.clickListener(
      { startChar: 24 },
      0,
      'abcjs-note abcjs-l1 abcjs-m0 abcjs-mm3',
      { measure: 0 },
    );

    expect(onSelectAnchor).toHaveBeenCalledWith({
      measure: 4,
      abcOffset: 24,
      label: 'm. 4',
      playbackFraction: 1,
    });
  });

  it('draws a faint background highlight behind the selected measure', () => {
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((element) => {
      if (element && typeof element !== 'string') {
        element.innerHTML = `
          <svg data-testid="highlight-svg">
            <g class="abcjs-note abcjs-mm2"></g>
            <g class="abcjs-bar abcjs-mm2"></g>
          </svg>
        `;
        const measureElements = element.querySelectorAll<SVGGraphicsElement>('.abcjs-mm2');
        Object.defineProperty(measureElements[0], 'getBBox', {
          value: () => ({ x: 20, y: 30, width: 40, height: 20 }),
        });
        Object.defineProperty(measureElements[1], 'getBBox', {
          value: () => ({ x: 58, y: 28, width: 4, height: 28 }),
        });
      }
      return [{ getBpm: () => 120 }] as any;
    });

    const { container } = render(
      <SheetMusicView abcCode={sampleAbc} activeAnchor={{ measure: 3 }} />,
    );

    const highlight = container.querySelector('.abcjs-measure-highlight');
    expect(highlight?.getAttribute('x')).toBe('14');
    expect(highlight?.getAttribute('y')).toBe('20');
    expect(highlight?.getAttribute('width')).toBe('54');
    expect(highlight?.getAttribute('height')).toBe('44');
  });

  it('selects a measure from its full hit target on the first click', () => {
    const onSelectAnchor = vi.fn();
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((element) => {
      if (element && typeof element !== 'string') {
        element.innerHTML = `
          <svg>
            <g class="abcjs-note abcjs-mm0"></g>
            <g class="abcjs-bar abcjs-mm0"></g>
            <g class="abcjs-note abcjs-mm1"></g>
            <g class="abcjs-bar abcjs-mm1"></g>
          </svg>
        `;
        element.querySelectorAll<SVGGraphicsElement>('.abcjs-mm0').forEach((node, index) => {
          Object.defineProperty(node, 'getBBox', {
            value: () => ({ x: 10 + index * 40, y: 20, width: 30, height: 24 }),
          });
        });
        element.querySelectorAll<SVGGraphicsElement>('.abcjs-mm1').forEach((node, index) => {
          Object.defineProperty(node, 'getBBox', {
            value: () => ({ x: 90 + index * 40, y: 20, width: 30, height: 24 }),
          });
        });
      }
      return [{ getBpm: () => 120 }] as any;
    });

    const { container } = render(
      <SheetMusicView abcCode={sampleAbc} onSelectAnchor={onSelectAnchor} />,
    );

    fireEvent.click(container.querySelector('[data-measure="2"]')!);
    expect(onSelectAnchor).toHaveBeenCalledOnce();
    expect(onSelectAnchor).toHaveBeenCalledWith({
      measure: 2,
      abcOffset: undefined,
      label: 'm. 2',
      playbackFraction: 0.5,
    });
  });

  it('uses layout-aware zoom so enlarged scores reserve scrollable space', () => {
    const { container } = render(
      <SheetMusicView abcCode={sampleAbc} zoom={150} onZoomChange={vi.fn()} />
    );

    const wrapper = container.querySelector<HTMLElement>('.sheet-zoom-wrapper')!;
    expect(wrapper.style.zoom).toBe('1.5');
    expect(wrapper.style.transform).toBe('');
  });

  it('triggers onZoomChange on ctrl+wheel scroll gesture without page zoom', () => {
    const onZoomChange = vi.fn();
    const { container } = render(
      <SheetMusicView abcCode={sampleAbc} zoom={100} onZoomChange={onZoomChange} />
    );

    const card = container.querySelector('.sheet-music-card')!;
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -100,
    });

    fireEvent(card, wheelEvent);
    expect(onZoomChange).toHaveBeenCalledWith(110);
    expect(wheelEvent.defaultPrevented).toBe(true);
  });

  it('selects measure using repeat-aware timestamp when score contains repeats', () => {
    const onSelectAnchor = vi.fn();
    const repeatedAbc = 'X:1\nT:Repeats\nM:4/4\nL:1/4\nK:C\n|: C D E F | G A B c :|';

    render(<SheetMusicView abcCode={repeatedAbc} onSelectAnchor={onSelectAnchor} />);

    // Trigger clickListener on measure 2 (abcjs-mm1)
    const options = vi.mocked(abcjs.renderAbc).mock.calls.slice(-1)[0][2] as any;
    options.clickListener(
      { startChar: 37 },
      0,
      'abcjs-note abcjs-mm1',
      { measure: 1 },
    );

    expect(onSelectAnchor).toHaveBeenCalledWith(
      expect.objectContaining({
        measure: 2,
        abcOffset: 37,
        label: 'm. 2',
      }),
    );
  });
});
