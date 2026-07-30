import { describe, expect, it } from 'vitest';
import {
  clampChatPanelWidth,
  maximumChatPanelWidth,
} from '../workspaceSizing';

describe('chat panel sizing', () => {
  it('allows the panel to reach one third of the viewport', () => {
    expect(maximumChatPanelWidth(1_800)).toBe(600);
    expect(clampChatPanelWidth(900, 1_800)).toBe(600);
    expect(clampChatPanelWidth(520, 1_800)).toBe(520);
  });

  it('retains a usable minimum on narrow viewports', () => {
    expect(maximumChatPanelWidth(720)).toBe(280);
    expect(clampChatPanelWidth(100, 720)).toBe(280);
  });
});
