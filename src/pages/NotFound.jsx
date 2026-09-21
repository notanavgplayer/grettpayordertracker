import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background p-4">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 text-center" aria-labelledby="not-found-title">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 id="not-found-title" className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">The address may be incorrect, or the page may have moved.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft /> Back</Button>
          <Button onClick={() => navigate('/home')}><Home /> Home</Button>
        </div>
      </section>
    </div>
  )
}
