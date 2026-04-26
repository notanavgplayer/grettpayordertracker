import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, FileText, Calendar as CalendarIcon, CheckSquare, AlertCircle, Activity as ActivityIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNotifications } from '@/hooks/useNotifications'
import { cn } from '@/lib/utils'

const KIND_ICON = {
  tender: FileText,
  event: CalendarIcon,
  todo: CheckSquare,
  payorder: AlertCircle,
  activity: ActivityIcon,
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { items, unreadCount, readIds, markAllRead, markRead } = useNotifications()
  const panelRef = useRef(null)
  const triggerRef = useRef(null)

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
            className="relative h-9 w-9"
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
          className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-1rem)] origin-top-right rounded-lg border border-border bg-popover text-popover-foreground shadow-lg sm:w-[32rem]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {items.length > 0 && unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">You're all caught up</p>
                <p className="text-xs text-muted-foreground/70">No deadlines in the next 7 days</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const Icon = KIND_ICON[item.kind] || Bell
                  const isRead = readIds.has(item.id) || item.kind === 'activity'
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className={cn(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent',
                          !isRead && 'bg-primary/5',
                        )}
                      >
                        <div
                          className={cn(
                            'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                            item.severity === 'high'
                              ? 'bg-destructive/10 text-destructive'
                              : item.severity === 'low'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-primary/10 text-primary',
                          )}
                        >
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm leading-snug break-words', !isRead ? 'font-semibold' : 'font-medium')}>
                            {item.title}
                          </p>
                          {item.subtitle && (
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground break-words">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                        {!isRead && (
                          <span
                            className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-primary"
                            aria-label="Unread"
                          />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
