import { describe, expect, it } from 'vitest';
import {
  clampEditorPanelWidth,
  fitWorkspacePanelLayout,
  clampFileRailWidth,
  defaultFileRailWidth,
  MIN_SCORE_WORKSPACE_WIDTH,
  MIN_CHAT_RAIL_WIDTH,
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

describe('ABC editor sizing', () => {
  it('has no arbitrary maximum but still retains a usable minimum', () => {
    expect(clampEditorPanelWidth(100)).toBe(320);
    expect(clampEditorPanelWidth(1_200)).toBe(1_200);
  });

  it('fits an oversized preference to the available workspace', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 1_600,
      fileRailWidth: 360,
      editorPanelWidth: 1_200,
      fileRailVisible: false,
      editorPanelVisible: true,
    });

    expect(layout.editorPanelWidth).toBe(968);
    expect(layout.scoreWorkspaceWidth).toBe(MIN_SCORE_WORKSPACE_WIDTH);
  });
});

describe('workspace panel fitting', () => {
  it('keeps the shared rail in flow when the panes cannot all fit at preferred widths', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 1_024,
      fileRailWidth: 560,
      editorPanelWidth: 720,
      fileRailVisible: true,
      editorPanelVisible: true,
    });

    expect(layout.fileRailWidth).toBe(240);
    expect(layout.scoreWorkspaceWidth).toBe(448);
    expect(layout.editorPanelWidth).toBe(320);
  });

  it('shrinks inline panels proportionally while preserving the score minimum', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 1_480,
      fileRailWidth: 560,
      editorPanelWidth: 720,
      fileRailVisible: true,
      editorPanelVisible: true,
    });

    expect(layout.fileRailWidth).toBeGreaterThanOrEqual(240);
    expect(layout.editorPanelWidth).toBeGreaterThanOrEqual(320);
    expect(layout.scoreWorkspaceWidth).toBeGreaterThanOrEqual(MIN_SCORE_WORKSPACE_WIDTH);
  });

  it('keeps preferred widths when the viewport has enough room', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 2_400,
      fileRailWidth: 360,
      editorPanelWidth: 520,
      fileRailVisible: true,
      editorPanelVisible: true,
    });

    expect(layout).toMatchObject({
      fileRailWidth: 360,
      editorPanelWidth: 520,
    });
  });

  it.each([720, 1024, 1480])('keeps Chat readable in the shared rail at %ipx', (viewportWidth) => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth,
      fileRailWidth: 240,
      fileRailMinimumWidth: MIN_CHAT_RAIL_WIDTH,
      editorPanelWidth: 420,
      fileRailVisible: true,
      editorPanelVisible: true,
    });
    expect(layout.fileRailWidth).toBe(336);
  });

  it('allocates the persistent 56px icon rail when file rail content panel is collapsed', () => {
    const layout = fitWorkspacePanelLayout({
      viewportWidth: 1_480,
      fileRailWidth: 360,
      editorPanelWidth: 520,
      fileRailVisible: false,
      editorPanelVisible: true,
    });

    expect(layout.fileRailWidth).toBe(56);
  });
});
