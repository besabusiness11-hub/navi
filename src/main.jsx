import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Dashboard from './Dashboard.jsx'
import CheckoutSuccess from './CheckoutSuccess.jsx'
import Admin from './Admin.jsx'
import { startFaviconAnimation } from './faviconAnimator.js'
import './index.css'

// Animated favicon — vinyl color crossfade loop
startFaviconAnimation();

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('CRASH:', error.message, error.stack, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', background: '#020a10', color: '#ff6666', fontFamily: 'monospace', minHeight: '100vh' }}>
          <h2 style={{ color: '#ff4444' }}>Runtime Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '14px' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px', opacity: 0.6 }}>{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

const path = window.location.pathname;
const isDashboard = path.startsWith('/dashboard');
const isCheckoutSuccess = path.startsWith('/checkout/success');
const isAdmin = path.startsWith('/admin');

const screen = isAdmin
  ? <Admin />
  : isDashboard
    ? <Dashboard />
    : isCheckoutSuccess
      ? <CheckoutSuccess />
      : <App />;

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>{screen}</ErrorBoundary>,
)
