import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error in GGMS App:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#f8fafc', fontFamily: 'sans-serif', textAlign: 'center' }}>
          <div style={{ background: '#fff', padding: '32px', borderRadius: '32px', border: '1px solid #e2e8f0', boxShadow: '0 20px 50px rgba(0,0,0,0.08)', maxWidth: '480px', width: '100%' }}>
            <div style={{ width: '64px', height: '64px', background: '#fff1f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#f43f5e', fontSize: '32px' }}>
              ⚠️
            </div>
            <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', margin: '0 0 8px' }}>કાંઈક ભૂલ થઈ છે / Something went wrong</h1>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px' }}>The application encountered an unexpected error. Please try reloading.</p>
            <div style={{ textAlign: 'left', background: '#f8fafc', padding: '12px', borderRadius: '12px', color: '#f43f5e', fontFamily: 'monospace', fontSize: '10px', maxHeight: '120px', overflow: 'auto', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <strong>Error:</strong> {this.state.error?.toString()}
              {this.state.errorInfo && (
                <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap' }}>{this.state.errorInfo.componentStack}</pre>
              )}
            </div>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              style={{ padding: '10px 24px', background: '#059669', color: '#fff', borderRadius: '12px', fontSize: '12px', fontWeight: 900, border: 'none', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
            >
              Clear Storage &amp; Reload / રીલોડ કરો
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
