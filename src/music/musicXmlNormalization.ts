/**
 * MusicXML Pre-Export Normalization Pass
 *
 * Normalizes MusicXML documents before export by ensuring every measure across all parts,
 * staves, and voices satisfies the expected meter duration. Empty staves/voices are padded
 * with whole-measure rests (<rest measure="yes"/>) and partially filled measures are padded
 * with decomposed durational rests.
 */

function getDOMParser(): DOMParser {
  if (typeof window !== 'undefined' && window.DOMParser) {
    return new window.DOMParser();
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).DOMParser) {
    return new (globalThis as any).DOMParser();
  }
  throw new Error('DOMParser is not available in the current environment.');
}

function getXMLSerializer(): XMLSerializer {
  if (typeof window !== 'undefined' && window.XMLSerializer) {
    return new window.XMLSerializer();
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).XMLSerializer) {
    return new (globalThis as any).XMLSerializer();
  }
  throw new Error('XMLSerializer is not available in the current environment.');
}

export type DecomposedRest = Readonly<{
  type?: string;
  ticks: number;
  dots: number;
}>;

/**
 * Greedily decomposes a duration into standard rhythmic note types and dots.
 */
export function decomposeDuration(divisions: number, missingTicks: number): DecomposedRest[] {
  if (missingTicks <= 0 || divisions <= 0) return [];

  const noteTypes: Array<{ type: string; ticks: number; dots: number }> = [
    { type: 'whole', ticks: divisions * 4, dots: 0 },
    { type: 'half', ticks: divisions * 3, dots: 1 },
    { type: 'half', ticks: divisions * 2, dots: 0 },
    { type: 'quarter', ticks: Math.round(divisions * 1.5), dots: 1 },
    { type: 'quarter', ticks: divisions, dots: 0 },
    { type: 'eighth', ticks: Math.round(divisions * 0.75), dots: 1 },
    { type: 'eighth', ticks: Math.round(divisions * 0.5), dots: 0 },
    { type: '16th', ticks: Math.round(divisions * 0.25), dots: 0 },
    { type: '32nd', ticks: Math.round(divisions * 0.125), dots: 0 },
    { type: '64th', ticks: Math.round(divisions * 0.0625), dots: 0 },
  ].filter((t) => t.ticks > 0 && t.ticks === Math.floor(t.ticks));

  const result: DecomposedRest[] = [];
  let remaining = missingTicks;

  for (const nt of noteTypes) {
    while (remaining >= nt.ticks && nt.ticks > 0) {
      result.push(nt);
      remaining -= nt.ticks;
    }
  }

  if (remaining > 0) {
    result.push({ ticks: remaining, dots: 0 });
  }

  return result;
}

type MeterSignature = {
  beats: number;
  beatType: number;
};

/**
 * Normalizes a MusicXML document string to ensure all measures in all parts, staves,
 * and voices have the expected durational content or explicit whole-measure rests.
 */
export function normalizeMusicXml(xmlString: string): string {
  if (!xmlString.trim()) return xmlString;

  const parser = getDOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  if (doc.getElementsByTagName('parsererror').length > 0) {
    return xmlString;
  }

  const parts = Array.from(doc.getElementsByTagName('part'));
  if (parts.length === 0) return xmlString;

  // Gather master ordered measure numbers across all parts
  const measureNumberSet = new Set<string>();
  const measureNumbers: string[] = [];
  for (const part of parts) {
    const measures = Array.from(part.getElementsByTagName('measure'));
    for (const m of measures) {
      const num = m.getAttribute('number') || '';
      if (!measureNumberSet.has(num)) {
        measureNumberSet.add(num);
        measureNumbers.push(num);
      }
    }
  }

  const allNumeric = measureNumbers.every((n) => /^\d+$/.test(n));
  if (allNumeric) {
    measureNumbers.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }

  let globalDivisions = 4;
  let globalMeter: MeterSignature = { beats: 4, beatType: 4 };

  const firstDivisions = doc.querySelector('divisions');
  if (firstDivisions && firstDivisions.textContent) {
    const d = parseInt(firstDivisions.textContent.trim(), 10);
    if (!Number.isNaN(d) && d > 0) globalDivisions = d;
  }

  const firstTime = doc.querySelector('time');
  if (firstTime) {
    const b = parseInt(firstTime.querySelector('beats')?.textContent || '4', 10);
    const bt = parseInt(firstTime.querySelector('beat-type')?.textContent || '4', 10);
    if (!Number.isNaN(b) && !Number.isNaN(bt) && b > 0 && bt > 0) {
      globalMeter = { beats: b, beatType: bt };
    }
  }

  for (const part of parts) {
    let currentDivisions = globalDivisions;
    let currentMeter: MeterSignature = { ...globalMeter };

    let declaredStaves = 1;
    for (const stavesEl of Array.from(part.getElementsByTagName('staves'))) {
      const s = parseInt(stavesEl.textContent?.trim() || '1', 10);
      if (!Number.isNaN(s) && s > declaredStaves) declaredStaves = s;
    }
    for (const staffEl of Array.from(part.getElementsByTagName('staff'))) {
      const s = parseInt(staffEl.textContent?.trim() || '1', 10);
      if (!Number.isNaN(s) && s > declaredStaves) declaredStaves = s;
    }

    const voiceStaffMap = new Map<string, string>();
    const discoveredVoices: string[] = [];
    for (const note of Array.from(part.getElementsByTagName('note'))) {
      const v = note.querySelector('voice')?.textContent?.trim() || '1';
      const s = note.querySelector('staff')?.textContent?.trim() || '1';
      if (!voiceStaffMap.has(v)) {
        voiceStaffMap.set(v, s);
        discoveredVoices.push(v);
      }
    }

    if (discoveredVoices.length === 0) {
      discoveredVoices.push('1');
      voiceStaffMap.set('1', '1');
    }

    for (let s = 1; s <= declaredStaves; s++) {
      const staffStr = String(s);
      const hasVoice = Array.from(voiceStaffMap.values()).includes(staffStr);
      if (!hasVoice) {
        const v = String(s);
        voiceStaffMap.set(v, staffStr);
        if (!discoveredVoices.includes(v)) discoveredVoices.push(v);
      }
    }

    const canonicalVoices = [...discoveredVoices].sort((a, b) => {
      const staffA = parseInt(voiceStaffMap.get(a) || '1', 10);
      const staffB = parseInt(voiceStaffMap.get(b) || '1', 10);
      if (staffA !== staffB) return staffA - staffB;
      return a.localeCompare(b, undefined, { numeric: true });
    });

    const measureMap = new Map<string, Element>();
    for (const m of Array.from(part.getElementsByTagName('measure'))) {
      measureMap.set(m.getAttribute('number') || '', m);
    }

    let prevMeasureNode: Element | null = null;

    for (const measureNum of measureNumbers) {
      let measureNode = measureMap.get(measureNum);
      if (!measureNode) {
        measureNode = doc.createElement('measure');
        measureNode.setAttribute('number', measureNum);
        if (prevMeasureNode && prevMeasureNode.nextSibling) {
          part.insertBefore(measureNode, prevMeasureNode.nextSibling);
        } else {
          part.appendChild(measureNode);
        }
      }
      prevMeasureNode = measureNode;

      const divEl = measureNode.querySelector('attributes > divisions');
      if (divEl && divEl.textContent) {
        const d = parseInt(divEl.textContent.trim(), 10);
        if (!Number.isNaN(d) && d > 0) currentDivisions = d;
      }

      const timeEl = measureNode.querySelector('attributes > time');
      if (timeEl) {
        const b = parseInt(timeEl.querySelector('beats')?.textContent || '4', 10);
        const bt = parseInt(timeEl.querySelector('beat-type')?.textContent || '4', 10);
        if (!Number.isNaN(b) && !Number.isNaN(bt) && b > 0 && bt > 0) {
          currentMeter = { beats: b, beatType: bt };
        }
      }

      const isPickup = measureNode.getAttribute('implicit') === 'yes' || measureNum === '0';
      let expectedDuration = Math.round((4 * currentMeter.beats * currentDivisions) / currentMeter.beatType);

      const children = Array.from(measureNode.childNodes);
      const preamble: Element[] = [];
      const epilogue: Element[] = [];
      const voiceElements = new Map<string, Element[]>();
      for (const v of canonicalVoices) {
        voiceElements.set(v, []);
      }
      const voiceDurations = new Map<string, number>();
      for (const v of canonicalVoices) {
        voiceDurations.set(v, 0);
      }

      let currentVoiceForNonNotes = canonicalVoices[0];

      for (const child of children) {
        if (child.nodeType !== 1) continue;
        const el = child as Element;
        const tagName = el.tagName.toLowerCase();

        if (tagName === 'attributes' || tagName === 'print') {
          preamble.push(el);
          continue;
        }

        if (tagName === 'barline') {
          const loc = el.getAttribute('location');
          if (loc === 'left') {
            preamble.push(el);
          } else {
            epilogue.push(el);
          }
          continue;
        }

        if (tagName === 'backup') {
          // Internal backup nodes are re-synthesized cleanly between voices
          continue;
        }

        if (tagName === 'note') {
          const v = el.querySelector('voice')?.textContent?.trim() || canonicalVoices[0];
          currentVoiceForNonNotes = v;
          if (!voiceElements.has(v)) {
            voiceElements.set(v, []);
            voiceDurations.set(v, 0);
          }
          voiceElements.get(v)!.push(el);

          const isChord = el.querySelector('chord') !== null;
          if (!isChord) {
            const isFullMeasureRest = el.querySelector('rest[measure="yes"]') !== null;
            if (isFullMeasureRest) {
              voiceDurations.set(v, expectedDuration);
            } else {
              const d = parseInt(el.querySelector('duration')?.textContent || '0', 10);
              voiceDurations.set(v, (voiceDurations.get(v) || 0) + (Number.isNaN(d) ? 0 : d));
            }
          }
          continue;
        }

        const v = el.querySelector('voice')?.textContent?.trim() || currentVoiceForNonNotes;
        if (voiceElements.has(v)) {
          voiceElements.get(v)!.push(el);
        } else {
          preamble.push(el);
        }
      }

      if (isPickup) {
        let maxDur = 0;
        for (const v of canonicalVoices) {
          const d = voiceDurations.get(v) || 0;
          if (d > maxDur) maxDur = d;
        }
        if (maxDur > 0) expectedDuration = maxDur;
      }

      for (const v of canonicalVoices) {
        const dur = voiceDurations.get(v) || 0;
        const missing = expectedDuration - dur;
        const staffNum = voiceStaffMap.get(v) || '1';

        if (dur === 0) {
          const noteEl = doc.createElement('note');
          const restEl = doc.createElement('rest');
          restEl.setAttribute('measure', 'yes');
          noteEl.appendChild(restEl);

          const durEl = doc.createElement('duration');
          durEl.textContent = String(expectedDuration);
          noteEl.appendChild(durEl);

          const voiceEl = doc.createElement('voice');
          voiceEl.textContent = v;
          noteEl.appendChild(voiceEl);

          if (declaredStaves > 1) {
            const staffEl = doc.createElement('staff');
            staffEl.textContent = staffNum;
            noteEl.appendChild(staffEl);
          }
          voiceElements.get(v)!.push(noteEl);
        } else if (missing > 0) {
          const decomposed = decomposeDuration(currentDivisions, missing);
          for (const piece of decomposed) {
            const noteEl = doc.createElement('note');
            const restEl = doc.createElement('rest');
            noteEl.appendChild(restEl);

            const durEl = doc.createElement('duration');
            durEl.textContent = String(piece.ticks);
            noteEl.appendChild(durEl);

            const voiceEl = doc.createElement('voice');
            voiceEl.textContent = v;
            noteEl.appendChild(voiceEl);

            if (piece.type) {
              const typeEl = doc.createElement('type');
              typeEl.textContent = piece.type;
              noteEl.appendChild(typeEl);
            }
            if (piece.dots > 0) {
              for (let d = 0; d < piece.dots; d++) {
                noteEl.appendChild(doc.createElement('dot'));
              }
            }
            if (declaredStaves > 1) {
              const staffEl = doc.createElement('staff');
              staffEl.textContent = staffNum;
              noteEl.appendChild(staffEl);
            }
            voiceElements.get(v)!.push(noteEl);
          }
        }
      }

      while (measureNode.firstChild) {
        measureNode.removeChild(measureNode.firstChild);
      }

      for (const el of preamble) {
        measureNode.appendChild(el);
      }

      for (let i = 0; i < canonicalVoices.length; i++) {
        const v = canonicalVoices[i];
        const els = voiceElements.get(v) || [];
        for (const el of els) {
          measureNode.appendChild(el);
        }
        if (i < canonicalVoices.length - 1) {
          const backupEl = doc.createElement('backup');
          const durEl = doc.createElement('duration');
          durEl.textContent = String(expectedDuration);
          backupEl.appendChild(durEl);
          measureNode.appendChild(backupEl);
        }
      }

      for (const el of epilogue) {
        measureNode.appendChild(el);
      }
    }
  }

  const serializer = getXMLSerializer();
  let resultXml = serializer.serializeToString(doc);
  if (!resultXml.startsWith('<?xml')) {
    resultXml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + resultXml;
  }
  return resultXml;
}
