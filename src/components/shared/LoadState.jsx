import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Home, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function LoadState({
  title = 'Loading',
  description = 'Getting the latest data.',
  error,
  fullScreen = false,
  retry,
  homeLink = true,
  className,
}) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8000)
    return () => window.clearTimeout(timer)
  }, [])

  const hasError = Boolean(error)
  const wrapperClass = fullScreen ? 'min-h-screen' : 'min-h-[60vh]'

  return (
    <div className={cn('flex w-full items-center justify-center bg-background p-4', wrapperClass, className)}>
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 text-center shadow-sm">
        <div
          className={cn(
            'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl',
            hasError ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-primary/10 text-primary'
          )}
        >
          {hasError ? <AlertTriangle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin" />}
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          {hasError ? title || 'Could not load data' : slow ? 'Still loading' : title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasError
            ? error
            : slow
            ? 'This is taking longer than usual. You can keep waiting or reload the page.'
            : description}
        </p>
        {(slow || hasError) && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={retry || (() => window.location.reload())}>
              <RefreshCw size={16} />
              Retry
            </Button>
            {homeLink && (
              <Button variant="outline" asChild>
                <Link to="/home">
                  <Home size={16} />
                  Home
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
