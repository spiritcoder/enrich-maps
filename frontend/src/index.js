import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Error boundary for extension conflicts
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.log('Extension conflict detected:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>🔧 Extension Conflict Detected</h2>
          <p>Please try:</p>
          <ul style={{ textAlign: 'left', maxWidth: '400px', margin: '0 auto' }}>
            <li>Use incognito mode</li>
            <li>Disable browser extensions temporarily</li>
            <li>Try a different browser</li>
          </ul>
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);