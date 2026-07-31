import { describe, expect, it } from 'vitest';
import {
  clampChatPanelWidth,
  clampFileRailWidth,
  defaultFileRailWidth,
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
