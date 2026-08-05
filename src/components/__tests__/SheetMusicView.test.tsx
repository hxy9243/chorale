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

  it('renders from ABC without inline directives that shift visual and audio timing', () => {
    const abcWithTempoChange = sampleAbc.replace(
      'C D',
      'C [Q:1/4=60] !f![I:staff -1] (3x/D/E/[I:staff +1]',
    );

    render(<SheetMusicView abcCode={abcWithTempoChange} />);

    const renderedAbc = vi.mocked(abcjs.renderAbc).mock.calls.at(-1)?.[1] as string;
    expect(renderedAbc).not.toContain('[Q:1/4=60]');
    expect(renderedAbc).not.toContain('[I:staff -1]');
    expect(renderedAbc).not.toContain('[I:staff +1]');
    expect(renderedAbc).toContain('(3z/D/E/');
    expect(renderedAbc).toHaveLength(abcWithTempoChange.length);
    expect(renderedAbc.indexOf('E F')).toBe(abcWithTempoChange.indexOf('E F'));
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
        activeAnchor={{ startMeasure: 5, endMeasure: 5, label: 'm. 5' }}
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
      startMeasure: 4,
      endMeasure: 4,
      abcOffset: 24,
      label: 'm. 4',
      playbackFraction: 1,
    });
  });

  it('keeps the selection highlight inside the measure barlines', () => {
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((element) => {
      if (element && typeof element !== 'string') {
        element.innerHTML = `
          <svg data-testid="highlight-svg">
            <g class="abcjs-staff abcjs-l0"></g>
            <g class="abcjs-bar abcjs-l0 abcjs-mm1"></g>
            <g class="abcjs-note abcjs-mm2"></g>
            <g class="abcjs-bar abcjs-l0 abcjs-mm2"></g>
          </svg>
        `;
        const staff = element.querySelector<SVGGraphicsElement>('.abcjs-staff')!;
        const previousBar = element.querySelector<SVGGraphicsElement>('.abcjs-mm1')!;
        const measureElements = element.querySelectorAll<SVGGraphicsElement>('.abcjs-mm2');
        Object.defineProperty(staff, 'getBBox', {
          value: () => ({ x: 10, y: 20, width: 200, height: 40 }),
        });
        Object.defineProperty(previousBar, 'getBBox', {
          value: () => ({ x: 60, y: 20, width: 2, height: 40 }),
        });
        Object.defineProperty(measureElements[0], 'getBBox', {
          value: () => ({ x: 80, y: 25, width: 50, height: 20 }),
        });
        Object.defineProperty(measureElements[1], 'getBBox', {
          value: () => ({ x: 160, y: 20, width: 2, height: 40 }),
        });
      }
      return [{ getBpm: () => 120 }] as any;
    });

    const { container } = render(
      <SheetMusicView abcCode={sampleAbc} activeAnchor={{ startMeasure: 3, endMeasure: 3 }} />,
    );

    const highlight = container.querySelector('.abcjs-measure-highlight');
    expect(highlight?.getAttribute('x')).toBe('62');
    expect(highlight?.getAttribute('y')).toBe('20');
    expect(highlight?.getAttribute('width')).toBe('98');
    expect(highlight?.getAttribute('height')).toBe('40');
  });

  it('starts the selection highlight at the staff edge after a line wrap', () => {
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((element) => {
      if (element && typeof element !== 'string') {
        element.innerHTML = `
          <svg>
            <g class="abcjs-bar abcjs-l0 abcjs-mm1"></g>
            <g class="abcjs-staff abcjs-l1"></g>
            <g class="abcjs-note abcjs-l1 abcjs-mm2"></g>
            <g class="abcjs-bar abcjs-l1 abcjs-mm2"></g>
          </svg>
        `;
        const previousLineBar = element.querySelector<SVGGraphicsElement>('.abcjs-mm1')!;
        const staff = element.querySelector<SVGGraphicsElement>('.abcjs-staff')!;
        const measureElements = element.querySelectorAll<SVGGraphicsElement>('.abcjs-mm2');
        Object.defineProperty(previousLineBar, 'getBBox', {
          value: () => ({ x: 300, y: 20, width: 2, height: 40 }),
        });
        Object.defineProperty(staff, 'getBBox', {
          value: () => ({ x: 15, y: 100, width: 280, height: 40 }),
        });
        Object.defineProperty(measureElements[0], 'getBBox', {
          value: () => ({ x: 40, y: 105, width: 50, height: 20 }),
        });
        Object.defineProperty(measureElements[1], 'getBBox', {
          value: () => ({ x: 160, y: 100, width: 2, height: 40 }),
        });
      }
      return [{ getBpm: () => 120 }] as any;
    });

    const { container } = render(
      <SheetMusicView abcCode={sampleAbc} activeAnchor={{ startMeasure: 3, endMeasure: 3 }} />,
    );

    const highlight = container.querySelector('.abcjs-measure-highlight');
    expect(highlight?.getAttribute('x')).toBe('15');
    expect(highlight?.getAttribute('y')).toBe('100');
    expect(highlight?.getAttribute('width')).toBe('145');
    expect(highlight?.getAttribute('height')).toBe('40');
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
      startMeasure: 2,
      endMeasure: 2,
      abcOffset: undefined,
      label: 'm. 2',
      playbackFraction: 0.5,
    });

    fireEvent.click(container.querySelector('[data-measure="1"]')!, { shiftKey: true });
    expect(onSelectAnchor).toHaveBeenLastCalledWith({
      startMeasure: 1,
      endMeasure: 2,
      abcOffset: undefined,
      label: 'mm. 1–2',
      playbackFraction: 0,
    });

    fireEvent.click(container.querySelector('[data-measure="1"]')!);
    fireEvent.keyDown(container.querySelector('[data-measure="2"]')!, {
      key: 'Enter',
      shiftKey: true,
    });
    expect(onSelectAnchor).toHaveBeenLastCalledWith({
      startMeasure: 1,
      endMeasure: 2,
      abcOffset: undefined,
      label: 'mm. 1–2',
      playbackFraction: 0,
    });
  });

  it('sizes the score wrapper with its zoom so rendered dimensions actually change', () => {
    const { container, rerender } = render(
      <SheetMusicView abcCode={sampleAbc} zoom={150} onZoomChange={vi.fn()} />
    );

    const wrapper = container.querySelector<HTMLElement>('.sheet-zoom-wrapper')!;
    expect(wrapper.style.zoom).toBe('1.5');
    expect(wrapper.style.width).toBe('150%');
    expect(wrapper.style.transform).toBe('');

    rerender(
      <SheetMusicView abcCode={sampleAbc} zoom={50} onZoomChange={vi.fn()} />
    );

    expect(wrapper.style.zoom).toBe('0.5');
    expect(wrapper.style.width).toBe('50%');
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

  it('selects the measure occurrence in the playhead current repeat pass', () => {
    const onSelectAnchor = vi.fn();
    const repeatedAbc = 'X:1\nT:Repeats\nM:4/4\nL:1/4\nK:C\n|: C D E F | G A B c :|';
    vi.mocked(abcjs.renderAbc).mockImplementationOnce(() => [{
      getBpm: () => 120,
      getTotalTime: () => 8,
      setTiming: vi.fn(),
      noteTimings: [
        { type: 'event', milliseconds: 0, measureNumber: 0, measureStart: true },
        { type: 'event', milliseconds: 2_000, measureNumber: 1, measureStart: true },
        { type: 'event', milliseconds: 4_000, measureNumber: 0, measureStart: true },
        { type: 'event', milliseconds: 6_000, measureNumber: 1, measureStart: true },
        { type: 'end', milliseconds: 8_000 },
      ],
    }] as any);

    render(
      <SheetMusicView
        abcCode={repeatedAbc}
        onSelectAnchor={onSelectAnchor}
        getPlaybackPosition={() => ({ currentSeconds: 6.1, isPlaying: true })}
      />,
    );

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
        startMeasure: 2,
        endMeasure: 2,
        abcOffset: 37,
        label: 'm. 2',
        playbackSeconds: 6,
        playbackFraction: 0.75,
      }),
    );
  });
});
