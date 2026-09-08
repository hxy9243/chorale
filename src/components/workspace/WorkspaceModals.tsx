import React from 'react';
import { EditingHistoryModal } from '../EditingHistoryModal';
import { NewScoreModal } from '../NewScoreModal';
import type { EditHistoryEntry } from '../../types/document';
import type { ScoreExportState } from '../../hooks/useScoreExport';

export interface WorkspaceModalsProps {
  historyModalOpen: boolean;
  onCloseHistoryModal: () => void;
  scoreTitle: string;
  editingHistory: EditHistoryEntry[];
  activeHistoryIndex: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRevertTo: (idOrIndex: string | number) => void;

  newScoreModalOpen: boolean;
  onCloseNewScoreModal: () => void;
  onCreateDocument: (abcSource: string, title: string) => void;

  exportStatus: ScoreExportState;
}

export const WorkspaceModals: React.FC<WorkspaceModalsProps> = ({
  historyModalOpen,
  onCloseHistoryModal,
  scoreTitle,
  editingHistory,
  activeHistoryIndex,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRevertTo,
  newScoreModalOpen,
  onCloseNewScoreModal,
  onCreateDocument,
  exportStatus,
}) => {
  return (
    <>
      <EditingHistoryModal
        open={historyModalOpen}
        onClose={onCloseHistoryModal}
        scoreTitle={scoreTitle}
        history={editingHistory}
        activeHistoryIndex={activeHistoryIndex}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onRevertTo={onRevertTo}
      />
      <NewScoreModal
        open={newScoreModalOpen}
        onClose={onCloseNewScoreModal}
        onCreate={onCreateDocument}
      />
      {exportStatus.status === 'success' && (
        <div className="export-status-toast" role="status">
          Exported {exportStatus.message ?? 'file'}
        </div>
      )}
      {exportStatus.status === 'error' && (
        <div className="export-status-toast error" role="alert">
          Export failed: {exportStatus.message ?? 'unknown error'}
        </div>
      )}
    </>
  );
};
