import { useState, useEffect, useRef, useCallback } from 'react'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { formatDate, truncate } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Search, Trash2, Loader2, StickyNote, Save } from 'lucide-react'
import { toast } from 'sonner'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const PRIORITY_COLORS = { high: 'destructive', medium: 'pending', low: 'returned', none: 'secondary' }

// Strip HTML tags, comments, and MS Word/Docs fragment markers so pasted
// content renders as clean plain text in the textarea editor.
function stripHtml(str = '') {
  return String(str)
    .replace(/<!--[\s\S]*?-->/g, '')        // HTML comments incl. <!--StartFragment-->
    .replace(/<\/?[a-z][^>]*>/gi, '')       // tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export default function Notes() {
  const { data: notes, loading } = useCollection('notes', 'updatedAt', 'desc')
  const { add, remove } = useFirestoreCRUD('notes')
  const { isAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [body, setBody] = useState('')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('none')
  const [saveStatus, setSaveStatus] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const debounceRef = useRef(null)

  const filtered = notes.filter((n) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q)
  })

  const selectNote = (note) => {
    setSelected(note)
    setTitle(note.title || '')
    setBody(stripHtml(note.body || ''))
    setPriority(note.priority || 'none')
    setSaveStatus('')
  }

  const newNote = async () => {
    const id = await add({ title: 'Untitled Note', body: '', priority: 'none' })
    setSaveStatus('')
  }

  const saveNote = useCallback(async (noteId, data) => {
    if (!noteId) return
    setSaveStatus('Saving…')
    try {
      await updateDoc(doc(db, 'notes', noteId), { ...data, updatedAt: serverTimestamp() })
      setSaveStatus('Saved')
      setTimeout(() => setSaveStatus(''), 2000)
    } catch {
      setSaveStatus('Error saving')
    }
  }, [])

  // Debounce auto-save
  useEffect(() => {
    if (!selected) return
    setSaveStatus('Auto-saving…')
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveNote(selected.id, { title, body, priority })
    }, 800)
    return () => clearTimeout(debounceRef.current)
  }, [title, body, priority, selected?.id])

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="flex h-full overflow-hidden">
      {/* Notes list */}
      <div className={`flex flex-col border-r border-border bg-card ${selected ? 'hidden sm:flex' : 'flex'} w-full sm:w-72 lg:w-80 flex-shrink-0`}>
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold">Notes</h1>
            {isAdmin && <Button size="icon-sm" onClick={newNote}><Plus className="h-4 w-4" /></Button>}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search notes…" className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-border">
          {filtered.length === 0 ? (
            <EmptyState icon={StickyNote} title="No notes" description="Create your first note." action={isAdmin && <Button size="sm" onClick={newNote}><Plus className="h-4 w-4" /> New Note</Button>} />
          ) : (
            filtered.map((note) => (
              <button
                key={note.id}
                onClick={() => selectNote(note)}
                className={`w-full text-left px-4 py-3 hover:bg-accent transition-colors ${selected?.id === note.id ? 'bg-accent' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-foreground break-words line-clamp-2 flex-1 min-w-0">{note.title || 'Untitled'}</p>
                  {note.priority && note.priority !== 'none' && (
                    <Badge variant={PRIORITY_COLORS[note.priority]} className="text-[10px] flex-shrink-0">{note.priority}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 break-words">{truncate(stripHtml(note.body || ''), 80)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{formatDate(note.updatedAt?.toDate?.()?.toISOString?.() || '')}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Editor toolbar */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2 flex-shrink-0 gap-3">
            <button className="sm:hidden text-muted-foreground hover:text-foreground text-sm" onClick={() => setSelected(null)}>← Back</button>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">{saveStatus}</span>
              <Select value={priority} onValueChange={(v) => { setPriority(v); setSaveStatus('') }} disabled={!isAdmin}>
                <SelectTrigger className="h-7 text-xs w-[110px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  {['none', 'high', 'medium', 'low'].map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
              {isAdmin && (
                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleteId(selected.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <input
              className="w-full px-6 pt-5 pb-2 text-xl font-semibold text-foreground bg-transparent border-0 outline-none placeholder:text-muted-foreground"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setSaveStatus('') }}
              placeholder="Note title…"
              disabled={!isAdmin}
            />
            <textarea
              className="flex-1 px-6 py-2 text-sm text-foreground bg-transparent border-0 outline-none resize-none placeholder:text-muted-foreground scrollbar-thin"
              value={body}
              onChange={(e) => { setBody(e.target.value); setSaveStatus('') }}
              onPaste={(e) => {
                const html = e.clipboardData.getData('text/html')
                const plain = e.clipboardData.getData('text/plain')
                const clean = html ? stripHtml(html) : stripHtml(plain)
                if (clean !== (html || plain)) {
                  e.preventDefault()
                  const el = e.target
                  const start = el.selectionStart
                  const end = el.selectionEnd
                  const next = body.slice(0, start) + clean + body.slice(end)
                  setBody(next)
                  setSaveStatus('')
                  // restore cursor after paste
                  requestAnimationFrame(() => {
                    el.selectionStart = el.selectionEnd = start + clean.length
                  })
                }
              }}
              placeholder="Start writing…"
              disabled={!isAdmin}
            />
          </div>
        </div>
      ) : (
        <div className="hidden sm:flex flex-1 items-center justify-center">
          <div className="text-center">
            <StickyNote className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Select a note to view it</p>
          </div>
        </div>
      )}

      <ConfirmDelete
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={async () => { await remove(deleteId); setSelected(null); toast.success('Note deleted'); setDeleteId(null) }}
        title="Delete note"
        description="This note will be permanently deleted."
      />
    </div>
  )
}
