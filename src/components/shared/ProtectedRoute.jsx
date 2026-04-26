import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Loader2, ShieldAlert } from 'lucide-react'

export default function ProtectedRoute({ children }) {
  const { user, loading, isAdmin, logout } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Access pending</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is signed in, but it has not been granted admin access to this tracker yet.
          </p>
          <Button className="mt-5" variant="outline" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    )
  }

  return children
}
