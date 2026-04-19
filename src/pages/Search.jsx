import { useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { truncate } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search as SearchIcon, FileStack, FileText, StickyNote, CheckSquare, Receipt, Loader2, Clock, X } from 'lucide-react'
import { toast } from 'sonner'

const SCOPES = ['All', 'Tenders', 'Pay Orders', 'Notes', 'Tasks', 'Expenses']

const RESULT_CONFIG = {
  tenders:   { icon: FileStack,    label: 'Tender',    scope: 'Tenders',    href: (r) => `/tenders/${r.id}`, text: (r) => r.name,        sub: (r) => r.agency },
  payOrders: { icon: FileText,     label: 'Pay Order', scope: 'Pay Orders', href: () => '/pay-orders',       text: (r) => r.po,          sub: (r) => r.tender },
  notes:     { icon: StickyNote,   label: 'Note',      scope: 'Notes',      href: () => '/notes',            text: (r) => r.title,       sub: (r) => truncate(r.body?.replace(/<[^>]*>/g, '') || '', 80) },
  todos:     { icon: CheckSquare,  label: 'Task',      scope: 'Tasks',      href: () => '/todo',             text: (r) => r.text,        sub: () => '' },
  expenses:  { icon: Receipt,      label: 'Expense',   scope: 'Expenses',   href: () => '/expenses',         text: (r) => r.description, sub: (r) => r.category },
}

const SCOPE_TO_COLS = {
  'All':       Object.keys(RESULT_CONFIG),
  'Tenders':   ['tenders'],
  'Pay Orders':['payOrders'],
  'Notes':     ['notes'],
  'Tasks':     ['todos'],
  'Expenses':  ['expenses'],
}

const MAX_RECENT = 8

function loadRecent() {
  try { return JSON.parse(localStorage.getItem('grett-recent-searches') || '[]') } catch { return [] }
}
function saveRecent(query) {
  const prev = loadRecent().filter((q) => q !== query)
  const next = [query, ...prev].slice(0, MAX_RECENT)
  try { localStorage.setItem('grett-recent-searches', JSON.stringify(next)) } catch {}
}
function clearRecent() {
  try { localStorage.removeItem('grett-recent-searches') } catch {}
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('All')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [recentSearches, setRecentSearches] = useState(loadRecent)
  const debounceRef = useRef(null)

  const doSearch = useCallback(async (q, sc) => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return }
    setLoading(true)
    setSearched(true)
    const lower = q.toLowerCase()
    const found = []
    const cols = SCOPE_TO_COLS[sc] || Object.keys(RESULT_CONFIG)

    try {
      for (const col of cols) {
        const cfg = RESULT_CONFIG[col]
        const snap = await getDocs(collection(db, col))
        for (const d of snap.docs) {
          const data = { id: d.id, ...d.data() }
          const text = Object.values(data).filter((v) => typeof v === 'string').join(' ').toLowerCase()
          if (text.includes(lower)) found.push({ ...data, _col: col, _cfg: cfg })
        }
      }
      setResults(found)
      saveRecent(q.trim())
      setRecentSearches(loadRecent())
    } catch (err) {
      console.error('Search failed:', err)
      toast.error('Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q, scope), 300)
  }

  const handleScopeChange = (sc) => {
    setScope(sc)
    if (query.trim().length >= 2) doSearch(query, sc)
  }

  const runRecent = (q) => {
    setQuery(q)
    doSearch(q, scope)
  }

  const handleClearRecent = () => {
    clearRecent()
    setRecentSearches([])
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader title="Search" description="Search across tenders, pay orders, notes, tasks, and expenses" />

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          autoFocus
          placeholder="Type to search…"
          className="pl-10 h-11 text-base"
          value={query}
          onChange={handleChange}
          aria-label="Search"
        />
      </div>

      {/* Scope filter */}
      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Search scope">
        {SCOPES.map((s) => (
          <button
            key={s}
            onClick={() => handleScopeChange(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              scope === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
            aria-pressed={scope === s}
          >
            {s}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching…
        </div>
      )}

      {searched && !loading && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          {scope !== 'All' && ` in ${scope}`}
        </p>
      )}

      {/* Results */}
      <div className="space-y-2" aria-live="polite">
        {results.map((r) => {
          const cfg = r._cfg
          const Icon = cfg.icon
          return (
            <Link key={`${r._col}-${r.id}`} to={cfg.href(r)}>
              <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted flex-shrink-0" aria-hidden="true">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{cfg.text(r)}</p>
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">{cfg.label}</Badge>
                    </div>
                    {cfg.sub(r) && <p className="text-xs text-muted-foreground truncate mt-0.5">{cfg.sub(r)}</p>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      {searched && !loading && results.length === 0 && (
        <div className="text-center py-12">
          <SearchIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No results found for &ldquo;{query}&rdquo;</p>
        </div>
      )}

      {/* Recent searches — shown before user types */}
      {!searched && recentSearches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recent searches</p>
            <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={handleClearRecent}>
              <X className="h-3 w-3 mr-1" aria-hidden="true" /> Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((q) => (
              <button
                key={q}
                onClick={() => runRecent(q)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-foreground hover:bg-muted transition-colors"
              >
                <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
