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
});
