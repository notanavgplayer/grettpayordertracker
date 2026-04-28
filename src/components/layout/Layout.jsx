import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Menu, Moon, Sun, PanelLeft, Search, Home, BriefcaseBusiness, FileText, Settings } from 'lucide-react'
import Sidebar from './Sidebar'
import NotificationsBell from './NotificationsBell'
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
const MOBILE_NAV_ITEMS = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/tenders', label: 'Tenders', icon: BriefcaseBusiness },
  { to: '/pay-orders', label: 'Pay Orders', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
]

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
          <SheetContent side="left" className="p-0 w-[280px]">
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
          <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-md px-4 lg:px-6 flex-shrink-0">
            {/* Mobile hamburger */}
            <Button
              variant="ghost" size="icon" className="lg:hidden h-9 w-9"
              onClick={() => setMobileOpen(true)} aria-label="Open menu"
            >
              <Menu size={18} />
            </Button>

            {/* Desktop collapse toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  className="hidden lg:inline-flex h-9 w-9"
                  onClick={() => setCollapsed((v) => !v)}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  <PanelLeft size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{collapsed ? 'Expand' : 'Collapse'}</TooltipContent>
            </Tooltip>

            {/* Centered command palette trigger (pill) — desktop shows pill, mobile collapses to a spacer */}
            <div className="flex flex-1 items-center justify-center gap-2 sm:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
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
              className="sm:hidden h-9 w-9"
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
                  className="h-9 w-9"
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
            <div className="mx-auto w-full px-4 pb-24 pt-4 lg:px-6 lg:py-6">
              {children}
            </div>
          </main>

          <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-6 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-md lg:hidden">
            <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
              {MOBILE_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-xs transition-colors ${
                      isActive ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className="h-6 w-6" strokeWidth={isActive ? 2.2 : 1.8} />
                      <span className="truncate">{label}</span>
                      <span className={`h-1 w-8 rounded-full ${isActive ? 'bg-emerald-600' : 'bg-transparent'}`} />
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
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
