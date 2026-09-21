import { useState, useCallback, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { truncate, formatDate } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Search as SearchIcon, FileStack, FileText, StickyNote, CheckSquare, Receipt, Loader2, Clock, X, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'

const SCOPES = ['All', 'Tenders', 'Pay Orders', 'Tasks', 'Documents', 'Notes']
const COLLECTIONS = ['tenders', 'payOrders', 'todos', 'notes', 'expenses']

const RESULT_CONFIG = {
  tenders: {
    icon: FileStack,
    label: 'Tender',
    scope: 'Tenders',
    href: (r) => `/tenders/${r.id}`,
    title: (r) => r.name || 'Untitled tender',
    sub: (r) => [r.agency, r.nit].filter(Boolean).join(' · '),
    date: (r) => r.submissionDate || r.createdAt,
  },
  payOrders: {
    icon: FileText,
    label: 'Pay Order',
    scope: 'Pay Orders',
    href: () => '/pay-orders',
    title: (r) => r.po ? `PO #${r.po}` : 'Pay order',
    sub: (r) => [r.tender, r.bank, r.status].filter(Boolean).join(' · '),
    date: (r) => r.submitted || r.createdAt,
  },
  todos: {
    icon: CheckSquare,
    label: 'Task',
    scope: 'Tasks',
    href: () => '/todo',
    title: (r) => r.text || r.title || 'Task',
    sub: (r) => [r.category, r.priority].filter(Boolean).join(' · '),
    date: (r) => r.dueDate || r.createdAt,
  },
  documents: {
    icon: FolderOpen,
    label: 'Document',
    scope: 'Documents',
    href: (r) => r.tenderId ? `/tenders/${r.tenderId}` : '/tenders',
    title: (r) => r.title || r.fileName || r.type || 'Document',
    sub: (r) => [r.tenderName, r.type, r.fileName].filter(Boolean).join(' · '),
    date: (r) => r.uploadedAt || r.addedAt,
  },
  notes: {
    icon: StickyNote,
    label: 'Note',
    scope: 'Notes',
    href: () => '/notes',
    title: (r) => r.title || 'Note',
    sub: (r) => truncate(r.body?.replace(/<[^>]*>/g, '') || '', 110),
    date: (r) => r.updatedAt || r.createdAt,
  },
  expenses: {
    icon: Receipt,
    label: 'Expense',
    scope: 'Expenses',
    href: () => '/expenses',
    title: (r) => r.description || 'Expense',
    sub: (r) => [r.category, r.tenderName].filter(Boolean).join(' · '),
    date: (r) => r.date || r.createdAt,
  },
}

const SCOPE_TO_TYPES = {
  All: Object.keys(RESULT_CONFIG),
  Tenders: ['tenders'],
  'Pay Orders': ['payOrders'],
  Tasks: ['todos'],
  Documents: ['documents'],
  Notes: ['notes'],
}

const MAX_RECENT = 8

function recentKey(userId) {
  return `grett-recent-searches:${userId || 'anonymous'}`
}

function loadRecent(userId) {
  try { return JSON.parse(localStorage.getItem(recentKey(userId)) || '[]') } catch { return [] }
}

function saveRecent(userId, query) {
  const prev = loadRecent(userId).filter((q) => q !== query)
  const next = [query, ...prev].slice(0, MAX_RECENT)
  try { localStorage.setItem(recentKey(userId), JSON.stringify(next)) } catch {}
}

function clearRecent(userId) {
  try { localStorage.removeItem(recentKey(userId)) } catch {}
}

function flattenSearchText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(flattenSearchText).join(' ')
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().toISOString()
    return Object.values(value).map(flattenSearchText).join(' ')
  }
  return ''
}

function buildDocumentResults(tenders = []) {
  return tenders.flatMap((tender) => (
    (tender.documents || []).map((document, index) => ({
      ...document,
      id: `${tender.id}-${document.id || document.fileName || index}`,
      tenderId: tender.id,
      tenderName: tender.name,
      tenderAgency: tender.agency,
      _type: 'documents',
      _searchText: flattenSearchText({ ...document, tenderName: tender.name, agency: tender.agency, nit: tender.nit }).toLowerCase(),
    }))
  ))
}

function decorateRecords(collectionName, records = []) {
  return records.map((record) => ({
    ...record,
    _type: collectionName,
    _searchText: flattenSearchText(record).toLowerCase(),
  }))
}

export default function Search() {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [scope, setScope] = useState('All')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [recentSearches, setRecentSearches] = useState(() => loadRecent(user?.uid))
  const debounceRef = useRef(null)
  const cacheRef = useRef(null)
  const requestRef = useRef(0)

  useEffect(() => {
    setRecentSearches(loadRecent(user?.uid))
    cacheRef.current = null
  }, [user?.uid])

  const loadSearchData = useCallback(async () => {
    if (cacheRef.current) return cacheRef.current

    const snapshots = await Promise.all(COLLECTIONS.map(async (name) => {
      const snap = await getDocs(collection(db, name))
      return [name, snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))]
    }))

    const data = Object.fromEntries(snapshots)
    const indexed = {
      tenders: decorateRecords('tenders', data.tenders || []),
      payOrders: decorateRecords('payOrders', data.payOrders || []),
      todos: decorateRecords('todos', data.todos || []),
      notes: decorateRecords('notes', data.notes || []),
      expenses: decorateRecords('expenses', data.expenses || []),
      documents: buildDocumentResults(data.tenders || []),
    }

    cacheRef.current = indexed
    return indexed
  }, [])

  const doSearch = useCallback(async (q, sc) => {
    const requestId = ++requestRef.current
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearched(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setSearched(true)

    try {
      const indexed = await loadSearchData()
      if (requestId !== requestRef.current) return
      const lower = trimmed.toLowerCase()
      const types = SCOPE_TO_TYPES[sc] || SCOPE_TO_TYPES.All
      const found = types
        .flatMap((type) => indexed[type] || [])
        .filter((record) => record._searchText.includes(lower))
        .map((record) => ({ ...record, _cfg: RESULT_CONFIG[record._type] }))

      setResults(found)
      saveRecent(user?.uid, trimmed)
      setRecentSearches(loadRecent(user?.uid))
    } catch (err) {
      console.error('Search failed:', err)
      toast.error('Search failed')
      if (requestId === requestRef.current) setResults([])
    } finally {
      if (requestId === requestRef.current) setLoading(false)
    }
  }, [loadSearchData, user?.uid])

  useEffect(() => {
    doSearch(debouncedQuery, scope)
  }, [debouncedQuery, scope, doSearch])

  useEffect(() => () => {
    clearTimeout(debounceRef.current)
    requestRef.current += 1
  }, [])

  const handleChange = (event) => {
    const value = event.target.value
    setQuery(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(value), 300)
  }

  const handleScopeChange = (nextScope) => {
    setScope(nextScope)
  }

  const runRecent = (recentQuery) => {
    setQuery(recentQuery)
    setDebouncedQuery(recentQuery)
  }

  const handleClearRecent = () => {
    clearRecent(user?.uid)
    setRecentSearches([])
  }

  const clearSearch = () => {
    clearTimeout(debounceRef.current)
    requestRef.current += 1
    setQuery('')
    setDebouncedQuery('')
    setResults([])
    setSearched(false)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Search" description="Search across tenders, pay orders, tasks, documents, and notes" />

      <Card className="rounded-xl border-border/80">
        <CardContent className="space-y-4 p-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              autoFocus
              placeholder="Search tenders, pay orders, tasks, documents..."
              className="h-12 pl-10 pr-10 text-base"
              value={query}
              onChange={handleChange}
              aria-label="Search"
            />
            {query && (
              <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" role="group" aria-label="Search scope">
            {SCOPES.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleScopeChange(item)}
                className={`h-9 flex-shrink-0 rounded-full border px-3 text-sm font-medium transition-colors ${
                  scope === item
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-border bg-background text-muted-foreground hover:border-emerald-200 dark:hover:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300'
                }`}
                aria-pressed={scope === item}
              >
                {item}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching...
        </div>
      )}

      {searched && !loading && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {results.length} result{results.length !== 1 ? 's' : ''} for "{debouncedQuery.trim()}"
          {scope !== 'All' && ` in ${scope}`}
        </p>
      )}

      <div className="space-y-3" aria-live="polite">
        {results.map((result) => (
          <SearchResultCard key={`${result._type}-${result.id}`} result={result} />
        ))}
      </div>

      {!query.trim() && !searched && (
        <SearchEmptyState
          icon={SearchIcon}
          title="Search across tenders, pay orders, tasks, and documents."
          description="Type at least 2 characters to find records across your workspace."
        />
      )}

      {query.trim().length === 1 && !searched && (
        <SearchEmptyState
          icon={SearchIcon}
          title="Keep typing to search."
          description="Enter at least 2 characters to start searching."
        />
      )}

      {searched && !loading && results.length === 0 && (
        <SearchEmptyState
          icon={SearchIcon}
          title="No results found."
          description="Try another keyword or check spelling."
        />
      )}

      {!searched && recentSearches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent searches</p>
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={handleClearRecent}>
              <X className="mr-1 h-3 w-3" aria-hidden="true" /> Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => runRecent(item)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
              >
                <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {item}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchResultCard({ result }) {
  const cfg = result._cfg
  const Icon = cfg.icon
  const title = cfg.title(result)
  const subtitle = cfg.sub(result)
  const date = cfg.date(result)

  return (
    <Link to={cfg.href(result)} className="block">
      <Card className="rounded-xl border-border/80 transition hover:border-emerald-200 dark:hover:border-emerald-900/60 hover:shadow-md">
        <CardContent className="flex items-start gap-4 p-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs text-emerald-700 dark:text-emerald-300">{cfg.label}</Badge>
              {date && <span className="text-xs text-muted-foreground">{formatDate(date)}</span>}
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-foreground">{title}</p>
            {subtitle && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function SearchEmptyState({ icon: Icon, title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
        <Icon className="h-7 w-7" aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
