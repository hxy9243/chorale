import React from 'react';
import { AISettingsModal } from '../AISettingsModal';
import { EditingHistoryModal } from '../EditingHistoryModal';
import { NewScoreModal } from '../NewScoreModal';
import type { AIProviderState } from '../../agent/useAIProviders';
import type { EditHistoryEntry } from '../../types/document';
import type { ScoreExportState } from '../../hooks/useScoreExport';

export interface WorkspaceModalsProps {
  settingsOpen: boolean;
  onCloseSettings: () => void;
  aiProviders: AIProviderState;
  interfaceZoom: number;
  onInterfaceZoomChange: (zoom: number) => void;

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
  settingsOpen,
  onCloseSettings,
  aiProviders,
  interfaceZoom,
  onInterfaceZoomChange,
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
      <AISettingsModal
        open={settingsOpen}
        onClose={onCloseSettings}
        ai={aiProviders}
        interfaceZoom={interfaceZoom}
        onInterfaceZoomChange={onInterfaceZoomChange}
      />
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
