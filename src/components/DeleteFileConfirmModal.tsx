import React, { useEffect } from 'react';
import { Trash2, X } from 'lucide-react';

export interface DeleteFileConfirmModalProps {
  open: boolean;
  fileTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const DeleteFileConfirmModal: React.FC<DeleteFileConfirmModalProps> = ({
  open,
  fileTitle,
  onCancel,
  onConfirm,
}) => {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="delete-file-modal-overlay" onClick={onCancel} role="presentation">
      <div
        className="delete-file-modal-window"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-file-modal-title"
        aria-describedby="delete-file-modal-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="delete-file-modal-header">
          <div className="delete-file-icon-badge" aria-hidden="true">
            <Trash2 size={16} />
          </div>
          <h2 id="delete-file-modal-title" className="delete-file-modal-heading">
            Delete file?
          </h2>
          <button
            type="button"
            className="delete-file-close-btn"
            onClick={onCancel}
            title="Cancel delete (Esc)"
            aria-label="Cancel delete"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="delete-file-modal-body">
          <p id="delete-file-modal-description" className="delete-file-modal-description">
            <strong>{fileTitle || 'Untitled score'}</strong> and its editing
            history will be permanently removed from this workspace. This cannot
            be undone.
          </p>
        </div>

        <div className="delete-file-modal-footer">
          <button
            type="button"
            className="delete-file-cancel-btn"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="delete-file-confirm-btn"
            onClick={onConfirm}
            autoFocus
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteFileConfirmModal;
