import abcjs from 'abcjs';
import type { Annotation, RangeAnnotation, ScoreInfo } from '../types/document';
import { chordStaffSpacing } from './annotationLayout';
import { prepareAbcForPlayback } from '../utils/abcAudio';
import { parseAbcHeaderMetadata } from '../utils/abcMetadata';

export class ScorePdfExportError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ScorePdfExportError';
    this.cause = cause;
  }
}

export type ScorePdfExportInput = Readonly<{
  abcSource: string;
  fallbackTitle?: string;
  composer?: string;
  scoreInfo?: ScoreInfo;
  annotations?: readonly Annotation[];
}>;


const KIND_LABEL: Record<RangeAnnotation['kind'], string> = {
  modulation: 'Modulation',
  'voice-leading': 'Voice leading',
  explanation: 'Explanation',
};

const escapeHtml = (text: string): string => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const measureLabel = ({ startMeasure, endMeasure }: RangeAnnotation['span']) => (
  startMeasure === endMeasure ? `m. ${startMeasure}` : `mm. ${startMeasure}–${endMeasure}`
);

type SystemInfo = {
  index: number;
  lineClass?: string;
  minMeasure: number;
  maxMeasure: number;
  top: number;
  bottom: number;
  height: number;
  elements: Element[];
};

const extractBBoxFromElement = (
  el: Element,
): { x: number; y: number; width: number; height: number } | null => {
  try {
    if (typeof (el as SVGGraphicsElement).getBBox === 'function') {
      const bbox = (el as SVGGraphicsElement).getBBox();
      if (
        Number.isFinite(bbox.x)
        && Number.isFinite(bbox.y)
        && Number.isFinite(bbox.width)
        && Number.isFinite(bbox.height)
        && (bbox.width > 0 || bbox.height > 0)
      ) {
        return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
      }
    }
  } catch {
    // ignore
  }

  const tagName = el.tagName.toLowerCase();

  // Container elements (<g>, <svg>): compute union bounding box of children
  if (tagName === 'g' || tagName === 'svg') {
    const childBoxes: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (const child of Array.from(el.children)) {
      const box = extractBBoxFromElement(child);
      if (box) childBoxes.push(box);
    }
    if (childBoxes.length > 0) {
      const minX = Math.min(...childBoxes.map((b) => b.x));
      const minY = Math.min(...childBoxes.map((b) => b.y));
      const maxX = Math.max(...childBoxes.map((b) => b.x + b.width));
      const maxY = Math.max(...childBoxes.map((b) => b.y + b.height));
      return {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
    }
  }

  // Parse path coordinates directly from 'd' attribute
  if (tagName === 'path') {
    const d = el.getAttribute('d');
    if (d) {
      const coords = Array.from(d.matchAll(/([MLCSTQAZ])\s*([0-9.-]+)[,\s]+([0-9.-]+)/gi));
      if (coords.length > 0) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const coord of coords) {
          const x = Number(coord[2]);
          const y = Number(coord[3]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
        if (Number.isFinite(minX) && Number.isFinite(minY)) {
          return {
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
          };
        }
      }
    }
  }

  // Parse rect, image, use
  if (tagName === 'rect' || tagName === 'image' || tagName === 'use') {
    const x = Number(el.getAttribute('x') || 0);
    const y = Number(el.getAttribute('y') || 0);
    const width = Number(el.getAttribute('width') || 0);
    const height = Number(el.getAttribute('height') || 0);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return {
        x,
        y,
        width: Math.max(1, Number.isFinite(width) ? width : 1),
        height: Math.max(1, Number.isFinite(height) ? height : 1),
      };
    }
  }

  // Parse line
  if (tagName === 'line') {
    const x1 = Number(el.getAttribute('x1') || 0);
    const y1 = Number(el.getAttribute('y1') || 0);
    const x2 = Number(el.getAttribute('x2') || 0);
    const y2 = Number(el.getAttribute('y2') || 0);
    if ([x1, y1, x2, y2].every(Number.isFinite)) {
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      return {
        x: minX,
        y: minY,
        width: Math.max(1, Math.abs(x2 - x1)),
        height: Math.max(1, Math.abs(y2 - y1)),
      };
    }
  }

  // Parse text
  if (tagName === 'text') {
    const x = Number(el.getAttribute('x') || 0);
    const y = Number(el.getAttribute('y') || 0);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const textLen = (el.textContent || '').length;
      return {
        x,
        y: y - 10,
        width: Math.max(1, textLen * 7),
        height: 12,
      };
    }
  }

  return null;
};

export const generateScorePdfHtml = ({
  abcSource,
  fallbackTitle = 'Score',
  composer: inputComposer,
  scoreInfo,
  annotations = [],
}: ScorePdfExportInput): string => {
  if (!abcSource.trim()) {
    throw new ScorePdfExportError('The score is empty — nothing to export.');
  }

  const parsedMeta = parseAbcHeaderMetadata(abcSource);
  const title = scoreInfo?.title || (fallbackTitle !== 'Score' ? fallbackTitle : (parsedMeta.title || 'Score'));
  const subtitle = scoreInfo?.subtitle || parsedMeta.subtitle;
  const composer = scoreInfo?.composer || (inputComposer ? inputComposer : parsedMeta.composer);
  const key = scoreInfo?.key || parsedMeta.key;
  const meter = scoreInfo?.meter || parsedMeta.meter;
  const tempoText = scoreInfo?.tempoText || parsedMeta.tempoText || (parsedMeta.tempoBpm ? `${parsedMeta.tempoBpm} BPM` : undefined);


  // Set up DOM container for abcjs rendering attached offscreen
  let container: HTMLDivElement | null = null;
  if (typeof document !== 'undefined') {
    container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '800px';
    container.style.visibility = 'hidden';
    document.body.appendChild(container);
  } else {
    throw new ScorePdfExportError('DOM environment is required to render score.');
  }


  try {
    const rangeAnnotations = annotations.filter(
      (a): a is RangeAnnotation => a.kind !== 'chord',
    );

    const chordAnnotations = annotations.filter((a) => a.kind === 'chord');
    const hasRangeAnnotations = rangeAnnotations.length > 0;
    const hasChords = chordAnnotations.length > 0;

    const preparedAbc = prepareAbcForPlayback(abcSource);
    const baseSpacing = chordStaffSpacing();

    const spacing = {
      ...baseSpacing,
      topspace: hasChords ? 52 : 20,
      musicspace: hasChords ? 82 : 42,
      staffsep: hasChords ? 150 : 100,
    };

    try {
      abcjs.renderAbc(container, preparedAbc, {
        responsive: 'resize',
        scale: 1,
        staffwidth: 740,
        wrap: {
          minSpacing: 1.5,
          maxSpacing: 3,
          preferredMeasuresPerLine: 4,
        },
        afterParsing: (tune) => {
          Object.assign(tune.formatting, spacing);
          return tune;
        },
        add_classes: true,
      });
    } catch (error) {
      throw new ScorePdfExportError('Failed to engrave score with abcjs.', error);
    }

    const svg = container.querySelector<SVGSVGElement>('svg');
    if (!svg) {
      throw new ScorePdfExportError('Engraving failed — no SVG output produced.');
    }

    const svgWidth = 780;
    const viewBoxAttr = svg.getAttribute('viewBox') || '';
    const viewBoxParts = viewBoxAttr.split(/[ ,]+/).map(Number);
    const totalSvgHeight = viewBoxParts.length >= 4 && Number.isFinite(viewBoxParts[3])
      ? viewBoxParts[3]
      : 800;

    // Identify distinct lines/systems
    const lineClassSet = new Set<string>();
    container.querySelectorAll<SVGGraphicsElement>('[class*="abcjs-l"]').forEach((el) => {
      Array.from(el.classList).forEach((className) => {
        if (/^abcjs-l\d+$/.test(className)) {
          lineClassSet.add(className);
        }
      });
    });

    const sortedLineClasses = Array.from(lineClassSet).sort(
      (a, b) => Number(a.slice(7)) - Number(b.slice(7)),
    );

    // Extract system information
    const systems: SystemInfo[] = [];

    if (sortedLineClasses.length > 0) {
      sortedLineClasses.forEach((lineClass, index) => {
        const lineElements = Array.from(svg.querySelectorAll<SVGGraphicsElement>(`.${lineClass}`));
        const measuresInLine: number[] = [];

        svg.querySelectorAll<SVGGraphicsElement>(`[class*="abcjs-mm"].${lineClass}`).forEach((el) => {
          Array.from(el.classList).forEach((cls) => {
            const match = cls.match(/^abcjs-mm(\d+)$/);
            if (match) {
              measuresInLine.push(Number(match[1]) + 1);
            }
          });
        });

        const uniqueMeasures = Array.from(new Set(measuresInLine)).sort((a, b) => a - b);
        const minMeasure = uniqueMeasures.length > 0 ? uniqueMeasures[0] : 1;
        const maxMeasure = uniqueMeasures.length > 0 ? uniqueMeasures[uniqueMeasures.length - 1] : minMeasure;

        // Approximate or measure bounding box
        const staffEls = svg.querySelectorAll<SVGGraphicsElement>(`.abcjs-staff.${lineClass}`);
        let staffTop = Infinity;
        let staffBottom = -Infinity;

        staffEls.forEach((el) => {
          const box = extractBBoxFromElement(el);
          if (box) {
            staffTop = Math.min(staffTop, box.y);
            staffBottom = Math.max(staffBottom, box.y + box.height);
          }
        });

        let elementMinY = Infinity;
        let elementMaxY = -Infinity;

        lineElements.forEach((el) => {
          if (
            el.classList.contains('abcjs-note')
            || el.classList.contains('abcjs-dynamics')
            || el.classList.contains('abcjs-tempo')
            || el.classList.contains('abcjs-bar')
          ) {
            const box = extractBBoxFromElement(el);
            if (box) {
              elementMinY = Math.min(elementMinY, box.y);
              elementMaxY = Math.max(elementMaxY, box.y + box.height);
            }
          }
        });

        const systemChords = chordAnnotations.filter((c) => {
          const m = c.position.measure;
          return m >= minMeasure && m <= maxMeasure;
        });

        const topStaffY = Number.isFinite(staffTop) ? staffTop : (Number.isFinite(elementMinY) ? elementMinY : 60);
        let top = Number.isFinite(elementMinY) ? Math.min(staffTop - 28, elementMinY - 20) : staffTop - 28;
        let bottom = Number.isFinite(elementMaxY) ? Math.max(staffBottom + 28, elementMaxY + 20) : staffBottom + 28;

        if (systemChords.length > 0) {
          // Ensure system top comfortably encompasses the chord badges above the staff
          const maxBadgeHeight = systemChords.some((c) => c.romanNumeral) ? 28 : 20;
          const minObstacleY = Math.min(topStaffY, elementMinY);
          const chordBaselineY = Math.min(topStaffY - 22, minObstacleY - 10);
          top = Math.min(top, chordBaselineY - maxBadgeHeight - 12);
        }

        if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
          // Fallback proportional slicing
          const sliceHeight = totalSvgHeight / sortedLineClasses.length;
          top = index * sliceHeight;
          bottom = (index + 1) * sliceHeight;
        }

        systems.push({
          index,
          lineClass,
          minMeasure,
          maxMeasure,
          top: Math.max(0, top),
          bottom,
          height: Math.max(90, bottom - top),
          elements: lineElements,
        });
      });
    } else {
      // Single system fallback
      systems.push({
        index: 0,
        minMeasure: 1,
        maxMeasure: 999,
        top: 0,
        bottom: totalSvgHeight,
        height: totalSvgHeight,
        elements: Array.from(svg.children),
      });
    }

    // Inject chord badges into SVG clone at top z-index layer
    const svgClone = svg.cloneNode(true) as SVGSVGElement;

    // Strip internal ABC title/composer from SVG so they never bleed into system rows
    svgClone
      .querySelectorAll('.abcjs-title, .abcjs-composer, .abcjs-subtitle, .abcjs-header')
      .forEach((el) => el.remove());

    const chordLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chordLayer.setAttribute('id', 'chorale-chord-layer');
    chordLayer.setAttribute('class', 'chorale-chord-layer');

    // Render chord badges grouped per system so each line has its own independent horizontal de-confliction
    systems.forEach((system) => {
      const lineClass = system.lineClass;
      const systemChords = chordAnnotations.filter((c) => (
        c.position.measure >= system.minMeasure && c.position.measure <= system.maxMeasure
      ));
      if (systemChords.length === 0) return;

      // Sort chords on this line in reading order (measure then offset)
      const sortedChords = [...systemChords].sort((a, b) => {
        if (a.position.measure !== b.position.measure) {
          return a.position.measure - b.position.measure;
        }
        const aFrac = a.position.offset.denominator > 0 ? a.position.offset.numerator / a.position.offset.denominator : 0;
        const bFrac = b.position.offset.denominator > 0 ? b.position.offset.numerator / b.position.offset.denominator : 0;
        return aFrac - bFrac;
      });

      // Find top staff Y for this line to establish a consistent vertical baseline for all chords on this system
      const staffEls = lineClass
        ? svg.querySelectorAll<SVGGraphicsElement>(`.abcjs-staff.${lineClass}`)
        : svg.querySelectorAll<SVGGraphicsElement>('.abcjs-staff');
      let topStaffY = Infinity;
      staffEls.forEach((el) => {
        const box = extractBBoxFromElement(el);
        if (box && box.y > 0) topStaffY = Math.min(topStaffY, box.y);
      });
      if (!Number.isFinite(topStaffY)) topStaffY = system.top + 60;

      // Check obstacles (high notes, tempo, dynamics) above the top staff on this line
      let minObstacleY = topStaffY;
      const lineObstacles = lineClass
        ? svg.querySelectorAll<SVGGraphicsElement>(`.abcjs-note.${lineClass}, .abcjs-tempo.${lineClass}, .abcjs-dynamics.${lineClass}`)
        : svg.querySelectorAll<SVGGraphicsElement>('.abcjs-note, .abcjs-tempo, .abcjs-dynamics');
      lineObstacles.forEach((el) => {
        const box = extractBBoxFromElement(el);
        // Only consider valid obstacle boxes that are above the staff but within reasonable reach
        if (box && box.y > 10 && box.y < topStaffY && box.y >= topStaffY - 100) {
          minObstacleY = Math.min(minObstacleY, box.y);
        }
      });

      const maxBadgeHeightOnLine = sortedChords.some((c) => c.romanNumeral) ? 28 : 20;
      const systemChordCenterY = Math.max(
        system.top + maxBadgeHeightOnLine / 2 + 4,
        Math.min(topStaffY - 22, minObstacleY - 10) - maxBadgeHeightOnLine / 2,
      );

      // Debug log
      // console.log(`SYSTEM ${system.index} (${lineClass}): staffEls=${staffEls.length}, topStaffY=${topStaffY}, minObstacleY=${minObstacleY}, systemChordCenterY=${systemChordCenterY}, system.top=${system.top}`);

      let previousPlacedRight = -Infinity;

      sortedChords.forEach((chord) => {
        if (chord.kind !== 'chord') return;
        const measureIdx = chord.position.measure - 1;

        // Query elements specifically on this line
        const measureSelector = lineClass ? `.abcjs-mm${measureIdx}.${lineClass}` : `.abcjs-mm${measureIdx}`;
        const measureEls = svg.querySelectorAll<SVGGraphicsElement>(measureSelector);

        let measureX = 100;
        let measureW = 140;
        let foundMeasureBox = false;

        const measureBoxes: Array<{ x: number; y: number; width: number; height: number }> = [];
        measureEls.forEach((el) => {
          const box = extractBBoxFromElement(el);
          if (box && box.width > 0) {
            measureBoxes.push(box);
          }
        });

        if (measureBoxes.length > 0) {
          const minX = Math.min(...measureBoxes.map((b) => b.x));
          const maxX = Math.max(...measureBoxes.map((b) => b.x + b.width));
          measureX = minX;
          measureW = Math.max(30, maxX - minX);
          foundMeasureBox = true;
        }

        // Locate note elements inside this measure on this line to anchor to noteheads
        const noteSelector = lineClass ? `.abcjs-mm${measureIdx}.abcjs-note.${lineClass}` : `.abcjs-mm${measureIdx}.abcjs-note`;
        const noteEls = svg.querySelectorAll<SVGGraphicsElement>(noteSelector);
        const noteCenters: number[] = [];
        noteEls.forEach((el) => {
          const box = extractBBoxFromElement(el);
          if (box && box.width > 0) {
            noteCenters.push(box.x + box.width / 2);
          }
        });
        noteCenters.sort((a, b) => a - b);

        const offsetFraction = chord.position.offset.denominator > 0
          ? chord.position.offset.numerator / chord.position.offset.denominator
          : 0;

        let targetX: number;
        if (noteCenters.length > 0) {
          if (offsetFraction === 0) {
            targetX = noteCenters[0];
          } else {
            const noteIndex = Math.min(noteCenters.length - 1, Math.round(offsetFraction * (noteCenters.length - 1)));
            targetX = noteCenters[noteIndex];
          }
        } else if (foundMeasureBox) {
          targetX = offsetFraction === 0 ? measureX + 16 : measureX + measureW * offsetFraction;
        } else {
          // Fallback proportional estimate across system measures
          const measureRatio = (chord.position.measure - system.minMeasure) / Math.max(1, system.maxMeasure - system.minMeasure + 1);
          const estimatedMeasureWidth = (svgWidth - 100) / Math.max(1, system.maxMeasure - system.minMeasure + 1);
          targetX = 60 + measureRatio * (svgWidth - 100) + estimatedMeasureWidth * offsetFraction;
        }

        const symbolLen = chord.chordSymbol.length;
        const romanLen = chord.romanNumeral?.length ?? 0;
        const maxCharCount = Math.max(symbolLen, romanLen);
        const badgeWidth = Math.max(38, maxCharCount * 8.5 + 14);
        const halfWidth = badgeWidth / 2;
        const badgeHeight = chord.romanNumeral ? 28 : 20;
        const halfHeight = badgeHeight / 2;

        let idealX = targetX;

        // De-conflict horizontally if placed near previous chord in this system
        if (idealX - halfWidth < previousPlacedRight + 6) {
          idealX = previousPlacedRight + 6 + halfWidth;
        }

        // Strictly clamp within horizontal SVG line margins to avoid right/left edge clipping
        const minClampX = halfWidth + 10;
        const maxClampX = svgWidth - halfWidth - 14;
        idealX = Math.max(minClampX, Math.min(idealX, maxClampX));

        previousPlacedRight = idealX + halfWidth;

        const badgeY = Math.max(20, systemChordCenterY);

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'score-chord-badge');
        g.setAttribute('transform', `translate(${idealX}, ${badgeY})`);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(-halfWidth));
        rect.setAttribute('y', String(-halfHeight));
        rect.setAttribute('width', String(badgeWidth));
        rect.setAttribute('height', String(badgeHeight));
        rect.setAttribute('rx', '4.5');
        rect.setAttribute('fill', '#f0f9ff');
        rect.setAttribute('stroke', '#0284c7');
        rect.setAttribute('stroke-width', '1.2');
        g.appendChild(rect);

        const textSymbol = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textSymbol.setAttribute('x', '0');
        textSymbol.setAttribute('y', chord.romanNumeral ? '-2' : '3.5');
        textSymbol.setAttribute('text-anchor', 'middle');
        textSymbol.setAttribute('font-family', 'sans-serif');
        textSymbol.setAttribute('font-size', '11');
        textSymbol.setAttribute('font-weight', 'bold');
        textSymbol.setAttribute('fill', '#0369a1');
        textSymbol.textContent = chord.chordSymbol;
        g.appendChild(textSymbol);

        if (chord.romanNumeral) {
          const textRoman = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          textRoman.setAttribute('x', '0');
          textRoman.setAttribute('y', '9.5');
          textRoman.setAttribute('text-anchor', 'middle');
          textRoman.setAttribute('font-family', 'sans-serif');
          textRoman.setAttribute('font-size', '9');
          textRoman.setAttribute('font-weight', '600');
          textRoman.setAttribute('fill', '#0284c7');
          textRoman.textContent = chord.romanNumeral;
          g.appendChild(textRoman);
        }

        chordLayer.appendChild(g);
      });
    });

    if (chordAnnotations.length > 0) {
      svgClone.appendChild(chordLayer);
    }

  // Build system rows
  const systemRowsHtml = systems.map((system) => {
    // Find range annotations belonging to this system
    const systemAnnotations = rangeAnnotations.filter((ann) => {
      const start = ann.span.startMeasure;
      return start >= system.minMeasure && start <= system.maxMeasure;
    });

    const systemSvgHtml = `
      <svg viewBox="0 ${system.top} ${svgWidth} ${system.height}" style="width: 100%; height: auto;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <use href="#chorale-master-canvas" xlink:href="#chorale-master-canvas" />
      </svg>
    `;


    const annotationCardsHtml = systemAnnotations.map((ann) => `
      <div class="print-annotation-card print-annotation-${ann.kind}">
        <div class="print-card-header">
          <span class="print-card-kind print-kind-${ann.kind}">${KIND_LABEL[ann.kind]}</span>
          <span class="print-card-measure">${measureLabel(ann.span)}</span>
          <strong class="print-card-label">${escapeHtml(ann.label)}</strong>
        </div>
        ${ann.body ? `<div class="print-card-body">${escapeHtml(ann.body)}</div>` : ''}
      </div>
    `).join('\n');

    return `
      <div class="print-system-row ${hasRangeAnnotations ? 'has-annotations' : 'notation-only'}">
        <div class="print-notation-col">
          ${systemSvgHtml}
        </div>
        ${hasRangeAnnotations ? `
          <div class="print-annotation-col">
            ${annotationCardsHtml}
          </div>
        ` : ''}
      </div>
    `;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} - exported from Chorale</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 14mm 12mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #ffffff;
      color: #0f172a;
      line-height: 1.4;
      padding: 12px 18px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #cbd5e1;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .print-header-main {
      flex: 1 1 auto;
      min-width: 0;
    }
    .print-title {
      font-family: "Academico", "Century Schoolbook", "Newsreader", "Playfair Display", "Instrument Serif", "Iowan Old Style", "Apple Garamond", "Baskerville", "Times New Roman", "Georgia", serif;
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.01em;
      line-height: 1.2;
    }
    .print-subtitle {
      font-family: "Academico", "Century Schoolbook", "Newsreader", "Playfair Display", "Instrument Serif", "Iowan Old Style", "Apple Garamond", "Baskerville", "Times New Roman", "Georgia", serif;
      font-size: 14px;
      font-style: italic;
      color: #475569;
      margin-top: 3px;
    }
    .print-meta-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      margin-top: 8px;
    }
    .print-meta-item {
      font-family: "Academico", "Century Schoolbook", "Newsreader", "Playfair Display", "Instrument Serif", "Iowan Old Style", "Apple Garamond", "Baskerville", "Times New Roman", "Georgia", serif;
      font-size: 12.5px;
      color: #334155;
    }
    .print-meta-item strong {
      font-weight: 700;
      color: #0f172a;
      margin-right: 4px;
    }
    .print-branding {
      flex: 0 0 auto;
      text-align: right;
      font-size: 11px;
      color: #64748b;
      font-weight: 500;
      letter-spacing: 0.02em;
      margin-left: 20px;
    }
    .print-brand-tag {
      font-family: "Academico", "Century Schoolbook", "Newsreader", "Playfair Display", "Instrument Serif", "Iowan Old Style", "Apple Garamond", "Baskerville", "Times New Roman", "Georgia", serif;
      font-size: 12px;
      color: #475569;
      font-style: italic;
      white-space: nowrap;
    }
    .print-score-container {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .print-system-row {
      display: flex;
      flex-direction: row;
      gap: 24px;
      align-items: flex-start;
      break-inside: avoid;
      page-break-inside: avoid;
      padding-top: 14px;
      padding-bottom: 16px;
      border-bottom: 1px dashed #e2e8f0;
    }
    .print-system-row:last-child {
      border-bottom: none;
    }
    .print-system-row.notation-only .print-notation-col {
      flex: 1 1 100%;
      max-width: 100%;
    }
    .print-system-row.has-annotations .print-notation-col {
      flex: 1 1 65%;
      min-width: 0;
    }
    .print-notation-col svg {
      width: 100%;
      height: auto;
      display: block;
      overflow: hidden;
    }
    .abcjs-title, .abcjs-composer, .abcjs-subtitle {
      display: none !important;
    }
    .score-chord-badge {
      pointer-events: none;
    }
    .score-chord-badge rect {
      filter: drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.08));
    }
    .print-annotation-col {
      flex: 0 0 35%;
      max-width: 35%;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .print-annotation-card {
      border-radius: 4px;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      font-size: 11px;
      background: #f8fafc;
    }
    .print-annotation-modulation {
      background: #fefce8;
      border-color: #facc15;
    }
    .print-annotation-voice-leading {
      background: #f0fdf4;
      border-color: #4ade80;
    }
    .print-annotation-explanation {
      background: #f5f3ff;
      border-color: #a78bfa;
    }
    .print-card-header {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 4px;
    }
    .print-card-kind {
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 1px 5px;
      border-radius: 2px;
    }
    .print-kind-modulation {
      background: #fef08a;
      color: #854d0e;
    }
    .print-kind-voice-leading {
      background: #bbf7d0;
      color: #166534;
    }
    .print-kind-explanation {
      background: #ddd6fe;
      color: #5b21b6;
    }
    .print-card-measure {
      font-size: 10.5px;
      font-weight: 600;
      color: #475569;
    }
    .print-card-label {
      font-weight: 600;
      color: #0f172a;
    }
    .print-card-body {
      font-size: 10.5px;
      color: #334155;
      white-space: pre-wrap;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="print-header">
    <div class="print-header-main">
      <h1 class="print-title">${escapeHtml(title)}</h1>
      ${subtitle ? `<div class="print-subtitle">${escapeHtml(subtitle)}</div>` : ''}
      <div class="print-meta-grid">
        ${composer ? `<div class="print-meta-item"><strong>Composer:</strong> <span>${escapeHtml(composer)}</span></div>` : ''}
        ${key ? `<div class="print-meta-item"><strong>Key Signature:</strong> <span>${escapeHtml(key)}</span></div>` : ''}
        ${meter ? `<div class="print-meta-item"><strong>Time Signature:</strong> <span>${escapeHtml(meter)}</span></div>` : ''}
        ${tempoText ? `<div class="print-meta-item"><strong>Tempo:</strong> <span>${escapeHtml(tempoText)}</span></div>` : ''}
      </div>
    </div>
    <div class="print-branding">
      <div class="print-brand-tag">exported from Chorale</div>
      <div class="print-brand-date">${new Date().toLocaleDateString()}</div>
    </div>
  </div>
  <div class="print-score-container">
    <svg style="position: absolute; width: 0; height: 0; overflow: hidden;" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <g id="chorale-master-canvas">
          ${svgClone.innerHTML}
        </g>
      </defs>
    </svg>
    ${systemRowsHtml}
  </div>
</body>
</html>`;

  } finally {
    container?.remove();
  }
};


