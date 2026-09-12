import { useEffect, useMemo, useRef } from 'react';

import { buildAbcPresentation } from '../music/abcPresentation';
import type { Annotation, ScoreAnchor } from '../types/document';

type PluginViewConfig = Readonly<{
  viewId: string;
  bridgeUrl: string;
}>;

type PluginMcpBridgeInput = Readonly<{
  enabled: boolean;
  documentId?: string;
  title: string;
  revision: number;
  abcSource: string;
  annotations?: readonly Annotation[];
  selection: ScoreAnchor | null;
  activeTab?: 'sheet' | 'abc-editor';
  isEditorVisible?: boolean;
  sheetVisible?: boolean;
  onApplyAnnotations: (annotations: readonly Annotation[]) => void;
  onReplaceScore: (replacementAbc: string) => { status: string };
  onSetAnnotations?: (annotations: readonly Annotation[]) => void;
  onDeleteAnnotations?: (annotationIds: readonly string[]) => void;
}>;

const defaultBridgeUrl = 'http://127.0.0.1:1685';

// Module state is deliberately per loaded page. sessionStorage is cloned by
// duplicated tabs, which made two independent views publish under one ID.
let pageViewId: string | null = null;
const viewIdentity = (): string => (pageViewId ||= `view-${crypto.randomUUID()}`);

export const getPluginViewConfig = (): PluginViewConfig => {
  if (typeof window === 'undefined') {
    return { viewId: 'plugin-main', bridgeUrl: defaultBridgeUrl };
  }
  const parameters = new URLSearchParams(window.location.search);
  const isViteDev = window.location.port.startsWith('517') || window.location.port === '4173';
  return {
    viewId: parameters.get('viewId') || viewIdentity(),
    // The packaged UI is served by the daemon. Same-origin requests work from
    // every browser profile without broad mutation CORS permissions.
    // Dev servers (5173, 5174, etc.) target the local daemon at defaultBridgeUrl.
    bridgeUrl: parameters.get('choraleBridge') || (isViteDev ? defaultBridgeUrl : window.location.origin),
  };
};

/** Controls the compact plugin presentation only; the bridge publishes from every view. */
export const isPluginView = (): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('plugin') === '1';
};

/**
 * Produces a self-contained, voice-labelled ABC excerpt for the written
 * measures in a captured selection. The full score remains in the page; this
 * is the bounded payload exposed to a conversational read.
 */
export const extractSelectedAbc = (abcSource: string, selection: ScoreAnchor): string => {
  try {
    const presentation = buildAbcPresentation(abcSource);
    const headerEnd = Math.max(0, ...presentation.headers.map(({ range }) => range.end));
    const header = abcSource.slice(0, headerEnd).trimEnd();
    const selectedVoices = presentation.voices.map((voice) => {
      const measures = voice.cells
        .filter((cell) => cell.measureNumber >= selection.startMeasure && cell.measureNumber <= selection.endMeasure)
        .map((cell) => cell.text)
        .join('');
      return measures ? `V:${voice.id}\n${measures.trim()}` : '';
    }).filter(Boolean);
    return [header, ...selectedVoices].filter(Boolean).join('\n\n');
  } catch {
    // A malformed draft must not make the selection bridge fail. The MCP
    // consumer receives the page's last available source with its range guard.
    return abcSource;
  }
};

export const usePluginMcpBridge = ({
  enabled,
  documentId,
  title,
  revision,
  abcSource,
  annotations,
  selection,
  activeTab,
  isEditorVisible,
  sheetVisible,
  onApplyAnnotations,
  onReplaceScore,
  onSetAnnotations,
  onDeleteAnnotations,
}: PluginMcpBridgeInput) => {
  const config = useMemo(() => getPluginViewConfig(), []);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;

  const onSetAnnotationsRef = useRef(onSetAnnotations);
  onSetAnnotationsRef.current = onSetAnnotations;

  const selectedAbc = useMemo(
    () => selection ? extractSelectedAbc(abcSource, selection) : undefined,
    [abcSource, selection],
  );

  useEffect(() => {
    if (!enabled || !documentId) return undefined;
    const publish = () => {
      const snapshot = {
        documentId,
        title,
        revision,
        abcSource,
        annotationCount: annotations?.length ?? 0,
        selection: selection ? {
          startMeasure: selection.startMeasure,
          endMeasure: selection.endMeasure,
          ...(selection.voiceId ? { voiceId: selection.voiceId } : {}),
        } : null,
        selectedAbc,
        activeTab: activeTab || (isEditorVisible && !sheetVisible ? 'abc-editor' : 'sheet'),
        isEditorVisible: Boolean(isEditorVisible),
        sheetVisible: sheetVisible !== false,
        focused: document.hasFocus(),
        visibilityState: document.visibilityState,
        updatedAt: new Date().toISOString(),
      };
      void fetch(`${config.bridgeUrl}/v1/views/${encodeURIComponent(config.viewId)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot),
        keepalive: true,
      }).catch(() => {
        // The page remains usable while the optional local MCP process is not running.
      });
    };

    publish();
    const refresh = window.setInterval(publish, 1500);
    window.addEventListener('focus', publish);
    window.addEventListener('blur', publish);
    document.addEventListener('visibilitychange', publish);
    return () => {
      window.clearInterval(refresh);
      window.removeEventListener('focus', publish);
      window.removeEventListener('blur', publish);
      document.removeEventListener('visibilitychange', publish);
    };
  }, [abcSource, activeTab, annotations?.length, config, documentId, enabled, isEditorVisible, revision, selectedAbc, selection, sheetVisible, title]);

  useEffect(() => {
    if (!enabled || !documentId) return undefined;
    let cancelled = false;

    const syncFromStore = async () => {
      try {
        const response = await fetch(`${config.bridgeUrl}/v1/scores/${encodeURIComponent(documentId)}`);
        if (!response.ok || cancelled) return;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return;
        const score = await response.json() as { annotations?: Annotation[]; revision?: number };
        if (Array.isArray(score.annotations) && onSetAnnotationsRef.current) {
          const currentAnns = annotationsRef.current || [];
          const currentIds = new Set(currentAnns.map((a) => a.id));
          const serverIds = new Set(score.annotations.map((a) => a.id));
          const hasDiff = currentIds.size !== serverIds.size || score.annotations.some((a) => !currentIds.has(a.id));
          if (hasDiff) {
            onSetAnnotationsRef.current(score.annotations);
          }
        }
      } catch {
        // The optional local bridge may be offline.
      }
    };

    const poll = async () => {
      try {
        const response = await fetch(`${config.bridgeUrl}/v1/views/${encodeURIComponent(config.viewId)}/commands`);
        if (!response.ok || cancelled) return;
        const pollContentType = response.headers.get('content-type') || '';
        if (!pollContentType.includes('application/json')) return;
        const { commands } = await response.json() as { commands?: Array<Record<string, unknown>> };
        for (const command of commands || []) {
          const commandId = typeof command.id === 'string' ? command.id : '';
          if (!commandId || cancelled) continue;
          let accepted = command.documentId === documentId;
          if (accepted && command.kind === 'annotations' && Array.isArray(command.annotations)) {
            onApplyAnnotations(command.annotations as Annotation[]);
          } else if (accepted && command.kind === 'delete-annotations' && Array.isArray(command.annotationIds)) {
            onDeleteAnnotations?.(command.annotationIds as string[]);
          } else if (accepted && command.kind === 'replace-score' && typeof command.replacementAbc === 'string') {
            accepted = onReplaceScore(command.replacementAbc).status === 'valid';
          } else {
            accepted = false;
          }
          await fetch(`${config.bridgeUrl}/v1/views/${encodeURIComponent(config.viewId)}/commands/${encodeURIComponent(commandId)}/ack`, {
            method: 'POST',
            keepalive: true,
            body: JSON.stringify({ accepted }),
          });
        }
      } catch {
        // The optional local bridge may be offline.
      }
    };

    void syncFromStore();
    void poll();
    const pollInterval = window.setInterval(() => void poll(), 500);
    const syncInterval = window.setInterval(() => void syncFromStore(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(pollInterval);
      window.clearInterval(syncInterval);
    };
  }, [config, documentId, enabled, onApplyAnnotations, onDeleteAnnotations, onReplaceScore]);
};
