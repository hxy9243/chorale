import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditingHistoryModal } from '../EditingHistoryModal';
import type { EditHistoryEntry } from '../../types/document';

describe('EditingHistoryModal', () => {
  const mockHistory: EditHistoryEntry[] = [
    {
      id: 'hist-1',
      revision: 1,
      timestamp: '2026-08-20T10:00:00Z',
      category: 'origin',
      actionType: 'initial',
      summary: 'Initial score import',
      details: 'MUSICXML source',
      abcSource: 'X:1\nT:Test\nK:C\nC|',
      scoreInfo: { title: 'Test' },
      annotations: [],
    },
    {
      id: 'hist-2',
      revision: 2,
      timestamp: '2026-08-20T10:05:00Z',
      category: 'metadata',
      actionType: 'edit',
      summary: 'Key signature → G',
      metadataField: 'key',
      abcSource: 'X:1\nT:Test\nK:G\nC|',
      scoreInfo: { title: 'Test', key: 'G' },
      annotations: [],
    },
    {
      id: 'hist-3',
      revision: 3,
      timestamp: '2026-08-20T10:10:00Z',
      category: 'annotation',
      actionType: 'add',
      annotationKind: 'chord',
      summary: 'Add Chord [G7] at M2',
      details: 'CHORD · M2',
      abcSource: 'X:1\nT:Test\nK:G\nC|',
      scoreInfo: { title: 'Test', key: 'G' },
      annotations: [],
    },
    {
      id: 'hist-4',
      revision: 4,
      timestamp: '2026-08-20T10:15:00Z',
      category: 'body',
      actionType: 'edit',
      summary: 'Edited ABC music body',
      details: 'Score measures & notation',
      abcSource: 'X:1\nT:Test\nK:G\nCDEF|',
      scoreInfo: { title: 'Test', key: 'G' },
      annotations: [],
    },
  ];

  it('renders correctly when open and displays all history items with correct categories and badges', () => {
    const handleClose = vi.fn();
    const handleUndo = vi.fn();
    const handleRedo = vi.fn();
    const handleRevert = vi.fn();

    render(
      <EditingHistoryModal
        open={true}
        onClose={handleClose}
        scoreTitle="Test Score"
        history={mockHistory}
        activeHistoryIndex={2}
        canUndo={true}
        canRedo={true}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRevertTo={handleRevert}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Editing History' })).toBeDefined();
    expect(screen.getByText(/Test Score · 4 steps from origin/)).toBeDefined();

    // Check categories
    expect(screen.getAllByText('Origin').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Metadata · key')).toBeDefined();
    expect(screen.getByText('Annotation · Chord')).toBeDefined();
    expect(screen.getByText('Body ABC')).toBeDefined();

    // Check actions
    expect(screen.getByText('★ Initial')).toBeDefined();
    expect(screen.getAllByText('✎ Edit')).toHaveLength(2);
    expect(screen.getByText('+ Add')).toBeDefined();

    // Check summaries
    expect(screen.getByText('Initial score import')).toBeDefined();
    expect(screen.getByText('Key signature → G')).toBeDefined();
    expect(screen.getAllByText('Add Chord [G7] at M2').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Edited ABC music body')).toBeDefined();

    // Check active step indicator
    expect(screen.getByText('Step 3 of 4')).toBeDefined();
    expect(screen.getByText('Current')).toBeDefined();
  });

  it('triggers revert when clicking a non-active history row or revert button', () => {
    const handleRevert = vi.fn();

    render(
      <EditingHistoryModal
        open={true}
        onClose={vi.fn()}
        scoreTitle="Test Score"
        history={mockHistory}
        activeHistoryIndex={2}
        canUndo={true}
        canRedo={true}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onRevertTo={handleRevert}
      />
    );

    // Click on row 1 (origin)
    fireEvent.click(screen.getByText('Initial score import'));
    expect(handleRevert).toHaveBeenCalledWith('hist-1');

    // Click on revert button for step 2
    const revertButtons = screen.getAllByRole('button', { name: /Revert score to step/ });
    fireEvent.click(revertButtons[0]);
    expect(handleRevert).toHaveBeenCalledWith('hist-1');
  });

  it('calls undo and redo from modal quick controls', () => {
    const handleUndo = vi.fn();
    const handleRedo = vi.fn();

    render(
      <EditingHistoryModal
        open={true}
        onClose={vi.fn()}
        scoreTitle="Test Score"
        history={mockHistory}
        activeHistoryIndex={1}
        canUndo={true}
        canRedo={true}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRevertTo={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Undo step' }));
    expect(handleUndo).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Redo step' }));
    expect(handleRedo).toHaveBeenCalled();
  });

  it('closes on Escape or clicking Done / close button', () => {
    const handleClose = vi.fn();

    render(
      <EditingHistoryModal
        open={true}
        onClose={handleClose}
        scoreTitle="Test Score"
        history={mockHistory}
        activeHistoryIndex={1}
        canUndo={true}
        canRedo={true}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onRevertTo={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close history window' }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(handleClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(3);
  });
});
