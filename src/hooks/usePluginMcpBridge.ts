import { useEffect, useMemo } from 'react';

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
  selection: ScoreAnchor | null;
  onApplyAnnotations: (annotations: readonly Annotation[]) => void;
  onReplaceScore: (replacementAbc: string) => { status: string };
}>;

const defaultBridgeUrl = 'http://127.0.0.1:43171';

export const getPluginViewConfig = (): PluginViewConfig => {
  if (typeof window === 'undefined') {
    return { viewId: 'plugin-main', bridgeUrl: defaultBridgeUrl };
  }
  const parameters = new URLSearchParams(window.location.search);
  return {
    viewId: parameters.get('viewId') || 'plugin-main',
    bridgeUrl: parameters.get('choraleBridge') || defaultBridgeUrl,
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
  selection,
  onApplyAnnotations,
  onReplaceScore,
}: PluginMcpBridgeInput) => {
  const config = useMemo(() => getPluginViewConfig(), []);
  const selectedAbc = useMemo(
    () => selection ? extractSelectedAbc(abcSource, selection) : undefined,
    [abcSource, selection],
  );

  useEffect(() => {
    if (!enabled || !documentId) return undefined;
    const snapshot = {
      documentId,
      title,
      revision,
      abcSource,
      selection: selection ? {
        startMeasure: selection.startMeasure,
        endMeasure: selection.endMeasure,
        ...(selection.voiceId ? { voiceId: selection.voiceId } : {}),
      } : null,
      selectedAbc,
      updatedAt: new Date().toISOString(),
    };
    const publish = () => {
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
    return () => window.clearInterval(refresh);
  }, [abcSource, config, documentId, enabled, revision, selectedAbc, selection, title]);

  useEffect(() => {
    if (!enabled || !documentId) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`${config.bridgeUrl}/v1/views/${encodeURIComponent(config.viewId)}/commands`);
        if (!response.ok) return;
        const { commands } = await response.json() as { commands?: Array<Record<string, unknown>> };
        for (const command of commands || []) {
          const commandId = typeof command.id === 'string' ? command.id : '';
          if (!commandId || cancelled) continue;
          let accepted = command.documentId === documentId && (command.expectedRevision === revision || command.expectedRevision === revision + 1);
          if (accepted && command.kind === 'annotations' && Array.isArray(command.annotations)) onApplyAnnotations(command.annotations as Annotation[]);
          else if (accepted && command.kind === 'replace-score' && typeof command.replacementAbc === 'string') accepted = onReplaceScore(command.replacementAbc).status === 'valid';
          else accepted = false;
          await fetch(`${config.bridgeUrl}/v1/views/${encodeURIComponent(config.viewId)}/commands/${encodeURIComponent(commandId)}/ack`, { method: 'POST', keepalive: true, body: JSON.stringify({ accepted }) });
        }
      } catch { /* The optional local bridge may be offline. */ }
    };
    void poll();
    const refresh = window.setInterval(() => void poll(), 500);
    return () => { cancelled = true; window.clearInterval(refresh); };
  }, [config, documentId, enabled, onApplyAnnotations, onReplaceScore, revision]);
};
