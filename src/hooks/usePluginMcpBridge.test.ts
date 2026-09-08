import { describe, expect, it } from 'vitest';

import { getPluginViewConfig, isPluginView } from './usePluginMcpBridge';

describe('plugin MCP bridge configuration', () => {
  it('publishes to the local bridge from the normal workspace', () => {
    window.history.replaceState({}, '', '/');

    expect(getPluginViewConfig()).toEqual({
      viewId: 'plugin-main',
      bridgeUrl: 'http://127.0.0.1:43171',
    });
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
