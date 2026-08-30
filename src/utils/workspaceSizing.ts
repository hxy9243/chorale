export const MIN_FILE_RAIL_WIDTH = 240;
export const MAX_FILE_RAIL_WIDTH = 560;
export const FILE_RAIL_BAR_WIDTH = 56;
export const DEFAULT_FILE_RAIL_WIDTH_FRACTION = 1 / 4;
export const MIN_CHAT_PANEL_WIDTH = 280;
export const CHAT_PANEL_WIDTH_FRACTION = 1 / 2;
export const MIN_EDITOR_PANEL_WIDTH = 320;
export const MIN_SCORE_WORKSPACE_WIDTH = 560;
export const DESKTOP_PANEL_LAYOUT_MIN_WIDTH = 960;
const PANEL_DIVIDER_ALLOWANCE = 8;

export interface WorkspacePanelLayoutInput {
  viewportWidth: number;
  fileRailWidth: number;
  chatPanelWidth: number;
  editorPanelWidth: number;
  fileRailVisible: boolean;
  chatPanelVisible: boolean;
  editorPanelVisible: boolean;
}

export interface WorkspacePanelLayout {
  fileRailWidth: number;
  chatPanelWidth: number;
  editorPanelWidth: number;
  scoreWorkspaceWidth: number;
  overlaySidePanels: boolean;
}

export const clampFileRailWidth = (width: number) => (
  Math.max(MIN_FILE_RAIL_WIDTH, Math.min(MAX_FILE_RAIL_WIDTH, width))
);

export const defaultFileRailWidth = (viewportWidth: number) => (
  clampFileRailWidth(Math.round(viewportWidth * DEFAULT_FILE_RAIL_WIDTH_FRACTION))
);

export const maximumChatPanelWidth = (viewportWidth: number) => (
  Math.max(MIN_CHAT_PANEL_WIDTH, Math.floor(viewportWidth * CHAT_PANEL_WIDTH_FRACTION))
);

export const clampChatPanelWidth = (width: number, viewportWidth: number) => (
  Math.max(MIN_CHAT_PANEL_WIDTH, Math.min(maximumChatPanelWidth(viewportWidth), width))
);

export const clampEditorPanelWidth = (width: number) => (
  Math.max(MIN_EDITOR_PANEL_WIDTH, width)
);

const dividerAllowance = (visiblePanelCount: number) => (
  Math.max(0, visiblePanelCount) * PANEL_DIVIDER_ALLOWANCE
);

/**
 * Fits the persistent panel preferences into the current layout without ever
 * sacrificing the score's reading width. Side panels become drawers when all
 * visible panels cannot coexist at their usable minimum widths.
 */
export const fitWorkspacePanelLayout = ({
  viewportWidth,
  fileRailWidth,
  chatPanelWidth,
  editorPanelWidth,
  fileRailVisible,
  chatPanelVisible,
  editorPanelVisible,
}: WorkspacePanelLayoutInput): WorkspacePanelLayout => {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const desiredFileRailWidth = clampFileRailWidth(fileRailWidth);
  const desiredChatPanelWidth = clampChatPanelWidth(chatPanelWidth, safeViewportWidth);
  const desiredEditorPanelWidth = clampEditorPanelWidth(editorPanelWidth);

  if (safeViewportWidth < DESKTOP_PANEL_LAYOUT_MIN_WIDTH) {
    return {
      fileRailWidth: fileRailVisible ? desiredFileRailWidth : FILE_RAIL_BAR_WIDTH,
      chatPanelWidth: desiredChatPanelWidth,
      editorPanelWidth: Math.min(desiredEditorPanelWidth, safeViewportWidth),
      scoreWorkspaceWidth: safeViewportWidth,
      overlaySidePanels: fileRailVisible || chatPanelVisible,
    };
  }

  const visibleSidePanelMinimum = (
    (fileRailVisible ? MIN_FILE_RAIL_WIDTH : FILE_RAIL_BAR_WIDTH)
    + (chatPanelVisible ? MIN_CHAT_PANEL_WIDTH : 0)
  );
  const visibleEditorMinimum = editorPanelVisible ? MIN_EDITOR_PANEL_WIDTH : 0;
  const visiblePanelCount = 1 + Number(chatPanelVisible) + Number(editorPanelVisible);
  const minimumInlineWidth = (
    MIN_SCORE_WORKSPACE_WIDTH
    + visibleSidePanelMinimum
    + visibleEditorMinimum
    + dividerAllowance(visiblePanelCount)
  );
  const overlaySidePanels = (fileRailVisible || chatPanelVisible)
    && safeViewportWidth < minimumInlineWidth;

  const panelDefinitions = [
    {
      key: 'fileRailWidth' as const,
      visible: !overlaySidePanels,
      minimum: fileRailVisible ? MIN_FILE_RAIL_WIDTH : FILE_RAIL_BAR_WIDTH,
      desired: fileRailVisible ? desiredFileRailWidth : FILE_RAIL_BAR_WIDTH,
    },
    {
      key: 'chatPanelWidth' as const,
      visible: chatPanelVisible && !overlaySidePanels,
      minimum: MIN_CHAT_PANEL_WIDTH,
      desired: desiredChatPanelWidth,
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
    chatPanelWidth: desiredChatPanelWidth,
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
    overlaySidePanels,
  };
};
