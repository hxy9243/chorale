import { useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePaneMenu } from '../WorkspacePaneMenu';

afterEach(cleanup);

function Harness({ replaceLauncher = false, onSelect = vi.fn() }) {
  const [open, setOpen] = useState(false);
  const [launcherKey, setLauncherKey] = useState(0);
  const paneMenuRef = useRef<HTMLDivElement>(null);
  return <div className="score-editor-shell">
    <div key={launcherKey}>
      <button className="workspace-add-tab-btn" onClick={() => setOpen(true)}>Open pane</button>
      {open && <WorkspacePaneMenu paneMenuRef={paneMenuRef}
        sheetVisible editorVisible waterfallVisible={false} paneOrientation="horizontal"
        onOpenSheet={() => onSelect('sheet')} onOpenEditor={() => onSelect('editor')}
        onOpenWaterfall={() => onSelect('waterfall')}
        onLayoutChange={layout => {
          onSelect(layout);
          if (replaceLauncher) setLauncherKey(key => key + 1);
        }}
        onClose={() => setOpen(false)} />}
    </div>
    <input aria-label="Next workspace control" onMouseDown={() => setOpen(false)} />
  </div>;
}

function openMenu() {
  const launcher = screen.getByRole('button', { name: 'Open pane' });
  launcher.focus();
  fireEvent.click(launcher);
  return launcher;
}

describe('WorkspacePaneMenu keyboard focus', () => {
  it('focuses the portaled menu immediately and supports arrows, Home, and End', () => {
    const { container } = render(<Harness />);
    openMenu();
    const menu = screen.getByRole('menu');
    expect(container.contains(menu)).toBe(false);
    const sheet = screen.getByRole('menuitem', { name: /Sheet/ });
    const editor = screen.getByRole('menuitem', { name: /ABC source/ });
    const last = screen.getByRole('menuitemradio', { name: 'Split stack right' });
    expect(document.activeElement).toBe(sheet);
    fireEvent.keyDown(sheet, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(editor);
    fireEvent.keyDown(editor, { key: 'End' });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(sheet);
    fireEvent.keyDown(sheet, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Home' });
    expect(document.activeElement).toBe(sheet);
    fireEvent.keyDown(sheet, { key: 'ArrowDown' });
    fireEvent(window, new Event('resize'));
    expect(document.activeElement).toBe(editor);
  });

  it('returns focus to the launcher after Escape', async () => {
    render(<Harness />);
    const launcher = openMenu();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await act(async () => {});
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(launcher);
  });

  it.each([false, true])('returns focus after layout selection with replacement launcher: %s', async replaceLauncher => {
    const onSelect = vi.fn();
    render(<Harness replaceLauncher={replaceLauncher} onSelect={onSelect} />);
    const originalLauncher = openMenu();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Split stack right' }));
    await act(async () => {});
    expect(onSelect).toHaveBeenCalledWith('split-right');
    expect(screen.queryByRole('menu')).toBeNull();
    const launcher = screen.getByRole('button', { name: 'Open pane' });
    expect(launcher === originalLauncher).toBe(!replaceLauncher);
    expect(document.activeElement).toBe(launcher);
  });

  it('returns focus after opening a pane', async () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const launcher = openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Waterfall/ }));
    await act(async () => {});
    expect(onSelect).toHaveBeenCalledWith('waterfall');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(launcher);
  });

  it('preserves the clicked control focus when dismissed by clicking away', async () => {
    render(<Harness />);
    openMenu();
    const outside = screen.getByRole('textbox', { name: 'Next workspace control' });
    fireEvent.mouseDown(outside);
    outside.focus();
    await act(async () => {});
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });
});
