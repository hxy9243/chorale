import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SheetMusicView } from '../SheetMusicView';
import abcjs from 'abcjs';

vi.mock('abcjs', () => ({
  default: {
    parseOnly: vi.fn().mockReturnValue([{
      lines: [{ staff: [{ voices: [[
        { el_type: 'note', duration: 0.25, startChar: 30, endChar: 31, pitches: [{ pitch: 0 }] },
        { el_type: 'bar', startChar: 38, endChar: 39 },
      ]] }] }],
      getMeter: () => ({ value: [{ num: '4', den: '4' }] }),
      getKeySignature: () => ({ root: 'C' }),
    }]),
    renderAbc: vi.fn().mockImplementation((element) => {
      if (element && typeof element !== 'string') {
        element.innerHTML = '<svg data-testid="mock-svg-paper"><path class="abcjs-note" /></svg>';
      }
      return [{ getBpm: () => 120 }] as any;
    }),
  },
}));

describe('SheetMusicView Component', () => {
  const sampleAbc = 'X:1\nT:Test Melody\nM:4/4\nL:1/4\nK:C\nC D E F |';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(abcjs.renderAbc).mockImplementation((element) => {
      if (element && typeof element !== 'string') {
        element.innerHTML = '<svg data-testid="mock-svg-paper"><path class="abcjs-note" /></svg>';
      }
      return [{ getBpm: () => 120 }] as any;
    });
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

  it('reserves a fixed chord band without rerendering abcjs when chord annotations change', () => {
    const chord = {
      id: 'stable-chord',
      kind: 'chord' as const,
      span: { startMeasure: 1, endMeasure: 1 },
      position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
      chordSymbol: 'C',
      label: 'Tonic',
      body: 'Stable harmony.',
      source: 'assistant' as const,
      createdAt: '2026-08-12T00:00:00.000Z',
      updatedAt: '2026-08-12T00:00:00.000Z',
    };
    const { rerender } = render(<SheetMusicView abcCode={sampleAbc} annotations={[]} />);
    const renderCount = vi.mocked(abcjs.renderAbc).mock.calls.length;
    const afterParsing = vi.mocked(abcjs.renderAbc).mock.calls.at(-1)?.[2]?.afterParsing;
    expect(afterParsing).toEqual(expect.any(Function));
    const parsedTune = { formatting: {} } as abcjs.TuneObject;
    afterParsing?.(parsedTune, 0, sampleAbc);
    expect(parsedTune.formatting).toMatchObject({ musicspace: 110, staffsep: 132 });

    rerender(<SheetMusicView abcCode={sampleAbc} annotations={[chord]} />);

    expect(vi.mocked(abcjs.renderAbc)).toHaveBeenCalledTimes(renderCount);
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
    clearBtn.focus();
    fireEvent.click(clearBtn);
    expect(onSelectAnchor).toHaveBeenCalledWith(null);
    expect(document.activeElement).toBe(clearBtn);
  });

  it('does not expose annotation add or count controls for the active range', () => {
    const onCreateAnnotation = vi.fn();
    const { container } = render(
      <SheetMusicView
        abcCode={sampleAbc}
        activeAnchor={{ startMeasure: 2, endMeasure: 4 }}
        meter="4/4"
        onCreateAnnotation={onCreateAnnotation}
      />,
    );

    expect(screen.queryByRole('button', { name: /Add annotation/ })).toBeNull();
    expect(screen.queryByLabelText(/range annotations/)).toBeNull();
    expect(container.querySelector('.annotation-rail-create')).toBeNull();
    expect(container.querySelector('.annotation-rail-count')).toBeNull();
    expect(onCreateAnnotation).not.toHaveBeenCalled();
  });

  it('opens accepted annotations for explicit edit and delete actions', async () => {
    const accepted = {
      id: 'annotation-accepted',
      kind: 'explanation' as const,
      span: { startMeasure: 3, endMeasure: 5 },
      label: 'Cadence plan',
      body: 'The phrase moves toward closure.',
      source: 'assistant' as const,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };
    const onSelectAnchor = vi.fn();
    const onUpdateAnnotation = vi.fn();
    const onDeleteAnnotation = vi.fn();
    render(
      <SheetMusicView
        abcCode={sampleAbc}
        annotations={[accepted]}
        onSelectAnchor={onSelectAnchor}
        onUpdateAnnotation={onUpdateAnnotation}
        onDeleteAnnotation={onDeleteAnnotation}
      />,
    );

    let editButton = screen.getByRole('button', { name: 'Edit annotation' });
    fireEvent.click(editButton);
    expect(screen.getByRole('form', { name: 'Edit annotation' })
      .closest('.annotation-card-editor')).not.toBeNull();
    expect(onSelectAnchor).toHaveBeenCalledWith(expect.objectContaining({
      startMeasure: 3,
      endMeasure: 5,
    }));
    fireEvent.change(screen.getByLabelText('Explanation'), {
      target: { value: 'Edited accepted explanation.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save annotation' }));
    await waitFor(() => expect(onUpdateAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      id: 'annotation-accepted',
      body: 'Edited accepted explanation.',
      source: 'assistant',
    })));
    editButton = screen.getByRole('button', { name: 'Edit annotation' });
    await waitFor(() => expect(document.activeElement).toBe(editButton));

    fireEvent.click(editButton);
    fireEvent.click(screen.getByRole('button', { name: 'Delete annotation' }));
    expect(onDeleteAnnotation).toHaveBeenCalledWith('annotation-accepted');
  });

  it('resets the compact editor when switching between chord annotations', async () => {
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((element) => {
      if (!element || typeof element === 'string') return [];
      element.innerHTML = `
        <svg viewBox="0 0 400 140">
          <g class="abcjs-note abcjs-mm0"></g>
          <g class="abcjs-bar abcjs-mm0"></g>
        </svg>
      `;
      const svg = element.querySelector<SVGSVGElement>('svg')!;
      const note = element.querySelector<SVGGraphicsElement>('.abcjs-note')!;
      const bar = element.querySelector<SVGGraphicsElement>('.abcjs-bar')!;
      Object.defineProperty(svg, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          top: 0,
          right: 400,
          bottom: 140,
          width: 400,
          height: 140,
        }),
      });
      Object.defineProperty(note, 'getBBox', {
        value: () => ({ x: 30, y: 55, width: 10, height: 12 }),
      });
      Object.defineProperty(bar, 'getBBox', {
        value: () => ({ x: 180, y: 40, width: 2, height: 50 }),
      });
      return [{ getBpm: () => 120 }] as any;
    });
    const firstChord = {
      id: 'switch-chord-first',
      kind: 'chord' as const,
      span: { startMeasure: 1, endMeasure: 1 },
      position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
      chordSymbol: 'C',
      romanNumeral: 'I',
      label: 'Tonic',
      body: 'Establishes the home key.',
      source: 'assistant' as const,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };
    const secondChord = {
      id: 'switch-chord-second',
      kind: 'chord' as const,
      span: { startMeasure: 1, endMeasure: 1 },
      position: { measure: 1, offset: { numerator: 1, denominator: 4 } },
      chordSymbol: 'G7',
      romanNumeral: 'V7',
      label: 'Dominant',
      body: 'Prepares the return to tonic.',
      source: 'assistant' as const,
      createdAt: '2026-08-05T00:00:01.000Z',
      updatedAt: '2026-08-05T00:00:01.000Z',
    };
    const onUpdateAnnotation = vi.fn();
    render(
      <SheetMusicView
        abcCode={sampleAbc}
        annotations={[firstChord, secondChord]}
        onUpdateAnnotation={onUpdateAnnotation}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Tonic annotation' }));
    expect(screen.getByRole('form', { name: 'Edit annotation' })
      .closest('.annotation-chord-inline-editor')).not.toBeNull();
    expect((screen.getByLabelText('Chord symbol') as HTMLInputElement).value).toBe('C');
    expect((screen.getByLabelText('Roman numeral (optional)') as HTMLInputElement).value).toBe('I');
    expect(screen.queryByLabelText('Label')).toBeNull();
    expect(screen.queryByLabelText('Explanation')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Dominant annotation' }));
    expect((screen.getByLabelText('Chord symbol') as HTMLInputElement).value).toBe('G7');
    expect((screen.getByLabelText('Roman numeral (optional)') as HTMLInputElement).value).toBe('V7');
    expect(screen.queryByLabelText('Label')).toBeNull();
    expect(screen.queryByLabelText('Explanation')).toBeNull();

    fireEvent.change(screen.getByLabelText('Chord symbol'), { target: { value: 'D7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save chord' }));
    await waitFor(() => expect(onUpdateAnnotation).toHaveBeenCalledWith(expect.objectContaining({
      id: 'switch-chord-second',
      chordSymbol: 'D7',
      romanNumeral: 'V7',
      label: 'Dominant',
      body: 'Prepares the return to tonic.',
      span: { startMeasure: 1, endMeasure: 1 },
      position: { measure: 1, offset: { numerator: 1, denominator: 4 } },
    })));
  });

  it('renders interactive annotations in a view-box-aligned React sibling overlay', async () => {
    const onSelectAnchor = vi.fn();
    let sourceWidth = 400;
    const resizeObservers: ResizeObserverCallback[] = [];
    const OriginalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resizeObservers.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    vi.mocked(abcjs.renderAbc).mockImplementation((element) => {
      if (!element || typeof element === 'string') return [];
      element.innerHTML = `
        <svg viewBox="0 0 400 140" data-testid="source-score-svg">
          <g class="abcjs-note abcjs-mm0"></g>
          <g class="abcjs-bar abcjs-mm0"></g>
        </svg>
      `;
      const svg = element.querySelector<SVGSVGElement>('svg')!;
      const note = element.querySelector<SVGGraphicsElement>('.abcjs-note')!;
      const bar = element.querySelector<SVGGraphicsElement>('.abcjs-bar')!;
      Object.defineProperty(svg, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          top: 0,
          right: sourceWidth,
          bottom: 140,
          width: sourceWidth,
          height: 140,
        }),
      });
      Object.defineProperty(note, 'getBBox', {
        value: () => ({ x: 30, y: 55, width: 10, height: 12 }),
      });
      Object.defineProperty(bar, 'getBBox', {
        value: () => ({ x: 180, y: 40, width: 2, height: 50 }),
      });
      return [{
        getBpm: () => 120,
        engraver: {
          selectables: [{ absEl: { abcelem: { startChar: 30 } }, svgEl: note }],
        },
      }] as any;
    });
    const chord = {
      id: 'overlay-chord',
      kind: 'chord' as const,
      span: { startMeasure: 1, endMeasure: 1 },
      position: { measure: 1, offset: { numerator: 0, denominator: 1 } },
      chordSymbol: 'C',
      romanNumeral: 'I',
      label: 'Tonic',
      body: 'The opening tonic.',
      source: 'assistant' as const,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    };
    const rangeNote = {
      id: 'overlay-explanation',
      kind: 'explanation' as const,
      span: { startMeasure: 1, endMeasure: 1 },
      label: 'Phrase shape',
      body: 'The opening phrase establishes the score context.',
      source: 'assistant' as const,
      createdAt: '2026-08-05T00:00:01.000Z',
      updatedAt: '2026-08-05T00:00:01.000Z',
    };
    const props = {
      abcCode: sampleAbc,
      annotations: [chord, rangeNote],
      onSelectAnchor,
      onUpdateAnnotation: vi.fn(),
      onDeleteAnnotation: vi.fn(),
    };
    const { container, rerender, unmount } = render(
      <SheetMusicView
        {...props}
      />,
    );

    const overlayNode = await screen.findByRole('button', { name: 'Edit Tonic annotation' });
    const paper = container.querySelector('#paper')!;
    const layer = container.querySelector('.annotation-overlay-layer')!;
    expect(paper.contains(layer)).toBe(false);
    expect(paper.parentElement?.children).toContain(layer);
    expect(container.querySelector('.annotation-overlay-system')?.getAttribute('viewBox'))
      .toBe('0 0 400 140');
    expect(overlayNode.getAttribute('data-annotation-id')).toBe('overlay-chord');
    expect(container.querySelector('.sheet-annotation-layout')).not.toBeNull();
    expect(container.querySelector('.sheet-layout-balance')).not.toBeNull();
    const zoomScene = container.querySelector<HTMLElement>('.sheet-zoom-wrapper')!;
    expect(zoomScene.parentElement?.classList.contains('sheet-scene-positioner')).toBe(true);
    expect(zoomScene.style.zoom).toBe('1');
    expect(zoomScene.getAttribute('data-score-zoom')).toBe('100');
    expect(zoomScene.contains(container.querySelector('.sheet-notation-column'))).toBe(true);
    expect(zoomScene.contains(container.querySelector('.annotation-rail'))).toBe(true);
    expect(container.querySelector('.annotation-rail-zoom')).toBeNull();
    expect(container.querySelector('.annotation-overlay-node.explanation')).toBeNull();
    expect(container.querySelector('.annotation-card-toggle')?.getAttribute('aria-expanded'))
      .toBe('false');
    await waitFor(() => expect(
      container.querySelector('[data-annotation-id="overlay-explanation"]')
        ?.getAttribute('data-annotation-anchor-y'),
    ).toBe('65'));
    expect(overlayNode.getAttribute('tabindex')).toBe('0');
    fireEvent.focus(overlayNode);
    expect(onSelectAnchor).not.toHaveBeenCalled();
    fireEvent.click(overlayNode);
    expect(onSelectAnchor).toHaveBeenCalledWith(expect.objectContaining({
      startMeasure: 1,
      endMeasure: 1,
    }));
    const chordEditor = screen.getByRole('form', { name: 'Edit annotation' });
    expect(chordEditor.closest('.annotation-chord-inline-editor')).not.toBeNull();
    expect(chordEditor.closest('.sheet-notation-column')).not.toBeNull();
    expect(screen.getByLabelText('Chord symbol')).toBeDefined();
    expect(screen.getByLabelText('Roman numeral (optional)')).toBeDefined();
    expect(screen.queryByLabelText('Kind')).toBeNull();
    expect(screen.queryByLabelText('Explanation')).toBeNull();
    expect(overlayNode.getAttribute('class')).toContain('active');
    expect(overlayNode.querySelector('.annotation-chord-symbol')?.textContent).toBe('C');
    expect(overlayNode.querySelector('.annotation-roman-numeral')?.textContent).toBe('I');
    expect(overlayNode.querySelector('.annotation-chord-background')).not.toBeNull();
    expect(overlayNode.querySelector('.annotation-chord-edit-glyph')).toBeNull();
    expect(overlayNode.getAttribute('data-chord-lane')).toBe('0');
    await waitFor(() => expect(
      vi.mocked(abcjs.renderAbc).mock.calls.at(-1)?.[2]?.afterParsing,
    ).toEqual(expect.any(Function)));

    const rangeHitArea = container.querySelector<SVGElement>(
      '.abcjs-measure-hit-area[data-measure="1"]',
    )!;
    const scrollRangeIntoView = vi.fn();
    Object.defineProperty(rangeHitArea, 'scrollIntoView', { value: scrollRangeIntoView });
    const rangeCard = container.querySelector<HTMLButtonElement>('.annotation-card-toggle')!;
    fireEvent.click(rangeCard);
    expect(rangeCard.getAttribute('aria-expanded')).toBe('true');
    expect(onSelectAnchor).toHaveBeenLastCalledWith(expect.objectContaining({
      startMeasure: 1,
      endMeasure: 1,
    }));
    expect(scrollRangeIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });

    await act(async () => {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    });
    const frameSpy = vi.spyOn(window, 'requestAnimationFrame');
    frameSpy.mockClear();
    sourceWidth = 500;
    act(() => {
      resizeObservers.forEach((observer) => {
        observer([], {} as ResizeObserver);
        observer([], {} as ResizeObserver);
      });
    });
    expect(frameSpy.mock.calls.length).toBeGreaterThan(0);
    expect(frameSpy.mock.calls.length).toBeLessThanOrEqual(resizeObservers.length);
    await waitFor(() => expect(
      container.querySelector<SVGSVGElement>('.annotation-overlay-system')?.style.width,
    ).toBe('500px'));

    sourceWidth = 1_000;
    rerender(<SheetMusicView {...props} zoom={200} />);
    await waitFor(() => expect(
      container.querySelector<SVGSVGElement>('.annotation-overlay-system')?.style.width,
    ).toBe('500px'));

    fireEvent.click(screen.getByTitle('Transpose up 1 semitone'));
    await screen.findByRole('button', { name: 'Edit Tonic annotation' });
    expect(vi.mocked(abcjs.renderAbc).mock.calls.at(-1)?.[2]).toMatchObject({ visualTranspose: 1 });

    const switched = { ...chord, id: 'overlay-switched', label: 'Switched tonic' };
    rerender(
      <SheetMusicView
        {...props}
        abcCode={`${sampleAbc}\nG A B c |`}
        annotations={[switched]}
        zoom={200}
      />,
    );
    expect(await screen.findByRole('button', { name: 'Edit Switched tonic annotation' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Edit Tonic annotation' })).toBeNull();

    unmount();
    frameSpy.mockRestore();
    globalThis.ResizeObserver = OriginalResizeObserver;
  });

  it('anchors and packs chord labels by rendered staff line inside one abcjs SVG', async () => {
    const originalParseImplementation = vi.mocked(abcjs.parseOnly).getMockImplementation();
    vi.mocked(abcjs.parseOnly).mockImplementation(() => ([{
      lines: [
        { staff: [{ voices: [[
          { el_type: 'note', duration: 0.25, startChar: 40, endChar: 41, pitches: [{ pitch: 0 }] },
          { el_type: 'bar', startChar: 50, endChar: 51 },
        ]] }] },
        { staff: [{ voices: [[
          { el_type: 'note', duration: 0.25, startChar: 60, endChar: 61, pitches: [{ pitch: 1 }] },
          { el_type: 'bar', startChar: 70, endChar: 71 },
        ]] }] },
      ],
      getMeter: () => ({ value: [{ num: '4', den: '4' }] }),
      getKeySignature: () => ({ root: 'C' }),
    }] as any));
    vi.mocked(abcjs.renderAbc).mockImplementation((element) => {
      if (!element || typeof element === 'string') return [];
      element.innerHTML = `
        <svg viewBox="0 0 400 420">
          <g class="abcjs-staff abcjs-l0"></g>
          <g class="abcjs-note abcjs-l0 abcjs-mm0"></g>
          <g class="abcjs-bar abcjs-l0 abcjs-mm0"></g>
          <g class="abcjs-dynamics abcjs-l0 abcjs-mm1"></g>
          <g class="abcjs-staff abcjs-l1"></g>
          <g class="abcjs-note abcjs-l1 abcjs-mm1"></g>
          <g class="abcjs-bar abcjs-l1 abcjs-mm1"></g>
        </svg>
      `;
      const svg = element.querySelector<SVGSVGElement>('svg')!;
      const boxes = new Map<string, DOMRect>([
        ['.abcjs-staff.abcjs-l0', { x: 20, y: 80, width: 360, height: 50 } as DOMRect],
        ['.abcjs-note.abcjs-l0', { x: 100, y: 95, width: 10, height: 12 } as DOMRect],
        ['.abcjs-bar.abcjs-l0', { x: 180, y: 80, width: 2, height: 50 } as DOMRect],
        ['.abcjs-dynamics', { x: 350, y: 170, width: 20, height: 10 } as DOMRect],
        ['.abcjs-staff.abcjs-l1', { x: 20, y: 280, width: 360, height: 50 } as DOMRect],
        ['.abcjs-note.abcjs-l1', { x: 100, y: 295, width: 10, height: 12 } as DOMRect],
        ['.abcjs-bar.abcjs-l1', { x: 180, y: 280, width: 2, height: 50 } as DOMRect],
      ]);
      Object.defineProperty(svg, 'getBoundingClientRect', {
        value: () => ({
          left: 0,
          top: 0,
          right: 400,
          bottom: 420,
          width: 400,
          height: 420,
        }),
      });
      for (const [selector, bounds] of boxes) {
        Object.defineProperty(element.querySelector(selector), 'getBBox', {
          value: () => bounds,
        });
      }
      const firstNote = element.querySelector<SVGGraphicsElement>('.abcjs-note.abcjs-l0')!;
      const secondNote = element.querySelector<SVGGraphicsElement>('.abcjs-note.abcjs-l1')!;
      return [{
        getBpm: () => 120,
        engraver: {
          selectables: [
            { absEl: { abcelem: { startChar: 40 } }, svgEl: firstNote },
            { absEl: { abcelem: { startChar: 60 } }, svgEl: secondNote },
          ],
        },
      }] as any;
    });
    const timestamp = '2026-08-13T00:00:00.000Z';
    const annotations = [1, 2].map((measure) => ({
      id: `line-chord-${measure}`,
      kind: 'chord' as const,
      span: { startMeasure: measure, endMeasure: measure },
      position: { measure, offset: { numerator: 0, denominator: 1 } },
      chordSymbol: measure === 1 ? 'Cmaj7' : 'G7',
      label: `Line chord ${measure}`,
      body: 'A staff-line geometry regression fixture.',
      source: 'assistant' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const { container, unmount } = render(
      <SheetMusicView abcCode={sampleAbc} annotations={annotations} />,
    );
    try {
      await screen.findByRole('button', { name: 'Edit Line chord 1 annotation' });
      await screen.findByRole('button', { name: 'Edit Line chord 2 annotation' });
      await waitFor(() => expect(
        container.querySelectorAll('.annotation-chord-background'),
      ).toHaveLength(2));

      const badgeBounds = (annotationId: string) => {
        const rect = container.querySelector<SVGRectElement>(
          `[data-annotation-id="${annotationId}"] .annotation-chord-background`,
        )!;
        const x = Number(rect.getAttribute('x'));
        const y = Number(rect.getAttribute('y'));
        const width = Number(rect.getAttribute('width'));
        return { x, centerX: x + width / 2, y };
      };
      expect(badgeBounds('line-chord-1')).toEqual({ x: 20, centerX: 56, y: -30 });
      expect(badgeBounds('line-chord-2')).toEqual({ x: 20, centerX: 47, y: 170 });
    } finally {
      unmount();
      vi.mocked(abcjs.parseOnly).mockImplementation(originalParseImplementation!);
    }
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

  it('highlights an opening-repeat measure between its repeat and ending bar', () => {
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((element) => {
      if (element && typeof element !== 'string') {
        element.innerHTML = `
          <svg>
            <g class="abcjs-staff abcjs-l0"></g>
            <g class="abcjs-staff-extra abcjs-l0 abcjs-mm0"></g>
            <g class="abcjs-bar abcjs-l0 abcjs-mm0"></g>
            <g class="abcjs-note abcjs-l0 abcjs-mm0"></g>
            <g class="abcjs-bar abcjs-l0 abcjs-mm0"></g>
          </svg>
        `;
        const staff = element.querySelector<SVGGraphicsElement>('.abcjs-staff')!;
        const measureElements = element.querySelectorAll<SVGGraphicsElement>('.abcjs-mm0');
        const bounds = [
          { x: 15, y: 20, width: 20, height: 40 },
          { x: 50, y: 20, width: 12, height: 40 },
          { x: 70, y: 25, width: 40, height: 20 },
          { x: 160, y: 20, width: 2, height: 40 },
        ];
        Object.defineProperty(staff, 'getBBox', {
          value: () => ({ x: 10, y: 20, width: 200, height: 40 }),
        });
        measureElements.forEach((node, index) => {
          Object.defineProperty(node, 'getBBox', {
            value: () => bounds[index],
          });
        });
      }
      return [{ getBpm: () => 120 }] as any;
    });

    const { container } = render(
      <SheetMusicView abcCode={sampleAbc} activeAnchor={{ startMeasure: 1, endMeasure: 1 }} />,
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

  it('highlights every selected measure across wrapped systems', () => {
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((element) => {
      if (element && typeof element !== 'string') {
        element.innerHTML = `
          <svg>
            <g class="abcjs-staff abcjs-l0"></g>
            <g class="abcjs-note abcjs-l0 abcjs-mm0"></g>
            <g class="abcjs-bar abcjs-l0 abcjs-mm0"></g>
            <g class="abcjs-note abcjs-l0 abcjs-mm1"></g>
            <g class="abcjs-bar abcjs-l0 abcjs-mm1"></g>
            <g class="abcjs-staff abcjs-l1"></g>
            <g class="abcjs-note abcjs-l1 abcjs-mm2"></g>
            <g class="abcjs-bar abcjs-l1 abcjs-mm2"></g>
            <g class="abcjs-note abcjs-l1 abcjs-mm3"></g>
            <g class="abcjs-bar abcjs-l1 abcjs-mm3"></g>
          </svg>
        `;
        element.querySelectorAll<SVGGraphicsElement>('.abcjs-staff').forEach((node, index) => {
          Object.defineProperty(node, 'getBBox', {
            value: () => ({ x: 10, y: 20 + index * 80, width: 220, height: 40 }),
          });
        });
        for (let measure = 0; measure < 4; measure += 1) {
          element.querySelectorAll<SVGGraphicsElement>(`.abcjs-mm${measure}`)
            .forEach((node, index) => {
              Object.defineProperty(node, 'getBBox', {
                value: () => ({
                  x: 20 + (measure % 2) * 100 + index * 60,
                  y: 20 + Math.floor(measure / 2) * 80,
                  width: index === 0 ? 40 : 2,
                  height: 40,
                }),
              });
            });
        }
      }
      return [{ getBpm: () => 120 }] as any;
    });

    const { container } = render(
      <SheetMusicView
        abcCode={sampleAbc}
        activeAnchor={{ startMeasure: 2, endMeasure: 4 }}
      />,
    );

    const highlights = Array.from(container.querySelectorAll('.abcjs-measure-highlight'));
    expect(highlights.map((highlight) => highlight.getAttribute('data-measure')))
      .toEqual(['2', '3', '4']);
    expect(highlights[0].getAttribute('y')).toBe('20');
    expect(highlights[1].getAttribute('y')).toBe('100');
    expect(highlights[2].getAttribute('y')).toBe('100');
    expect(Array.from(container.querySelectorAll('.abcjs-measure-hit-area')).map((hitArea) => ({
      measure: hitArea.getAttribute('data-measure'),
      pressed: hitArea.getAttribute('aria-pressed'),
    }))).toEqual([
      { measure: '1', pressed: 'false' },
      { measure: '2', pressed: 'true' },
      { measure: '3', pressed: 'true' },
      { measure: '4', pressed: 'true' },
    ]);
  });

  it('renders the first measure number in a small label at the start of every system', () => {
    vi.mocked(abcjs.renderAbc).mockImplementationOnce((element) => {
      if (element && typeof element !== 'string') {
        element.innerHTML = `
          <svg>
            <g class="abcjs-staff abcjs-l0"></g>
            <g class="abcjs-note abcjs-l0 abcjs-mm0"></g>
            <g class="abcjs-bar abcjs-l0 abcjs-mm0"></g>
            <g class="abcjs-bar abcjs-l0 abcjs-mm1"></g>
            <g class="abcjs-dynamics abcjs-l0 abcjs-mm2"></g>
            <g class="abcjs-staff abcjs-l1"></g>
            <g class="abcjs-note abcjs-l1 abcjs-mm2"></g>
            <g class="abcjs-bar abcjs-l1 abcjs-mm2"></g>
            <g class="abcjs-bar abcjs-l1 abcjs-mm3"></g>
          </svg>
        `;
        element.querySelectorAll<SVGGraphicsElement>('.abcjs-staff').forEach((node, index) => {
          Object.defineProperty(node, 'getBBox', {
            value: () => ({ x: 24, y: 60 + index * 100, width: 300, height: 40 }),
          });
        });
        element.querySelectorAll<SVGGraphicsElement>('[class*="abcjs-mm"]').forEach((node) => {
          Object.defineProperty(node, 'getBBox', {
            value: () => ({ x: 80, y: 60, width: 20, height: 40 }),
          });
        });
      }
      return [{ getBpm: () => 120 }] as any;
    });

    const { container } = render(<SheetMusicView abcCode={sampleAbc} />);

    const labels = Array.from(container.querySelectorAll('.chorale-line-measure-number'));
    expect(labels.map((label) => label.textContent)).toEqual(['1', '3']);
    expect(labels.map((label) => label.getAttribute('data-measure'))).toEqual(['1', '3']);
    expect(labels.map((label) => label.getAttribute('x'))).toEqual(['24', '24']);
    expect(labels.map((label) => label.getAttribute('y'))).toEqual(['40', '140']);
    expect(labels.every((label) => label.getAttribute('aria-hidden') === 'true')).toBe(true);
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
    const secondMeasure = container.querySelector<SVGElement>('[data-measure="2"]')!;
    secondMeasure.focus();
    fireEvent.keyDown(secondMeasure, {
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
    expect(document.activeElement).toBe(secondMeasure);
  });

  it('sizes the score wrapper with its zoom so rendered dimensions actually change', () => {
    const { container, rerender } = render(
      <SheetMusicView abcCode={sampleAbc} zoom={150} onZoomChange={vi.fn()} />
    );

    const wrapper = container.querySelector<HTMLElement>('.sheet-zoom-wrapper')!;
    expect(wrapper.style.zoom).toBe('1.5');
    expect(wrapper.getAttribute('data-score-zoom')).toBe('150');
    expect(wrapper.contains(container.querySelector('.sheet-notation-column'))).toBe(true);
    expect(wrapper.contains(container.querySelector('.annotation-rail'))).toBe(true);
    expect(wrapper.style.transform).toBe('');

    rerender(
      <SheetMusicView abcCode={sampleAbc} zoom={50} onZoomChange={vi.fn()} />
    );

    expect(wrapper.style.zoom).toBe('0.5');
    expect(wrapper.getAttribute('data-score-zoom')).toBe('50');
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

    const { container } = render(
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

    fireEvent.click(container.querySelector('.abcjs-paper-container')!, { shiftKey: true });
    options.clickListener(
      { startChar: 30 },
      0,
      'abcjs-note abcjs-mm0',
      { measure: 0 },
    );
    expect(onSelectAnchor).toHaveBeenLastCalledWith(expect.objectContaining({
      startMeasure: 1,
      endMeasure: 2,
      abcOffset: 30,
      label: 'mm. 1–2',
      playbackSeconds: 4,
      playbackFraction: 0.5,
    }));
  });

  it('resolves annotation selections to the start of the current repeat pass', () => {
    const onSelectAnchor = vi.fn();
    const voiceLeadingAnnotation = {
      id: 'voice-leading-repeat',
      kind: 'voice-leading' as const,
      span: { startMeasure: 2, endMeasure: 3 },
      label: 'Repeated motion',
      body: 'The upper parts move together in the repeated phrase.',
      source: 'assistant' as const,
      createdAt: '2026-08-15T00:00:00.000Z',
      updatedAt: '2026-08-15T00:00:00.000Z',
    };
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
        element.querySelectorAll<SVGGraphicsElement>('[class*="abcjs-mm"]').forEach((node, index) => {
          Object.defineProperty(node, 'getBBox', {
            value: () => ({ x: 10 + index * 40, y: 20, width: 30, height: 24 }),
          });
        });
      }
      return [{
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
      }] as any;
    });

    render(
      <SheetMusicView
        abcCode={sampleAbc}
        annotations={[voiceLeadingAnnotation]}
        onSelectAnchor={onSelectAnchor}
        getPlaybackPosition={() => ({ currentSeconds: 6.1, isPlaying: false })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Repeated motion/i }));

    expect(onSelectAnchor).toHaveBeenLastCalledWith({
      startMeasure: 2,
      endMeasure: 3,
      label: 'mm. 2–3',
      playbackSeconds: 6,
      playbackFraction: 0.75,
    });
  });

  it('resolves linked ranges in the current repeat pass, then scrolls and focuses the start', () => {
    const onSelectAnchor = vi.fn();
    const getPlaybackPosition = () => ({ currentSeconds: 6.1, isPlaying: false });
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
        element.querySelectorAll<SVGGraphicsElement>('[class*="abcjs-mm"]').forEach((node, index) => {
          Object.defineProperty(node, 'getBBox', {
            value: () => ({ x: 10 + index * 40, y: 20, width: 30, height: 24 }),
          });
        });
      }
      return [{
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
      }] as any;
    });

    const { container, rerender } = render(
      <SheetMusicView
        abcCode={sampleAbc}
        onSelectAnchor={onSelectAnchor}
        getPlaybackPosition={getPlaybackPosition}
      />,
    );
    const firstMeasure = container.querySelector<SVGElement>('[data-measure="1"]')!;
    const scrollIntoView = vi.fn();
    Object.defineProperty(firstMeasure, 'scrollIntoView', { value: scrollIntoView });

    rerender(
      <SheetMusicView
        abcCode={sampleAbc}
        navigationAnchor={{ startMeasure: 1, endMeasure: 2 }}
        onSelectAnchor={onSelectAnchor}
        getPlaybackPosition={getPlaybackPosition}
      />,
    );

    expect(onSelectAnchor).toHaveBeenLastCalledWith({
      startMeasure: 1,
      endMeasure: 2,
      label: 'mm. 1–2',
      playbackSeconds: 4,
      playbackFraction: 0.5,
    });
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
    expect(document.activeElement).toBe(firstMeasure);
    expect(getPlaybackPosition().isPlaying).toBe(false);
  });
});
