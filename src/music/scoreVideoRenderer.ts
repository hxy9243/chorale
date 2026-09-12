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
    const { width } = this.options;
    const { metadata } = this.options;
    const paddingX = Math.round(width * 0.05);
    const topY = Math.round(this.options.height * 0.05);

    ctx.save();
    // Title
    ctx.fillStyle = this.palette.textSecondary;
    ctx.font = `600 ${Math.max(16, Math.round(width * 0.016))}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(metadata.title, paddingX, topY);

    // Subtitle / Composer right-aligned
    if (metadata.composer) {
      ctx.fillStyle = this.palette.textMuted;
      ctx.font = `400 ${Math.max(14, Math.round(width * 0.013))}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(metadata.composer, width - paddingX, topY);
    }

    // Active Measure Tag (if in score phase)
    if (frameState.scoreState) {
      const measureText = `Measure ${frameState.scoreState.measureNumber}`;
      ctx.fillStyle = this.palette.accent;
      ctx.font = `500 ${Math.max(14, Math.round(width * 0.013))}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(measureText, width / 2, topY);
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

  private drawIntroCard(ctx: CanvasRenderingContext2D, frameState: ScoreVideoFrameState): void {
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
      ctx.fillText(badges.join('   •   '), cx, cy + cardH * 0.08);
    }

    // Animated Count-in Dots
    if (frameState.introState && frameState.introState.countInTotalBeats > 0) {
      const { countInBeat, countInTotalBeats, beatFraction } = frameState.introState;
      const dotSpacing = 36;
      const totalDotsWidth = (countInTotalBeats - 1) * dotSpacing;
      const dotsStartX = cx - totalDotsWidth / 2;
      const dotsY = cy + cardH * 0.28;

      for (let i = 1; i <= countInTotalBeats; i++) {
        const dotX = dotsStartX + (i - 1) * dotSpacing;
        const isActive = i <= countInBeat;
        const isCurrent = i === countInBeat;

        ctx.beginPath();
        const baseRadius = 7;
        const radius = isCurrent ? baseRadius + Math.sin(beatFraction * Math.PI) * 3 : baseRadius;
        ctx.arc(dotX, dotsY, radius, 0, Math.PI * 2);

        if (isActive) {
          ctx.fillStyle = this.palette.dotActive;
          ctx.fill();

          if (isCurrent) {
            ctx.strokeStyle = this.palette.cursorGlow;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(dotX, dotsY, radius + 4, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = this.palette.dotInactive;
          ctx.fill();
        }
      }
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

    const { width, height } = this.options;
    const scoreAreaTop = Math.round(height * 0.12);
    const scoreAreaBottom = Math.round(height * 0.88);
    const scoreAreaHeight = scoreAreaBottom - scoreAreaTop;
    const slotHeight = scoreAreaHeight / 2;
    const paddingX = Math.round(width * 0.05);
    const targetWidth = width - paddingX * 2;

    const activeSys = systems.find((s) => s.systemIndex === scoreState.activeSystemIndex) || systems[0];
    const nextSys = scoreState.nextSystemIndex !== null
      ? systems.find((s) => s.systemIndex === scoreState.nextSystemIndex)
      : null;

    // Slot 1: Active System (Top Line)
    this.renderSystemSlot(
      ctx,
      activeSys,
      paddingX,
      scoreAreaTop,
      targetWidth,
      slotHeight,
      true,
      scoreState.cursorX,
      'Active Line',
    );

    // Slot 2: Next System Lookahead (Bottom Line)
    if (nextSys) {
      this.renderSystemSlot(
        ctx,
        nextSys,
        paddingX,
        scoreAreaTop + slotHeight,
        targetWidth,
        slotHeight,
        false,
        null,
        'Next Line',
      );
    }
  }

  private renderSystemSlot(
    ctx: CanvasRenderingContext2D,
    system: RenderableSystem,
    x: number,
    y: number,
    width: number,
    height: number,
    isActive: boolean,
    cursorX: number | null,
    label: string,
  ): void {
    ctx.save();

    // Slot Frame / Container background
    const slotPadding = 12;
    const innerX = x + slotPadding;
    const innerY = y + slotPadding;
    const innerW = width - slotPadding * 2;
    const innerH = height - slotPadding * 2;

    ctx.fillStyle = this.palette.cardBg;
    ctx.strokeStyle = isActive ? this.palette.accent : this.palette.border;
    ctx.lineWidth = isActive ? 1.5 : 1;
    ctx.beginPath();
    ctx.roundRect(innerX, innerY, innerW, innerH, 16);
    ctx.fill();
    ctx.stroke();

    // Slot Tag (Active vs Lookahead)
    ctx.fillStyle = isActive ? this.palette.accent : this.palette.textMuted;
    ctx.font = `600 ${Math.max(11, Math.round(this.options.width * 0.01))}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${label} (mm. ${system.bbox.minMeasure}–${system.bbox.maxMeasure})`, innerX + 16, innerY + 12);

    // Draw System Image
    if (system.image && system.bbox.width > 0 && system.bbox.height > 0) {
      const scale = Math.min(
        (innerW - 32) / system.bbox.width,
        (innerH - 40) / system.bbox.height,
      );
      const drawW = system.bbox.width * scale;
      const drawH = system.bbox.height * scale;
      const drawX = innerX + (innerW - drawW) / 2;
      const drawY = innerY + 30 + (innerH - 40 - drawH) / 2;

      ctx.globalAlpha = isActive ? 1.0 : 0.75;
      ctx.drawImage(system.image, drawX, drawY, drawW, drawH);

      // Draw Animated Cursor on Active System
      if (isActive && cursorX !== null) {
        const cursorRatio = Math.max(
          0,
          Math.min(1, (cursorX - system.bbox.left) / Math.max(1, system.bbox.width)),
        );
        const actualCursorX = drawX + cursorRatio * drawW;

        // Glowing Line
        ctx.save();
        ctx.strokeStyle = this.palette.cursorGlow;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(actualCursorX, drawY - 4);
        ctx.lineTo(actualCursorX, drawY + drawH + 4);
        ctx.stroke();

        ctx.strokeStyle = this.palette.cursor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(actualCursorX, drawY - 4);
        ctx.lineTo(actualCursorX, drawY + drawH + 4);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }
}
