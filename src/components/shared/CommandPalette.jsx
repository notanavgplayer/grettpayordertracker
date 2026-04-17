import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Search, FileText, FileStack, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

export default function CommandPalette({ className }) {
  const [open, setOpen] = useState(false)
  const [tenders, setTenders] = useState([])
  const [payOrders, setPayOrders] = useState([])
  const [contacts, setContacts] = useState([])
  const [loaded, setLoaded] = useState(false)
  const navigate = useNavigate()

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

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(
          'hidden sm:flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground font-normal w-48 justify-between',
          className
        )}
      >
        <span className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5" />
          Search…
        </span>
        <kbd className="inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
          ⌘K
        </kbd>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="sm:hidden h-9 w-9"
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search tenders, pay orders, contacts…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {tenders.length > 0 && (
            <CommandGroup heading="Tenders">
              {tenders.slice(0, 5).map((t) => (
                <CommandItem
                  key={t.id}
                  value={`tender-${t.name || t.id}`}
                  onSelect={() => run(`/tenders/${t.id}`)}
                >
                  <FileStack className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{t.name || 'Untitled tender'}</span>
                  {t.agency && (
                    <span className="ml-auto text-xs text-muted-foreground truncate max-w-[120px]">
                      {t.agency}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {tenders.length > 0 && payOrders.length > 0 && <CommandSeparator />}

          {payOrders.length > 0 && (
            <CommandGroup heading="Pay Orders">
              {payOrders.slice(0, 5).map((p) => (
                <CommandItem
                  key={p.id}
                  value={`po-${p.po || p.id}`}
                  onSelect={() => run('/pay-orders')}
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-sm">{p.po || '—'}</span>
                  {p.agency && (
                    <span className="ml-auto text-xs text-muted-foreground truncate max-w-[120px]">
                      {p.agency}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {payOrders.length > 0 && contacts.length > 0 && <CommandSeparator />}

          {contacts.length > 0 && (
            <CommandGroup heading="Contacts">
              {contacts.slice(0, 5).map((c) => (
                <CommandItem
                  key={c.id}
                  value={`contact-${c.name || c.id}`}
                  onSelect={() => run('/contacts')}
                >
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{c.name || 'Unnamed contact'}</span>
                  {c.company && (
                    <span className="ml-auto text-xs text-muted-foreground truncate max-w-[120px]">
                      {c.company}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
