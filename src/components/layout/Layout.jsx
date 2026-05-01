import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, Moon, Sun, PanelLeft, Search } from 'lucide-react'
import Sidebar from './Sidebar'
import NotificationsBell from './NotificationsBell'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import CommandPalette from '@/components/shared/CommandPalette'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { toast } from 'sonner'

const SIDEBAR_STORAGE_KEY = 'grett-sidebar-collapsed'

const PAGE_BREADCRUMBS = {
  '/home': [{ label: 'Home' }],
  '/tenders': [{ label: 'Home', href: '/home' }, { label: 'Tenders' }],
  '/pay-orders': [{ label: 'Home', href: '/home' }, { label: 'Pay Orders' }],
  '/expenses': [{ label: 'Home', href: '/home' }, { label: 'Expenses' }],
  '/calendar': [{ label: 'Home', href: '/home' }, { label: 'Calendar' }],
  '/todo': [{ label: 'Home', href: '/home' }, { label: 'To-Do' }],
  '/contacts': [{ label: 'Home', href: '/home' }, { label: 'Contacts' }],
  '/notes': [{ label: 'Home', href: '/home' }, { label: 'Notes' }],
  '/activity': [{ label: 'Home', href: '/home' }, { label: 'Activity' }],
  '/search': [{ label: 'Home', href: '/home' }, { label: 'Search' }],
  '/settings': [{ label: 'Home', href: '/home' }, { label: 'Settings' }],
  '/data-health': [{ label: 'Home', href: '/home' }, { label: 'Data Health' }],
}

function getPageBreadcrumbs(pathname) {
  if (pathname.startsWith('/tenders/')) return null
  return PAGE_BREADCRUMBS[pathname] || null
}

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1' } catch { return false }
  })
  const { logout } = useAuth()
  const { toggleTheme, isDark } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const breadcrumbs = getPageBreadcrumbs(location.pathname)

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0') } catch {}
  }, [collapsed])

  const handleLogout = async () => {
    await logout()
    navigate('/')
    toast.success('Signed out successfully')
  }

  return (
    <TooltipProvider delayDuration={300}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Skip to main content
      </a>

      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-shrink-0">
          <Sidebar collapsed={collapsed} onSignOut={() => setSignOutOpen(true)} />
        </aside>

        {/* Mobile sidebar via Sheet */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[300px] max-w-[86vw] p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Main application navigation menu</SheetDescription>
            <Sidebar
              onClose={() => setMobileOpen(false)}
              onSignOut={() => { setMobileOpen(false); setSignOutOpen(true) }}
            />
          </SheetContent>
        </Sheet>

        {/* Main column */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex h-16 flex-shrink-0 items-center gap-2 border-b border-border/80 bg-background/90 px-3 shadow-sm backdrop-blur-md sm:px-4 lg:px-6">
            {/* Mobile hamburger */}
            <Button
              variant="ghost" size="icon" className="h-10 w-10 rounded-xl lg:hidden"
              onClick={() => setMobileOpen(true)} aria-label="Open menu"
            >
              <Menu size={19} />
            </Button>

            {/* Desktop collapse toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  className="hidden h-10 w-10 rounded-xl lg:inline-flex"
                  onClick={() => setCollapsed((v) => !v)}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  <PanelLeft size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{collapsed ? 'Expand' : 'Collapse'}</TooltipContent>
            </Tooltip>

            {/* Centered command palette trigger (pill) — desktop shows pill, mobile collapses to a spacer */}
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2 sm:hidden">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path d="M12 2L3 8v2h2v10h4v-5h6v5h4V10h2V8L12 2z" fill="currentColor" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">Grett Engineering Solutions</p>
                <p className="truncate text-xs text-muted-foreground">Pay Order Tracker</p>
              </div>
            </div>

            <div className="hidden flex-1 justify-center px-2 sm:flex">
              <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
            </div>

            {/* Mobile search trigger */}
            <Button
              variant="ghost" size="icon"
              className="h-10 w-10 rounded-xl sm:hidden"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
            >
              <Search size={16} />
            </Button>

            {/* Theme toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  onClick={toggleTheme}
                  aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                  className="h-10 w-10 rounded-xl"
                >
                  {isDark ? <Sun size={16} /> : <Moon size={16} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isDark ? 'Light mode' : 'Dark mode'}</TooltipContent>
            </Tooltip>

            <NotificationsBell />
          </header>

          {/* Page content */}
          <main
            id="main" tabIndex={-1}
            className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin outline-none"
          >
            <div className="mx-auto w-full px-4 py-4 lg:px-6 lg:py-6">
              {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Sign-out confirmation */}
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be returned to the login screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
