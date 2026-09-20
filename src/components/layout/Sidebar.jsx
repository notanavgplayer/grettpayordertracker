import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FileText, FileStack, Users, Receipt,
  Calendar, StickyNote, CheckSquare, Settings, Activity,
  LogOut, DatabaseZap, FolderOpen, BarChart3,
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
      { to: '/reports', icon: BarChart3, label: 'Reports' },
      { to: '/calendar', icon: Calendar, label: 'Calendar' },
      { to: '/todo', icon: CheckSquare, label: 'To-Do' },
      { to: '/documents', icon: FolderOpen, label: 'Documents' },
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
    items: [
      { to: '/data-health', icon: DatabaseZap, label: 'Data Health' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
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
        'flex h-full flex-col border-r border-sidebar-border/80 bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-[280px]'
      )}
    >
      <div className={cn('flex h-16 items-center gap-3 border-b border-sidebar-border/80', collapsed ? 'justify-center px-2' : 'px-5')}>
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/15">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 2L3 8v2h2v10h4v-5h6v5h4V10h2V8L12 2z" fill="currentColor" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold leading-tight">Grett Engineering</p>
            <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Pay Order Tracker</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-5 last:mb-0">
            {!collapsed && (
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <Tooltip key={to} disableHoverableContent={!collapsed}>
                  <TooltipTrigger asChild>
                    <NavLink
                      aria-label={collapsed ? label : undefined}
                      to={to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          'relative flex min-h-10 items-center gap-3 rounded-xl border-0 px-3 py-2.5 text-sm font-medium outline-none ring-0 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/30',
                          collapsed && 'justify-center px-2',
                          isActive
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300'
                            : 'bg-transparent text-slate-600 shadow-none hover:bg-slate-50 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-slate-100'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-emerald-600" aria-hidden />
                          )}
                          <Icon className={cn('flex-shrink-0', isActive && 'text-emerald-600 dark:text-emerald-300')} size={18} />
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

      <div className="border-t border-sidebar-border/80 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex min-h-12 w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20',
                collapsed && 'justify-center'
              )}
              aria-label="User menu"
            >
              <Avatar className="h-9 w-9 flex-shrink-0">
                <AvatarFallback className="bg-emerald-100 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-sidebar-foreground">{displayName}</p>
                  <p className="truncate text-[11px] capitalize text-muted-foreground">{role}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-0.5">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs capitalize text-muted-foreground">{role}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <NavLink to="/settings" onClick={onClose} className="flex cursor-pointer items-center gap-2">
                <Settings size={16} />
                Settings
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onSignOut}
              className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
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
