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

const recitalCss = readFileSync(resolve(process.cwd(), 'src/styles/recital.css'), 'utf8');

const controlsCss = readFileSync(
  resolve(process.cwd(), 'src/styles/controls.css'),
  'utf8',
);

describe('workspace layout CSS contract', () => {
  it('bounds the workspace row and the shared chat panel to allow transcript scrolling', () => {
    expect(responsiveCss).toMatch(/\.workspace-body\s*{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\);/s);
    expect(responsiveCss).toMatch(/\.file-rail-chat-panel\s*{[^}]*min-height:\s*0;[^}]*height:\s*100%;/s);
    expect(responsiveCss).toMatch(/\.file-rail-chat-panel\[hidden\]\s*{[^}]*display:\s*none;/s);
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

  it('keeps sticky headers below modal backdrop in stacking scale', () => {
    const zStickyMatch = tokensCss.match(/--z-sticky:\s*(\d+);/);
    const zModalMatch = tokensCss.match(/--z-modal:\s*(\d+);/);
    expect(zStickyMatch).not.toBeNull();
    expect(zModalMatch).not.toBeNull();
    const zSticky = Number.parseInt(zStickyMatch![1], 10);
    const zModal = Number.parseInt(zModalMatch![1], 10);
    expect(zSticky).toBeLessThan(zModal);
  });

  it('preserves fade-away behavior for score display options without hardcoded opacity override', () => {
    expect(themeCss).not.toMatch(
      /\.workspace-pane\.score-pane\s+\.score-display-options\s*{[^}]*opacity:/s,
    );
  });

  it('bounds the dock width and binds its dark surface to Recital roles', () => {
    expect(themeCss).toMatch(/width:\s*min\(100%, 760px\)\s*!important;/);
    expect(recitalCss).toMatch(/background:\s*var\(--surface-dock\)/);
    expect(recitalCss).toMatch(/color:\s*var\(--frame-text\)/);
    expect(recitalCss).toMatch(/background:\s*var\(--frame-sound\)/);
  });

  it('keeps the playback controls in a named grid at narrow widths', () => {
    expect(themeCss).toMatch(
      /@media\s*\(max-width:\s*44rem\)\s*{[\s\S]*?\.central-workspace\s*>\s*\.playback-dock-container\s+\.player-controls-bar\s*{[^}]*grid-template-areas:[^}]*transport\s+progress\s+status[^}]*volume\s+volume/s,
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

  it('keeps an invisible sidebar resize target until hover without duplicate visual overrides', () => {
    const css = controlsCss + '\n' + themeCss;
    expect(css).not.toMatch(/\.file-rail-resize-handle::after\s*{[^}]*display:\s*none/s);
    expect(css).toMatch(/\.file-rail-resize-handle:hover,\s*\.file-rail-resize-handle:active\s*{[^}]*background:\s*transparent\s*;/s);
    expect(themeCss).toMatch(/\.file-rail-resize-handle\s*{[^}]*width:\s*14px/s);
  });

  it('uses the shared flat sidebar surface without obsolete paper-edge shadows', () => {
    expect(tokensCss).toMatch(/--shadow-sidebar:\s*none;/);
    expect(themeCss).toMatch(/\.file-rail\s*{[^}]*box-shadow:\s*none;/s);
    expect(themeCss + controlsCss).not.toMatch(/#efebe2/i);
  });

  it('orders playback dock media queries so narrow viewports are not shadowed by wider rules', () => {
    const idx60rem = themeCss.indexOf('@media (max-width: 60rem)');
    const idx44rem = themeCss.indexOf('@media (max-width: 44rem)');
    expect(idx60rem).toBeGreaterThan(-1);
    expect(idx44rem).toBeGreaterThan(-1);
    expect(idx60rem).toBeLessThan(idx44rem);
  });

  it('preserves transport button width with max-content in playback controls grid', () => {
    expect(themeCss).toMatch(
      /\.central-workspace\s*>\s*\.playback-dock-container\s+\.player-controls-bar\s*{[^}]*grid-template-columns:\s*max-content/s,
    );
  });

  it('keeps file rail in-flow as an inline grid column and never positions it absolutely over the score', () => {
    expect(responsiveCss).not.toMatch(
      /\.file-rail\s*{[^}]*position:\s*absolute;/s,
    );
    expect(responsiveCss).not.toMatch(
      /\.workspace-body\.side-panels-overlay[^{]*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*!important;/s,
    );
    expect(themeCss).not.toMatch(
      /^\.file-rail\s*{[^}]*position:\s*absolute;/m,
    );
  });

  it('keeps horizontal score-editor-shell side-by-side without hiding the divider at low widths', () => {
    // Responsive rules cannot override an explicitly selected vertical layout.
    expect(responsiveCss).toMatch(
      /\.score-editor-shell\.layout-horizontal\s*{[^}]*flex-direction:\s*row\s*!important;[^}]*flex-wrap:\s*nowrap\s*!important;/s,
    );
    expect(responsiveCss).toMatch(
      /\.editor-divider\s*{[^}]*display:\s*flex\s*!important;/s,
    );

    // Legacy overrides in index.css must not collapse or hide editor
    const indexCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    expect(indexCss).not.toMatch(/\.score-editor-shell\s*{[^}]*flex-direction:\s*column;/s);
    expect(indexCss).not.toMatch(/\.editor-divider\s*{[^}]*display:\s*none;/s);
  });

  it('applies horizontal width caps only to horizontal panes', () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="score-editor-shell layout-vertical"><section class="workspace-pane editor-pane"></section></div>';
    const editor = host.querySelector('.editor-pane')!;
    const cappedRules = [...responsiveCss.matchAll(/([^{}]+)\{[^}]*max-width:\s*calc\(100% - 154px\)[^}]*\}/g)];
    expect(cappedRules).toHaveLength(1);
    expect(editor.matches(cappedRules[0][1].trim())).toBe(false);
    host.firstElementChild!.classList.replace('layout-vertical', 'layout-horizontal');
    expect(editor.matches(cappedRules[0][1].trim())).toBe(true);
    expect(themeCss).toMatch(/\.score-editor-shell\.layout-vertical \.workspace-pane\.editor-pane\s*{[^}]*width:\s*100%\s*!important;[^}]*max-width:\s*100%\s*!important;/s);
  });

  it('keeps minimum-size panes reachable when a vertical workspace is too short', () => {
    expect(responsiveCss).toMatch(/\.score-editor-shell\.layout-vertical\s*{[^}]*overflow-y:\s*auto;/s);
  });

  it('uses a deep charcoal outer siderail, single-row 6-slot transport grid, and top-aligned measure source timeline', () => {
    const waterfallCss = readFileSync(resolve(process.cwd(), 'src/styles/waterfall.css'), 'utf8');
    expect(recitalCss).toMatch(/\.file-rail-tabs\s*{[^}]*background:\s*var\(--surface-frame\)/s);
    expect(waterfallCss).toMatch(/grid-template-areas:\s*'transport progress status voices speed volume'\s*!important;/);
    expect(themeCss).toMatch(/\.abc-editor-card\s+\.editor-body\.is-measure-view\s*{[^}]*justify-content:\s*flex-start;/s);
  });

});

