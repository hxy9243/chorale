import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  resetKey?: string;
  onError?: (error: Error) => void;
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
    this.props.onError?.(error);
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps): void {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.resetError();
    }
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
            fontFamily: 'var(--font-ui)',
            backgroundColor: 'var(--surface-backdrop)',
            color: 'var(--text)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              padding: '32px',
              borderRadius: 'var(--radius-float)',
              backgroundColor: 'var(--surface-wing)',
              border: '1px solid var(--line-control)',
              boxShadow: 'var(--shadow-float)',
            }}
          >
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', fontWeight: 600 }}>
              Something went wrong
            </h2>
            <p
              style={{
                margin: '0 0 16px 0',
                fontSize: '0.875rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              Chorale encountered an unexpected error. Your documents remain safely stored.
            </p>
            <div
              style={{
                padding: '8px 12px',
                marginBottom: '20px',
                borderRadius: 'var(--radius-control)',
                backgroundColor: 'var(--color-warning-soft)',
                border: '1px solid var(--status-pending)',
                color: 'var(--status-pending)',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-meta)',
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
                  borderRadius: 'var(--radius-control)',
                  border: 'none',
                  backgroundColor: 'var(--text)',
                  color: 'var(--surface-wing)',
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
                  borderRadius: 'var(--radius-control)',
                  border: '1px solid var(--line-control)',
                  backgroundColor: 'transparent',
                  color: 'var(--text)',
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
