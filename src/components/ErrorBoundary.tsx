import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled React ErrorBoundary error caught:', error, errorInfo);
  }

  resetError = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '24px',
            fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            backgroundColor: 'var(--bg-primary, #18181b)',
            color: 'var(--text-primary, #f4f4f5)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              padding: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-secondary, #27272a)',
              border: '1px solid var(--border-color, #3f3f46)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            }}
          >
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Something went wrong
            </h2>
            <p
              style={{
                margin: '0 0 16px 0',
                fontSize: '0.875rem',
                color: 'var(--text-secondary, #a1a1aa)',
                lineHeight: 1.5,
              }}
            >
              Chorale encountered an unexpected error. Your documents remain safely stored.
            </p>
            <div
              style={{
                padding: '8px 12px',
                marginBottom: '20px',
                borderRadius: '4px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono, monospace)',
                wordBreak: 'break-word',
                textAlign: 'left',
              }}
            >
              {this.state.error.message || 'Unknown error'}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.resetError}
                style={{
                  padding: '8px 16px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: 'var(--accent-color, #3b82f6)',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color, #52525b)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-primary, #f4f4f5)',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
