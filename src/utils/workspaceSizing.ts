export const MIN_FILE_RAIL_WIDTH = 240;
export const MAX_DEFAULT_FILE_RAIL_WIDTH = 560;
export const FILE_RAIL_BAR_WIDTH = 56;
export const DEFAULT_FILE_RAIL_WIDTH_FRACTION = 1 / 4;
export const MIN_CHAT_RAIL_WIDTH = FILE_RAIL_BAR_WIDTH + 280;
export const MIN_EDITOR_PANEL_WIDTH = 320;
export const MIN_SCORE_WORKSPACE_WIDTH = 560;
const PANEL_DIVIDER_ALLOWANCE = 8;

export interface WorkspacePanelLayoutInput {
  viewportWidth: number;
  fileRailWidth: number;
  editorPanelWidth: number;
  fileRailVisible: boolean;
  fileRailMinimumWidth?: number;
  additionalWorkspaceWidth?: number;
  editorPanelVisible: boolean;
}

export interface WorkspacePanelLayout {
  fileRailWidth: number;
  editorPanelWidth: number;
  scoreWorkspaceWidth: number;
}

export const clampFileRailWidth = (width: number) => (
  Math.max(MIN_FILE_RAIL_WIDTH, width)
);

export const defaultFileRailWidth = (viewportWidth: number) => (
  Math.min(MAX_DEFAULT_FILE_RAIL_WIDTH, clampFileRailWidth(Math.round(viewportWidth * DEFAULT_FILE_RAIL_WIDTH_FRACTION)))
);

export const clampEditorPanelWidth = (width: number) => (
  Math.max(MIN_EDITOR_PANEL_WIDTH, width)
);

const dividerAllowance = (visiblePanelCount: number) => (
  Math.max(0, visiblePanelCount) * PANEL_DIVIDER_ALLOWANCE
);

/**
 * Fits the persistent panel preferences into the current layout while
 * prioritizing the score's reading width. The shared sidebar stays in flow
 * and its collapsed icon bar always retains its width.
 */
export const fitWorkspacePanelLayout = ({
  viewportWidth,
  fileRailWidth,
  editorPanelWidth,
  fileRailVisible,
  fileRailMinimumWidth = MIN_FILE_RAIL_WIDTH,
  additionalWorkspaceWidth = 0,
  editorPanelVisible,
}: WorkspacePanelLayoutInput): WorkspacePanelLayout => {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const minimumRailWidth = clampFileRailWidth(fileRailMinimumWidth);
  const desiredFileRailWidth = Math.max(minimumRailWidth, clampFileRailWidth(fileRailWidth));
  const desiredEditorPanelWidth = clampEditorPanelWidth(editorPanelWidth);

  const minimumEditorWidth = editorPanelVisible ? MIN_EDITOR_PANEL_WIDTH : 0;
  const dividers = dividerAllowance(1 + Number(editorPanelVisible));
  const minimumCenterWidth = MIN_SCORE_WORKSPACE_WIDTH + minimumEditorWidth + additionalWorkspaceWidth + dividers;
  const maximumRailWidth = Math.max(minimumRailWidth, safeViewportWidth - minimumCenterWidth);
  const fittedRailWidth = fileRailVisible
    ? Math.min(desiredFileRailWidth, maximumRailWidth)
    : FILE_RAIL_BAR_WIDTH;
  const maximumEditorWidth = Math.max(MIN_EDITOR_PANEL_WIDTH,
    safeViewportWidth - fittedRailWidth - MIN_SCORE_WORKSPACE_WIDTH - additionalWorkspaceWidth - dividers);
  const fittedEditorWidth = editorPanelVisible
    ? Math.min(desiredEditorPanelWidth, maximumEditorWidth)
    : desiredEditorPanelWidth;

  return {
    fileRailWidth: fittedRailWidth,
    editorPanelWidth: fittedEditorWidth,
    scoreWorkspaceWidth: Math.max(0, safeViewportWidth - fittedRailWidth
      - (editorPanelVisible ? fittedEditorWidth : 0) - additionalWorkspaceWidth - dividers),
  };
};
