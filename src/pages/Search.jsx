import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { truncate } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Search as SearchIcon, FileStack, FileText, StickyNote, CheckSquare, Receipt, Loader2 } from 'lucide-react'

const RESULT_CONFIG = {
  tenders: { icon: FileStack, label: 'Tender', href: (r) => `/tenders/${r.id}`, text: (r) => r.name, sub: (r) => r.agency },
  payOrders: { icon: FileText, label: 'Pay Order', href: () => '/pay-orders', text: (r) => r.po, sub: (r) => r.tender },
  notes: { icon: StickyNote, label: 'Note', href: () => '/notes', text: (r) => r.title, sub: (r) => truncate(r.body?.replace(/<[^>]*>/g, '') || '', 80) },
  todos: { icon: CheckSquare, label: 'Task', href: () => '/todo', text: (r) => r.text, sub: () => '' },
  expenses: { icon: Receipt, label: 'Expense', href: () => '/expenses', text: (r) => r.description, sub: (r) => r.category },
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = { current: null }

  const doSearch = useCallback(async (q) => {
    if (q.trim().length < 2) { setResults([]); setSearched(false); return }
    setLoading(true)
    setSearched(true)
    const lower = q.toLowerCase()
    const found = []

    for (const [col, cfg] of Object.entries(RESULT_CONFIG)) {
      const snap = await getDocs(collection(db, col))
      for (const d of snap.docs) {
        const data = { id: d.id, ...d.data() }
        const text = Object.values(data).filter((v) => typeof v === 'string').join(' ').toLowerCase()
        if (text.includes(lower)) found.push({ ...data, _col: col, _cfg: cfg })
      }
    }

    setResults(found)
    setLoading(false)
  }, [])

  const handleChange = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(q), 300)
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <PageHeader title="Search" description="Search across tenders, pay orders, notes, tasks, and expenses" />

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Type to search…"
          className="pl-10 h-11 text-base"
          value={query}
          onChange={handleChange}
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Searching…
        </div>
      )}

      {searched && !loading && (
        <p className="text-sm text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''} for "{query}"</p>
      )}

      <div className="space-y-2">
        {results.map((r) => {
          const cfg = r._cfg
          const Icon = cfg.icon
          return (
            <Link key={`${r._col}-${r.id}`} to={cfg.href(r)}>
              <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted flex-shrink-0">
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
          <SearchIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No results found for "{query}"</p>
        </div>
      )}
    </div>
  )
}
