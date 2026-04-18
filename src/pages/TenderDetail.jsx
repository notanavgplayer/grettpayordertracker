import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, addDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { formatDate, formatCurrency, TENDER_STATUSES, EXPENSE_CATEGORIES, uid } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import StatusBadge from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Save, Plus, Trash2, Pencil, Loader2, CheckSquare, DollarSign, History, User, Receipt, FileText } from 'lucide-react'
import { toast } from 'sonner'

const EMPTY_EXP = { description: '', category: EXPENSE_CATEGORIES[0], amount: '', date: '', note: '' }

export default function TenderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [tender, setTender] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({})
  const [dirty, setDirty] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [linkedPOs, setLinkedPOs] = useState([])
  const [expDialogOpen, setExpDialogOpen] = useState(false)
  const [editExp, setEditExp] = useState(null)
  const [expForm, setExpForm] = useState(EMPTY_EXP)
  const [expSaving, setExpSaving] = useState(false)
  const [deleteExpId, setDeleteExpId] = useState(null)
  const [expRefresh, setExpRefresh] = useState(0)

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'tenders', id))
        if (!snap.exists()) { navigate('/tenders'); return }
        const data = { id: snap.id, ...snap.data() }
        setTender(data)
        setForm(data)
      } catch {
        toast.error('Failed to load tender')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  useEffect(() => {
    const loadExpenses = async () => {
      try {
        const q1 = query(collection(db, 'expenses'), where('tenderRef', '==', id))
        const snap = await getDocs(q1)
        setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } catch {}
    }
    loadExpenses()
  }, [id, saving, expRefresh])

  useEffect(() => {
    const loadPOs = async () => {
      if (!tender) return
      try {
        const snap = await getDocs(collection(db, 'payOrders'))
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        const nit = (tender.nit || '').trim()
        const linkedPO = (tender.linkedPO || '').trim()
        const name = (tender.name || '').trim()
        const matched = all.filter((p) => {
          const pNit = (p.nit || '').trim()
          const pPO = (p.po || '').trim()
          const pTender = (p.tender || '').trim()
          return (nit && pNit && pNit === nit) ||
                 (linkedPO && pPO && pPO === linkedPO) ||
                 (name && pTender && pTender === name)
        })
        setLinkedPOs(matched)
      } catch {}
    }
    loadPOs()
  }, [tender])

  const expenseTotal = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  )
  const poTotal = useMemo(
    () => linkedPOs.reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [linkedPOs]
  )
  const combinedTotal = expenseTotal + poTotal

  const openExpDialog = (item = null) => {
    setEditExp(item)
    setExpForm(item
      ? { description: item.description || '', category: item.category || EXPENSE_CATEGORIES[0], amount: item.amount || '', date: item.date || '', note: item.note || '' }
      : { ...EMPTY_EXP, date: new Date().toISOString().slice(0, 10) })
    setExpDialogOpen(true)
  }

  const saveExpense = async () => {
    if (!expForm.description) { toast.error('Description is required'); return }
    setExpSaving(true)
    try {
      const payload = {
        description: expForm.description,
        category: expForm.category,
        amount: Number(expForm.amount) || 0,
        date: expForm.date || new Date().toISOString().slice(0, 10),
        note: expForm.note || '',
        tenderId: (tender?.nit || id),
        tenderRef: id,
        source: 'tender-detail',
        updatedAt: serverTimestamp(),
      }
      if (editExp) {
        await updateDoc(doc(db, 'expenses', editExp.id), payload)
        toast.success('Expense updated')
      } else {
        await addDoc(collection(db, 'expenses'), { ...payload, createdAt: serverTimestamp() })
        toast.success('Expense added')
      }
      setExpDialogOpen(false)
      setExpRefresh((n) => n + 1)
    } catch {
      toast.error('Failed to save expense')
    } finally {
      setExpSaving(false)
    }
  }

  const removeExpense = async () => {
    if (!deleteExpId) return
    try {
      await deleteDoc(doc(db, 'expenses', deleteExpId))
      toast.success('Expense deleted')
      setDeleteExpId(null)
      setExpRefresh((n) => n + 1)
    } catch {
      toast.error('Failed to delete')
    }
  }

  const setExpF = (k) => (e) => setExpForm((p) => ({ ...p, [k]: e.target?.value ?? e }))

  const updateForm = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }))
    setDirty(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const tenderFeeNum = Number(form.tenderFee) || 0
      const data = { ...form, value: Number(form.value) || 0, tenderFee: tenderFeeNum }
      // Record status change
      if (tender.status !== form.status) {
        data.statusHistory = [...(tender.statusHistory || []), {
          from: tender.status, to: form.status,
          date: new Date().toISOString().slice(0, 10),
          ts: Date.now(),
        }]
      }

      // Sync tender fee expense
      const existingExpId = tender.tenderFeeExpenseId
      const expPayload = {
        description: `Tender fee — ${form.name || 'Untitled'}`,
        category: 'Tender Fees',
        amount: tenderFeeNum,
        date: form.submissionDate || new Date().toISOString().slice(0, 10),
        tenderId: form.nit || id,
        note: 'Auto-generated from tender fee',
        source: 'tender',
        tenderRef: id,
        updatedAt: serverTimestamp(),
      }
      try {
        if (tenderFeeNum > 0 && existingExpId) {
          await updateDoc(doc(db, 'expenses', existingExpId), expPayload)
        } else if (tenderFeeNum > 0 && !existingExpId) {
          const ref = await addDoc(collection(db, 'expenses'), { ...expPayload, createdAt: serverTimestamp() })
          data.tenderFeeExpenseId = ref.id
        } else if (tenderFeeNum <= 0 && existingExpId) {
          await deleteDoc(doc(db, 'expenses', existingExpId))
          data.tenderFeeExpenseId = null
        }
      } catch (e) {
        // non-fatal — continue with tender save
      }

      await updateDoc(doc(db, 'tenders', id), { ...data, updatedAt: serverTimestamp() })
      setTender(data)
      setDirty(false)
      toast.success('Tender saved')
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  // Checklist helpers
  const addChecklistItem = () => {
    const item = { id: uid(), label: '', done: false }
    updateForm('checklist', [...(form.checklist || []), item])
  }
  const updateChecklistItem = (itemId, patch) => {
    updateForm('checklist', (form.checklist || []).map((c) => c.id === itemId ? { ...c, ...patch } : c))
  }
  const removeChecklistItem = (itemId) => {
    updateForm('checklist', (form.checklist || []).filter((c) => c.id !== itemId))
  }

  // Bills helpers
  const addBill = () => {
    updateForm('bills', [...(form.bills || []), { id: uid(), desc: '', amount: 0, date: '', status: 'Pending' }])
  }
  const updateBill = (billId, patch) => {
    updateForm('bills', (form.bills || []).map((b) => b.id === billId ? { ...b, ...patch } : b))
  }
  const removeBill = (billId) => {
    updateForm('bills', (form.bills || []).filter((b) => b.id !== billId))
  }

  // RA Bills helpers
  const addRABill = () => {
    updateForm('raBills', [...(form.raBills || []), { id: uid(), no: '', amount: 0, submitted: '', paid: '', status: 'Submitted' }])
  }
  const updateRABill = (billId, patch) => {
    updateForm('raBills', (form.raBills || []).map((b) => b.id === billId ? { ...b, ...patch } : b))
  }
  const removeRABill = (billId) => {
    updateForm('raBills', (form.raBills || []).filter((b) => b.id !== billId))
  }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (!tender) return null

  const checklist = form.checklist || []
  const doneCount = checklist.filter((c) => c.done).length
  const pct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0

  const billTotal = (form.bills || []).reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const billPaid = (form.bills || []).filter((b) => b.status === 'Paid').reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const raBillTotal = (form.raBills || []).reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const raBillPaid = (form.raBills || []).filter((b) => b.status === 'Paid').reduce((s, b) => s + (Number(b.amount) || 0), 0)

  return (
    <div className="space-y-6">
      <Link to="/tenders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Tenders
      </Link>

      <PageHeader
        title={form.name || 'Untitled Tender'}
        description={form.nit ? `NIT ${form.nit}` : null}
        actions={
          <div className="flex items-center gap-2">
            {form.status && <StatusBadge status={form.status} />}
            {isAdmin && dirty && (
              <Button onClick={save} disabled={saving} size="sm">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                <Save className="h-4 w-4" /> Save Changes
              </Button>
            )}
          </div>
        }
      />

      {/* Header info */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
              <Label>Tender Name</Label>
              <Input value={form.name || ''} onChange={(e) => updateForm('name', e.target.value)} disabled={!isAdmin} className="text-base font-semibold" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status || ''} onValueChange={(v) => updateForm('status', v)} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TENDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>NIT / Reference</Label>
              <Input value={form.nit || ''} onChange={(e) => updateForm('nit', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Value (PKR)</Label>
              <Input type="number" value={form.value || ''} onChange={(e) => updateForm('value', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Tender Fee (PKR)</Label>
              <Input type="number" value={form.tenderFee || ''} onChange={(e) => updateForm('tenderFee', e.target.value)} disabled={!isAdmin} className="font-mono tabular-nums" />
              <p className="text-xs text-muted-foreground">Auto-tracked as expense.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Procuring Agency</Label>
              <Input value={form.agency || ''} onChange={(e) => updateForm('agency', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Submission Date</Label>
              <Input type="date" value={form.submissionDate || ''} onChange={(e) => updateForm('submissionDate', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Opening Date</Label>
              <Input type="date" value={form.openingDate || ''} onChange={(e) => updateForm('openingDate', e.target.value)} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Linked Pay Order</Label>
              <Input value={form.linkedPO || ''} onChange={(e) => updateForm('linkedPO', e.target.value)} disabled={!isAdmin} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bills">Bills ({(form.bills || []).length})</TabsTrigger>
          <TabsTrigger value="rabills">RA Bills ({(form.raBills || []).length})</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
        </TabsList>

        {/* Overview tab: checklist + notes + history */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Checklist */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckSquare className="h-4 w-4" /> Checklist
                  {checklist.length > 0 && <span className="text-muted-foreground font-normal">{doneCount}/{checklist.length}</span>}
                </CardTitle>
                {isAdmin && <Button size="sm" variant="outline" onClick={addChecklistItem}><Plus className="h-3.5 w-3.5" /> Add Item</Button>}
              </div>
              {checklist.length > 0 && <Progress value={pct} className="h-1.5 mt-2" />}
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {checklist.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No checklist items yet.</p>}
              {checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-3 group">
                  <Checkbox
                    checked={item.done}
                    onCheckedChange={(v) => updateChecklistItem(item.id, { done: v })}
                    disabled={!isAdmin}
                  />
                  <Input
                    value={item.label}
                    onChange={(e) => updateChecklistItem(item.id, { label: e.target.value })}
                    disabled={!isAdmin}
                    className={`flex-1 border-0 shadow-none focus-visible:ring-0 p-0 h-auto bg-transparent ${item.done ? 'line-through text-muted-foreground' : ''}`}
                    placeholder="Checklist item…"
                  />
                  {isAdmin && (
                    <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 text-destructive" onClick={() => removeChecklistItem(item.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={form.notes || ''} onChange={(e) => updateForm('notes', e.target.value)} disabled={!isAdmin} rows={4} placeholder="Add notes about this tender…" />
            </CardContent>
          </Card>

          {/* Status History */}
          {(form.statusHistory || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4" /> Status History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {(form.statusHistory || []).map((h, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{formatDate(h.date)}</span>
                    <StatusBadge status={h.from} />
                    <span className="text-muted-foreground">→</span>
                    <StatusBadge status={h.to} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Bills tab */}
        <TabsContent value="bills" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-mono tabular-nums font-bold">{formatCurrency(billTotal)}</p><p className="text-xs text-muted-foreground">Total Billed</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(billPaid)}</p><p className="text-xs text-muted-foreground">Received</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">{formatCurrency(billTotal - billPaid)}</p><p className="text-xs text-muted-foreground">Outstanding</p></CardContent></Card>
          </div>
          {isAdmin && <Button size="sm" onClick={addBill}><Plus className="h-3.5 w-3.5" /> Add Bill</Button>}
          {(form.bills || []).map((bill) => (
            <Card key={bill.id}>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input value={bill.desc} onChange={(e) => updateBill(bill.id, { desc: e.target.value })} disabled={!isAdmin} placeholder="Bill description" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount (PKR)</Label>
                    <Input type="number" value={bill.amount} onChange={(e) => updateBill(bill.id, { amount: Number(e.target.value) })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={bill.date} onChange={(e) => updateBill(bill.id, { date: e.target.value })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={bill.status} onValueChange={(v) => updateBill(bill.id, { status: v })} disabled={!isAdmin}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => removeBill(bill.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {(form.bills || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No bills added yet.</p>}
        </TabsContent>

        {/* RA Bills tab */}
        <TabsContent value="rabills" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-mono tabular-nums font-bold">{formatCurrency(raBillTotal)}</p><p className="text-xs text-muted-foreground">Total RA Billed</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(raBillPaid)}</p><p className="text-xs text-muted-foreground">Received</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">{formatCurrency(raBillTotal - raBillPaid)}</p><p className="text-xs text-muted-foreground">Outstanding</p></CardContent></Card>
          </div>
          {isAdmin && <Button size="sm" onClick={addRABill}><Plus className="h-3.5 w-3.5" /> Add RA Bill</Button>}
          {(form.raBills || []).map((bill) => (
            <Card key={bill.id}>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Bill No.</Label>
                    <Input value={bill.no} onChange={(e) => updateRABill(bill.id, { no: e.target.value })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Amount (PKR)</Label>
                    <Input type="number" value={bill.amount} onChange={(e) => updateRABill(bill.id, { amount: Number(e.target.value) })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Submitted</Label>
                    <Input type="date" value={bill.submitted} onChange={(e) => updateRABill(bill.id, { submitted: e.target.value })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Paid Date</Label>
                    <Input type="date" value={bill.paid} onChange={(e) => updateRABill(bill.id, { paid: e.target.value })} disabled={!isAdmin} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={bill.status} onValueChange={(v) => updateRABill(bill.id, { status: v })} disabled={!isAdmin}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Submitted', 'Under Review', 'Paid', 'Rejected'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => removeRABill(bill.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {(form.raBills || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No RA bills yet.</p>}
        </TabsContent>

        {/* Expenses tab */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-mono tabular-nums font-bold">{formatCurrency(expenseTotal)}</p><p className="text-xs text-muted-foreground">Expenses ({expenses.length})</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-mono tabular-nums font-bold">{formatCurrency(poTotal)}</p><p className="text-xs text-muted-foreground">Pay Orders ({linkedPOs.length})</p></CardContent></Card>
            <Card><CardContent className="p-4 text-center"><p className="text-lg font-mono tabular-nums font-bold text-primary">{formatCurrency(combinedTotal)}</p><p className="text-xs text-muted-foreground">Combined Total</p></CardContent></Card>
          </div>

          {/* Pay Orders */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" /> Linked Pay Orders
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {linkedPOs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No pay orders matched this tender (by NIT, PO number, or name).
                </p>
              ) : (
                <>
                  <div className="md:hidden space-y-2">
                    {linkedPOs.map((p) => (
                      <div key={p.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium break-words">PO {p.po || '—'}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{p.bank || '—'}{p.submitted && <> · {formatDate(p.submitted)}</>}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono tabular-nums text-sm font-semibold whitespace-nowrap">{formatCurrency(p.amount)}</span>
                            {p.status && <StatusBadge status={p.status} />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>PO #</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkedPOs.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm font-medium">{p.po || '—'}</TableCell>
                          <TableCell className="text-sm">{p.bank || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(p.submitted)}</TableCell>
                          <TableCell>{p.status && <StatusBadge status={p.status} />}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm">{formatCurrency(p.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>

          {/* Expenses */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Receipt className="h-4 w-4" /> Expenses
                </CardTitle>
                {isAdmin && <Button size="sm" onClick={() => openExpDialog()}><Plus className="h-3.5 w-3.5" /> Add Expense</Button>}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No expenses linked to this tender yet.
                </p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-2">
                    {expenses.map((e) => (
                      <div key={e.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground break-words">{e.description || '—'}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(e.date)}{e.category && <> · {e.category}</>}</p>
                          </div>
                          <span className="font-mono tabular-nums text-sm font-semibold whitespace-nowrap">{formatCurrency(e.amount)}</span>
                        </div>
                        {e.note && <p className="text-xs text-muted-foreground mt-1.5 break-words">{e.note}</p>}
                        {isAdmin && (
                          <div className="flex justify-end gap-1 mt-2">
                            <Button variant="ghost" size="icon-sm" onClick={() => openExpDialog(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleteExpId(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        {isAdmin && <TableHead className="w-20"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(e.date)}</TableCell>
                          <TableCell className="text-sm">{e.description || '—'}</TableCell>
                          <TableCell className="text-sm">
                            {e.category && <Badge variant="secondary" className="text-xs">{e.category}</Badge>}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm">{formatCurrency(e.amount)}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon-sm" onClick={() => openExpDialog(e)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleteExpId(e.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contact tab */}
        <TabsContent value="contact" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><User className="h-4 w-4" /> Contact Person</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {['name', 'phone', 'email', 'role'].map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label className="capitalize">{field}</Label>
                  <Input
                    value={(form.contactPerson || {})[field] || ''}
                    onChange={(e) => updateForm('contactPerson', { ...(form.contactPerson || {}), [field]: e.target.value })}
                    disabled={!isAdmin}
                  />
                </div>
              ))}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={(form.contactPerson || {}).notes || ''}
                  onChange={(e) => updateForm('contactPerson', { ...(form.contactPerson || {}), notes: e.target.value })}
                  disabled={!isAdmin}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Floating save for mobile */}
      {isAdmin && dirty && (
        <div className="fixed bottom-6 right-6 z-50">
          <Button onClick={save} disabled={saving} size="lg" className="shadow-lg">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      )}

      {/* Expense Sheet */}
      <Sheet open={expDialogOpen} onOpenChange={setExpDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>{editExp ? 'Edit Expense' : 'New Expense'}</SheetTitle>
            <SheetDescription>
              {editExp ? 'Update expense details.' : 'Record a new expense for this tender.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="td-exp-desc">Description <span className="text-destructive">*</span></Label>
              <Input id="td-exp-desc" value={expForm.description} onChange={setExpF('description')} placeholder="What was this expense for?" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={expForm.category} onValueChange={setExpF('category')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="td-exp-amt">Amount (PKR)</Label>
                <Input id="td-exp-amt" type="number" value={expForm.amount} onChange={setExpF('amount')} placeholder="0" className="font-mono tabular-nums" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="td-exp-date">Date</Label>
              <Input id="td-exp-date" type="date" value={expForm.date} onChange={setExpF('date')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="td-exp-note">Notes</Label>
              <Textarea id="td-exp-note" value={expForm.note} onChange={setExpF('note')} rows={3} />
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setExpDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveExpense} disabled={expSaving}>
              {expSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editExp ? 'Save Changes' : 'Add Expense'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDelete
        open={!!deleteExpId}
        onOpenChange={() => setDeleteExpId(null)}
        onConfirm={removeExpense}
        title="Delete expense"
        description="This will permanently remove this expense record."
      />
    </div>
  )
}
