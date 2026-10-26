export const MIN_FILE_RAIL_WIDTH = 240;
export const MAX_FILE_RAIL_WIDTH = 560;
export const FILE_RAIL_BAR_WIDTH = 56;
export const DEFAULT_FILE_RAIL_WIDTH_FRACTION = 1 / 4;
export const MIN_CHAT_RAIL_WIDTH = FILE_RAIL_BAR_WIDTH + 280;
export const MIN_EDITOR_PANEL_WIDTH = 320;
export const MIN_SCORE_WORKSPACE_WIDTH = 560;
export const DESKTOP_PANEL_LAYOUT_MIN_WIDTH = 960;
const PANEL_DIVIDER_ALLOWANCE = 8;

export interface WorkspacePanelLayoutInput {
  viewportWidth: number;
  fileRailWidth: number;
  editorPanelWidth: number;
  fileRailVisible: boolean;
  fileRailMinimumWidth?: number;
  editorPanelVisible: boolean;
}

export interface WorkspacePanelLayout {
  fileRailWidth: number;
  editorPanelWidth: number;
  scoreWorkspaceWidth: number;
}

export const clampFileRailWidth = (width: number) => (
  Math.max(MIN_FILE_RAIL_WIDTH, Math.min(MAX_FILE_RAIL_WIDTH, width))
);

export const defaultFileRailWidth = (viewportWidth: number) => (
  clampFileRailWidth(Math.round(viewportWidth * DEFAULT_FILE_RAIL_WIDTH_FRACTION))
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
  editorPanelVisible,
}: WorkspacePanelLayoutInput): WorkspacePanelLayout => {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const minimumRailWidth = clampFileRailWidth(fileRailMinimumWidth);
  const desiredFileRailWidth = Math.max(minimumRailWidth, clampFileRailWidth(fileRailWidth));
  const desiredEditorPanelWidth = clampEditorPanelWidth(editorPanelWidth);

  if (safeViewportWidth < DESKTOP_PANEL_LAYOUT_MIN_WIDTH) {
    const inlineRailWidth = fileRailVisible ? desiredFileRailWidth : FILE_RAIL_BAR_WIDTH;
    return {
      fileRailWidth: inlineRailWidth,
      editorPanelWidth: Math.min(desiredEditorPanelWidth, safeViewportWidth),
      scoreWorkspaceWidth: Math.max(0, safeViewportWidth - inlineRailWidth),
    };
  }

  const panelDefinitions = [
    {
      key: 'fileRailWidth' as const,
      visible: true,
      minimum: fileRailVisible ? minimumRailWidth : FILE_RAIL_BAR_WIDTH,
      desired: fileRailVisible ? desiredFileRailWidth : FILE_RAIL_BAR_WIDTH,
    },
    {
      key: 'editorPanelWidth' as const,
      visible: editorPanelVisible,
      minimum: MIN_EDITOR_PANEL_WIDTH,
      desired: desiredEditorPanelWidth,
    },
  ];
  const inlinePanels = panelDefinitions.filter((panel) => panel.visible);
  const availablePanelWidth = Math.max(
    0,
    safeViewportWidth
      - MIN_SCORE_WORKSPACE_WIDTH
      - dividerAllowance(inlinePanels.length),
  );
  const minimumPanelWidth = inlinePanels.reduce((sum, panel) => sum + panel.minimum, 0);
  const desiredExtraWidth = inlinePanels.reduce(
    (sum, panel) => sum + panel.desired - panel.minimum,
    0,
  );
  const availableExtraWidth = Math.max(0, availablePanelWidth - minimumPanelWidth);
  const extraScale = desiredExtraWidth === 0
    ? 0
    : Math.min(1, availableExtraWidth / desiredExtraWidth);
  const fittedWidths = {
    fileRailWidth: fileRailVisible ? desiredFileRailWidth : FILE_RAIL_BAR_WIDTH,
    editorPanelWidth: desiredEditorPanelWidth,
  };

  inlinePanels.forEach((panel) => {
    fittedWidths[panel.key] = Math.floor(
      panel.minimum + (panel.desired - panel.minimum) * extraScale,
    );
  });

  const usedInlineWidth = inlinePanels.reduce(
    (sum, panel) => sum + fittedWidths[panel.key],
    0,
  ) + dividerAllowance(inlinePanels.length);

  return {
    ...fittedWidths,
    scoreWorkspaceWidth: Math.max(0, safeViewportWidth - usedInlineWidth),
  };
};
