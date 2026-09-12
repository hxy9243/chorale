/**
 * Canvas video frame rendering engine for sheet music videos.
 * Renders intro title card, two-line lookahead score view with glowing cursor,
 * measure highlights, count-in indicators, and outro card.
 */

import type { ScoreVideoFrameState, ScoreSystemBBox } from './scoreVideoTimeline';

export type ScoreVideoTheme = 'dark' | 'warm';
export type ScoreVideoAspectRatio = '16:9' | '9:16';

export interface ScoreVideoMetadata {
  title: string;
  subtitle?: string;
  composer?: string;
  key?: string;
  meter?: string;
  tempoBpm?: number;
}

export interface ScoreVideoRenderOptions {
  width: number;
  height: number;
  theme: ScoreVideoTheme;
  aspectRatio: ScoreVideoAspectRatio;
  metadata: ScoreVideoMetadata;
}

export interface RenderableSystem {
  systemIndex: number;
  bbox: ScoreSystemBBox;
  image?: CanvasImageSource | null;
}

export interface Palette {
  bg: string;
  bgGradEnd: string;
  cardBg: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  cursor: string;
  cursorGlow: string;
  measureHighlight: string;
  dotInactive: string;
  dotActive: string;
}

export const PALETTES: Record<ScoreVideoTheme, Palette> = {
  dark: {
    bg: '#0f1115',
    bgGradEnd: '#161922',
    cardBg: 'rgba(26, 29, 38, 0.85)',
    border: 'rgba(255, 255, 255, 0.1)',
    textPrimary: '#f8fafc',
    textSecondary: '#cbd5e1',
    textMuted: '#64748b',
    accent: '#38bdf8',
    cursor: '#38bdf8',
    cursorGlow: 'rgba(56, 189, 248, 0.45)',
    measureHighlight: 'rgba(56, 189, 248, 0.12)',
    dotInactive: 'rgba(255, 255, 255, 0.2)',
    dotActive: '#38bdf8',
  },
  warm: {
    bg: '#fcfbf7',
    bgGradEnd: '#f4efe4',
    cardBg: 'rgba(255, 255, 255, 0.88)',
    border: 'rgba(70, 60, 45, 0.12)',
    textPrimary: '#1c1917',
    textSecondary: '#57534e',
    textMuted: '#a8a29e',
    accent: '#d97706',
    cursor: '#d97706',
    cursorGlow: 'rgba(217, 119, 6, 0.35)',
    measureHighlight: 'rgba(217, 119, 6, 0.1)',
    dotInactive: 'rgba(120, 113, 108, 0.25)',
    dotActive: '#d97706',
  },
};

const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export class ScoreVideoRenderer {
  readonly options: ScoreVideoRenderOptions;
  readonly palette: Palette;

  constructor(options: ScoreVideoRenderOptions) {
    this.options = options;
    this.palette = PALETTES[options.theme] || PALETTES.dark;
  }

  renderFrame(
    ctx: CanvasRenderingContext2D,
    frameState: ScoreVideoFrameState,
    systems: RenderableSystem[] = [],
  ): void {
    const { width, height } = this.options;

    // 1. Draw Background
    this.drawBackground(ctx, width, height);

    // 2. Render Phase Specific Content
    switch (frameState.phase) {
      case 'intro':
        this.drawIntroCard(ctx, frameState);
        break;
      case 'score':
        this.drawScoreView(ctx, frameState, systems);
        break;
      case 'outro':
        this.drawOutroCard(ctx, frameState);
        break;
    }

    // 3. Persistent Header and Progress Bar
    this.drawHeader(ctx, frameState);
    this.drawProgressBar(ctx, frameState);
  }

  private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, this.palette.bg);
    grad.addColorStop(1, this.palette.bgGradEnd);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle ambient pattern / glow
    const cx = width / 2;
    const cy = height / 2;
    const radGrad = ctx.createRadialGradient(cx, cy, 50, cx, cy, Math.max(width, height) * 0.7);
    radGrad.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, width, height);
  }

  private drawHeader(ctx: CanvasRenderingContext2D, frameState: ScoreVideoFrameState): void {
    const { width, height, metadata, aspectRatio } = this.options;
    const isPortrait = aspectRatio === '9:16';
    const paddingX = Math.round(width * 0.05);
    const topY = Math.round(height * (isPortrait ? 0.038 : 0.05));

    ctx.save();

    const getTextWidth = (text: string): number => {
      if (typeof ctx.measureText === 'function') {
        const measured = ctx.measureText(text);
        if (measured && typeof measured.width === 'number') {
          return measured.width;
        }
      }
      return text.length * 8;
    };

    // Determine font sizes
    const titleFontSize = Math.max(16, Math.round(width * (isPortrait ? 0.026 : 0.016)));
    const titleFont = `600 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.font = titleFont;

    // Subtitle / Composer right-aligned
    let composerWidth = 0;
    if (metadata.composer) {
      const composerFontSize = Math.max(13, Math.round(width * (isPortrait ? 0.022 : 0.013)));
      ctx.font = `400 ${composerFontSize}px system-ui, -apple-system, sans-serif`;
      composerWidth = getTextWidth(metadata.composer);
      ctx.fillStyle = this.palette.textMuted;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(metadata.composer, width - paddingX, topY);
    }

    // Title (left-aligned, truncated if necessary to avoid colliding with composer)
    ctx.font = titleFont;
    const availableTitleWidth = width - paddingX * 2 - (composerWidth > 0 ? composerWidth + 24 : 0);
    let displayTitle = metadata.title;
    if (getTextWidth(displayTitle) > availableTitleWidth) {
      while (displayTitle.length > 3 && getTextWidth(displayTitle + '…') > availableTitleWidth) {
        displayTitle = displayTitle.slice(0, -1);
      }
      displayTitle += '…';
    }
    ctx.fillStyle = this.palette.textSecondary;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(displayTitle, paddingX, topY);

    // Active Measure Tag (if in score phase)
    if (frameState.scoreState) {
      const measureText = `Measure ${frameState.scoreState.measureNumber}`;
      const measureFontSize = Math.max(12, Math.round(width * (isPortrait ? 0.022 : 0.013)));
      ctx.font = `500 ${measureFontSize}px monospace`;

      if (isPortrait) {
        // In portrait mode: dedicate a second line with a clean pill badge to avoid horizontal conflict
        const textWidth = getTextWidth(measureText);
        const badgeW = textWidth + 24;
        const badgeH = measureFontSize + 10;
        const badgeX = (width - badgeW) / 2;
        const badgeY = topY + titleFontSize + 12;

        ctx.fillStyle = this.palette.cardBg;
        ctx.strokeStyle = this.palette.border;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = this.palette.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(measureText, width / 2, badgeY + badgeH / 2);
      } else {
        // In landscape mode: center-aligned on header row
        ctx.fillStyle = this.palette.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(measureText, width / 2, topY);
      }
    }

    ctx.restore();
  }

  private drawProgressBar(ctx: CanvasRenderingContext2D, frameState: ScoreVideoFrameState): void {
    const { width, height } = this.options;
    const paddingX = Math.round(width * 0.05);
    const barY = height - Math.round(height * 0.06);
    const barWidth = width - paddingX * 2;
    const barHeight = Math.max(4, Math.round(height * 0.008));

    ctx.save();
    // Track background
    ctx.fillStyle = this.palette.border;
    ctx.beginPath();
    ctx.roundRect(paddingX, barY, barWidth, barHeight, barHeight / 2);
    ctx.fill();

    // Active progress
    const progressWidth = Math.max(barHeight, barWidth * frameState.progress);
    ctx.fillStyle = this.palette.accent;
    ctx.beginPath();
    ctx.roundRect(paddingX, barY, progressWidth, barHeight, barHeight / 2);
    ctx.fill();

    // Time text below or above bar
    const timeStr = `${formatTime(frameState.timestampSec)} / ${formatTime(frameState.totalDurationSec)}`;
    ctx.fillStyle = this.palette.textMuted;
    ctx.font = `500 ${Math.max(12, Math.round(width * 0.011))}px monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(timeStr, width - paddingX, barY - 8);
    ctx.restore();
  }

  private drawIntroCard(ctx: CanvasRenderingContext2D, _frameState: ScoreVideoFrameState): void {
    const { width, height, metadata } = this.options;
    const cx = width / 2;
    const cy = height / 2;

    ctx.save();

    // Card Container
    const cardW = Math.min(width * 0.85, 900);
    const cardH = Math.min(height * 0.55, 520);
    const cardX = cx - cardW / 2;
    const cardY = cy - cardH / 2;

    ctx.fillStyle = this.palette.cardBg;
    ctx.strokeStyle = this.palette.border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 24);
    ctx.fill();
    ctx.stroke();

    // Big Title
    ctx.fillStyle = this.palette.textPrimary;
    ctx.font = `bold ${Math.max(28, Math.round(width * 0.038))}px 'Instrument Serif', Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(metadata.title, cx, cy - cardH * 0.22);

    // Composer & Details
    if (metadata.composer) {
      ctx.fillStyle = this.palette.textSecondary;
      ctx.font = `italic 500 ${Math.max(16, Math.round(width * 0.018))}px Georgia, serif`;
      ctx.fillText(metadata.composer, cx, cy - cardH * 0.06);
    }

    // Metadata Badges (Key, Meter, Tempo)
    const badges: string[] = [];
    if (metadata.key) badges.push(`Key: ${metadata.key}`);
    if (metadata.meter) badges.push(`Meter: ${metadata.meter}`);
    if (metadata.tempoBpm) badges.push(`♩ = ${metadata.tempoBpm}`);

    if (badges.length > 0) {
      ctx.fillStyle = this.palette.textMuted;
      ctx.font = `500 ${Math.max(13, Math.round(width * 0.013))}px monospace`;
      ctx.fillText(badges.join('   •   '), cx, cy + cardH * 0.12);
    }

    ctx.restore();
  }

  private drawOutroCard(ctx: CanvasRenderingContext2D, frameState: ScoreVideoFrameState): void {
    const { width, height, metadata } = this.options;
    const cx = width / 2;
    const cy = height / 2;
    const fade = frameState.outroState ? frameState.outroState.fadeProgress : 1;

    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0.1, fade));

    // Card Container
    const cardW = Math.min(width * 0.8, 800);
    const cardH = Math.min(height * 0.45, 400);
    const cardX = cx - cardW / 2;
    const cardY = cy - cardH / 2;

    ctx.fillStyle = this.palette.cardBg;
    ctx.strokeStyle = this.palette.border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = this.palette.textPrimary;
    ctx.font = `bold ${Math.max(26, Math.round(width * 0.032))}px 'Instrument Serif', Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(metadata.title, cx, cy - 30);

    ctx.fillStyle = this.palette.textSecondary;
    ctx.font = `italic ${Math.max(16, Math.round(width * 0.016))}px Georgia, serif`;
    ctx.fillText(metadata.composer ? `Composed by ${metadata.composer}` : 'Fine', cx, cy + 15);

    ctx.fillStyle = this.palette.textMuted;
    ctx.font = `500 ${Math.max(12, Math.round(width * 0.012))}px system-ui, sans-serif`;
    ctx.fillText('Engraved with Chorale', cx, cy + 60);

    ctx.restore();
  }

  private drawScoreView(
    ctx: CanvasRenderingContext2D,
    frameState: ScoreVideoFrameState,
    systems: RenderableSystem[],
  ): void {
    const scoreState = frameState.scoreState;
    if (!scoreState || systems.length === 0) return;

    const { width, height, aspectRatio } = this.options;
    const isPortrait = aspectRatio === '9:16';
    const sheetPaddingX = Math.round(width * 0.05);
    const sheetWidth = width - sheetPaddingX * 2;

    const topLineIndex = typeof scoreState.topLineSystemIndex === 'number'
      ? scoreState.topLineSystemIndex
      : (typeof scoreState.activeSystemIndex === 'number' ? Math.floor(scoreState.activeSystemIndex / 2) * 2 : 0);

    const bottomLineIndex = scoreState.bottomLineSystemIndex !== undefined
      ? scoreState.bottomLineSystemIndex
      : (scoreState.nextSystemIndex !== undefined ? scoreState.nextSystemIndex : (topLineIndex + 1));

    const topSys = systems.find((s) => s.systemIndex === topLineIndex) || systems[0];
    const bottomSys = bottomLineIndex !== null
      ? systems.find((s) => s.systemIndex === bottomLineIndex)
      : null;

    const isTopActive = scoreState.activeSystemIndex === topLineIndex;
    const isBottomActive = bottomLineIndex !== null && scoreState.activeSystemIndex === bottomLineIndex;

    // Use global maximum system dimensions across all score systems so clefs, staff lines,
    // and overall scale remain completely invariant across screen transitions.
    const globalMaxBboxHeight = Math.max(...systems.map((s) => s.bbox.height), 1);
    const globalSystemWidth = Math.max(...systems.map((s) => s.bbox.width), 1);

    let sheetTop: number;
    let sheetHeight: number;
    let topSlotY: number;
    let topSlotHeight: number;
    let bottomSlotY: number;
    let bottomSlotHeight: number;
    let sharedScale: number;
    let drawW: number;
    let drawX: number;

    if (isPortrait) {
      // In portrait mode, staves are placed close together with a natural musical system gap,
      // and the sheet card frames them with balanced vertical padding centered in the screen.
      const innerPaddingX = Math.max(16, Math.round(sheetWidth * 0.035));
      const usableWidth = sheetWidth - innerPaddingX * 2;
      sharedScale = usableWidth / globalSystemWidth;
      drawW = globalSystemWidth * sharedScale;
      drawX = sheetPaddingX + innerPaddingX + (usableWidth - drawW) / 2;

      const slotH = globalMaxBboxHeight * sharedScale;
      const staffGap = Math.max(24, Math.round(slotH * 0.38));
      const innerPaddingY = Math.max(28, Math.round(sheetWidth * 0.055));
      const totalContentHeight = slotH + (bottomSys ? staffGap + slotH : 0);
      sheetHeight = Math.round(totalContentHeight + innerPaddingY * 2);

      const centerY = Math.round((height * 0.12 + height * 0.91) / 2);
      sheetTop = Math.round(centerY - sheetHeight / 2);

      topSlotY = sheetTop + innerPaddingY;
      topSlotHeight = slotH;
      bottomSlotY = topSlotY + slotH + staffGap;
      bottomSlotHeight = slotH;
    } else {
      // In landscape mode, staves fill upper and lower halves of the wide widescreen sheet
      sheetTop = Math.round(height * 0.11);
      const sheetBottom = Math.round(height * 0.89);
      sheetHeight = sheetBottom - sheetTop;

      const innerPadding = Math.round(sheetHeight * 0.035);
      const usableWidth = sheetWidth - innerPadding * 2;
      const usableHeight = sheetHeight - innerPadding * 2;
      const lineHeight = usableHeight / 2;

      sharedScale = Math.min(
        usableWidth / globalSystemWidth,
        (lineHeight - 12) / globalMaxBboxHeight,
      );
      drawW = globalSystemWidth * sharedScale;
      drawX = sheetPaddingX + innerPadding + (usableWidth - drawW) / 2;

      topSlotY = sheetTop + innerPadding;
      topSlotHeight = lineHeight;
      bottomSlotY = sheetTop + innerPadding + lineHeight;
      bottomSlotHeight = lineHeight;
    }

    ctx.save();

    // Unified Sheet Card
    ctx.fillStyle = this.palette.cardBg;
    ctx.strokeStyle = this.palette.border;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(sheetPaddingX, sheetTop, sheetWidth, sheetHeight, 20);
    ctx.fill();
    ctx.stroke();

    // Line 1: Top Line
    this.renderSheetLine(
      ctx,
      topSys,
      drawX,
      topSlotY,
      drawW,
      topSlotHeight,
      sharedScale,
      isTopActive,
      isTopActive ? scoreState.cursorX : null,
    );

    // Line 2: Bottom Line (Aligned together in the same sheet with identical width)
    if (bottomSys) {
      this.renderSheetLine(
        ctx,
        bottomSys,
        drawX,
        bottomSlotY,
        drawW,
        bottomSlotHeight,
        sharedScale,
        isBottomActive,
        isBottomActive ? scoreState.cursorX : null,
      );
    }

    ctx.restore();
  }

  private renderSheetLine(
    ctx: CanvasRenderingContext2D,
    system: RenderableSystem,
    drawX: number,
    slotY: number,
    drawW: number,
    slotHeight: number,
    scale: number,
    isActive: boolean,
    cursorX: number | null,
  ): void {
    if (!system.image || system.bbox.width <= 0 || system.bbox.height <= 0) return;

    ctx.save();

    const drawH = system.bbox.height * scale;
    const drawY = slotY + (slotHeight - drawH) / 2;

    ctx.drawImage(system.image, drawX, drawY, drawW, drawH);

    // Draw Animated Cursor on the actively playing line
    if (isActive && cursorX !== null) {
      const cursorRatio = Math.max(
        0,
        Math.min(1, (cursorX - system.bbox.left) / Math.max(1, system.bbox.width)),
      );
      const actualCursorX = drawX + cursorRatio * drawW;

      // Cursor Glow
      ctx.save();
      ctx.strokeStyle = this.palette.cursorGlow;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(actualCursorX, drawY - 4);
      ctx.lineTo(actualCursorX, drawY + drawH + 4);
      ctx.stroke();

      // Sharp Cursor Line
      ctx.strokeStyle = this.palette.cursor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(actualCursorX, drawY - 4);
      ctx.lineTo(actualCursorX, drawY + drawH + 4);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
