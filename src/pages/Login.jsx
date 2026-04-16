import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Loader2, Lock, Moon, Sun, Mail, KeyRound, ShieldCheck, ArrowRight, Building2 } from 'lucide-react'

const ERROR_MESSAGES = {
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment.',
  'auth/invalid-credential': 'Invalid email or password.',
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()
  const { toggleTheme, isDark } = useTheme()

  useEffect(() => {
    if (user) navigate('/home', { replace: true })
  }, [user, navigate])

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (!email || !password) { setError('Please enter your email and password.'); return }
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
      navigate('/home', { replace: true })
    } catch (err) {
      setError(ERROR_MESSAGES[err.code] || 'Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Decorative gradient blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-32 h-[480px] w-[480px] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_70%)]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Theme toggle top-right */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleTheme}
        className="fixed top-4 right-4 rounded-full"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Brand mark above card */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/30 ring-1 ring-white/10">
              <Building2 className="h-7 w-7 text-amber-400" strokeWidth={2.25} />
            </div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              Grett Engineering Solutions
            </h2>
            <p className="mt-0.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              Pay Order Tracker
            </p>
          </div>

          <Card className="border-border/60 bg-card/80 shadow-2xl shadow-primary/5 backdrop-blur-xl">
            <CardHeader className="space-y-1.5 pb-4">
              <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
              <CardDescription>
                Sign in to your account to continue. Restricted to authorized personnel.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      className="h-11 pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Password
                  </Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      className="h-11 pl-10"
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive animate-in fade-in slide-in-from-top-1">
                    <Lock className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="group h-11 w-full gap-2 bg-gradient-to-r from-primary to-primary/85 text-base font-semibold shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>

              <Separator className="my-6" />

              <div className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Secured by Firebase Authentication. Contact your administrator if you need access.
                </p>
              </div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Grett Engineering Solutions · All rights reserved
          </p>
        </div>
      </div>
    </div>
  )
}
