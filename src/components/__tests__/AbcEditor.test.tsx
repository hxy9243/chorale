import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AbcEditor } from '../AbcEditor';

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

  it('keeps editor chrome separate from the scrolling source body', () => {
    const { container } = render(<AbcEditor abcCode={formattedAbc} onAbcChange={() => undefined} />);
    expect(container.querySelector('.abc-editor-chrome')?.nextElementSibling).toBe(container.querySelector('.editor-body'));
  });

  it('shows one always-editable source split into beat slots and follows sheet selection', () => {
    const onSelectAnchor = vi.fn();
    const onNavigateMeasure = vi.fn();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
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
    expect(screen.getAllByRole('textbox', { name: /Edit upper, measure 1, beat/ })).toHaveLength(4);
    expect(screen.getAllByRole('textbox', { name: /Edit lower, measure 1, beat/ })).toHaveLength(4);
    expect(view.container.querySelector('.abc-beat-lane')).toBeNull();
    expect(view.container.querySelector('.abc-timeline-source')).toBeNull();
    expect(screen.getByRole('slider', { name: 'Navigate measures' })).toBeDefined();

    const upperBeat = screen.getByRole('textbox', { name: 'Edit upper, measure 2, beat 1' });
    expect((upperBeat as HTMLInputElement).readOnly).toBe(false);
    fireEvent.click(upperBeat);
    expect(onNavigateMeasure).toHaveBeenLastCalledWith(expect.objectContaining({ startMeasure: 2, endMeasure: 2 }));
    expect(onSelectAnchor).not.toHaveBeenCalled();

    view.rerender(
      <AbcEditor
        abcCode={formattedAbc}
        onAbcChange={() => undefined}
        activeAnchor={{ startMeasure: 2, endMeasure: 2 }}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'center', behavior: 'smooth' });

    frameSpy.mockRestore();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: originalScrollIntoView });
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
    expect(screen.getAllByRole('textbox', { name: /measure 1, beat/ })).toHaveLength(6);
    expect(beatGroup.children).toHaveLength(6);
    expect(beatGroup.querySelector('.abc-beat-separator')).toBeNull();
    expect((beatGroup as HTMLElement).style.gridTemplateColumns.split(' ')).toHaveLength(6);
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
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
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

    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'center', behavior: 'smooth' });

    frameSpy.mockRestore();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: originalScrollIntoView });
  });

  it('commits valid beat edits and keeps structural changes out of canonical ABC', async () => {
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

    const firstBeat = screen.getByRole('textbox', { name: 'Edit upper, measure 1, beat 1' });
    expect((firstBeat as HTMLInputElement).value).toContain('C');
    fireEvent.focus(firstBeat);
    fireEvent.change(firstBeat, { target: { value: ' E ' } });
    fireEvent.keyDown(firstBeat, { key: 'Enter' });
    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('[V:upper] E D E F |'));

    onAbcChange.mockClear();
    const lastBeat = screen.getByRole('textbox', { name: 'Edit upper, measure 2, beat 4' });
    fireEvent.focus(lastBeat);
    fireEvent.change(lastBeat, { target: { value: 'c ||' } });
    fireEvent.keyDown(lastBeat, { key: 'Enter' });
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

    const upperMeasure1Beat1 = screen.getByRole('textbox', { name: 'Edit upper, measure 1, beat 1' });
    const lowerMeasure1Beat1 = screen.getByRole('textbox', { name: 'Edit lower, measure 1, beat 1' });
    const upperMeasure2Beat1 = screen.getByRole('textbox', { name: 'Edit upper, measure 2, beat 1' });

    // Focus and edit upper voice in measure 1
    fireEvent.focus(upperMeasure1Beat1);
    fireEvent.change(upperMeasure1Beat1, { target: { value: ' E ' } });

    // Switch focus directly to lower voice in measure 1
    fireEvent.blur(upperMeasure1Beat1.parentElement!, { relatedTarget: lowerMeasure1Beat1 });
    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('[V:upper] E D E F |'));
    onAbcChange.mockClear();

    fireEvent.focus(lowerMeasure1Beat1);
    fireEvent.change(lowerMeasure1Beat1, { target: { value: ' D,4 |' } });

    // Switch focus to upper voice in measure 2
    fireEvent.blur(lowerMeasure1Beat1.parentElement!, { relatedTarget: upperMeasure2Beat1 });
    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('[V:lower] D,4 |'));
    onAbcChange.mockClear();

    fireEvent.focus(upperMeasure2Beat1);
    fireEvent.change(upperMeasure2Beat1, { target: { value: ' A ' } });
    fireEvent.keyDown(upperMeasure2Beat1, { key: 'Enter' });
    expect(onAbcChange).toHaveBeenCalledWith(expect.stringContaining('[V:upper] C D E F | A A B c |'));
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
});
