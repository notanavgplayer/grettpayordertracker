import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, FileStack, Users, Receipt,
  Calendar, StickyNote, CheckSquare, Settings, Search,
  Activity, LogOut, Moon, Sun, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'

const NAV_ITEMS = [
  { to: '/home', icon: LayoutDashboard, label: 'Home' },
  { to: '/pay-orders', icon: FileText, label: 'Pay Orders' },
  { to: '/tenders', icon: FileStack, label: 'Tenders' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/notes', icon: StickyNote, label: 'Notes' },
  { to: '/todo', icon: CheckSquare, label: 'To-Do' },
  { to: '/activity', icon: Activity, label: 'Activity Log' },
]

export default function Sidebar({ onClose }) {
  const { logout, displayName, role } = useAuth()
  const { toggleTheme, isDark } = useTheme()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
    toast.success('Signed out successfully')
  }

  return (
    <div className="flex h-full flex-col bg-card border-r border-border w-64">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path d="M12 2L3 8v2h2v10h4v-5h6v5h4V10h2V8L12 2z" fill="hsl(var(--amber))" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">Grett Engineering</p>
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Pay Order Tracker</p>
        </div>
      </div>

      {/* Search shortcut */}
      <div className="px-3 py-3">
        <NavLink
          to="/search"
          onClick={onClose}
          className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-muted-foreground border border-border hover:bg-accent hover:text-foreground transition-colors"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1">Search…</span>
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">/</kbd>
        </NavLink>
      </div>

      <Separator />

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 scrollbar-thin">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        <Separator className="my-2" />

        <NavLink
          to="/settings"
          onClick={onClose}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )
          }
        >
          <Settings className="h-4 w-4 flex-shrink-0" />
          Settings
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-2">
        <div className="flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold flex-shrink-0">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{role}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex-1 h-8"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleLogout}
            title="Sign out"
            className="flex-1 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
