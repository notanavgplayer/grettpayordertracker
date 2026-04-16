import { useState } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar via Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64">
          <Sidebar onClose={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Mobile header */}
        <header className="flex lg:hidden items-center gap-3 border-b border-border px-4 py-3 bg-card flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M12 2L3 8v2h2v10h4v-5h6v5h4V10h2V8L12 2z" fill="#e8940a" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-foreground">Grett Tracker</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  )
}
