import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/utils'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import LoadState from '@/components/shared/LoadState'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, Search, Trash2, StickyNote, Loader2 } from 'lucide-react'

const PRIORITY_COLORS = { high: 'destructive', medium: 'pending', low: 'returned', none: 'secondary' }

// Existing rich-text records are displayed as text and kept byte-for-byte if
// the body is not edited. No arbitrary HTML reaches the rendered page.
function plainText(value = '') {
  return String(value).replace(/<!--[^]*?-->/g, '').replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function noteDraft(note) {
  return { title: note?.title || '', body: plainText(note?.body || ''), priority: note?.priority || 'none' }
}

function recordedDate(note) {
  const value = note?.updatedAt || note?.createdAt
  const date = value?.toDate?.() || (value ? new Date(value) : null)
  return date && !Number.isNaN(date.getTime()) ? formatDate(date.toISOString()) : 'Not recorded'
}

function noteDateLabel(note) {
  return note?.updatedAt ? 'Updated' : note?.createdAt ? 'Created' : 'Date'
}

export default function Notes() {
  const { data: notes, loading, error } = useCollection('notes', 'updatedAt', 'desc')
  const { add, update, remove } = useFirestoreCRUD('notes')
  const { isAdmin } = useAuth()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [pendingSelection, setPendingSelection] = useState(undefined)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [saveError, setSaveError] = useState('')
  const [deleteId, setDeleteId] = useState(null)

  const filtered = useMemo(() => notes.filter((note) => {
    const query = search.trim().toLowerCase()
    return !query || [note.title, plainText(note.body), note.projectName, note.tenderName]
      .some((value) => String(value || '').toLowerCase().includes(query))
  }), [notes, search])
  const dirty = !!draft && !!baseline && JSON.stringify(draft) !== JSON.stringify(baseline)

  const showNote = (note) => {
    setSelected(note)
    const next = note ? noteDraft(note) : null
    setDraft(next)
    setBaseline(next)
    setSaveError('')
  }

  const navigateToNote = (note) => {
    if (savingRef.current) return
    if (dirty) { setPendingSelection(note); return }
    showNote(note)
  }

  const startNote = () => {
    if (savingRef.current) return
    if (dirty) { setPendingSelection('new'); return }
    showNote({ id: null, title: 'Untitled Note', body: '', priority: 'none' })
  }

  const saveNote = async () => {
    if (!isAdmin || !selected || !draft || savingRef.current || (selected.id && !dirty)) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    try {
      const payload = {
        title: draft.title.trim() || 'Untitled Note',
        body: draft.body === plainText(selected.body || '') ? selected.body || '' : draft.body,
        priority: draft.priority,
      }
      if (selected.id) await update(selected.id, payload)
      else {
        const id = await add(payload)
        setSelected({ ...selected, ...payload, id })
      }
      setDraft({ ...draft, title: payload.title })
      setBaseline({ ...draft, title: payload.title })
    } catch (failure) {
      console.error('Failed to save note:', failure)
      setSaveError('Could not save this note. Your edits are still here; please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (loading) return <div className="grid min-h-[70vh] grid-cols-1 gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2"><Skeleton className="h-full" /><Skeleton className="h-full" /></div>
  if (error) return <LoadState title="Notes could not be loaded" error={error} />

  return (
    <div className="flex min-h-[70vh] min-w-0 overflow-hidden rounded-xl border bg-card">
      <div className={`w-full flex-shrink-0 border-r border-border sm:w-72 lg:w-80 ${selected ? 'hidden sm:flex' : 'flex'} flex-col`}>
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-xl font-semibold tracking-tight">Notes</h1>
            {isAdmin && <Button size="sm" onClick={startNote}><Plus className="h-4 w-4" /> Add Note</Button>}
          </div>
          <div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search notes" type="search" placeholder="Search notes…" className="h-10 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        </div>
        <div className="flex-1 divide-y divide-border overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? <EmptyState icon={StickyNote} title={search ? 'No matching notes' : 'No notes yet'} description={search ? 'Try another search.' : 'Add a note to keep project information together.'} /> : filtered.map((note) => (
            <button key={note.id} type="button" onClick={() => navigateToNote(note)} className={`w-full px-4 py-3 text-left transition-colors hover:bg-accent ${selected?.id === note.id ? 'bg-accent' : ''}`}>
              <div className="flex min-w-0 items-start justify-between gap-2"><p className="min-w-0 flex-1 break-words text-sm font-medium line-clamp-2">{note.title || 'Untitled Note'}</p>{note.priority && note.priority !== 'none' && <Badge variant={PRIORITY_COLORS[note.priority] || 'secondary'} className="flex-shrink-0 capitalize">{note.priority}</Badge>}</div>
              <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{plainText(note.body || '')}</p>
              {(note.projectName || note.tenderName) && <p className="mt-1 truncate text-xs text-muted-foreground">{note.projectName || note.tenderName}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{noteDateLabel(note)}: {recordedDate(note)}</p>
            </button>
          ))}
        </div>
      </div>

      {selected && draft ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => navigateToNote(null)}>← Back</Button>
            <div className="min-w-0 text-xs text-muted-foreground">{selected.id ? `${noteDateLabel(selected)}: ${recordedDate(selected)}` : 'New note'}</div>
            <div className="flex items-center gap-2">{isAdmin && <Button variant="outline" size="sm" onClick={() => navigateToNote(null)} disabled={saving}>Close</Button>}{isAdmin && <Button size="sm" onClick={saveNote} disabled={saving || (selected.id && !dirty)}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Saving…' : 'Save Note'}</Button>}{isAdmin && selected.id && <Button variant="ghost" size="icon-sm" aria-label="Delete note" className="text-destructive" onClick={() => setDeleteId(selected.id)}><Trash2 className="h-4 w-4" /></Button>}</div>
          </div>
          {saveError && <p role="alert" className="mx-4 mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{saveError}</p>}
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
            <div className="space-y-1.5"><Label htmlFor="note-title">Title</Label><Input id="note-title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} disabled={!isAdmin} className="font-display text-lg font-semibold" /></div>
            <div className="space-y-1.5"><Label htmlFor="note-priority">Priority</Label><Select value={draft.priority} onValueChange={(priority) => setDraft((current) => ({ ...current, priority }))} disabled={!isAdmin}><SelectTrigger id="note-priority" className="w-40"><SelectValue /></SelectTrigger><SelectContent>{['none', 'high', 'medium', 'low'].map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select></div>
            {(selected.projectName || selected.tenderName || selected.tenderId) && <p className="text-sm text-muted-foreground">Linked project: {selected.tenderId ? <Link className="break-words text-primary underline-offset-2 hover:underline" to={`/tenders/${encodeURIComponent(selected.tenderId)}`}>{selected.projectName || selected.tenderName || selected.tenderId}</Link> : selected.projectName || selected.tenderName}</p>}
            <div className="flex min-h-[280px] flex-1 flex-col space-y-1.5"><Label htmlFor="note-body">Content</Label><Textarea id="note-body" className="min-h-[280px] flex-1 resize-y whitespace-pre-wrap break-words leading-6" value={draft.body} onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))} disabled={!isAdmin} /></div>
          </div>
        </div>
      ) : <div className="hidden flex-1 items-center justify-center sm:flex"><div className="text-center text-sm text-muted-foreground"><StickyNote className="mx-auto mb-3 h-10 w-10 opacity-40" />Select a note to read it</div></div>}

      <AlertDialog open={pendingSelection !== undefined} onOpenChange={(open) => { if (!open) setPendingSelection(undefined) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard note changes?</AlertDialogTitle><AlertDialogDescription>Your unsaved edits will be lost.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => { const next = pendingSelection; setPendingSelection(undefined); if (next === 'new') showNote({ id: null, title: 'Untitled Note', body: '', priority: 'none' }); else showNote(next) }}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={async () => { await remove(deleteId); showNote(null); setDeleteId(null) }} title="Delete note" description="This note will be permanently deleted." />
    </div>
  )
}
