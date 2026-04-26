import { Component } from 'react'
import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error, info) {
    console.error('Route error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page hit an unexpected error. Reloading usually clears temporary app-state issues.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => window.location.reload()}>
              <RefreshCw size={16} />
              Reload
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = '/home' }}>
              <Home size={16} />
              Home
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
