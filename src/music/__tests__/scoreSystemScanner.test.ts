import { describe, it, expect } from 'vitest';
import { scanScoreSystems, extractBBoxFromElement } from '../scoreSystemScanner';

describe('scoreSystemScanner', () => {
  describe('extractBBoxFromElement', () => {
    it('parses rect elements with geometric attributes', () => {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', '10');
      rect.setAttribute('y', '20');
      rect.setAttribute('width', '100');
      rect.setAttribute('height', '50');

      const bbox = extractBBoxFromElement(rect);
      expect(bbox).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 50,
      });
    });

    it('parses path elements with d attribute', () => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M 10 20 L 50 80');

      const bbox = extractBBoxFromElement(path);
      expect(bbox).toEqual({
        x: 10,
        y: 20,
        width: 40,
        height: 60,
      });
    });

    it('parses line elements', () => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0');
      line.setAttribute('y1', '10');
      line.setAttribute('x2', '100');
      line.setAttribute('y2', '50');

      const bbox = extractBBoxFromElement(line);
      expect(bbox).toEqual({
        x: 0,
        y: 10,
        width: 100,
        height: 40,
      });
    });
  });

  describe('scanScoreSystems', () => {
    it('scans and sorts abcjs systems and extracts measures', () => {
      const container = document.createElement('div');
      container.innerHTML = `
        <svg viewBox="0 0 800 600">
          <g class="abcjs-l1">
            <rect class="abcjs-staff abcjs-l1" x="20" y="200" width="760" height="40" />
            <path class="abcjs-note abcjs-l1 abcjs-mm2" d="M 50 210 L 60 210" />
            <path class="abcjs-note abcjs-l1 abcjs-mm3" d="M 150 210 L 160 210" />
          </g>
          <g class="abcjs-l0">
            <rect class="abcjs-staff abcjs-l0" x="20" y="50" width="760" height="40" />
            <path class="abcjs-note abcjs-l0 abcjs-mm0" d="M 50 60 L 60 60" />
            <path class="abcjs-note abcjs-l0 abcjs-mm1" d="M 150 60 L 160 60" />
          </g>
        </svg>
      `;

      const systems = scanScoreSystems(container);
      expect(systems).toHaveLength(2);

      // System 0 is abcjs-l0
      expect(systems[0].lineClass).toBe('abcjs-l0');
      expect(systems[0].minMeasure).toBe(1);
      expect(systems[0].maxMeasure).toBe(2);
      expect(systems[0].staffTop).toBe(50);
      expect(systems[0].staffBottom).toBe(90);

      // System 1 is abcjs-l1
      expect(systems[1].lineClass).toBe('abcjs-l1');
      expect(systems[1].minMeasure).toBe(3);
      expect(systems[1].maxMeasure).toBe(4);
      expect(systems[1].staffTop).toBe(200);
      expect(systems[1].staffBottom).toBe(240);
    });
  });
});
