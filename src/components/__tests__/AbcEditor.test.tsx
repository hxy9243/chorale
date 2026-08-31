import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    const { container } = render(<AbcEditor abcCode={formattedAbc} onAbcChange={() => undefined} />);
    expect(container.querySelector('.abc-editor-chrome')?.nextElementSibling).toBe(container.querySelector('.editor-body'));
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
    expect(screen.getByRole('slider', { name: 'Navigate measures' })).toBeDefined();

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

  it('allows inline editing of sheet info headers in measure view', () => {
    const onAbcChange = vi.fn();
    render(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={onAbcChange}
      />,
    );

    const titleButton = screen.getByRole('button', { name: /Edit Title: T:Test Score/i });
    expect(titleButton).toBeDefined();

    fireEvent.click(titleButton);
    const headerInput = screen.getByRole('textbox', { name: 'Edit header T' }) as HTMLInputElement;
    expect(headerInput.value).toBe('T:Test Score');

    fireEvent.change(headerInput, { target: { value: 'T:New Score Title' } });
    fireEvent.keyDown(headerInput, { key: 'Enter' });

    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('T:New Score Title'));
  });

  it('provides a close button inside the editor window', () => {
    const onToggleVisibility = vi.fn();
    render(
      <AbcEditor
        abcCode={'X:1\nT:Test\nK:C\nC|'}
        onAbcChange={() => undefined}
        onToggleVisibility={onToggleVisibility}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close ABC editor' }));
    expect(onToggleVisibility).toHaveBeenCalledOnce();
  });

  it('renders Measure Source toolbar belt only when a measure/range is selected in Measure Source', () => {
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
    expect(screen.getByRole('group', { name: 'Edit Measure 1' })).toBeDefined();
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

    // Hidden when activeAnchor is null
    view.rerender(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={null}
        onMeasureMutation={onMeasureMutation}
      />,
    );
    expect(screen.queryByRole('group', { name: /Edit Measure/ })).toBeNull();

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

    // Add before action
    fireEvent.click(screen.getByRole('button', { name: /Add before/ }));
    fireEvent.change(screen.getByLabelText(/^Number of measures/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add measures' }));
    expect(onMeasureMutation).toHaveBeenCalledWith({
      kind: 'insert',
      span: { startMeasure: 2, endMeasure: 2 },
      position: 'before',
      count: 2,
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
});
