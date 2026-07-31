export const MIN_FILE_RAIL_WIDTH = 240;
export const MAX_FILE_RAIL_WIDTH = 560;
export const DEFAULT_FILE_RAIL_WIDTH_FRACTION = 1 / 4;
export const MIN_CHAT_PANEL_WIDTH = 280;
export const CHAT_PANEL_WIDTH_FRACTION = 1 / 3;

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
