import { indexNoteWindow, noteGeometry, pianoKeys, pitchLabel, visibleNotes, WATERFALL_COLORS } from './waterfallLayout';
import type { WaterfallNote } from './waterfallPlayback';
import { contactSparks, WATERFALL_TAIL_STOPS } from './waterfallVisuals';

export interface WaterfallVideoBounds { x: number; y: number; width: number; height: number }

/** Fits the entire keyboard inside either export orientation, without scrollbars. */
export function waterfallVideoBounds(width: number, height: number): WaterfallVideoBounds {
  return { x: width * 0.05, y: height * 0.14, width: width * 0.9, height: height * 0.72 };
}

const alpha = (color: string, opacity: number) => `${color}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, '0')}`;

/** Canvas counterpart of WaterfallView, sampled only by score time (never wall time). */
export class WaterfallCanvasRenderer {
  private readonly keys;
  private readonly index;
  private readonly keyMap;
  private readonly whiteCount;
  private readonly voices;

  constructor(notes: readonly WaterfallNote[]) {
    this.keys = pianoKeys(notes);
    this.index = indexNoteWindow(notes);
    this.keyMap = new Map(this.keys.map(key => [key.midiPitch, key]));
    this.whiteCount = this.keys.filter(key => !key.black).length;
    this.voices = [...new Set(notes.map(note => note.voice))];
  }

  render(ctx: CanvasRenderingContext2D, time: number, bounds: WaterfallVideoBounds, theme: 'warm' | 'dark'): void {
    const { x, y, width, height } = bounds;
    const scale = Math.min(width, height) / 440;
    const kw = width / this.whiteCount;
    const keyboardHeight = Math.min(84 * scale, height * 0.2);
    const rail = height - keyboardHeight;
    const legendColumns = Math.max(1, Math.floor(width / (68 * scale)));
    const legendHeight = Math.max(25, Math.ceil(this.voices.length / legendColumns) * 18 + 7) * scale;
    const fieldHeight = rail - legendHeight;
    const paper = theme === 'warm' ? '#fffdfa' : '#1a1d26';
    const line = theme === 'warm' ? '#dfddd5' : '#343944';
    const label = theme === 'warm' ? '#67665e' : '#bfc6ce';
    const glint = '#fffdfa';
    const color = (voice: number) => WATERFALL_COLORS[voice % WATERFALL_COLORS.length];
    const roundRect = (left: number, top: number, w: number, h: number, radius: number) => {
      ctx.beginPath(); ctx.roundRect(left, top, w, h, Math.max(0, Math.min(radius, w / 2, h / 2))); ctx.fill();
    };
    const rendered = visibleNotes(this.index, time).flatMap(note => {
      const key = this.keyMap.get(note.midiPitch);
      if (!key) return [];
      const geometry = noteGeometry(note, time, fieldHeight);
      if (geometry.height <= 0) return [];
      const inset = Math.min(scale, key.width * kw * 0.12);
      return [{ note, geometry, left: key.x * kw + inset, width: key.width * kw - inset * 2 }];
    });
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = paper;
    roundRect(0, 0, width, height, 5 * scale);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, legendHeight, width, fieldHeight); ctx.clip();
    ctx.translate(0, legendHeight);
    for (const key of this.keys) if (!key.black) {
      ctx.strokeStyle = alpha(line, 0.65); ctx.lineWidth = 0.5 * scale;
      ctx.beginPath(); ctx.moveTo(key.x * kw, 0); ctx.lineTo(key.x * kw, fieldHeight); ctx.stroke();
    }
    for (const { note, geometry, left, width: noteWidth } of rendered) {
      const gradient = ctx.createLinearGradient(0, geometry.top, 0, geometry.bottom);
      for (const [offset, opacity] of WATERFALL_TAIL_STOPS) gradient.addColorStop(offset, alpha(color(note.voice), opacity));
      ctx.fillStyle = gradient;
      const merging = geometry.bottom >= fieldHeight;
      roundRect(left, geometry.top, noteWidth, geometry.bottom - geometry.top + (merging ? noteWidth : 0), 4 * scale);
      if (!merging && geometry.height >= 4 * scale && noteWidth >= 4 * scale) {
        const r = Math.min(noteWidth / 2, 4 * scale);
        ctx.strokeStyle = alpha(glint, 0.45); ctx.lineWidth = scale; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(left + r, geometry.bottom - 1.2 * scale); ctx.lineTo(left + noteWidth - r, geometry.bottom - 1.2 * scale); ctx.stroke();
      }
    }
    ctx.restore();

    const active = new Map(rendered.filter(({ note }) => note.onsetSeconds <= time).map(({ note }) => [note.midiPitch, note.voice]));
    for (const key of [...this.keys.filter(key => !key.black), ...this.keys.filter(key => key.black)]) {
      const voice = active.get(key.midiPitch);
      const keyHeight = key.black ? keyboardHeight * 0.62 : keyboardHeight;
      ctx.fillStyle = voice !== undefined ? color(voice) : key.black ? '#454540' : '#faf9f5';
      roundRect(key.x * kw, rail, key.width * kw, keyHeight, 2 * scale);
      ctx.strokeStyle = '#b8b6ae'; ctx.lineWidth = 0.6 * scale; ctx.stroke();
      if (key.midiPitch % 12 === 0 && kw >= 12 * scale) {
        ctx.fillStyle = '#66665d'; ctx.font = `${10 * scale}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(pitchLabel(key.midiPitch), (key.x + 0.5) * kw, height - 7 * scale);
      }
    }
    ctx.save(); ctx.beginPath(); ctx.rect(0, legendHeight, width, fieldHeight); ctx.clip();
    for (const { note, left, width: noteWidth } of rendered) {
      const age = time - note.onsetSeconds;
      if (age < 0 || age >= note.durationSeconds) continue;
      const attack = Math.exp(-age * 14);
      const glowHeight = (6 + attack * 3) * scale;
      const glow = ctx.createLinearGradient(0, rail - glowHeight, 0, rail);
      glow.addColorStop(0, alpha(color(note.voice), 0));
      glow.addColorStop(0.55, alpha(color(note.voice), 0.28));
      glow.addColorStop(0.85, alpha(color(note.voice), 0.72));
      glow.addColorStop(1, alpha(glint, 0.98));
      ctx.fillStyle = glow; ctx.fillRect(left, rail - glowHeight, noteWidth, glowHeight);
      for (const spark of contactSparks(age, noteWidth / scale, note.midiPitch * 97 + note.voice * 41 + note.onsetSeconds * 13)) {
        ctx.strokeStyle = alpha(spark.white ? glint : color(note.voice), spark.opacity);
        ctx.lineWidth = spark.width * scale; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(left + spark.x * scale, rail + spark.y * scale);
        ctx.lineTo(left + spark.x * scale, rail + (spark.y - spark.length) * scale); ctx.stroke();
      }
      ctx.fillStyle = alpha(glint, 0.8 + attack * 0.2); ctx.fillRect(left, rail - 1.4 * scale, noteWidth, 1.4 * scale);
    }
    ctx.restore();
    // Keep the legend outside the falling-note clip.
    ctx.font = `${11 * scale}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    this.voices.forEach((voice, i) => {
      const left = (12 + (i % legendColumns) * 68) * scale;
      const top = (12.5 + Math.floor(i / legendColumns) * 18) * scale;
      ctx.fillStyle = color(voice); ctx.beginPath(); ctx.arc(left, top, 3 * scale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = label; ctx.fillText(`Voice ${voice + 1}`, left + 8 * scale, top);
    });
    ctx.restore();
  }
}
