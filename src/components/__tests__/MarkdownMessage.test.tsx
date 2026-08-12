import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownMessage } from '../MarkdownMessage';

describe('MarkdownMessage', () => {
  it('renders GFM structure and omits raw HTML', () => {
    const { container } = render(
      <MarkdownMessage
        content={'## Analysis\n\n- **Strong** motion\n- ~~Hidden~~ line\n\n<table><tr><td>unsafe</td></tr></table>'}
        totalMeasures={8}
        onNavigateMeasure={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Analysis', level: 2 })).toBeTruthy();
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('Strong').tagName).toBe('STRONG');
    expect(screen.getByText('Hidden').tagName).toBe('DEL');
    expect(container.querySelector('table')).toBeNull();
    expect(screen.queryByText('unsafe')).toBeNull();
  });

  it('turns valid score references into keyboard-operable buttons', () => {
    const onNavigateMeasure = vi.fn();
    render(
      <MarkdownMessage
        content={'Compare [the opening](#measure-2) with [the cadence](#measure-7-4).'}
        totalMeasures={8}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'the opening' }));
    expect(onNavigateMeasure).toHaveBeenLastCalledWith({ startMeasure: 2, endMeasure: 2 });

    const cadence = screen.getByRole('button', { name: 'the cadence' });
    cadence.focus();
    fireEvent.keyDown(cadence, { key: 'Enter' });
    fireEvent.click(cadence);
    expect(onNavigateMeasure).toHaveBeenLastCalledWith({ startMeasure: 4, endMeasure: 7 });
  });

  it('renders external, malformed, and out-of-score links without navigation', () => {
    const onNavigateMeasure = vi.fn();
    const { container } = render(
      <MarkdownMessage
        content={'[Website](https://example.com) [bad](#measure-x) [missing](#measure-9)'}
        totalMeasures={8}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );

    expect(container.querySelector('a')).toBeNull();
    const inertLinks = container.querySelectorAll('.markdown-link-disabled');
    expect(inertLinks).toHaveLength(3);
    expect([...inertLinks].every((link) => link.getAttribute('aria-disabled') === 'true')).toBe(true);
    fireEvent.click(screen.getByText('Website'));
    expect(onNavigateMeasure).not.toHaveBeenCalled();
  });

  it('renders completed think tags as collapsed quoted traces', () => {
    const { container } = render(
      <MarkdownMessage
        content={'<think>Check the **dominant** first.</think>\n\nThe cadence resolves.'}
        totalMeasures={8}
        onNavigateMeasure={vi.fn()}
      />,
    );

    const trace = container.querySelector('details.agent-thinking-trace');
    expect(trace).not.toBeNull();
    expect(trace?.hasAttribute('open')).toBe(false);
    expect(trace?.querySelector('summary')?.textContent).toBe('Thinking');
    expect(trace?.querySelector('blockquote')?.textContent).toContain('Check the dominant first.');
    expect(screen.getByText('The cadence resolves.')).toBeDefined();
    expect(container.textContent).not.toContain('<think>');
  });

  it('keeps an unfinished streaming think block expanded', () => {
    const { container } = render(
      <MarkdownMessage
        content="<think>Following the inner voices"
        totalMeasures={8}
        onNavigateMeasure={vi.fn()}
      />,
    );

    const trace = container.querySelector('details.agent-thinking-trace');
    expect(trace?.hasAttribute('open')).toBe(true);
    expect(trace?.querySelector('summary')?.textContent).toBe('Thinking…');
    expect(trace?.querySelector('blockquote')?.textContent).toContain('Following the inner voices');
  });
});
