'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Client-side error boundary. When a child component throws, this records the
 * crash to system_errors via /api/system-errors with source: 'client' and renders
 * a fallback UI. The POST is fire-and-forget so a network failure does not
 * create a second error for the user.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: { digest?: string; componentStack?: string }) {
    const payload = {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      path: typeof window !== 'undefined' ? window.location.pathname : null,
      context: {
        digest: info.digest,
        componentStack: info.componentStack,
      },
    }

    // Fire-and-forget with its own catch so recording can never bubble.
    fetch('/api/system-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[60vh] items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <h1 className="text-lg font-semibold">This page failed to load</h1>
              <p className="mt-2 text-sm text-muted">
                The error has been recorded. Reload the page to try again.
              </p>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
