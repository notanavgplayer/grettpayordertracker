import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, FileStack, Users, Receipt,
  Calendar, StickyNote, CheckSquare, Settings, Activity,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/AuthContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/home', icon: LayoutDashboard, label: 'Home' },
      { to: '/activity', icon: Activity, label: 'Activity' },
    ],
  },
  {
    label: 'Work',
    items: [
      { to: '/tenders', icon: FileStack, label: 'Tenders' },
      { to: '/pay-orders', icon: FileText, label: 'Pay Orders' },
      { to: '/calendar', icon: Calendar, label: 'Calendar' },
      { to: '/todo', icon: CheckSquare, label: 'To-Do' },
    ],
  },
  {
    label: 'Finance',
    items: [{ to: '/expenses', icon: Receipt, label: 'Expenses' }],
  },
  {
    label: 'People & Notes',
    items: [
      { to: '/contacts', icon: Users, label: 'Contacts' },
      { to: '/notes', icon: StickyNote, label: 'Notes' },
    ],
  },
  {
    label: 'System',
    items: [{ to: '/settings', icon: Settings, label: 'Settings' }],
  },
]

export default function Sidebar({ onClose, collapsed = false, onSignOut }) {
  const { displayName, role } = useAuth()
  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??'

  return (
    <div
      className={cn(
        'flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-[280px]'
      )}
    >
      {/* Logo / wordmark — 64px tall */}
      <div className={cn('flex h-16 items-center gap-2.5 border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'px-5')}>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 2L3 8v2h2v10h4v-5h6v5h4V10h2V8L12 2z" fill="currentColor" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold leading-tight truncate">Grett Engineering</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pay Order Tracker</p>
          </div>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-thin">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            {!collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <Tooltip key={to} disableHoverableContent={!collapsed}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          collapsed && 'justify-center px-2',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary" aria-hidden />
                          )}
                          <Icon className={cn('flex-shrink-0', isActive && 'text-primary')} size={18} />
                          {!collapsed && <span className="truncate">{label}</span>}
                        </>
                      )}
                    </NavLink>
                  </TooltipTrigger>
                  {collapsed && (
                    <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
                  )}
                </Tooltip>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User card with dropdown */}
      <div className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-sidebar-accent/60',
                collapsed && 'justify-center'
              )}
              aria-label="User menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sidebar-foreground truncate">{displayName}</p>
                  <p className="text-[11px] text-muted-foreground capitalize truncate">{role}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground capitalize">{role}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <NavLink to="/settings" onClick={onClose} className="flex items-center gap-2 cursor-pointer">
                <Settings size={16} />
                Settings
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onSignOut}
              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
            >
              <LogOut size={16} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
