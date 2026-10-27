import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderPlaybackScore } from '../../utils/abcAudio';
import { StaffInstruments } from '../StaffInstruments';

const abc = 'X:1\nM:4/4\nL:1/4\n%%score (S A) B\nV:S name="Upper"\nV:A\nV:B name="Lower" clef=bass\nK:C\n[V:S] C4 | D4 |\n[V:A] E4 | F4 |\n[V:B] C,4 | G,,4 |';

function setup(markup?: string) {
  const paper = document.createElement('div');
  const [tune] = renderPlaybackScore(paper, abc, { add_classes: true });
  if (markup) paper.innerHTML = markup;
  document.body.append(paper);
  const paperRef = createRef<HTMLDivElement>(); paperRef.current = paper;
  const onOpen = vi.fn();
  const props = { paperRef, tune, abc, generation: 1, disabled: false, onOpen };
  const view = render(<StaffInstruments {...props} />);
  return { paper, props, view, onOpen };
}

describe('engraved staff sound labels', () => {
  it('enhances the original text without adding buttons or changing layout, and cleans up listeners', () => {
    const { paper, props, view, onOpen } = setup();
    const label = screen.getByRole('button', { name: 'Upper: staff sounds' });
    expect(label.tagName.toLowerCase()).toBe('text');
    expect(label.textContent).toBe('Upper');
    expect(paper.querySelector('svg')?.getAttribute('role')).toBe('group');
    expect(document.querySelector('.staff-sound-button')).toBeNull();
    expect(document.querySelector('.staff-sound-panel-host')?.parentElement).toBe(document.body);
    fireEvent.click(label);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ staffIds: ['staff:["A","S"]'], trigger: label }));
    fireEvent.keyDown(label, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(2);
    view.rerender(<StaffInstruments {...props} disabled />);
    expect(label.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(label);
    expect(onOpen).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(label.hasAttribute('role')).toBe(false);
    fireEvent.click(label);
    expect(onOpen).toHaveBeenCalledTimes(2);
    paper.remove();
  });
  it('opens both independently controlled staves from an existing Piano brace label', () => {
    const { paper, view, onOpen } = setup('<svg><g class="abcjs-voice-name abcjs-l0 abcjs-v0" data-name="brace"><path/><text class="abcjs-voice-name abcjs-l0 abcjs-v0">Piano</text></g><path class="abcjs-staff abcjs-l0 abcjs-v0"/><path class="abcjs-staff abcjs-l0 abcjs-v2"/></svg>');
    const label = screen.getByRole('button', { name: 'Piano: staff sounds' });
    fireEvent.click(label);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ staffIds: ['staff:["A","S"]', 'staff:["B"]'], label: 'Piano' }));
    expect(paper.querySelectorAll('.staff-sound-label')).toHaveLength(1);
    view.unmount(); paper.remove();
  });
  it('leaves unnamed staves without synthetic buttons', () => {
    const { paper, view, onOpen } = setup('<svg><path class="abcjs-staff abcjs-l0 abcjs-v0"/></svg>');
    expect(paper.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(onOpen).not.toHaveBeenCalled();
    view.unmount(); paper.remove();
  });
});
