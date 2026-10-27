import { useLayoutEffect, useRef, type RefObject } from 'react';
import type abcjs from 'abcjs';
import { createPortal } from 'react-dom';
import { describeMixerStaves } from '../music/staffInstruments';

export interface StaffSoundTarget {
  staffId: string;
  staffIds?: readonly string[];
  label?: string;
  entryKey?: string;
  host: HTMLElement;
  trigger: HTMLElement | SVGElement;
}

/** Enhance abcjs's existing label; React only owns the external popup host. */
export function StaffInstruments({ paperRef, tune, abc, generation, disabled, onOpen, activeEntryKey }: {
  paperRef: RefObject<HTMLDivElement | null>; tune: abcjs.TuneObject | null; abc: string;
  generation: number; disabled: boolean; activeEntryKey?: string; onOpen: (target: StaffSoundTarget) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeTriggerRef = useRef<SVGElement | null>(null);
  useLayoutEffect(() => {
    const paper = paperRef.current;
    if (!paper || !tune) return;
    let staves;
    try { staves = describeMixerStaves(tune, abc); } catch { return; }
    const cleanups: (() => void)[] = [];
    const labels = [...paper.querySelectorAll<SVGElement>('text.abcjs-voice-name')];
    // An SVG image hides descendant buttons from assistive technologies.
    const svg = paper.querySelector('svg');
    const originalRole = svg?.getAttribute('role');
    if (labels.length && svg) {
      svg.setAttribute('role', 'group');
      cleanups.push(() => { if (originalRole === null) svg.removeAttribute('role'); else if (originalRole) svg.setAttribute('role', originalRole); });
    }
    labels.forEach((label, index) => {
      const system = [...label.classList].find((value) => /^abcjs-l\d+$/.test(value));
      const voice = [...label.classList].find((value) => /^abcjs-v\d+$/.test(value));
      const staff = staves.find((entry) => entry.trackIndexes.includes(voice ? Number(voice.slice(7)) : -1));
      if (!system || !staff) return;
      let staffIds = [staff.id];
      const brace = label.closest<SVGGraphicsElement>('g[data-name="brace"], g[data-name="bracket"]');
      if (brace) {
        const bounds = brace.getBoundingClientRect();
        const tracks = [...paper.querySelectorAll<SVGGraphicsElement>(`.abcjs-staff.${system}`)]
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.top >= bounds.top - 2 && box.bottom <= bounds.bottom + 2;
          }).flatMap((element) => [...element.classList].filter((value) => /^abcjs-v\d+$/.test(value)).map((value) => Number(value.slice(7))));
        staffIds = staves.filter((entry) => entry.trackIndexes.some((track) => tracks.includes(track))).map((entry) => entry.id);
        if (!staffIds.length) staffIds = [staff.id];
      }
      const key = `${system}:label-${index}`;
      const attributes = ['role', 'tabindex', 'aria-label', 'aria-haspopup', 'aria-expanded', 'aria-controls', 'aria-disabled'];
      const original = attributes.map((name) => [name, label.getAttribute(name)] as const);
      label.classList.add('staff-sound-label');
      label.setAttribute('role', 'button');
      label.setAttribute('tabindex', disabled ? '-1' : '0');
      label.setAttribute('aria-label', `${label.textContent?.trim() || 'Staff'}: staff sounds`);
      label.setAttribute('aria-haspopup', 'dialog');
      label.setAttribute('aria-expanded', String(activeEntryKey === key));
      label.setAttribute('aria-disabled', String(disabled));
      if (activeEntryKey === key) label.setAttribute('aria-controls', 'staff-sound-dialog');
      const target = () => ({ staffId: staff.id, staffIds, label: label.textContent?.trim(), entryKey: key, host: hostRef.current!, trigger: label });
      // Source edits replace abcjs's SVG nodes; retain the live label anchor.
      if (activeEntryKey === key && activeTriggerRef.current !== label && hostRef.current) {
        activeTriggerRef.current = label;
        onOpen(target());
      }
      const open = (event: Event) => {
        event.preventDefault(); event.stopPropagation();
        if (!disabled && hostRef.current) { activeTriggerRef.current = label; onOpen(target()); }
      };
      const keydown = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') open(event); };
      label.addEventListener('click', open);
      label.addEventListener('keydown', keydown);
      cleanups.push(() => {
        label.classList.remove('staff-sound-label');
        for (const [name, value] of original) { if (value === null) label.removeAttribute(name); else label.setAttribute(name, value); }
        label.removeEventListener('click', open); label.removeEventListener('keydown', keydown);
      });
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [paperRef, tune, abc, generation, disabled, onOpen, activeEntryKey]);
  return createPortal(<div ref={hostRef} className="staff-sound-panel-host" />, document.body);
}
