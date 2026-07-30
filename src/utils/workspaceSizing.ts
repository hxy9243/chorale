export const MIN_CHAT_PANEL_WIDTH = 280;
export const CHAT_PANEL_WIDTH_FRACTION = 1 / 3;

export const maximumChatPanelWidth = (viewportWidth: number) => (
  Math.max(MIN_CHAT_PANEL_WIDTH, Math.floor(viewportWidth * CHAT_PANEL_WIDTH_FRACTION))
);

export const clampChatPanelWidth = (width: number, viewportWidth: number) => (
  Math.max(MIN_CHAT_PANEL_WIDTH, Math.min(maximumChatPanelWidth(viewportWidth), width))
);
