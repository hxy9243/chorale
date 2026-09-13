/**
 * Shared scanner for extracting score systems, measures, and staff bounding boxes
 * from abcjs-rendered SVG DOM representations.
 *
 * Used uniformly across PDF export and Video export pipelines.
 */

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScannedScoreSystem {
  systemIndex: number;
  lineClass: string;
  minMeasure: number;
  maxMeasure: number;
  measures: number[];
  staffTop: number;
  staffBottom: number;
  elementsMinY: number;
  elementsMaxY: number;
  staffMidY: number;
}

/**
 * Extracts the bounding box of an SVG element, attempting native getBBox() first
 * and falling back to direct geometric attribute parsing for non-DOM / test environments.
 */
export function extractBBoxFromElement(el: Element): BBox | null {
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
    // ignore in non-rendered or headless environments
  }

  const tagName = el.tagName.toLowerCase();

  // Container elements (<g>, <svg>): union bounding box of children
  if (tagName === 'g' || tagName === 'svg') {
    const childBoxes: BBox[] = [];
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
}

/**
 * Scans an SVG element or container for rendered abcjs systems (`abcjs-l\d+`),
 * measures (`abcjs-mm\d+`), and bounding boxes for staves and musical elements.
 */
export function scanScoreSystems(root: Element): ScannedScoreSystem[] {
  const lineClassSet = new Set<string>();
  root.querySelectorAll<SVGGraphicsElement>('[class*="abcjs-l"]').forEach((el) => {
    Array.from(el.classList).forEach((className) => {
      if (/^abcjs-l\d+$/.test(className)) {
        lineClassSet.add(className);
      }
    });
  });

  const sortedLineClasses = Array.from(lineClassSet).sort(
    (a, b) => Number(a.slice(7)) - Number(b.slice(7)),
  );

  const scanned: ScannedScoreSystem[] = [];

  sortedLineClasses.forEach((lineClass, index) => {
    const lineElements = Array.from(root.querySelectorAll<SVGGraphicsElement>(`.${lineClass}`));
    const measuresInLine: number[] = [];

    root.querySelectorAll<SVGGraphicsElement>(`[class*="abcjs-mm"].${lineClass}`).forEach((el) => {
      Array.from(el.classList).forEach((cls) => {
        const match = cls.match(/^abcjs-mm(\d+)$/);
        if (match) {
          measuresInLine.push(Number(match[1]) + 1);
        }
      });
    });

    const uniqueMeasures = Array.from(new Set(measuresInLine)).sort((a, b) => a - b);
    const minMeasure = uniqueMeasures.length > 0 ? uniqueMeasures[0] : index + 1;
    const maxMeasure = uniqueMeasures.length > 0 ? uniqueMeasures[uniqueMeasures.length - 1] : minMeasure;

    // Staff bounding box
    const staffEls = root.querySelectorAll<SVGGraphicsElement>(`.abcjs-staff.${lineClass}, .abcjs-top-line.${lineClass}`);
    let staffTop = Infinity;
    let staffBottom = -Infinity;

    staffEls.forEach((el) => {
      const box = extractBBoxFromElement(el);
      if (box) {
        staffTop = Math.min(staffTop, box.y);
        staffBottom = Math.max(staffBottom, box.y + box.height);
      }
    });

    // Musical elements bounding box
    let elementMinY = Infinity;
    let elementMaxY = -Infinity;

    lineElements.forEach((el) => {
      const box = extractBBoxFromElement(el);
      if (box && box.height > 0) {
        elementMinY = Math.min(elementMinY, box.y);
        elementMaxY = Math.max(elementMaxY, box.y + box.height);

        if (el.classList.contains('abcjs-staff') || el.classList.contains('abcjs-top-line')) {
          staffTop = Math.min(staffTop, box.y);
          staffBottom = Math.max(staffBottom, box.y + box.height);
        }
      }
    });

    const staffMid = Number.isFinite(staffTop) && Number.isFinite(staffBottom)
      ? (staffTop + staffBottom) / 2
      : (Number.isFinite(elementMinY) && Number.isFinite(elementMaxY)
          ? (elementMinY + elementMaxY) / 2
          : index * 140 + 80);

    scanned.push({
      systemIndex: index,
      lineClass,
      minMeasure,
      maxMeasure,
      measures: uniqueMeasures,
      staffTop,
      staffBottom,
      elementsMinY: elementMinY,
      elementsMaxY: elementMaxY,
      staffMidY: staffMid,
    });
  });

  return scanned;
}
