import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChoraleReasoningView } from '../ChoraleReasoningView';
import { ChoraleStreamdownMessage } from '../ChoraleStreamdownMessage';

describe('ChoraleStreamdownMessage', () => {
  it('renders markdown text and navigates on score reference click', () => {
    const onNavigateMeasure = vi.fn();
    render(
      <ChoraleStreamdownMessage
        content="See [m. 5](#measure-5) and [other link](https://example.com) for details."
        totalMeasures={10}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );

    const scoreButton = screen.getByRole('button', { name: 'm. 5' });
    expect(scoreButton).toBeTruthy();
    expect(scoreButton.className).toContain('score-reference-link');

    fireEvent.click(scoreButton);
    expect(onNavigateMeasure).toHaveBeenCalledWith({
      startMeasure: 5,
      endMeasure: 5,
    });

    const disabledLink = screen.getByText('other link');
    expect(disabledLink.tagName.toLowerCase()).toBe('span');
    expect(disabledLink.getAttribute('aria-disabled')).toBe('true');
  });

  it('disables raw HTML while preserving ordinary Markdown rendering', () => {
    render(
      <ChoraleStreamdownMessage
        content="Testing <img src=x onerror=alert(1)> and <b>bold text</b>."
        totalMeasures={10}
        onNavigateMeasure={vi.fn()}
      />,
    );

    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });

  it('also disables raw HTML inside reasoning traces', () => {
    render(
      <ChoraleReasoningView
        reasoning="Testing <img src=x onerror=alert(1)> and <b>bold thought</b>."
      />,
    );

    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
  });

  it('renders a markdown table with semantic elements and without Streamdown control buttons', () => {
    const onNavigateMeasure = vi.fn();
    const { container } = render(
      <ChoraleStreamdownMessage
        content={`| Measure | Harmony | Function |
| :--- | :---: | ---: |
| [m. 1](#measure-1) | C maj | Tonic |
| [m. 2](#measure-2) | G7 | Dominant |`}
        totalMeasures={10}
        onNavigateMeasure={onNavigateMeasure}
      />,
    );

    // Verify container and table structure
    const tableContainer = container.querySelector('.chorale-table-container');
    expect(tableContainer).not.toBeNull();
    const table = tableContainer?.querySelector('table.chorale-table');
    expect(table).not.toBeNull();

    // Verify headers
    const headers = container.querySelectorAll('th');
    expect(headers).toHaveLength(3);
    expect(headers[0].textContent).toBe('Measure');
    expect(headers[1].textContent).toBe('Harmony');
    expect(headers[2].textContent).toBe('Function');
    expect(headers[1].style.textAlign).toBe('center');
    expect(headers[2].style.textAlign).toBe('right');

    // Verify rows and cells
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const firstRowCells = rows[0].querySelectorAll('td');
    expect(firstRowCells).toHaveLength(3);
    expect(firstRowCells[1].textContent).toBe('C maj');
    expect(firstRowCells[1].style.textAlign).toBe('center');
    expect(firstRowCells[2].textContent).toBe('Tonic');
    expect(firstRowCells[2].style.textAlign).toBe('right');

    // Verify Streamdown control buttons are absent
    expect(screen.queryByTitle('Copy table')).toBeNull();
    expect(screen.queryByTitle('Download table')).toBeNull();
    expect(screen.queryByTitle('View fullscreen')).toBeNull();

    // Verify interactive score links inside table cells work
    const m1Link = screen.getByRole('button', { name: 'm. 1' });
    expect(m1Link).toBeTruthy();
    expect(m1Link.className).toContain('score-reference-link');
    fireEvent.click(m1Link);
    expect(onNavigateMeasure).toHaveBeenCalledWith({
      startMeasure: 1,
      endMeasure: 1,
    });
  });
});
