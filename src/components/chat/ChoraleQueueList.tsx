import { memo, useState } from 'react';
import type { QueuedChatMessage } from '../../agent/types';

interface ChoraleQueueListProps {
  items: QueuedChatMessage[];
  isRunning: boolean;
  onRunNext: (item: QueuedChatMessage) => void;
  onSteerNow: (item: QueuedChatMessage) => void;
  onEdit: (itemId: string, newPrompt: string) => void;
  onRemove: (itemId: string) => void;
  onReorder: (itemId: string, direction: 'up' | 'down') => void;
}

export const ChoraleQueueList = memo(function ChoraleQueueList({
  items,
  isRunning,
  onRunNext,
  onSteerNow,
  onEdit,
  onRemove,
  onReorder,
}: ChoraleQueueListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  if (items.length === 0) return null;

  const startEdit = (item: QueuedChatMessage) => {
    setEditingId(item.id);
    setEditingText(item.prompt);
  };

  const saveEdit = (itemId: string) => {
    if (editingText.trim()) {
      onEdit(itemId, editingText.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  return (
    <div className="agent-queue-list" style={{ marginTop: 12, borderTop: '1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.1))', paddingTop: 8 }}>
      <div className="agent-queue-header" style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7, marginBottom: 6 }}>
        Pending Messages ({items.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, index) => {
          const isEditing = editingId === item.id;
          const rangeLabel = item.context.selection
            ? item.context.selection.startMeasure === item.context.selection.endMeasure
              ? `m. ${item.context.selection.startMeasure}`
              : `mm. ${item.context.selection.startMeasure}–${item.context.selection.endMeasure}`
            : null;

          return (
            <div
              key={item.id}
              className="agent-queue-item"
              data-lane={item.lane}
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                backgroundColor: item.lane === 'steer' ? 'var(--color-surface-steer, rgba(240, 160, 40, 0.1))' : 'var(--color-surface-subtle, rgba(0, 0, 0, 0.03))',
                border: '1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08))',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      padding: '1px 5px',
                      borderRadius: 3,
                      textTransform: 'uppercase',
                      backgroundColor: item.lane === 'steer' ? 'var(--color-warning-surface, #fdf6e2)' : 'var(--color-neutral-surface, #eee)',
                    }}
                  >
                    {item.lane}
                  </span>
                  {rangeLabel && (
                    <span className="agent-composer-range-chip" style={{ fontSize: '0.7rem' }}>
                      {rangeLabel}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                  {index > 0 && (
                    <button
                      type="button"
                      aria-label="Move up"
                      onClick={() => onReorder(item.id, 'up')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}
                    >
                      ▲
                    </button>
                  )}
                  {index < items.length - 1 && (
                    <button
                      type="button"
                      aria-label="Move down"
                      onClick={() => onReorder(item.id, 'down')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}
                    >
                      ▼
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Remove item"
                    onClick={() => onRemove(item.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    rows={2}
                    style={{ width: '100%', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={cancelEdit} style={{ fontSize: '0.75rem' }}>Cancel</button>
                    <button type="button" onClick={() => saveEdit(item.id)} style={{ fontSize: '0.75rem' }}>Save</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ wordBreak: 'break-word', flex: 1 }}>{item.prompt}</span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => startEdit(item)}
                      style={{ fontSize: '0.75rem', background: 'none', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 3, padding: '1px 5px', cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    {isRunning ? (
                      <button
                        type="button"
                        onClick={() => onSteerNow(item)}
                        style={{ fontSize: '0.75rem', background: 'none', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Steer now
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRunNext(item)}
                        style={{ fontSize: '0.75rem', background: 'none', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Run next
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
