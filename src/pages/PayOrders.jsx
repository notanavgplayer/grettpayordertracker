import { useState, useMemo } from 'react'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { useAuth } from '@/context/AuthContext'
import { exportPayOrdersCSV, exportPayOrdersPDF } from '@/lib/export'
import { formatCurrency, formatDate, PO_STATUSES, PO_PURPOSES, BID_RESULTS } from '@/lib/utils'
import { doc as fsDoc, updateDoc, addDoc as fsAddDoc, collection as fsCollection, serverTimestamp as fsServerTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import EmptyState from '@/components/shared/EmptyState'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import MetricCard from '@/components/shared/MetricCard'
import PayOrderQuickView from '@/components/shared/PayOrderQuickView'
import { PageTableSkeleton } from '@/components/shared/LoadingSkeletons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts'
import ChartTooltip, { AXIS_TICK, CHART_SEMANTIC } from '@/components/shared/ChartTooltip'
import {
  Plus, FileText, Download, Printer, Search, Pencil, Trash2,
  Loader2, TrendingUp, DollarSign, AlertCircle, CheckCircle, MoreHorizontal, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'

const EMPTY_PO = { po: '', bank: '', nit: '', amount: '', tender: '', agency: '', submitted: '', status: 'Pending', bidResult: 'N/A', notes: '', purpose: 'Tender Fee', tenderRef: '' }

export default function PayOrders() {
  const { data: payOrders, loading } = useCollection('payOrders', 'createdAt', 'desc')
  const { data: activityLog } = useCollection('activityLog', 'createdAt', 'desc')
  const { data: tenders } = useCollection('tenders', 'createdAt', 'desc')
  const { data: banks } = useCollection('banks', 'createdAt', 'asc')
  const { add, update, remove } = useFirestoreCRUD('payOrders')
  const { add: addLog, update: updateLog, remove: removeLog } = useFirestoreCRUD('activityLog')
  const { add: addBank } = useFirestoreCRUD('banks')
  const { isAdmin } = useAuth()

  const [tenderMode, setTenderMode] = useState('existing') // 'existing' | 'new' | 'none'
  const [newTenderFields, setNewTenderFields] = useState({ name: '', nit: '', agency: '' })
  const [tenderSearch, setTenderSearch] = useState('')
  const [addBankOpen, setAddBankOpen] = useState(false)
  const [newBankName, setNewBankName] = useState('')

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('All')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_PO)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState(null)
  const [quickView, setQuickView] = useState(null)

  // Activity log state
  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [editLog, setEditLog] = useState(null)
  const [logForm, setLogForm] = useState({ date: '', po: '', ref: '', action: '', next: '', by: '' })
  const [savingLog, setSavingLog] = useState(false)
  const [deleteLogId, setDeleteLogId] = useState(null)

  const filtered = useMemo(() => {
    return payOrders.filter((p) => {
      if (filterStatus !== 'All' && p.status !== filterStatus) return false
      if (!search) return true
      const q = search.toLowerCase()
      return [p.po, p.tender, p.agency, p.nit, p.bank].some((v) => (v || '').toLowerCase().includes(q))
    })
  }, [payOrders, search, filterStatus])

  // Summary stats
  const total = payOrders.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const atRisk = payOrders.filter((p) => p.status === 'Submitted').length
  const returned = payOrders.filter((p) => p.status === 'Returned').length
  const encashed = payOrders.filter((p) => p.status === 'Encashed').length

  // Chart data
  const statusChart = PO_STATUSES.map((s) => ({
    status: s,
    count: payOrders.filter((p) => p.status === s).length,
  })).filter((d) => d.count > 0)

  const winData = [
    { name: 'Won', value: payOrders.filter((p) => p.bidResult === 'Won').length, color: CHART_SEMANTIC.positive },
    { name: 'Lost', value: payOrders.filter((p) => p.bidResult === 'Lost').length, color: CHART_SEMANTIC.negative },
    { name: 'Active', value: payOrders.filter((p) => ['N/A', 'Awaiting'].includes(p.bidResult)).length, color: CHART_SEMANTIC.neutral },
  ].filter((d) => d.value > 0)

  const openDialog = (item = null) => {
    setEditItem(item)
    setForm(item ? { ...EMPTY_PO, ...item } : { ...EMPTY_PO, submitted: new Date().toISOString().slice(0, 10) })
    setTenderMode(item?.tenderRef ? 'existing' : 'none')
    setNewTenderFields({ name: item?.tender || '', nit: item?.nit || '', agency: item?.agency || '' })
    setTenderSearch('')
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.po) { toast.error('PO number is required'); return }
    setSaving(true)
    try {
      let tenderRef = form.tenderRef || ''
      let tenderName = form.tender || ''
      let nit = form.nit || ''
      let agency = form.agency || ''
      const amountNum = Number(form.amount) || 0

      if (tenderMode === 'new' && newTenderFields.name.trim()) {
        const stub = {
          name: newTenderFields.name.trim(),
          nit: newTenderFields.nit.trim(),
          agency: newTenderFields.agency.trim(),
          status: 'Bidding',
          value: 0,
          tenderFee: form.purpose === 'Tender Fee' ? amountNum : 0,
          bidSecurity: form.purpose === 'Bid Security' ? amountNum : 0,
          submissionDate: form.submitted || '',
          createdAt: fsServerTimestamp(),
          updatedAt: fsServerTimestamp(),
        }
        const ref = await fsAddDoc(fsCollection(db, 'tenders'), stub)
        tenderRef = ref.id
        tenderName = stub.name
        nit = nit || stub.nit
        agency = agency || stub.agency
      } else if (tenderMode === 'existing' && tenderRef) {
        const t = tenders.find((x) => x.id === tenderRef)
        if (t) {
          tenderName = t.name || tenderName
          nit = nit || t.nit || ''
          agency = agency || t.agency || ''
          // Write bidSecurity on tender if this PO is Bid Security
          if (form.purpose === 'Bid Security' && amountNum > 0) {
            try { await updateDoc(fsDoc(db, 'tenders', tenderRef), { bidSecurity: amountNum, updatedAt: fsServerTimestamp() }) } catch {}
          }
        }
      }

      const data = { ...form, amount: amountNum, tenderRef, tender: tenderName, nit, agency }
      if (editItem) {
        await update(editItem.id, data)
        toast.success('Pay order updated')
      } else {
        await add(data)
        toast.success('Pay order added')
      }
      setDialogOpen(false)
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    await remove(deleteId)
    toast.success('Pay order deleted')
    setDeleteId(null)
  }

  const openLogDialog = (item = null) => {
    setEditLog(item)
    setLogForm(item
      ? { date: item.date || '', po: item.po || '', ref: item.ref || '', action: item.action || '', next: item.next || '', by: item.by || '' }
      : { date: new Date().toISOString().slice(0, 10), po: '', ref: '', action: '', next: '', by: '' }
    )
    setLogDialogOpen(true)
  }

  const handleSaveLog = async () => {
    if (!logForm.action) { toast.error('Action is required'); return }
    setSavingLog(true)
    try {
      if (editLog) { await updateLog(editLog.id, logForm); toast.success('Log updated') }
      else { await addLog(logForm); toast.success('Log entry added') }
      setLogDialogOpen(false)
    } finally { setSavingLog(false) }
  }

  const handleAddBank = async () => {
    const name = newBankName.trim()
    if (!name) { toast.error('Bank name is required'); return }
    if (banks.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Bank already exists')
      return
    }
    try {
      await addBank({ name })
      setForm((p) => ({ ...p, bank: name }))
      setAddBankOpen(false)
      setNewBankName('')
      toast.success('Bank added')
    } catch {
      toast.error('Failed to add bank')
    }
  }

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target?.value ?? e }))
  const setLF = (k) => (e) => setLogForm((p) => ({ ...p, [k]: e.target?.value ?? e }))

  if (loading) return <PageTableSkeleton rows={8} cols={6} metrics={4} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pay Orders"
        description="Manage all pay order entries and activity logs"
        actions={
          isAdmin && (
            <Button onClick={() => openDialog()} className="gap-2">
              <Plus className="h-4 w-4" /> Add Pay Order
            </Button>
          )
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign}   title="Total Amount"   value={formatCurrency(total)} />
        <MetricCard icon={FileText}     title="Total Entries"  value={payOrders.length} mono={false} delta={`${returned} returned`} deltaPositive={null} />
        <MetricCard icon={AlertCircle}  title="At Risk"        value={atRisk} mono={false} delta={atRisk > 0 ? 'Submitted, awaiting result' : 'All clear'} deltaPositive={atRisk === 0} />
        <MetricCard icon={CheckCircle}  title="Encashed"       value={encashed} mono={false} delta={encashed > 0 ? `${Math.round((encashed / (payOrders.length || 1)) * 100)}% of total` : undefined} deltaPositive={null} />
      </div>

      {/* Charts */}
      {payOrders.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Status Distribution</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={statusChart} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="oklch(var(--border))" strokeDasharray="3 3" />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis dataKey="status" type="category" tick={AXIS_TICK} width={70} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'oklch(var(--muted))', opacity: 0.5 }} content={<ChartTooltip />} />
                  <Bar dataKey="count" fill="oklch(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Bid Results</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={winData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                    stroke="oklch(var(--card))"
                    strokeWidth={2}
                  >
                    {winData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs: Pay Orders | Activity Log */}
      <Tabs defaultValue="payorders">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <TabsList>
            <TabsTrigger value="payorders">Pay Orders</TabsTrigger>
            <TabsTrigger value="activity">Activity Log</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 flex-1 sm:ml-auto">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="icon" title="Export CSV" onClick={() => { if (!exportPayOrdersCSV(filtered)) toast.error('Nothing to export') }}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" title="Export PDF" onClick={() => { if (!exportPayOrdersPDF(filtered)) toast.error('Nothing to export') }}>
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <TabsContent value="payorders" className="mt-4">
          {/* Filter chips */}
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-thin -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
            {['All', ...PO_STATUSES].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                  filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {s} {s !== 'All' && <span className="font-mono tabular-nums">({payOrders.filter((p) => p.status === s).length})</span>}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={FileText} title="No pay orders found" description="Add your first pay order to get started." action={isAdmin && <Button onClick={() => openDialog()}><Plus className="h-4 w-4" /> Add Pay Order</Button>} />
          ) : (
            <>
              {/* Mobile: card-per-row */}
              <div className="md:hidden space-y-3">
                {filtered.map((p) => (
                  <Card key={p.id} className="overflow-hidden">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" onClick={() => setQuickView(p)} className="min-w-0 flex-1 text-left">
                          <p className="font-mono text-sm font-semibold text-foreground truncate hover:underline">{p.po || '—'}</p>
                          <p className="text-xs text-muted-foreground truncate mt-1">{p.bank || '—'}</p>
                        </button>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <StatusBadge status={p.status} />
                          {isAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openDialog(p)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteId(p.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>

                      {(p.tender || p.agency) && (
                        <div className="space-y-0.5">
                          {p.tender && <p className="text-sm font-semibold text-foreground break-words leading-snug">{p.tender}</p>}
                          {p.agency && <p className="text-xs text-muted-foreground break-words mt-1">{p.agency}</p>}
                        </div>
                      )}

                      <div>
                        <p className="font-mono tabular-nums font-semibold text-sm text-foreground leading-tight">
                          {formatCurrency(p.amount)}
                        </p>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">Pay order amount</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border divide-x divide-border">
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-1.5 text-foreground">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate">{formatDate(p.submitted) || '—'}</span>
                          </div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1 ml-[22px]">Submitted</p>
                        </div>
                        <div className="min-w-0 pl-3">
                          <p className="font-mono text-sm text-foreground break-all">{p.nit || '—'}</p>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1">NIT/Ref</p>
                        </div>
                        <div className="col-span-2 flex items-center justify-between gap-2 pt-3 border-t border-border">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Bid Result</span>
                          <StatusBadge status={p.bidResult} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop: table */}
              <Card className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs">PO #</TableHead>
                      <TableHead className="text-xs">Bank</TableHead>
                      <TableHead className="text-xs">NIT/Ref</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Tender</TableHead>
                      <TableHead className="text-xs">Agency</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs">Submitted</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Bid Result</TableHead>
                      {isAdmin && <TableHead className="w-12"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs font-medium">
                          <button type="button" onClick={() => setQuickView(p)} className="hover:underline text-left">{p.po || '—'}</button>
                        </TableCell>
                        <TableCell className="text-xs">{p.bank || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{p.nit || '—'}</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs font-semibold text-foreground min-w-[160px] max-w-[220px] whitespace-normal break-words">{p.tender || '—'}</TableCell>
                        <TableCell className="text-xs min-w-[140px] max-w-[200px] whitespace-normal break-words">{p.agency || '—'}</TableCell>
                        <TableCell className="text-xs font-mono tabular-nums text-right whitespace-nowrap">{formatCurrency(p.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.submitted)}</TableCell>
                        <TableCell><StatusBadge status={p.status} /></TableCell>
                        <TableCell className="hidden lg:table-cell"><StatusBadge status={p.bidResult} /></TableCell>
                        {isAdmin && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                  <span className="sr-only">Open menu</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openDialog(p)}>
                                  <Pencil className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setDeleteId(p.id)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="flex justify-end mb-4">
            {isAdmin && <Button size="sm" onClick={() => openLogDialog()}><Plus className="h-4 w-4" /> Add Entry</Button>}
          </div>
          {activityLog.length === 0 ? (
            <EmptyState icon={FileText} title="No activity logged" description="Track your follow-up actions here." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead className="hidden sm:table-cell">Reference</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden md:table-cell">Next Step</TableHead>
                    <TableHead className="hidden lg:table-cell">By</TableHead>
                    {isAdmin && <TableHead className="w-12"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLog.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(l.date)}</TableCell>
                      <TableCell className="font-mono text-sm">{l.po || '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm font-mono">{l.ref || '—'}</TableCell>
                      <TableCell className="text-sm">{l.action || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{l.next || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{l.by || '—'}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openLogDialog(l)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteLogId(l.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Pay Order Sheet */}
      <Sheet open={dialogOpen} onOpenChange={setDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>{editItem ? 'Edit Pay Order' : 'New Pay Order'}</SheetTitle>
            <SheetDescription>
              {editItem ? 'Update pay order details.' : 'Record a new pay order entry.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={<>PO Number <span className="text-destructive">*</span></>} value={form.po} onChange={setF('po')} placeholder="PO-2024-001" className="font-mono" />
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Select
                  value={form.bank}
                  onValueChange={(v) => {
                    if (v === '__add_bank__') { setNewBankName(''); setAddBankOpen(true); return }
                    setForm((p) => ({ ...p, bank: v }))
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>
                    {banks.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No banks yet — add one below.</div>
                    )}
                    {banks.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                    <div className="border-t border-border my-1" />
                    <SelectItem value="__add_bank__" className="text-primary">+ Add Bank</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="NIT / Reference" value={form.nit} onChange={setF('nit')} className="font-mono" />
              <Field label="Amount (PKR)" type="number" value={form.amount} onChange={setF('amount')} placeholder="0" className="font-mono tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <Select value={form.purpose || 'Tender Fee'} onValueChange={setF('purpose')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PO_PURPOSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2 rounded-md border border-border p-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Attach to tender</Label>
              <div className="flex gap-2">
                {[['none','None'],['existing','Existing'],['new','Create new']].map(([v,l]) => (
                  <button key={v} type="button" onClick={() => setTenderMode(v)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${tenderMode === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
                    {l}
                  </button>
                ))}
              </div>
              {tenderMode === 'existing' && (() => {
                const selected = tenders.find((t) => t.id === form.tenderRef)
                const q = tenderSearch.trim().toLowerCase()
                const matches = q
                  ? tenders.filter((t) =>
                      (t.name || '').toLowerCase().includes(q) ||
                      (t.nit || '').toLowerCase().includes(q) ||
                      (t.agency || '').toLowerCase().includes(q)
                    ).slice(0, 8)
                  : []
                return (
                  <div className="space-y-2">
                    {selected ? (
                      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{selected.name || 'Untitled'}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {selected.nit || '—'}{selected.agency ? ` · ${selected.agency}` : ''}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setForm((p) => ({ ...p, tenderRef: '' })); setTenderSearch('') }}>
                          Change
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            value={tenderSearch}
                            onChange={(e) => setTenderSearch(e.target.value)}
                            placeholder="Search tenders by name, NIT, or agency…"
                            className="pl-8 h-9"
                          />
                        </div>
                        {q && (
                          <div className="rounded-md border border-border max-h-48 overflow-y-auto">
                            {matches.length === 0 ? (
                              <p className="text-xs text-muted-foreground text-center py-3">No matching tenders.</p>
                            ) : matches.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => { setForm((p) => ({ ...p, tenderRef: t.id })); setTenderSearch('') }}
                                className="w-full text-left px-3 py-2 hover:bg-accent border-b border-border last:border-0"
                              >
                                <p className="text-sm font-medium truncate">{t.name || 'Untitled'}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {t.nit || '—'}{t.agency ? ` · ${t.agency}` : ''}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                        {!q && tenders.length === 0 && (
                          <p className="text-xs text-muted-foreground">No tenders yet — create one instead.</p>
                        )}
                      </>
                    )}
                  </div>
                )
              })()}
              {tenderMode === 'new' && (
                <div className="space-y-2">
                  <Field label="Tender name" value={newTenderFields.name} onChange={(e) => setNewTenderFields((p) => ({ ...p, name: e.target.value }))} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="NIT" value={newTenderFields.nit} onChange={(e) => setNewTenderFields((p) => ({ ...p, nit: e.target.value }))} className="font-mono" />
                    <Field label="Agency" value={newTenderFields.agency} onChange={(e) => setNewTenderFields((p) => ({ ...p, agency: e.target.value }))} />
                  </div>
                  <p className="text-xs text-muted-foreground">A new tender will be created with status Bidding and this amount as {form.purpose === 'Bid Security' ? 'bid security' : 'tender fee'}.</p>
                </div>
              )}
              {tenderMode === 'none' && (
                <Field label="Tender / Project (free-text)" value={form.tender} onChange={setF('tender')} />
              )}
            </div>
            <Field label="Agency" value={form.agency} onChange={setF('agency')} />
            <Field label="Date Submitted" type="date" value={form.submitted} onChange={setF('submitted')} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={setF('status')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bid Result</Label>
                <Select value={form.bidResult} onValueChange={setF('bidResult')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BID_RESULTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={setF('notes')} rows={4} placeholder="Optional remarks…" />
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editItem ? 'Save Changes' : 'Add Pay Order'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Activity Log Sheet */}
      <Sheet open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>{editLog ? 'Edit Log Entry' : 'New Log Entry'}</SheetTitle>
            <SheetDescription>Track a follow-up action for this pay order.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Date" type="date" value={logForm.date} onChange={setLF('date')} />
              <Field label="PO Number" value={logForm.po} onChange={setLF('po')} className="font-mono" />
            </div>
            <Field label="Reference" value={logForm.ref} onChange={setLF('ref')} className="font-mono" />
            <Field label={<>Action <span className="text-destructive">*</span></>} value={logForm.action} onChange={setLF('action')} placeholder="What was done?" />
            <Field label="Next Step" value={logForm.next} onChange={setLF('next')} placeholder="What needs to happen next?" />
            <Field label="By" value={logForm.by} onChange={setLF('by')} placeholder="Who performed this?" />
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setLogDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveLog} disabled={savingLog}>
              {savingLog && <Loader2 className="h-4 w-4 animate-spin" />}
              {editLog ? 'Save Changes' : 'Add Entry'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <PayOrderQuickView
        payOrder={quickView}
        open={!!quickView}
        onOpenChange={(v) => !v && setQuickView(null)}
        canEdit={isAdmin}
        onEdit={() => { const p = quickView; setQuickView(null); openDialog(p) }}
      />

      {/* Add Bank dialog (simple inline Sheet) */}
      <Sheet open={addBankOpen} onOpenChange={(v) => { setAddBankOpen(v); if (!v) setNewBankName('') }}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>Add Bank</SheetTitle>
            <SheetDescription>Add a new bank name to choose from.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-bank-name">Bank name</Label>
              <Input
                id="new-bank-name"
                value={newBankName}
                onChange={(e) => setNewBankName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddBank() } }}
                placeholder="e.g. HBL"
                autoFocus
              />
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setAddBankOpen(false)}>Cancel</Button>
            <Button onClick={handleAddBank}>Add Bank</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDelete open={!!deleteId} onOpenChange={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete pay order" description="This will permanently remove the pay order record." />
      <ConfirmDelete open={!!deleteLogId} onOpenChange={() => setDeleteLogId(null)} onConfirm={async () => { await removeLog(deleteLogId); toast.success('Log deleted'); setDeleteLogId(null) }} title="Delete log entry" description="This will remove this activity log entry." />
    </div>
  )
}

function Field({ label, className, inputClassName, ...props }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input className={className} {...props} />
    </div>
  )
}
