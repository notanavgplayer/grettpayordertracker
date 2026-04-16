import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { formatDate, formatCurrency, TENDER_STATUSES, uid } from '@/lib/utils'
import { exportTendersCSV } from '@/lib/export'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
  Plus, Search, Pencil, Trash2, Loader2, FileStack, Download,
  ExternalLink, CheckCircle, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'

const EMPTY_TENDER = {
  name: '', nit: '', agency: '', value: '', status: 'Bidding',
  submissionDate: '', openingDate: '', linkedPO: '', notes: '',
  contact: '', checklist: [], bills: [], raBills: [], statusHistory: [],
}

export default function Tenders() {
  const { data: tenders, loading } = useCollection('tenders', 'createdAt', 'desc')
  const { add, update, remove } = useFirestoreCRUD('tenders')
  const { isAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_TENDER)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  const filtered = useMemo(() => {
    return tenders.filter((t) => {
      if (filterStatus !== 'All' && t.status !== filterStatus) return false
      if (!search) return true
      const q = search.toLowerCase()
      return [t.name, t.agency, t.nit].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [tenders, search, filterStatus])

  const openDialog = (item = null) => {
    setEditItem(item)
    setForm(item ? { ...EMPTY_TENDER, ...item } : { ...EMPTY_TENDER })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('Tender name is required'); return }

    // Duplicate NIT detection
    if (form.nit && !editItem) {
      const dup = tenders.find((t) => t.nit?.toLowerCase() === form.nit.toLowerCase())
      if (dup) {
        const ok = window.confirm(
          `⚠️ A tender with NIT/Ref "${form.nit}" already exists:\n\n"${dup.name || 'Untitled'}" — ${dup.agency || 'No agency'} (${dup.status || '—'})\n\nDo you still want to create this tender?`
        )
        if (!ok) return
      }
    }

    // Duplicate name + agency detection
    if (form.name && form.agency && !editItem) {
      const dup = tenders.find(
        (t) => t.name?.toLowerCase() === form.name.toLowerCase() && t.agency?.toLowerCase() === form.agency.toLowerCase()
      )
      if (dup) {
        const ok = window.confirm(
          `⚠️ A tender with the same name and agency already exists:\n\n"${dup.name}" — ${dup.agency} (${dup.status || '—'})\n\nDo you still want to create this tender?`
        )
        if (!ok) return
      }
    }

    setSaving(true)
    try {
      const data = {
        ...form,
        value: Number(form.value) || 0,
        checklist: form.checklist || [],
        bills: form.bills || [],
        raBills: form.raBills || [],
        statusHistory: form.statusHistory || [],
      }
      if (editItem) {
        // Record status change if different
        if (editItem.status !== form.status) {
          data.statusHistory = [...(editItem.statusHistory || []), {
            from: editItem.status, to: form.status,
            date: new Date().toISOString().slice(0, 10),
            ts: Date.now(),
          }]
        }
        await update(editItem.id, data)
        toast.success('Tender updated')
      } else {
        await add(data)
        toast.success('Tender created')
      }
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    await remove(deleteId)
    toast.success('Tender deleted')
    setDeleteId(null)
  }

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Tenders"
        description="Manage your tender pipeline"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportTendersCSV(filtered)}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            {isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> New Tender</Button>}
          </>
        }
      />

      {/* Filter + Search bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search tenders…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {['All', ...TENDER_STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {TENDER_STATUSES.map((s) => {
          const count = tenders.filter((t) => t.status === s).length
          return (
            <Card key={s} className="cursor-pointer hover:shadow-sm" onClick={() => setFilterStatus(s === filterStatus ? 'All' : s)}>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground">{s}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Tender table */}
      {filtered.length === 0 ? (
        <EmptyState icon={FileStack} title="No tenders found" description="Add your first tender to get started." action={isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> New Tender</Button>} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tender Name</TableHead>
                <TableHead className="hidden sm:table-cell">Agency</TableHead>
                <TableHead className="hidden md:table-cell">NIT/Ref</TableHead>
                <TableHead className="hidden lg:table-cell">Value</TableHead>
                <TableHead className="hidden md:table-cell">Submission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Checklist</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const done = (t.checklist || []).filter((c) => c.done).length
                const total = (t.checklist || []).length
                const pct = total ? Math.round((done / total) * 100) : 0
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link to={`/tenders/${t.id}`} className="font-medium text-sm hover:underline text-foreground">
                        {t.name || 'Untitled'}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground truncate max-w-[160px]">{t.agency || '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{t.nit || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm font-medium">{formatCurrency(t.value)}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(t.submissionDate)}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {total > 0 && (
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress value={pct} className="flex-1 h-1.5" />
                          <span className="text-xs text-muted-foreground">{done}/{total}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Link to={`/tenders/${t.id}`}>
                          <Button variant="ghost" size="icon-sm" title="Open detail"><ExternalLink className="h-3.5 w-3.5" /></Button>
                        </Link>
                        {isAdmin && <>
                          <Button variant="ghost" size="icon-sm" onClick={() => openDialog(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Tender Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit Tender' : 'New Tender'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Tender Name *</Label>
              <Input value={form.name} onChange={setF('name')} placeholder="e.g. Supply of Office Equipment" />
            </div>
            <div className="space-y-1.5">
              <Label>NIT / Reference</Label>
              <Input value={form.nit} onChange={setF('nit')} placeholder="e.g. NIT-2024-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Value (PKR)</Label>
              <Input type="number" value={form.value} onChange={setF('value')} placeholder="0" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Procuring Agency</Label>
              <Input value={form.agency} onChange={setF('agency')} placeholder="e.g. PPRA, NHA" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={setF('status')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TENDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Linked Pay Order</Label>
              <Input value={form.linkedPO} onChange={setF('linkedPO')} placeholder="e.g. PO-2024-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Submission Date</Label>
              <Input type="date" value={form.submissionDate} onChange={setF('submissionDate')} />
            </div>
            <div className="space-y-1.5">
              <Label>Opening Date</Label>
              <Input type="date" value={form.openingDate} onChange={setF('openingDate')} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={setF('notes')} rows={3} placeholder="Optional notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Create Tender'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete tender" description="This will permanently delete the tender and all related data." />
    </div>
  )
}
