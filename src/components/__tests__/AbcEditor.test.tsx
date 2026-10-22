import { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AbcEditor } from '../AbcEditor';
import * as autoScroll from '../../utils/autoScroll';

describe('AbcEditor Component', () => {
  const formattedAbc = `X:1
T:Test Score
C:Bach
M:4/4
L:1/4
V:upper
V:lower
K:C
[V:upper] C D E F | G A B c |
[V:lower] C,4 | G,4 |
`;

  function EditableWorkspace({ onChange = vi.fn(), onSelect = vi.fn(), onPreview = vi.fn() }) {
    const [source, setSource] = useState(formattedAbc);
    const [revision, setRevision] = useState(1);
    const [anchor, setAnchor] = useState<{ startMeasure: number; endMeasure: number } | null>(null);
    return <AbcEditor abcCode={source} revision={revision} documentId="keyboard-score"
      onAbcChange={(next, options) => { onChange(next, options); setSource(next); setRevision((value) => value + 1); }}
      activeAnchor={anchor} onNavigateMeasure={vi.fn()}
      onSelectAnchor={(next) => { setAnchor(next); onSelect(next); }} onPreviewMeasure={onPreview} />;
  }

  it('moves up/down through voices in the same measure and preserves the caret column', async () => {
    render(<EditableWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 2' }));
    const upper = screen.getByRole('textbox', { name: 'Edit upper, measure 2' }) as HTMLInputElement;
    upper.setSelectionRange(3, 3);
    fireEvent.keyDown(upper, { key: 'ArrowDown' });
    const lower = screen.getByRole('textbox', { name: 'Edit lower, measure 2' }) as HTMLInputElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(lower);
      expect(lower.selectionStart).toBe(3);
    });
    fireEvent.keyDown(lower, { key: 'ArrowDown' });
    expect(screen.getByRole('textbox', { name: 'Edit lower, measure 2' })).toBe(lower);
    fireEvent.keyDown(lower, { key: 'ArrowUp' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Edit upper, measure 2' })));
  });

  it('jumps measures with Shift and extends/shrinks shared selection with Ctrl/Cmd+Shift', async () => {
    const onSelect = vi.fn();
    const { container } = render(<EditableWorkspace onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit lower, measure 1' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: /^Edit/ }), { key: 'ArrowRight', shiftKey: true, ctrlKey: true });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Edit lower, measure 2' })));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ startMeasure: 1, endMeasure: 2 }));
    expect(container.querySelectorAll('.abc-timeline-measure.is-selected')).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole('textbox', { name: /^Edit/ }), { key: 'ArrowLeft', shiftKey: true, metaKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ startMeasure: 1, endMeasure: 1 }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: /^Edit/ }), { key: 'ArrowRight', shiftKey: true });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Edit lower, measure 2' })));
    const calls = onSelect.mock.calls.length;
    fireEvent.keyDown(screen.getByRole('textbox', { name: /^Edit/ }), { key: 'ArrowRight', shiftKey: true });
    expect(onSelect).toHaveBeenCalledTimes(calls);
    // A plain jump resets the range origin to the new measure.
    fireEvent.keyDown(screen.getByRole('textbox', { name: /^Edit/ }), { key: 'ArrowLeft', shiftKey: true, ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ startMeasure: 1, endMeasure: 2 }));
  });

  it('starts a keyboard-only range from the focused display measure', () => {
    const onSelect = vi.fn();
    render(<EditableWorkspace onSelect={onSelect} />);
    const first = screen.getByRole('button', { name: 'Edit upper, measure 1' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight', shiftKey: true, ctrlKey: true });
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ startMeasure: 1, endMeasure: 2 }));
    expect(screen.getByRole('textbox', { name: 'Edit upper, measure 2' })).toBeDefined();
  });

  it('commits navigation edits before opening the destination at its new revision', async () => {
    const onChange = vi.fn();
    render(<EditableWorkspace onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    fireEvent.change(screen.getByRole('textbox', { name: /^Edit/ }), { target: { value: 'E2 D E |' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: /^Edit/ }), { key: 'ArrowRight', shiftKey: true });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Edit upper, measure 2' })));
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('E2 D E |'), { preserveSelection: true });
    fireEvent.change(screen.getByRole('textbox', { name: /^Edit/ }), { target: { value: 'A4 |' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: /^Edit/ }), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(expect.stringContaining('E2 D E | A4 |'), undefined);
  });

  it('keeps invalid drafts focused and blocks navigation and preview', () => {
    const onChange = vi.fn();
    const onPreview = vi.fn();
    render(<EditableWorkspace onChange={onChange} onPreview={onPreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const input = screen.getByRole('textbox', { name: /^Edit/ }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'C8 |' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('C8 |');
    expect(screen.getByRole('alert')).toBeDefined();
    expect(onChange).not.toHaveBeenCalled();
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('previews committed source on Enter, supports display cells, and ignores repeat/composition', async () => {
    const onPreview = vi.fn();
    render(<EditableWorkspace onPreview={onPreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const input = screen.getByRole('textbox', { name: /^Edit/ });
    fireEvent.keyDown(input, { key: 'Enter', repeat: true });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('textbox', { name: /^Edit/ })).toBe(input);
    expect(onPreview).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: 'E2 D E |' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPreview).toHaveBeenLastCalledWith(1, expect.stringContaining('E2 D E |'));
    const cell = screen.getByRole('button', { name: 'Edit upper, measure 1' });
    await waitFor(() => expect(document.activeElement).toBe(cell));
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(onPreview).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(cell, { key: ' ' });
    expect(screen.getByRole('textbox', { name: 'Edit upper, measure 1' })).toBeDefined();
  });

  it('preserves ordinary text-selection keys and Raw Source newlines', () => {
    const onPreview = vi.fn();
    render(<EditableWorkspace onPreview={onPreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const input = screen.getByRole('textbox', { name: /^Edit/ });
    for (const modifiers of [{}, { ctrlKey: true }]) {
      expect(fireEvent.keyDown(input, { key: 'ArrowRight', ...modifiers })).toBe(true);
    }
    expect(fireEvent.keyDown(input, { key: 'ArrowDown', shiftKey: true })).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Raw Source' }));
    expect(fireEvent.keyDown(screen.getByPlaceholderText(/Parsed ABC code/), { key: 'Enter' })).toBe(true);
    expect(onPreview).not.toHaveBeenCalled();
  });

  it('accepts a syntax completion with Tab without committing or moving focus', async () => {
    const onAbcChange = vi.fn();
    render(<AbcEditor abcCode={formattedAbc} onAbcChange={onAbcChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const input = screen.getByRole('textbox', { name: 'Edit upper, measure 1' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '!fe C D E F |', selectionStart: 3, selectionEnd: 3 } });
    expect(screen.getByRole('listbox', { name: 'ABC completions' })).toBeDefined();
    expect(screen.getByRole('option', { name: /fermata/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(input.value).toBe('!fermata! C D E F |');
    expect(screen.queryByRole('listbox')).toBeNull();
    await waitFor(() => expect(input.selectionStart).toBe(9));
    expect(document.activeElement).toBe(input);
    expect(onAbcChange).not.toHaveBeenCalled();
  });

  it('supports named completions, popup arrow navigation, dismissal, and voice navigation', () => {
    render(<AbcEditor abcCode={formattedAbc} onAbcChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const input = screen.getByRole('textbox', { name: 'Edit upper, measure 1' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'pian C D E F |', selectionStart: 4, selectionEnd: 4 } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /pianissimo/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('textbox', { name: 'Edit upper, measure 1' })).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input.value).toBe('pian C D E F |');
    // Restore valid ABC; arrow navigation resumes when suggestions are dismissed.
    fireEvent.change(input, { target: { value: ' C D E F |' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('textbox', { name: 'Edit lower, measure 1' })).toBeDefined();
  });

  it('opens suggestions explicitly and accepts a pointer choice without blurring the draft', () => {
    const onAbcChange = vi.fn();
    render(<AbcEditor abcCode={formattedAbc} onAbcChange={onAbcChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const input = screen.getByRole('textbox', { name: 'Edit upper, measure 1' }) as HTMLInputElement;
    input.setSelectionRange(1, 1);
    fireEvent.keyDown(input, { key: ' ', code: 'Space', ctrlKey: true });
    const option = screen.getByRole('option', { name: /fermata/ });
    expect(fireEvent.mouseDown(option)).toBe(false);
    fireEvent.click(option);
    expect(input.value).toBe(' !fermata!C D E F |');
    expect(onAbcChange).not.toHaveBeenCalled();
  });

  it('keeps Enter as commit and playback instead of accepting a completion', () => {
    const onAbcChange = vi.fn();
    const onPreviewMeasure = vi.fn();
    render(<AbcEditor abcCode={formattedAbc} onAbcChange={onAbcChange} onPreviewMeasure={onPreviewMeasure} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const input = screen.getByRole('textbox', { name: 'Edit upper, measure 1' });
    fireEvent.change(input, { target: { value: '!fe C D E F |', selectionStart: 3, selectionEnd: 3 } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onAbcChange).not.toHaveBeenCalled();
    expect(onPreviewMeasure).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('previews after an idle delay, retains the last valid rendering, and clears on cancel', async () => {
    vi.useFakeTimers();
    try {
      const onAbcChange = vi.fn();
      const onDraftPreview = vi.fn();
      render(<AbcEditor abcCode={formattedAbc} onAbcChange={onAbcChange} onDraftPreview={onDraftPreview} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
      const input = screen.getByRole('textbox', { name: 'Edit upper, measure 1' });
      fireEvent.change(input, { target: { value: 'E D E F |' } });
      onDraftPreview.mockClear();
      await act(async () => { vi.advanceTimersByTime(399); });
      expect(onDraftPreview).not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(1); });
      expect(onDraftPreview).toHaveBeenLastCalledWith(expect.stringContaining('E D E F |'));
      onDraftPreview.mockClear();
      fireEvent.change(input, { target: { value: 'C8 |' } });
      await act(async () => { vi.advanceTimersByTime(400); });
      expect(onDraftPreview).not.toHaveBeenCalled();
      expect(onAbcChange).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onDraftPreview).toHaveBeenLastCalledWith(null);
    } finally { vi.useRealTimers(); }
  });

  it('cancels pending visual updates on document changes and during IME composition', async () => {
    vi.useFakeTimers();
    try {
      const onDraftPreview = vi.fn();
      const view = render(<AbcEditor abcCode={formattedAbc} documentId="one" onAbcChange={vi.fn()} onDraftPreview={onDraftPreview} />);
      fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
      const input = screen.getByRole('textbox', { name: 'Edit upper, measure 1' });
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: 'E D E F |' } });
      onDraftPreview.mockClear();
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(onDraftPreview).not.toHaveBeenCalled();
      fireEvent.compositionEnd(input);
      await act(async () => { vi.advanceTimersByTime(400); });
      expect(onDraftPreview).toHaveBeenLastCalledWith(expect.stringContaining('E D E F |'));
      fireEvent.change(input, { target: { value: 'G D E F |' } });
      view.rerender(<AbcEditor abcCode={formattedAbc} documentId="two" onAbcChange={vi.fn()} onDraftPreview={onDraftPreview} />);
      onDraftPreview.mockClear();
      await act(async () => { vi.advanceTimersByTime(500); });
      expect(onDraftPreview).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('renders and changes the raw ABC source', () => {
    const onAbcChange = vi.fn();
    const initialAbc = 'X:1\nT:Test Score\nK:C\nC D E F|';
    render(<AbcEditor abcCode={initialAbc} onAbcChange={onAbcChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Raw Source' }));
    const textarea = screen.getByPlaceholderText(/Parsed ABC code will appear here/) as HTMLTextAreaElement;
    expect(textarea.value).toBe(initialAbc);
    fireEvent.change(textarea, { target: { value: 'X:1\nT:Modified\nK:C\nC4|' } });
    expect(onAbcChange).toHaveBeenCalledWith('X:1\nT:Modified\nK:C\nC4|');
  });

  it('enriches raw source with header explanations, voice colors, and selection/playback highlights', () => {
    const upperSecondStart = formattedAbc.indexOf('G A B c |');
    const lowerSecondStart = formattedAbc.indexOf('G,4 |');

    const { container } = render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={{ startMeasure: 1, endMeasure: 1 }}
        playbackSourceRanges={{
          starts: [upperSecondStart, lowerSecondStart],
          ends: [upperSecondStart + 1, lowerSecondStart + 1],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Raw Source' }));

    // Header explanations
    expect(screen.getByText('Reference: 1')).toBeDefined();
    expect(screen.getByText('Title: Test Score')).toBeDefined();
    expect(screen.getByText('Composer: Bach')).toBeDefined();
    expect(screen.getByText('Meter: 4/4')).toBeDefined();

    // Voice colors on music rows
    const upperRow = container.querySelector('.abc-raw-line-row[data-measure="1,2"][data-voice="upper"]');
    const lowerRow = container.querySelector('.abc-raw-line-row[data-measure="1,2"][data-voice="lower"]');
    expect(upperRow?.getAttribute('data-color')).toBe('0');
    expect(lowerRow?.getAttribute('data-color')).toBe('1');

    // Selection highlight (measure 1 is in activeAnchor)
    expect(upperRow?.classList.contains('is-selected')).toBe(true);
    expect(lowerRow?.classList.contains('is-selected')).toBe(true);

    // Playback highlight (measure 2 is playing)
    expect(upperRow?.classList.contains('is-playing')).toBe(true);
    expect(lowerRow?.classList.contains('is-playing')).toBe(true);

    // Segment highlights within the line
    const upperMeasure1 = upperRow?.querySelector('.abc-raw-measure-seg[data-measure="1"]');
    const upperMeasure2 = upperRow?.querySelector('.abc-raw-measure-seg[data-measure="2"]');
    expect(upperMeasure1?.classList.contains('is-selected')).toBe(true);
    expect(upperMeasure2?.classList.contains('is-playing')).toBe(true);
  });

  it('scrolls raw source backdrop and embedded line numbers in sync with textarea', () => {
    const longAbc = Array.from({ length: 50 }, (_, i) => `C D E F | % measure ${i + 1}`).join('\n');
    const { container } = render(<AbcEditor abcCode={longAbc} onAbcChange={() => undefined} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Raw Source' }));

    const textarea = container.querySelector('.abc-textarea') as HTMLTextAreaElement;
    const backdrop = container.querySelector('.abc-raw-backdrop') as HTMLDivElement;
    const lineNumbers = container.querySelectorAll('.abc-raw-line-number');

    expect(textarea).toBeDefined();
    expect(backdrop).toBeDefined();
    expect(lineNumbers.length).toBe(50);
    expect(lineNumbers[0].textContent).toBe('1');
    expect(lineNumbers[49].textContent).toBe('50');

    textarea.scrollTop = 180;
    textarea.scrollLeft = 20;
    fireEvent.scroll(textarea);

    expect(backdrop.scrollTop).toBe(180);
    expect(backdrop.scrollLeft).toBe(20);
  });

  it('keeps editor chrome separate from the scrolling source body', () => {
    const { container, rerender } = render(<AbcEditor abcCode={formattedAbc} onAbcChange={() => undefined} />);
    const chrome = container.querySelector('.abc-editor-chrome');
    const toolbelt = container.querySelector('.abc-toolbelt');
    const body = container.querySelector('.editor-body');
    const navigator = container.querySelector('.abc-horizontal-scrollbar');
    expect(chrome?.nextElementSibling).toBe(toolbelt);
    expect(toolbelt?.nextElementSibling).toBe(body);
    expect(body?.nextElementSibling).toBe(navigator);
    expect(navigator?.nextElementSibling).toBeNull();

    rerender(<AbcEditor abcCode={formattedAbc} onAbcChange={() => undefined} activeAnchor={{ startMeasure: 1, endMeasure: 1 }} />);
    expect(body?.nextElementSibling).toBe(navigator);
  });

  it('shows source rendered separately by beats and edits unified measures with underscore indicator', () => {
    const onSelectAnchor = vi.fn();
    const onNavigateMeasure = vi.fn();
    const scrollSpy = vi.spyOn(autoScroll, 'animateHorizontalScrollTo');
    const frameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const view = render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={{ startMeasure: 1, endMeasure: 1 }}
        onSelectAnchor={onSelectAnchor}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Measure Source' }).getAttribute('aria-selected')).toBe('true');
    expect(view.container.querySelectorAll('.abc-timeline-measure')).toHaveLength(2);
    expect(view.container.querySelectorAll('[data-timeline-measure="1"] .abc-timeline-voice')).toHaveLength(2);
    expect(view.container.querySelectorAll('[data-timeline-measure="1"] .abc-source-beat-display')).toHaveLength(8);
    expect(view.container.querySelector('.abc-beat-lane')).toBeNull();
    expect(view.container.querySelector('.abc-timeline-source')).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Navigate measures' })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Scroll ABC source horizontally' })).toBeDefined();

    const upperMeasure2Button = screen.getByRole('button', { name: 'Edit upper, measure 2' });
    fireEvent.click(upperMeasure2Button);
    expect(onNavigateMeasure).toHaveBeenLastCalledWith(expect.objectContaining({ startMeasure: 2, endMeasure: 2 }));
    expect(onSelectAnchor).not.toHaveBeenCalled();

    const upperInput = screen.getByRole('textbox', { name: 'Edit upper, measure 2' });
    expect(upperInput).toBeDefined();
    expect((upperInput as HTMLInputElement).value).toBe(' G A B c |');
    expect(upperInput.classList.contains('abc-measure-edit-input')).toBe(true);

    view.rerender(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={{ startMeasure: 2, endMeasure: 2 }}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );
    expect(scrollSpy).toHaveBeenCalled();

    frameSpy.mockRestore();
    scrollSpy.mockRestore();
  });

  it('uses the time-signature numerator for beat slots with implicit gaps', () => {
    const sixEightAbc = `X:1
M:6/8
L:1/8
K:C
C D E F G A |
`;
    const { container } = render(<AbcEditor abcCode={sixEightAbc} onAbcChange={() => undefined} />);
    const beatGroup = container.querySelector('.abc-source-beats')!;
    expect(beatGroup.querySelectorAll('.abc-source-beat-display')).toHaveLength(6);
    expect(beatGroup.querySelector('.abc-beat-separator')).toBeNull();
  });

  it('uses vertical wheel movement to traverse long measure source', () => {
    const { container } = render(<AbcEditor abcCode={formattedAbc} onAbcChange={() => undefined} />);
    const body = container.querySelector<HTMLElement>('.editor-body')!;
    Object.defineProperties(body, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1_400 },
    });
    fireEvent.wheel(body, { deltaY: 180, deltaX: 0 });
    expect(body.scrollLeft).toBe(180);
  });

  it('renders headers and every colored voice immediately', () => {
    const { container } = render(
      <AbcEditor abcCode={formattedAbc} onAbcChange={() => undefined} validationState="valid" />,
    );
    expect(screen.queryByText(/Aligning formatted measures/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sheet info' }));
    expect(screen.getByText('Composer: Bach')).toBeDefined();
    expect(screen.getAllByRole('button', { name: /Select measure/ })).toHaveLength(2);
    expect(container.querySelectorAll('.abc-timeline-voice')).toHaveLength(4);
    expect(container.querySelectorAll('[data-measure="1"]')).toHaveLength(2);
  });

  it('shares measure selection across voices and applies a separate playback tint', () => {
    const onSelectAnchor = vi.fn();
    const view = render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={{ startMeasure: 1, endMeasure: 1 }}
        onSelectAnchor={onSelectAnchor}
      />,
    );
    expect(view.container.querySelectorAll('.abc-timeline-measure.is-selected')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Select measure 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select measure 2' }), { shiftKey: true });
    expect(onSelectAnchor).toHaveBeenLastCalledWith(expect.objectContaining({ startMeasure: 1, endMeasure: 2 }));

    const upperSecondStart = formattedAbc.indexOf('G A B c |');
    const lowerSecondStart = formattedAbc.indexOf('G,4 |');
    view.rerender(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        playbackSourceRanges={{
          starts: [upperSecondStart, lowerSecondStart],
          ends: [upperSecondStart + 1, lowerSecondStart + 1],
        }}
      />,
    );
    expect(view.container.querySelectorAll('[data-timeline-measure="2"] .abc-timeline-voice.is-playing')).toHaveLength(2);
  });

  it('scrolls the active playing measure into view along the timeline during playback', () => {
    const scrollSpy = vi.spyOn(autoScroll, 'animateHorizontalScrollTo');
    const frameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    const upperSecondStart = formattedAbc.indexOf('G A B c |');
    const lowerSecondStart = formattedAbc.indexOf('G,4 |');

    const view = render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
      />,
    );

    view.rerender(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        playbackSourceRanges={{
          starts: [upperSecondStart, lowerSecondStart],
          ends: [upperSecondStart + 1, lowerSecondStart + 1],
        }}
      />,
    );

    expect(scrollSpy).toHaveBeenCalled();

    frameSpy.mockRestore();
    scrollSpy.mockRestore();
  });

  it('commits valid measure edits and keeps structural changes out of canonical ABC', async () => {
    const onAbcChange = vi.fn();
    render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={onAbcChange}
        documentId="score-1"
        revision={4}
        validationState="valid"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const firstInput = screen.getByRole('textbox', { name: 'Edit upper, measure 1' });
    expect((firstInput as HTMLInputElement).value).toBe(' C D E F |');
    fireEvent.change(firstInput, { target: { value: 'E D E F |' } });
    fireEvent.keyDown(firstInput, { key: 'Enter' });
    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('[V:upper] E D E F |'));

    onAbcChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 2' }));
    const lastInput = screen.getByRole('textbox', { name: 'Edit upper, measure 2' });
    fireEvent.change(lastInput, { target: { value: 'G A B c ||' } });
    fireEvent.keyDown(lastInput, { key: 'Enter' });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Raw Source'));
    expect(onAbcChange).not.toHaveBeenCalled();
  });

  it('allows switching to edit other voices and measures without focus being trapped', () => {
    const onAbcChange = vi.fn();
    render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={onAbcChange}
        documentId="score-1"
        revision={4}
        validationState="valid"
      />,
    );

    // Click and edit upper voice in measure 1
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const upperInput = screen.getByRole('textbox', { name: 'Edit upper, measure 1' });
    fireEvent.change(upperInput, { target: { value: 'E D E F |' } });

    // Switch directly to editing lower voice in measure 1
    const lowerButton = screen.getByRole('button', { name: 'Edit lower, measure 1' });
    fireEvent.blur(upperInput, { relatedTarget: lowerButton });
    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('[V:upper] E D E F |'));
    onAbcChange.mockClear();

    fireEvent.click(lowerButton);
    const lowerInput = screen.getByRole('textbox', { name: 'Edit lower, measure 1' });
    fireEvent.change(lowerInput, { target: { value: 'D,4 |' } });

    // Switch to upper voice in measure 2
    const upper2Button = screen.getByRole('button', { name: 'Edit upper, measure 2' });
    fireEvent.blur(lowerInput, { relatedTarget: upper2Button });
    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('[V:lower] D,4 |'));
    onAbcChange.mockClear();

    fireEvent.click(upper2Button);
    const upper2Input = screen.getByRole('textbox', { name: 'Edit upper, measure 2' });
    fireEvent.change(upper2Input, { target: { value: 'A A B c |' } });
    fireEvent.keyDown(upper2Input, { key: 'Enter' });
    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('[V:upper] C D E F | A A B c |'));
  });

  it('keeps sheet info in a collapsible tool belt section', () => {
    const onAbcChange = vi.fn();
    render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={onAbcChange}
      />,
    );

    expect(screen.queryByRole('button', { name: /Edit Title: T:Test Score/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sheet info' }));
    const titleButton = screen.getByRole('button', { name: /Edit Title: T:Test Score/i });
    expect(titleButton).toBeDefined();

    fireEvent.click(titleButton);
    const headerInput = screen.getByRole('textbox', { name: 'Edit header T' }) as HTMLInputElement;
    expect(headerInput.value).toBe('T:Test Score');

    fireEvent.change(headerInput, { target: { value: 'T:New Score Title' } });
    fireEvent.keyDown(headerInput, { key: 'Enter' });

    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('T:New Score Title'));
  });

  it('sizes sheet-info fields from their ABC content length', () => {
    const longTitle = 'A deliberately long score title that remains legible in the Tool Belt';
    render(<AbcEditor abcCode={`X:1\nT:${longTitle}\nK:C\nC|`} onAbcChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sheet info' }));
    const title = screen.getByRole('button', { name: `Edit Title: T:${longTitle}` });
    const field = title.closest('.abc-header-line') as HTMLElement;
    expect(field.style.getPropertyValue('--abc-header-field-width')).toBe('42ch');
  });

  it('renders a streamlined toolbar header with view switcher, status pill, and copy button', () => {
    render(
      <AbcEditor
        abcCode={'X:1\nT:Test\nK:C\nC|'}
        onAbcChange={() => undefined}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Measure Source' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Raw Source' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Copy/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Close ABC editor' })).toBeNull();
  });

  it('provides collapsible top tool sections', () => {
    render(<AbcEditor abcCode={formattedAbc} onAbcChange={() => undefined} activeAnchor={{ startMeasure: 1, endMeasure: 1 }} />);
    expect(screen.getByRole('region', { name: 'Measure Source tool belt' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Basics' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Quarter note' }).getAttribute('title')).toBe('C');
    expect(screen.getByRole('button', { name: 'Eighth note' }).textContent).toBe('♪');
    fireEvent.click(screen.getByRole('button', { name: 'Transpose' }));
    expect(screen.getByRole('button', { name: '+1 semitone' })).toBeDefined();
  });

  it('normalizes a tool insertion in the active draft before it is committed', () => {
    const underfilled = `X:1\nM:4/4\nL:1/4\nK:C\nC D |\n`;
    render(<AbcEditor abcCode={underfilled} onAbcChange={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit voice-1, measure 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quarter note' }));
    const input = screen.getByRole('textbox', { name: 'Edit voice-1, measure 1' }) as HTMLInputElement;
    expect(input.value).toContain('z');
  });

  it('uses ABC’s meter-dependent default length for note icons when L is omitted', () => {
    render(<AbcEditor abcCode={'X:1\nM:2/4\nK:C\nC4 |'} onAbcChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Quarter note' }).getAttribute('title')).toBe('C4');
  });

  it('keeps an active draft focused when using transpose controls', () => {
    render(<AbcEditor abcCode={formattedAbc} onAbcChange={() => undefined} activeAnchor={{ startMeasure: 1, endMeasure: 1 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit upper, measure 1' }));
    const input = screen.getByRole('textbox', { name: 'Edit upper, measure 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Transpose' }));
    const transpose = screen.getByRole('button', { name: '+1 semitone' });
    expect(fireEvent.mouseDown(transpose)).toBe(false);
    expect(document.activeElement).toBe(input);
  });

  it('transposes every editable voice in the selected measure range atomically without resetting selection', () => {
    const onAbcChange = vi.fn();
    const onSelectAnchor = vi.fn();
    const onNavigateMeasure = vi.fn();
    const selectedRange = { startMeasure: 1, endMeasure: 1 };
    render(<AbcEditor abcCode={formattedAbc} onAbcChange={onAbcChange} activeAnchor={selectedRange} onSelectAnchor={onSelectAnchor} onNavigateMeasure={onNavigateMeasure} />);
    fireEvent.click(screen.getByRole('button', { name: 'Transpose' }));
    fireEvent.click(screen.getByRole('button', { name: '+1 semitone' }));
    expect(onAbcChange).toHaveBeenCalledTimes(1);
    expect(onAbcChange).toHaveBeenCalledWith(
      expect.stringContaining('[V:upper] ^C ^D F ^F |'),
      { preserveSelection: true },
    );
    expect(onAbcChange).toHaveBeenCalledWith(
      expect.stringContaining('[V:lower] ^C,4 |'),
      { preserveSelection: true },
    );
    expect(onSelectAnchor).not.toHaveBeenCalled();
    expect(onNavigateMeasure).not.toHaveBeenCalled();
  });


  it('keeps the Measure Source structure belt mounted across selection changes', () => {
    const onMeasureMutation = vi.fn(() => ({
      status: 'valid' as const,
      abcSource: 'new source',
      affectedSpan: { startMeasure: 1, endMeasure: 1 },
    }));

    const view = render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={{ startMeasure: 1, endMeasure: 1 }}
        onMeasureMutation={onMeasureMutation}
      />,
    );

    // Visible in Measure Source with activeAnchor
    const structureTools = screen.getByRole('group', { name: 'Edit Measure 1' });
    expect(structureTools.classList.contains('abc-toolbelt-actions')).toBe(true);
    expect(screen.getByRole('button', { name: /Add before/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Add after/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeDefined();

    // Updates when selection changes to a range
    view.rerender(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={{ startMeasure: 1, endMeasure: 2 }}
        onMeasureMutation={onMeasureMutation}
      />,
    );
    expect(screen.getByRole('group', { name: 'Edit Measures 1–2' })).toBeDefined();

    // The same toolbar footprint stays mounted but disabled when selection clears.
    view.rerender(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={null}
        onMeasureMutation={onMeasureMutation}
      />,
    );
    expect(screen.getByRole('group', { name: 'Measure structure unavailable' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add before' }).hasAttribute('disabled')).toBe(true);

    // Unavailable in Raw Source view even if activeAnchor exists
    view.rerender(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={{ startMeasure: 1, endMeasure: 1 }}
        onMeasureMutation={onMeasureMutation}
      />,
    );
    expect(screen.getByRole('group', { name: 'Edit Measure 1' })).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Raw Source' }));
    expect(screen.queryByRole('group', { name: /Edit Measure/ })).toBeNull();
  });

  it('triggers onMeasureMutation from Measure Source toolbar belt actions', () => {
    const onMeasureMutation = vi.fn(() => ({
      status: 'valid' as const,
      abcSource: 'new source',
      affectedSpan: { startMeasure: 2, endMeasure: 2 },
    }));

    render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={{ startMeasure: 2, endMeasure: 2 }}
        onMeasureMutation={onMeasureMutation}
      />,
    );

    // Add before action (1-click direct add)
    fireEvent.click(screen.getByRole('button', { name: /Add before/ }));
    expect(onMeasureMutation).toHaveBeenCalledWith({
      kind: 'insert',
      span: { startMeasure: 2, endMeasure: 2 },
      position: 'before',
      count: 1,
    });

    // Delete action
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByRole('alertdialog', { name: 'Delete measures?' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete measures' }));
    expect(onMeasureMutation).toHaveBeenCalledWith({
      kind: 'delete',
      span: { startMeasure: 2, endMeasure: 2 },
    });
  });

  it('supports adjusting the tool belt height with pointer events and double click reset', () => {
    localStorage.clear();
    const { container } = render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
      />,
    );

    const toolbelt = container.querySelector('.abc-toolbelt') as HTMLElement;
    expect(toolbelt).toBeDefined();
    expect(toolbelt.style.height).toBe('328px');

    const resizer = screen.getByRole('separator', { name: 'Resize tool belt' });
    expect(resizer).toBeDefined();

    expect(resizer.getAttribute('tabindex')).toBe('0');
    expect(resizer.getAttribute('aria-orientation')).toBe('horizontal');
    expect(resizer.getAttribute('aria-valuenow')).toBe('328');
    expect(resizer.getAttribute('aria-valuemin')).toBe('80');
    expect(resizer.getAttribute('aria-valuemax')).toBe('640');

    // Drag to increase height
    fireEvent.pointerDown(resizer, { clientY: 100, pointerId: 1 });
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientY: 180 }));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    });

    expect(toolbelt.style.height).toBe('408px');
    expect(localStorage.getItem('chorale.workspace.toolbeltHeight')).toBe('408');
    expect(resizer.getAttribute('aria-valuenow')).toBe('408');

    // Double click resets to default
    act(() => {
      fireEvent.doubleClick(resizer);
    });
    expect(toolbelt.style.height).toBe('328px');
    expect(localStorage.getItem('chorale.workspace.toolbeltHeight')).toBe('328');
    expect(resizer.getAttribute('aria-valuenow')).toBe('328');

    // Keyboard navigation: ArrowDown increases height by 16px
    act(() => {
      fireEvent.keyDown(resizer, { key: 'ArrowDown' });
    });
    expect(toolbelt.style.height).toBe('344px');
    expect(localStorage.getItem('chorale.workspace.toolbeltHeight')).toBe('344');
    expect(resizer.getAttribute('aria-valuenow')).toBe('344');

    // Keyboard navigation: ArrowUp decreases height by 16px
    act(() => {
      fireEvent.keyDown(resizer, { key: 'ArrowUp' });
    });
    expect(toolbelt.style.height).toBe('328px');
    expect(localStorage.getItem('chorale.workspace.toolbeltHeight')).toBe('328');

    // Keyboard navigation: Home sets minimum height
    act(() => {
      fireEvent.keyDown(resizer, { key: 'Home' });
    });
    expect(toolbelt.style.height).toBe('80px');
    expect(localStorage.getItem('chorale.workspace.toolbeltHeight')).toBe('80');
    expect(resizer.getAttribute('aria-valuenow')).toBe('80');

    // Keyboard navigation: End sets maximum height
    act(() => {
      fireEvent.keyDown(resizer, { key: 'End' });
    });
    expect(toolbelt.style.height).toBe('640px');
    expect(localStorage.getItem('chorale.workspace.toolbeltHeight')).toBe('640');
    expect(resizer.getAttribute('aria-valuenow')).toBe('640');

    // Keyboard navigation: Enter resets to default height
    act(() => {
      fireEvent.keyDown(resizer, { key: 'Enter' });
    });
    expect(toolbelt.style.height).toBe('328px');
    expect(localStorage.getItem('chorale.workspace.toolbeltHeight')).toBe('328');
    expect(resizer.getAttribute('aria-valuenow')).toBe('328');
  });

  it('renders auto-sizing wrapper with ghost text for long measures in editing mode', () => {
    const longMeasureAbc = `X:1
T:Long Measure Test
M:4/4
L:1/16
K:C
V:1
cdef gfed cdef gfed cdef gfed cdef gfed |
`;
    const { container } = render(
      <AbcEditor abcCode={longMeasureAbc} onAbcChange={() => undefined} />,
    );
    const cellButton = screen.getByRole('button', { name: 'Edit 1, measure 1' });
    fireEvent.click(cellButton);

    const input = screen.getByRole('textbox', { name: 'Edit 1, measure 1' });
    expect(input).toBeDefined();

    const wrapper = container.querySelector('.abc-measure-edit-wrapper');
    expect(wrapper).not.toBeNull();

    const ghost = container.querySelector('.abc-measure-edit-ghost');
    expect(ghost).not.toBeNull();
    expect(ghost?.textContent).toContain('cdef gfed cdef gfed cdef gfed cdef gfed |');
    expect(input.getAttribute('size')).toBe(String('cdef gfed cdef gfed cdef gfed cdef gfed |'.length));

    // When typing additional characters, ghost expands to match
    fireEvent.change(input, {
      target: { value: 'cdef gfed cdef gfed cdef gfed cdef gfed cdef gfed |' },
    });
    expect(ghost?.textContent).toContain('cdef gfed cdef gfed cdef gfed cdef gfed cdef gfed |');
  });
});

