import { describe, expect, it } from 'vitest';
import {
  clampChatPanelWidth,
  clampEditorPanelWidth,
  fitWorkspacePanelLayout,
  clampFileRailWidth,
  defaultFileRailWidth,
  MIN_SCORE_WORKSPACE_WIDTH,
  maximumChatPanelWidth,
} from '../workspaceSizing';

describe('file rail sizing', () => {
  it('defaults to one quarter of the layout viewport', () => {
    expect(defaultFileRailWidth(1_440)).toBe(360);
    expect(defaultFileRailWidth(1_920)).toBe(480);
  });

  it('keeps the file rail usable at narrow and very wide sizes', () => {
    expect(defaultFileRailWidth(720)).toBe(240);
    expect(defaultFileRailWidth(3_000)).toBe(560);
    expect(clampFileRailWidth(100)).toBe(240);
  });
});

describe('chat panel sizing', () => {
  it('allows the panel to reach one half of the viewport', () => {
    expect(maximumChatPanelWidth(1_800)).toBe(900);
    expect(clampChatPanelWidth(900, 1_800)).toBe(900);
    expect(clampChatPanelWidth(520, 1_800)).toBe(520);
  });

  it('retains a usable minimum on narrow viewports', () => {
    expect(maximumChatPanelWidth(720)).toBe(360);
    expect(clampChatPanelWidth(100, 720)).toBe(280);
  });
});

describe('ABC editor sizing', () => {
  it('has no arbitrary maximum but still retains a usable minimum', () => {
    expect(clampEditorPanelWidth(100)).toBe(320);
    expect(clampEditorPanelWidth(1_200)).toBe(1_200);
  });

  it('fits an oversized preference to the available workspace', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 1_600,
      fileRailWidth: 360,
      chatPanelWidth: 420,
      editorPanelWidth: 1_200,
      fileRailVisible: false,
      chatPanelVisible: false,
      editorPanelVisible: true,
    });

    expect(layout.editorPanelWidth).toBe(968);
    expect(layout.scoreWorkspaceWidth).toBe(MIN_SCORE_WORKSPACE_WIDTH);
  });
});

describe('workspace panel fitting', () => {
  it('turns side panels into drawers at 1024px instead of collapsing the score', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 1_024,
      fileRailWidth: 560,
      chatPanelWidth: 560,
      editorPanelWidth: 720,
      fileRailVisible: true,
      chatPanelVisible: true,
      editorPanelVisible: true,
    });

    expect(layout.overlaySidePanels).toBe(true);
    expect(layout.scoreWorkspaceWidth).toBeGreaterThanOrEqual(MIN_SCORE_WORKSPACE_WIDTH);
    expect(layout.editorPanelWidth).toBe(456);
  });

  it('shrinks inline panels proportionally while preserving the score minimum', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 1_480,
      fileRailWidth: 560,
      chatPanelWidth: 560,
      editorPanelWidth: 720,
      fileRailVisible: true,
      chatPanelVisible: true,
      editorPanelVisible: true,
    });

    expect(layout.overlaySidePanels).toBe(false);
    expect(layout.fileRailWidth).toBeGreaterThanOrEqual(240);
    expect(layout.chatPanelWidth).toBeGreaterThanOrEqual(280);
    expect(layout.editorPanelWidth).toBeGreaterThanOrEqual(320);
    expect(layout.scoreWorkspaceWidth).toBeGreaterThanOrEqual(MIN_SCORE_WORKSPACE_WIDTH);
  });

  it('keeps preferred widths when the viewport has enough room', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 2_400,
      fileRailWidth: 360,
      chatPanelWidth: 420,
      editorPanelWidth: 520,
      fileRailVisible: true,
      chatPanelVisible: true,
      editorPanelVisible: true,
    });

    expect(layout).toMatchObject({
      fileRailWidth: 360,
      chatPanelWidth: 420,
      editorPanelWidth: 520,
      overlaySidePanels: false,
    });
  });

  it('allocates the persistent 56px icon rail when file rail content panel is collapsed', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 1_480,
      fileRailWidth: 360,
      chatPanelWidth: 420,
      editorPanelWidth: 520,
      fileRailVisible: false,
      chatPanelVisible: true,
      editorPanelVisible: true,
    });

    expect(layout.fileRailWidth).toBe(56);
    expect(layout.overlaySidePanels).toBe(false);
  });
});
