import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '../SettingsModal';

describe('SettingsModal', () => {
  it('does not render when closed', () => {
    render(
      <SettingsModal
        open={false}
        onClose={() => {}}
        interfaceZoom={100}
        onInterfaceZoomChange={() => {}}
      />,
    );

    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull();
  });

  it('renders with accessible dialog attributes and sets initial focus on close button', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.appendChild(trigger);
    trigger.focus();

    const onClose = vi.fn();
    const { unmount } = render(
      <SettingsModal
        open={true}
        onClose={onClose}
        interfaceZoom={100}
        onInterfaceZoomChange={() => {}}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    const closeBtn = screen.getByRole('button', { name: 'Close settings' });
    expect(document.activeElement).toBe(closeBtn);

    // Escape closes modal
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('traps focus inside the dialog on Tab / Shift+Tab', () => {
    render(
      <SettingsModal
        open={true}
        onClose={() => {}}
        interfaceZoom={100}
        onInterfaceZoomChange={() => {}}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    )];
    const first = focusable[0];
    const last = focusable.at(-1)!;

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(first);
  });

  it('navigates vertical tabs with keyboard arrow keys', () => {
    render(
      <SettingsModal
        open={true}
        onClose={() => {}}
        interfaceZoom={100}
        onInterfaceZoomChange={() => {}}
      />,
    );

    const tablist = screen.getByRole('tablist', { name: 'Settings sections' });
    expect(tablist.getAttribute('aria-orientation')).toBe('vertical');

    const appearanceTab = screen.getByRole('tab', { name: 'Appearance' });
    const aboutTab = screen.getByRole('tab', { name: 'About' });

    expect(appearanceTab.getAttribute('aria-selected')).toBe('true');
    expect(aboutTab.getAttribute('aria-selected')).toBe('false');

    // Arrow down moves to About tab
    fireEvent.keyDown(appearanceTab, { key: 'ArrowDown' });
    expect(aboutTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'About' })).toBeDefined();

    // Arrow up moves back to Appearance tab
    fireEvent.keyDown(aboutTab, { key: 'ArrowUp' });
    expect(appearanceTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Appearance' })).toBeDefined();
  });

  it('adjusts interface scale and resets to 100%', () => {
    const onInterfaceZoomChange = vi.fn();
    render(
      <SettingsModal
        open={true}
        onClose={() => {}}
        interfaceZoom={120}
        onInterfaceZoomChange={onInterfaceZoomChange}
      />,
    );

    expect(screen.getByText('120%')).toBeDefined();

    const slider = screen.getByLabelText('Interface scale');
    fireEvent.change(slider, { target: { value: '140' } });
    expect(onInterfaceZoomChange).toHaveBeenCalledWith(140);

    const resetBtn = screen.getByRole('button', { name: 'Reset to 100%' });
    fireEvent.click(resetBtn);
    expect(onInterfaceZoomChange).toHaveBeenCalledWith(100);
  });

  it('displays application details in About tab', () => {
    render(
      <SettingsModal
        open={true}
        onClose={() => {}}
        interfaceZoom={100}
        onInterfaceZoomChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'About' }));

    const aboutPanel = screen.getByRole('tabpanel', { name: 'About' });
    expect(aboutPanel.textContent).toContain('Chorale');
    expect(aboutPanel.textContent).toContain('Music score workspace and agent skill.');
    expect(screen.getByText('Release')).toBeDefined();
    expect(screen.getByText(/v\d+/)).toBeDefined();
    expect(screen.getByText('Runtime')).toBeDefined();
    expect(screen.getByText('Browser')).toBeDefined();
  });

  it('closes when clicking the backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SettingsModal
        open={true}
        onClose={onClose}
        interfaceZoom={100}
        onInterfaceZoomChange={() => {}}
      />,
    );

    const backdrop = container.querySelector('.ai-modal-backdrop')!;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
