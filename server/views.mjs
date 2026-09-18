import { randomUUID } from 'node:crypto';
import { PluginError } from './store.mjs';

const VIEW_HEARTBEAT_TTL_MS = 6_000;

export class ViewSnapshotStore {
  constructor(options = {}) {
    this.snapshots = new Map();
    this.commands = new Map();
    this.now = options.now || (() => Date.now());
    this.openUi = options.openUi || null;
  }

  setOpenUi(openUi) {
    this.openUi = openUi;
  }

  cleanExpired() {
    const cutoff = this.now() - VIEW_HEARTBEAT_TTL_MS;
    for (const [viewId, snapshot] of this.snapshots.entries()) {
      if (snapshot.lastSeenAt < cutoff) {
        this.snapshots.delete(viewId);
        this.commands.delete(viewId);
      }
    }
  }

  update(viewId, payload = {}) {
    if (!viewId || typeof viewId !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(viewId)) {
      throw new PluginError('INVALID_VIEW', `Invalid view ID "${viewId}".`);
    }

    const previous = this.snapshots.get(viewId) || {};
    const updated = {
      viewId,
      documentId: payload.documentId || previous.documentId || null,
      title: payload.title || previous.title || 'Untitled',
      revision: Number.isInteger(payload.revision) ? payload.revision : previous.revision || 1,
      selection: payload.selection !== undefined ? payload.selection : previous.selection || null,
      selectedAbc: payload.selectedAbc !== undefined ? payload.selectedAbc : previous.selectedAbc || null,
      activeTab: payload.activeTab || previous.activeTab || 'sheet',
      isEditorVisible: payload.isEditorVisible ?? previous.isEditorVisible ?? false,
      focused: payload.focused ?? previous.focused ?? false,
      visibilityState: payload.visibilityState || previous.visibilityState || 'visible',
      lastSeenAt: this.now(),
    };

    this.snapshots.set(viewId, updated);
    return updated;
  }

  require(viewId) {
    this.cleanExpired();
    const snapshot = this.snapshots.get(viewId);
    if (!snapshot) {
      throw new PluginError('VIEW_NOT_CONNECTED', `View "${viewId}" is not connected or heartbeat expired.`);
    }
    return snapshot;
  }

  listConnected() {
    this.cleanExpired();
    return Array.from(this.snapshots.values());
  }

  resolve(preferredViewId = null) {
    this.cleanExpired();
    if (preferredViewId) {
      return { ...this.require(preferredViewId), warning: null };
    }

    const connected = this.listConnected();
    if (connected.length === 0) {
      throw new PluginError('VIEW_NOT_CONNECTED', 'No connected Chorale score views found.');
    }

    // Prefer focused visible view, then most recently updated
    const sorted = [...connected].sort((a, b) => {
      if (a.focused !== b.focused) return a.focused ? -1 : 1;
      return b.lastSeenAt - a.lastSeenAt;
    });

    const active = sorted[0];
    const warning = connected.length > 1
      ? `Multiple Chorale views are connected (${connected.length}). Resolving focused view "${active.viewId}".`
      : null;

    return { ...active, warning };
  }

  pending(viewId) {
    return this.commands.get(viewId) || [];
  }

  queueCommand(viewId, command) {
    const list = this.commands.get(viewId) || [];
    const commandWithId = {
      id: `cmd-${randomUUID().slice(0, 8)}`,
      createdAt: this.now(),
      ...command,
    };
    list.push(commandWithId);
    this.commands.set(viewId, list);
    return commandWithId;
  }

  broadcastCommand(command) {
    this.cleanExpired();
    for (const viewId of this.snapshots.keys()) {
      this.queueCommand(viewId, command);
    }
  }

  acknowledge(viewId, commandId) {
    const list = this.commands.get(viewId);
    if (!list) return;
    this.commands.set(viewId, list.filter((cmd) => cmd.id !== commandId));
  }
}
