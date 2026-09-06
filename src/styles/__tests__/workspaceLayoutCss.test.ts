import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const responsiveCss = readFileSync(
  resolve(process.cwd(), 'src/styles/workspace-responsive.css'),
  'utf8',
);

const tokensCss = readFileSync(
  resolve(process.cwd(), 'tokens.css'),
  'utf8',
);

const themeCss = readFileSync(
  resolve(process.cwd(), 'src/chorale-theme.css'),
  'utf8',
);

const controlsCss = readFileSync(
  resolve(process.cwd(), 'src/styles/controls.css'),
  'utf8',
);

describe('workspace layout CSS contract', () => {
  it('lets the visible right panel shrink inside the workspace grid row', () => {
    expect(responsiveCss).toMatch(
      /\.workspace-body\s*>\s*\.right-panel\s*{[^}]*min-height:\s*0;/s,
    );
  });

  it('lets chat-panel-stack shrink and fill flex container', () => {
    expect(responsiveCss).toMatch(
      /\.workspace-body\s+\.chat-panel-stack\s*{[^}]*min-height:\s*0;[^}]*flex:\s*1\s+1\s+auto;/s,
    );
  });

  it('keeps score-display-options below modal backdrop in stacking scale', () => {
    const zRaisedMatch = tokensCss.match(/--z-raised:\s*(\d+);/);
    const zModalMatch = tokensCss.match(/--z-modal:\s*(\d+);/);
    expect(zRaisedMatch).not.toBeNull();
    expect(zModalMatch).not.toBeNull();
    const zRaised = Number.parseInt(zRaisedMatch![1], 10);
    const zModal = Number.parseInt(zModalMatch![1], 10);
    expect(zRaised).toBeLessThan(zModal);

    // Score display options must use --z-raised and not --z-tooltip
    expect(themeCss).not.toMatch(
      /\.workspace-pane\.score-pane\s+\.score-display-options\s*{[^}]*z-index:\s*var\(--z-tooltip\)/s,
    );
  });

  it('preserves fade-away behavior for score display options without hardcoded opacity override', () => {
    expect(themeCss).not.toMatch(
      /\.workspace-pane\.score-pane\s+\.score-display-options\s*{[^}]*opacity:/s,
    );
  });

  it('limits playback dock to 66% width and uses warm dark grey palette matching the display', () => {
    // Dock card must be constrained to 66% width
    expect(themeCss).toMatch(
      /\.central-workspace\s*>\s*\.playback-dock-container\s+\.audio-player-card\s*{[^}]*width:\s*66%\s*!important;[^}]*max-width:\s*66%\s*!important;/s,
    );

    // Dock card must use warm dark grey rather than jet-black, white, flat gray, or blue
    expect(themeCss).not.toMatch(
      /\.central-workspace\s*>\s*\.playback-dock-container\s+\.audio-player-card\s*{[^}]*background:\s*#24221d/s,
    );
    expect(themeCss).not.toMatch(
      /\.central-workspace\s*>\s*\.playback-dock-container\s+\.audio-player-card\s*{[^}]*background:\s*var\(--surface-raised,\s*#fffdfa\)/s,
    );
    expect(themeCss).not.toMatch(
      /\.central-workspace\s*>\s*\.playback-dock-container\s+\.audio-player-card\s*{[^}]*background:\s*var\(--context-blue/s,
    );
    expect(themeCss).toMatch(
      /\.central-workspace\s*>\s*\.playback-dock-container\s+\.audio-player-card\s*{[^}]*background:\s*#52504a\s*!important;/s,
    );
  });

  it('renders score creation actions as vertically stacked text rows with underlines across full width', () => {
    // Both theme and controls enforce flex column (vertically stacked)
    expect(controlsCss).toMatch(
      /\.file-create-actions\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s,
    );
    expect(themeCss).toMatch(
      /\.file-create-actions\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s,
    );

    // Enforce full width, underlines (border-bottom), and no square button appearance (border-radius: 0)
    expect(controlsCss).toMatch(
      /\.file-create-actions\s+\.import-btn\s*{[^}]*width:\s*100%;[^}]*border-bottom:\s*1px\s+solid\s+var\(--border-subtle\)[^}]*border-radius:\s*0/s,
    );
    expect(themeCss).toMatch(
      /\.file-create-actions\s+\.import-btn\s*{[^}]*width:\s*100%;[^}]*border-bottom:\s*1px\s+solid[^}]*border-radius:\s*0/s,
    );
  });

  it('keeps file rail resize handle invisible unless hovered and preserves clean sidebar edge', () => {
    // file-rail-resize-handle::after grip is NOT disabled with display: none
    expect(themeCss).not.toMatch(
      /\.file-rail-resize-handle::after\s*{[^}]*display:\s*none\s*!important/s,
    );

    // file-rail-resize-handle hover keeps transparent background rather than a solid fill
    expect(themeCss).toMatch(
      /\.file-rail-resize-handle:hover,\s*\.file-rail-resize-handle:active\s*{[^}]*background:\s*transparent\s*!important;/s,
    );

    // controls.css also keeps transparent background on hover
    expect(controlsCss).toMatch(
      /\.file-rail-resize-handle:hover,\s*\.file-rail-resize-handle:active\s*{[^}]*background:\s*transparent\s*!important;/s,
    );

    // file-rail maintains clean edge with zero borders conflicting with the paper shadow
    expect(themeCss).toMatch(
      /\.file-rail\s*{[^}]*border:\s*0;[^}]*border-right:\s*0;[^}]*border-inline-end:\s*0;/s,
    );
  });

  it('keeps left sidebar edge clean with no right-side shadow or white slivers next to scroller', () => {
    // .file-rail sets box-shadow: none !important
    expect(themeCss).toMatch(
      /\.file-rail\s*{[^}]*box-shadow:\s*none\s*!important;/s,
    );

    // .file-rail-panel-stack sets box-shadow: none !important
    expect(controlsCss).toMatch(
      /\.file-rail-panel-stack\s*{[^}]*box-shadow:\s*none\s*!important;/s,
    );

    // tokens.css defines --shadow-sidebar as none
    expect(tokensCss).toMatch(/--shadow-sidebar:\s*none;/);

    // Ensure no hard white sliver (#efebe2) shadow is applied to the rail or panel stack
    expect(themeCss).not.toMatch(/\.file-rail\s*{[^}]*#efebe2/s);
    expect(controlsCss).not.toMatch(/\.file-rail-panel-stack\s*{[^}]*#efebe2/s);
  });
});
