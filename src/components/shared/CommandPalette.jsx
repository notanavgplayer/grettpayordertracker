import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  Search, FileText, FileStack, Users, LayoutDashboard, Activity,
  Calendar, Receipt, StickyNote, CheckSquare, Settings as SettingsIcon,
  Plus, Moon, Sun, LogOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command'
import { useTheme } from '@/context/ThemeContext'
import { useAuth } from '@/context/AuthContext'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const PAGES = [
  { to: '/home', icon: LayoutDashboard, label: 'Home' },
  { to: '/activity', icon: Activity, label: 'Activity' },
  { to: '/tenders', icon: FileStack, label: 'Tenders' },
  { to: '/pay-orders', icon: FileText, label: 'Pay Orders' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/todo', icon: CheckSquare, label: 'To-Do' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/contacts', icon: Users, label: 'Contacts' },
  { to: '/notes', icon: StickyNote, label: 'Notes' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings' },
]

const QUICK_ACTIONS = [
  { to: '/tenders', icon: Plus, label: 'Add Tender', hint: 'Tenders' },
  { to: '/pay-orders', icon: Plus, label: 'Add Pay Order', hint: 'Pay Orders' },
  { to: '/expenses', icon: Plus, label: 'Add Expense', hint: 'Expenses' },
  { to: '/notes', icon: Plus, label: 'Add Note', hint: 'Notes' },
  { to: '/todo', icon: Plus, label: 'Add To-Do', hint: 'To-Do' },
]

export default function CommandPalette({ className }) {
  const [open, setOpen] = useState(false)
  const [tenders, setTenders] = useState([])
  const [payOrders, setPayOrders] = useState([])
  const [contacts, setContacts] = useState([])
  const [loaded, setLoaded] = useState(false)
  const navigate = useNavigate()
  const { toggleTheme, isDark } = useTheme()
  const { logout } = useAuth()

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!open || loaded) return
    const load = async () => {
      try {
        const [ts, ps, cs] = await Promise.all([
          getDocs(collection(db, 'tenders')),
          getDocs(collection(db, 'payOrders')),
          getDocs(collection(db, 'contacts')),
        ])
        setTenders(ts.docs.map((d) => ({ id: d.id, ...d.data() })))
        setPayOrders(ps.docs.map((d) => ({ id: d.id, ...d.data() })))
        setContacts(cs.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoaded(true)
      } catch (_) {}
    }
    load()
  }, [open, loaded])

  const run = useCallback((path) => {
    setOpen(false)
    navigate(path)
  }, [navigate])

  const handleSignOut = async () => {
    setOpen(false)
    await logout()
    navigate('/')
    toast.success('Signed out successfully')
  }

  return (
    <>
      {/* Pill-shaped desktop trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'hidden sm:flex items-center gap-2 h-9 w-full max-w-md rounded-full border border-border bg-muted/40 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <Search size={16} className="text-muted-foreground" />
        <span className="flex-1 text-left">Search anything…</span>
        <kbd className="inline-flex h-5 items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      {/* Mobile icon-only trigger */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="sm:hidden h-9 w-9"
        aria-label="Search"
      >
        <Search size={16} />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, records, or actions…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Pages">
            {PAGES.map(({ to, icon: Icon, label }) => (
              <CommandItem key={`page-${to}`} value={`page ${label}`} onSelect={() => run(to)}>
                <Icon size={16} className="text-muted-foreground" />
                <span>{label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{to}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Quick actions">
            {QUICK_ACTIONS.map(({ to, icon: Icon, label, hint }) => (
              <CommandItem key={`qa-${label}`} value={`action ${label}`} onSelect={() => run(to)}>
                <Icon size={16} className="text-muted-foreground" />
                <span>{label}</span>
                <span className="ml-auto text-xs text-muted-foreground">{hint}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Settings">
            <CommandItem value="settings theme" onSelect={() => { toggleTheme(); setOpen(false) }}>
              {isDark ? <Sun size={16} className="text-muted-foreground" /> : <Moon size={16} className="text-muted-foreground" />}
              <span>Toggle theme</span>
              <span className="ml-auto text-xs text-muted-foreground">{isDark ? 'Dark' : 'Light'}</span>
            </CommandItem>
            <CommandItem value="settings open" onSelect={() => run('/settings')}>
              <SettingsIcon size={16} className="text-muted-foreground" />
              <span>Open settings</span>
            </CommandItem>
            <CommandItem value="settings signout" onSelect={handleSignOut}>
              <LogOut size={16} className="text-muted-foreground" />
              <span>Sign out</span>
            </CommandItem>
          </CommandGroup>

          {tenders.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Tenders">
                {tenders.slice(0, 5).map((t) => (
                  <CommandItem key={t.id} value={`tender-${t.name || t.id}`} onSelect={() => run(`/tenders/${t.id}`)}>
                    <FileStack size={16} className="text-muted-foreground" />
                    <span className="truncate">{t.name || 'Untitled tender'}</span>
                    {t.agency && (
                      <span className="ml-auto text-xs text-muted-foreground truncate max-w-[140px]">{t.agency}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {payOrders.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Pay Orders">
                {payOrders.slice(0, 5).map((p) => (
                  <CommandItem key={p.id} value={`po-${p.po || p.id}`} onSelect={() => run('/pay-orders')}>
                    <FileText size={16} className="text-muted-foreground" />
                    <span className="font-mono">{p.po || '—'}</span>
                    {p.agency && (
                      <span className="ml-auto text-xs text-muted-foreground truncate max-w-[140px]">{p.agency}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {contacts.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Contacts">
                {contacts.slice(0, 5).map((c) => (
                  <CommandItem key={c.id} value={`contact-${c.name || c.id}`} onSelect={() => run('/contacts')}>
                    <Users size={16} className="text-muted-foreground" />
                    <span className="truncate">{c.name || 'Unnamed contact'}</span>
                    {c.company && (
                      <span className="ml-auto text-xs text-muted-foreground truncate max-w-[140px]">{c.company}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
