import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

function showFatalError(message, stack) {
  const root = document.getElementById('root')
  root.innerHTML = `
    <div style="padding:20px;font-family:monospace;background:#fff;color:#b91c1c;min-height:100vh;">
      <h2 style="color:#111;margin-bottom:10px;">Aplikasi gagal dimuat:</h2>
      <pre style="white-space:pre-wrap;font-size:13px;">${message}</pre>
      <pre style="white-space:pre-wrap;font-size:11px;margin-top:20px;color:#666;">${stack || ''}</pre>
    </div>
  `
}

window.addEventListener('error', (e) => {
  showFatalError(e.message, e.error?.stack)
})
window.addEventListener('unhandledrejection', (e) => {
  showFatalError(String(e.reason?.message || e.reason), e.reason?.stack)
})

import('./App.jsx')
  .then((mod) => {
    const App = mod.default
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <ErrorBoundary>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </React.StrictMode>,
    )
  })
  .catch((err) => {
    showFatalError(err.message, err.stack)
  })
