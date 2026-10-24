import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../ErrorBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('recoverable score error boundary', () => {
  it('reports a failure once, supports retry, and recovers when the source or document changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const Score = ({ fails }: { fails: boolean }) => {
      if (fails) throw new Error('Unsupported score');
      return <p>Rendered score</p>;
    };
    const fallback = (_error: Error, reset: () => void) => <button onClick={reset}>Retry score</button>;
    const { rerender } = render(<ErrorBoundary resetKey="doc-1:bad" onError={onError} fallback={fallback}><Score fails /></ErrorBoundary>);
    expect(onError).toHaveBeenCalledTimes(1);
    rerender(<ErrorBoundary resetKey="doc-1:bad" onError={onError} fallback={fallback}><Score fails={false} /></ErrorBoundary>);
    fireEvent.click(screen.getByRole('button', { name: 'Retry score' }));
    expect(screen.getByText('Rendered score')).toBeDefined();
    rerender(<ErrorBoundary resetKey="doc-1:bad" onError={onError} fallback={fallback}><Score fails /></ErrorBoundary>);
    rerender(<ErrorBoundary resetKey="doc-2:good" onError={onError} fallback={fallback}><Score fails={false} /></ErrorBoundary>);
    expect(screen.getByText('Rendered score')).toBeDefined();
  });
});
