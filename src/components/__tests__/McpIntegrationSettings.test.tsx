import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { McpIntegrationSettings } from '../McpIntegrationSettings';
import { SettingsModal } from '../SettingsModal';
import type { McpIntegrationBridge } from '../../types/mcpIntegration';

function setup(overrides: Partial<McpIntegrationBridge> = {}) {
  const bridge: McpIntegrationBridge = {
    offerSetup: vi.fn().mockResolvedValue('none'), onOpenSettings: vi.fn(() => () => {}), openGuide: vi.fn().mockResolvedValue(undefined),
    preview: vi.fn().mockResolvedValue({ id: 'preview-1', label: 'Claude Desktop', kind: 'json', summary: 'Target config and proposed connection', hasGuide: false }),
    connect: vi.fn().mockResolvedValue({ status: 'connected', message: 'MCP connected' }), ...overrides,
  };
  window.choraleMcp = bridge;
  return bridge;
}
afterEach(() => { delete window.choraleMcp; });

describe('MCP integration settings', () => {
  it('reviews and confirms a connection entirely in Settings → Integration', async () => {
    const bridge = setup();
    render(<SettingsModal open initialTab="integration" onClose={() => {}} interfaceZoom={100} onInterfaceZoomChange={() => {}} />);
    expect(screen.getByRole('tabpanel', { name: 'Integration' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'MCP integration' })).toBeDefined();
    const reviewBtn = screen.getByRole('button', { name: 'Review MCP connection' });
    expect(reviewBtn.className).toContain('mcp-action-btn');
    fireEvent.click(reviewBtn);
    expect(await screen.findByText('Target config and proposed connection')).toBeDefined();
    expect(bridge.connect).not.toHaveBeenCalled();
    const connectBtn = screen.getByRole('button', { name: 'Connect Claude Desktop' });
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    expect(connectBtn.className).toContain('mcp-connect-btn');
    expect(cancelBtn.className).toContain('mcp-cancel-btn');
    fireEvent.click(connectBtn);
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'MCP connected');
    expect(bridge.connect).toHaveBeenCalledWith('preview-1');
  });
  it('cancelling or switching apps requires a fresh review without changing configuration', async () => {
    const bridge = setup(); render(<McpIntegrationSettings />);
    fireEvent.click(screen.getByText('Review MCP connection'));
    await screen.findByText('Target config and proposed connection');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(bridge.connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Review MCP connection'));
    await screen.findByText('Target config and proposed connection');
    fireEvent.change(screen.getByLabelText('AI app for MCP integration'), { target: { value: 'codex' } });
    expect(screen.queryByRole('button', { name: 'Connect Claude Desktop' })).toBeNull();
    fireEvent.click(screen.getByText('Review MCP connection'));
    await waitFor(() => expect(bridge.preview).toHaveBeenLastCalledWith('codex'));
  });
  it('shows manual guidance and opens the guide only on request', async () => {
    const bridge = setup({ preview: vi.fn().mockResolvedValue({ id: 'manual', label: 'ChatGPT', kind: 'manual', summary: 'HTTPS required', hasGuide: true }) });
    render(<McpIntegrationSettings />);
    fireEvent.change(screen.getByLabelText('AI app for MCP integration'), { target: { value: 'chatgpt' } });
    fireEvent.click(screen.getByText('Review MCP connection'));
    await screen.findByText('HTTPS required');
    expect(screen.queryByRole('button', { name: 'Connect ChatGPT' })).toBeNull();
    expect(bridge.openGuide).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('View MCP setup guide'));
    await waitFor(() => expect(bridge.openGuide).toHaveBeenCalledOnce());
  });
  it('shows connection errors inline and requires a new review to retry', async () => {
    setup({ connect: vi.fn().mockRejectedValue(new Error('Configuration changed; review again.')) });
    render(<McpIntegrationSettings />);
    fireEvent.click(screen.getByText('Review MCP connection'));
    fireEvent.click(await screen.findByText('Connect Claude Desktop'));
    expect((await screen.findByRole('alert')).textContent).toContain('Configuration changed');
    expect(screen.queryByText('Connect Claude Desktop')).toBeNull();
  });
  it('explains how to configure MCP when running in a browser', () => {
    render(<McpIntegrationSettings />);
    expect(screen.getByText(/Use the Chorale desktop app/)).toBeDefined();
  });
});
