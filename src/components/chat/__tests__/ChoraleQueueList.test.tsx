import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { QueuedChatMessage } from '../../../agent/types';
import { ChoraleQueueList } from '../ChoraleQueueList';

const makeItem = (
  id: string,
  prompt: string,
  lane: 'queue' | 'steer' = 'queue',
  selection?: { startMeasure: number; endMeasure: number },
): QueuedChatMessage => ({
  id,
  prompt,
  lane,
  createdAt: '2026-09-03T00:00:00.000Z',
  context: {
    id: `context-${id}`,
    documentId: 'document-1',
    revision: 1,
    capturedAt: '2026-09-03T00:00:00.000Z',
    fileName: 'score.abc',
    abc: 'X:1\nK:C\nC4|',
    annotations: [],
    selection,
  },
});

const renderQueue = (
  items: QueuedChatMessage[],
  isRunning = false,
) => {
  const callbacks = {
    onRunNext: vi.fn(),
    onSteerNow: vi.fn(),
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onReorder: vi.fn(),
  };
  const result = render(
    <ChoraleQueueList
      items={items}
      isRunning={isRunning}
      {...callbacks}
    />,
  );
  return { ...result, ...callbacks };
};

describe('ChoraleQueueList', () => {
  it('does not render an empty pending queue', () => {
    const { container } = renderQueue([]);
    expect(container.firstChild).toBeNull();
  });

  it('edits, cancels, reorders, removes, and runs queued messages', () => {
    const first = makeItem('queue-1', 'Analyze the cadence', 'queue', {
      startMeasure: 2,
      endMeasure: 4,
    });
    const second = makeItem('queue-2', 'Check the soprano');
    const {
      onEdit,
      onRemove,
      onReorder,
      onRunNext,
      onSteerNow,
    } = renderQueue([first, second]);

    expect(screen.getByText('mm. 2–4')).toBeTruthy();
    expect(screen.getByText('Pending Messages (2)')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '  Analyze the revised cadence  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onEdit).toHaveBeenCalledWith('queue-1', 'Analyze the revised cadence');

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Discard this edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onEdit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));
    expect(onReorder).toHaveBeenCalledWith('queue-1', 'down');
    fireEvent.click(screen.getByRole('button', { name: 'Move up' }));
    expect(onReorder).toHaveBeenCalledWith('queue-2', 'up');

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove item' })[0]);
    expect(onRemove).toHaveBeenCalledWith('queue-1');
    fireEvent.click(screen.getAllByRole('button', { name: 'Run next' })[1]);
    expect(onRunNext).toHaveBeenCalledWith(second);
    expect(onSteerNow).not.toHaveBeenCalled();
  });

  it('offers immediate steering for a running chat and shows single-measure context', () => {
    const item = makeItem('steer-1', 'Focus on the bass', 'steer', {
      startMeasure: 3,
      endMeasure: 3,
    });
    const { onRunNext, onSteerNow } = renderQueue([item], true);

    expect(screen.getByText('m. 3')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run next' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Steer now' }));
    expect(onSteerNow).toHaveBeenCalledWith(item);
    expect(onRunNext).not.toHaveBeenCalled();
  });
});
