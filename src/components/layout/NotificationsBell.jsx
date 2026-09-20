import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity as ActivityIcon,
  AlertCircle,
  Bell,
  Calendar as CalendarIcon,
  CheckCircle2,
  CheckSquare,
  Clock3,
  FileText,
  WalletCards,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNotifications } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'

const FILTERS = ['All', 'Alerts', 'Activity']

function getVisualMeta(item) {
  const text = `${item.title} ${item.subtitle || ''}`.toLowerCase()
  if (text.includes('completed')) {
    return {
      icon: CheckCircle2,
      iconClassName: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
      rowClassName: '',
    }
  }
  if (item.kind === 'payorder') {
    return {
      icon: WalletCards,
      iconClassName: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
      rowClassName: item.severity === 'high' ? 'border-l-4 border-l-amber-500 bg-amber-50/45 dark:bg-amber-950/15' : '',
    }
  }
  if (item.kind === 'todo') {
    return {
      icon: CheckSquare,
      iconClassName: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
      rowClassName: item.severity === 'high' ? 'border-l-4 border-l-amber-500 bg-amber-50/45 dark:bg-amber-950/15' : '',
    }
  }
  if (item.kind === 'event' || item.severity === 'high' || text.includes('submission') || text.includes('deadline') || text.includes('overdue')) {
    return {
      icon: Clock3,
      iconClassName: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
      rowClassName: 'border-l-4 border-l-amber-500 bg-amber-50/45 dark:bg-amber-950/15',
    }
  }
  if (item.kind === 'tender') {
    return {
      icon: FileText,
      iconClassName: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
      rowClassName: '',
    }
  }
  if (item.kind === 'activity') {
    return {
      icon: text.includes('pay order') ? WalletCards : text.includes('tender') ? FileText : ActivityIcon,
      iconClassName: text.includes('pay order')
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
        : text.includes('tender')
        ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300',
      rowClassName: '',
    }
  }
  return {
    icon: AlertCircle,
    iconClassName: 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300',
    rowClassName: '',
  }
}

function isActivityItem(item) {
  return item.kind === 'activity' || item.title.toLowerCase().includes('completed')
}

function getDisplayTime(item) {
  const title = item.title || ''
  const subtitle = item.subtitle || ''
  const leadingTime = subtitle.match(/^([^-]+?)\s+-\s+/)
  if (leadingTime) return leadingTime[1].trim()
  if (title.includes('Today')) return 'Today'
  if (title.includes('Tomorrow')) return 'Tomorrow'
  const inDays = title.match(/In\s+\d+d/i)
  if (inDays) return inDays[0]
  const overdue = title.match(/\d+d overdue/i)
  if (overdue) return overdue[0]
  const completedAgo = subtitle.match(/Completed\s+(\d+d ago)/i)
  if (completedAgo) return completedAgo[1]
  return ''
}

function getDisplayText(item) {
  const subtitle = item.subtitle || ''
  if (item.kind !== 'activity') return { title: item.title, description: subtitle }

  const grouped = item.title.match(/^(Pay order|Tender|Task|Expense|Contact|Activity)\s+(.+)\s+(created|updated|deleted|completed|reopened)\s+(\d+)\s+times$/i)
  if (grouped) {
    const [, label, entity, action, count] = grouped
    return {
      title: `${label} ${action}`,
      description: `${entity} ${action} ${count} times.`,
    }
  }

  const single = item.title.match(/^(Pay order|Tender|Task|Expense|Contact|Activity)\s+(created|updated|deleted|completed|reopened):\s+(.+)$/i)
  if (single) {
    const [, label, action, entity] = single
    return {
      title: `${label} ${action}`,
      description: `${entity} ${action}.`,
    }
  }

  return {
    title: item.title,
    description: subtitle.replace(/^([^-]+?)\s+-\s+/, ''),
  }
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const [activeFilter, setActiveFilter] = useState('All')
  const navigate = useNavigate()
  const { items, unreadCount, readIds, markAllRead, markRead } = useNotifications()
  const panelRef = useRef(null)
  const triggerRef = useRef(null)
  const filteredItems = items.filter((item) => {
    if (activeFilter === 'Alerts') return !isActivityItem(item)
    if (activeFilter === 'Activity') return isActivityItem(item)
    return true
  })

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (panelRef.current?.contains(e.target)) return
      if (triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleItemClick = (item) => {
    markRead(item.id)
    setOpen(false)
    if (item.to) navigate(item.to)
  }

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 rounded-xl"
            aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
                aria-hidden="true"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1rem)] max-w-[420px] origin-top-right rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl shadow-slate-950/10 sm:mt-3 sm:w-[400px]"
        >
          <div className="space-y-3 p-3 pb-2 sm:space-y-5 sm:p-5 sm:pb-3">
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div>
                <p className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Notifications</p>
                <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm">Recent alerts and activity</p>
              </div>
              <button
                type="button"
                onClick={markAllRead}
                disabled={items.length === 0 || unreadCount === 0}
                className="shrink-0 rounded-md text-xs font-semibold text-primary transition-colors hover:text-primary/80 disabled:pointer-events-none disabled:opacity-50 sm:text-sm"
              >
                Mark all read
              </button>
            </div>

            <div className="flex gap-1.5 sm:gap-2" role="tablist" aria-label="Notification filters">
              {FILTERS.map((filter) => {
                const active = activeFilter === filter
                return (
                  <button
                    key={filter}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveFilter(filter)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors sm:px-4 sm:py-2 sm:text-sm',
                      active
                        ? 'border-primary/70 bg-primary/5 text-primary shadow-sm'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    {filter}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="max-h-[calc(100dvh-220px)] overflow-y-auto px-3 pb-3 scrollbar-thin sm:max-h-[480px] sm:px-4 sm:pb-4">
            {filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center sm:py-10">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 sm:h-12 sm:w-12">
                  <Bell className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">No notifications</p>
                <p className="mt-1 text-xs text-muted-foreground">You're all caught up.</p>
              </div>
            ) : (
              <ul className="space-y-2 sm:space-y-3">
                {filteredItems.map((item) => {
                  const meta = getVisualMeta(item)
                  const Icon = meta.icon
                  const isRead = readIds.has(item.id) || item.kind === 'activity'
                  const { title, description } = getDisplayText(item)
                  const time = getDisplayTime(item)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          'flex w-full gap-2.5 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:p-4',
                          meta.rowClassName,
                        )}
                      >
                        <div
                          className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11', meta.iconClassName)}
                        >
                          <Icon className="h-5 w-5 sm:h-[21px] sm:w-[21px]" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-5 text-foreground break-words">
                            {title}
                          </p>
                          {description && (
                            <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground break-words sm:mt-1 sm:text-sm sm:leading-5">
                              {description}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-3 sm:gap-4">
                          {time && <span className="text-xs text-muted-foreground sm:text-sm">{time}</span>}
                          {!isRead && (
                            <span
                              className="h-2 w-2 rounded-full bg-primary sm:h-2.5 sm:w-2.5"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {filteredItems.length > 0 && (
            <div className="border-t border-border p-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4 sm:pt-3">
              <button
                type="button"
                onClick={() => { setOpen(false); navigate('/activity') }}
                className="h-9 w-full rounded-xl border border-border bg-background text-sm font-semibold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-11"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
