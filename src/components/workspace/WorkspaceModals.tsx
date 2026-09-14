import React from 'react';
import { SettingsModal } from '../SettingsModal';
import { EditingHistoryModal } from '../EditingHistoryModal';
import { NewScoreModal } from '../NewScoreModal';
import { ScoreVideoExportModal } from '../ScoreVideoExportModal';
import type { EditHistoryEntry } from '../../types/document';
import type { ScoreExportState } from '../../hooks/useScoreExport';

export interface WorkspaceModalsProps {
  settingsOpen?: boolean;
  onCloseSettings?: () => void;
  interfaceZoom?: number;
  onInterfaceZoomChange?: (zoom: number) => void;

  historyModalOpen: boolean;
  onCloseHistoryModal: () => void;
  scoreTitle: string;
  scoreComposer?: string;
  scoreKey?: string;
  scoreMeter?: string;
  scoreTempoBpm?: number;
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

  videoExportModalOpen?: boolean;
  onCloseVideoExportModal?: () => void;
  abcSource?: string;

  exportStatus: ScoreExportState;
}

export const WorkspaceModals: React.FC<WorkspaceModalsProps> = ({
  settingsOpen = false,
  onCloseSettings,
  interfaceZoom = 100,
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
  videoExportModalOpen = false,
  onCloseVideoExportModal,
  abcSource,
  scoreComposer,
  scoreKey,
  scoreMeter,
  scoreTempoBpm,
  exportStatus,
}) => {
  return (
    <>
      <SettingsModal
        open={settingsOpen}
        onClose={onCloseSettings || (() => {})}
        interfaceZoom={interfaceZoom}
        onInterfaceZoomChange={onInterfaceZoomChange || (() => {})}
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
      <ScoreVideoExportModal
        open={videoExportModalOpen}
        onClose={onCloseVideoExportModal || (() => {})}
        scoreTitle={scoreTitle}
        composer={scoreComposer}
        keySignature={scoreKey}
        meter={scoreMeter}
        tempoBpm={scoreTempoBpm}
        abcSource={abcSource}
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
