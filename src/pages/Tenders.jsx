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
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Search, Pencil, Trash2, Loader2, FileStack, Download,
  ExternalLink, CheckCircle, Calendar, MoreHorizontal,
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

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {TENDER_STATUSES.map((s) => {
          const count = tenders.filter((t) => t.status === s).length
          const active = filterStatus === s
          return (
            <Card
              key={s}
              className={`cursor-pointer transition-all hover:shadow-sm ${active ? 'ring-2 ring-primary border-primary/50' : ''}`}
              onClick={() => setFilterStatus(s === filterStatus ? 'All' : s)}
            >
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold font-mono tabular-nums text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground">{s}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Tender table */}
      {filtered.length === 0 && !search && filterStatus === 'All' ? (
        <EmptyState icon={FileStack} title="No tenders found" description="Add your first tender to get started." action={isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> New Tender</Button>} />
      ) : (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0 border-b border-border py-3 px-4">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search tenders…" className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5">
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
          </CardHeader>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No tenders match your filters.
            </div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tender Name</TableHead>
                <TableHead className="hidden sm:table-cell">Agency</TableHead>
                <TableHead className="hidden md:table-cell">NIT/Ref</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Value</TableHead>
                <TableHead className="hidden md:table-cell">Submission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Checklist</TableHead>
                <TableHead className="w-12"></TableHead>
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
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">{t.nit || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm font-mono tabular-nums text-right">{formatCurrency(t.value)}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{formatDate(t.submissionDate)}</TableCell>
                    <TableCell><StatusBadge status={t.status} /></TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {total > 0 && (
                        <div className="flex items-center gap-2 min-w-[100px]">
                          <Progress value={pct} className="flex-1 h-1.5" />
                          <span className="text-xs text-muted-foreground font-mono tabular-nums">{done}/{total}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/tenders/${t.id}`} className="cursor-pointer">
                              <ExternalLink className="mr-2 h-4 w-4" /> View detail
                            </Link>
                          </DropdownMenuItem>
                          {isAdmin && (
                            <>
                              <DropdownMenuItem onClick={() => openDialog(t)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteId(t.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          )}
        </Card>
      )}

      {/* Tender Sheet */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>{editItem ? 'Edit Tender' : 'New Tender'}</SheetTitle>
            <SheetDescription>
              {editItem ? 'Update tender details and status.' : 'Add a new tender to the pipeline.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Tender Name <span className="text-destructive">*</span></Label>
              <Input id="t-name" value={form.name} onChange={setF('name')} placeholder="e.g. Supply of Office Equipment" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-nit">NIT / Reference</Label>
                <Input id="t-nit" value={form.nit} onChange={setF('nit')} placeholder="NIT-2024-001" className="font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-value">Value (PKR)</Label>
                <Input id="t-value" type="number" value={form.value} onChange={setF('value')} placeholder="0" className="font-mono tabular-nums" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-agency">Procuring Agency</Label>
              <Input id="t-agency" value={form.agency} onChange={setF('agency')} placeholder="e.g. PPRA, NHA" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={setF('status')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TENDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-po">Linked Pay Order</Label>
                <Input id="t-po" value={form.linkedPO} onChange={setF('linkedPO')} placeholder="PO-2024-001" className="font-mono" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="t-sub">Submission Date</Label>
                <Input id="t-sub" type="date" value={form.submissionDate} onChange={setF('submissionDate')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-open">Opening Date</Label>
                <Input id="t-open" type="date" value={form.openingDate} onChange={setF('openingDate')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-notes">Notes</Label>
              <Textarea id="t-notes" value={form.notes} onChange={setF('notes')} rows={4} placeholder="Optional notes…" />
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Create Tender'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete tender" description="This will permanently delete the tender and all related data." />
    </div>
  )
}
