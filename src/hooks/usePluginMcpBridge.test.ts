import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation } from '../types/document';

import { getPluginViewConfig, isPluginView, usePluginMcpBridge } from './usePluginMcpBridge';

describe('plugin MCP bridge configuration', () => {
  it('publishes to the local bridge from the normal workspace', () => {
    window.history.replaceState({}, '', '/');

    expect(getPluginViewConfig()).toMatchObject({ bridgeUrl: window.location.origin });
    expect(getPluginViewConfig().viewId).toMatch(/^view-/);
    expect(isPluginView()).toBe(false);
  });

  it('keeps URL bridge and view overrides without requiring plugin presentation', () => {
    window.history.replaceState({}, '', '/?viewId=review&choraleBridge=http%3A%2F%2F127.0.0.1%3A43172');

    expect(getPluginViewConfig()).toEqual({
      viewId: 'review',
      bridgeUrl: 'http://127.0.0.1:43172',
    });
    expect(isPluginView()).toBe(false);
  });
});


describe('annotation synchronization', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not overwrite a newly accepted local annotation with an in-flight stale read', async () => {
    let completeRead!: (response: Response) => void;
    const pendingRead = new Promise<Response>((resolve) => { completeRead = resolve; });
    const response = (body: unknown) => ({
      ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body,
    }) as Response;
    vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/v1/scores/')
      ? pendingRead : Promise.resolve(response({ commands: [] }))));
    const onSetAnnotations = vi.fn();
    const onApplyAnnotations = vi.fn();
    const onReplaceScore = () => ({ status: 'valid' });
    const local: Annotation = {
      id: 'new-annotation', kind: 'explanation', span: { startMeasure: 1, endMeasure: 1 },
      label: 'Opening', body: 'Keep the motif.', source: 'assistant',
      createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:00Z',
    };
    const { rerender } = renderHook(({ annotations, unsaved }) => usePluginMcpBridge({
      enabled: true, documentId: 'test', title: 'Test', revision: 1, abcSource: 'X:1\nK:C\nC4|',
      selection: null, annotations, hasUnsavedChanges: unsaved, onSetAnnotations,
      onApplyAnnotations, onReplaceScore,
    }), { initialProps: { annotations: [] as Annotation[], unsaved: false } });
    rerender({ annotations: [local], unsaved: true });
    await act(async () => { completeRead(response({ annotations: [], revision: 1 })); });
    expect(onSetAnnotations).not.toHaveBeenCalled();
  });
});
