import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, addDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { logActivity } from '@/lib/activity'
import { formatDate, formatCurrency, TENDER_STATUSES, EXPENSE_CATEGORIES, PO_STATUSES, PO_PURPOSES, BANKS, uid } from '@/lib/utils'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import StatusBadge from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Save, Plus, Trash2, Pencil, Loader2, CheckSquare, CheckCircle, DollarSign, History, User, Receipt, FileText, Printer, Paperclip, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

const EMPTY_EXP = { description: '', category: EXPENSE_CATEGORIES[0], amount: '', date: '', note: '' }
const EMPTY_PO = { po: '', bank: '', amount: '', purpose: 'Bid Security', status: 'Pending', submitted: '', notes: '' }
const STATUS_MEANINGS = {
  Awarded: 'Won and awaiting kickoff or formal work start.',
  'In Progress': 'Won and work is underway.',
  Completed: 'Work finished and closed. Completion date, remarks, and profit snapshot are saved.',
  Lost: 'Bid was not won. No active execution.',
  Cancelled: 'Tender was cancelled. No active execution.',
}

function cleanTenderPayload(form, fallbackValue, fallbackTenderFee) {
  const { id: _id, ...payload } = form
  const data = {
    ...payload,
    value: Number(fallbackValue) || 0,
    tenderFee: Number(fallbackTenderFee) || 0,
  }
  return stripUndefined(data)
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    )
  }
  return value
}

export default function TenderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin, displayName } = useAuth()
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
  const [poDialogOpen, setPoDialogOpen] = useState(false)
  const [editPo, setEditPo] = useState(null)
  const [poForm, setPoForm] = useState(EMPTY_PO)
  const [poSaving, setPoSaving] = useState(false)
  const [deletePoId, setDeletePoId] = useState(null)
  const [poRefresh, setPoRefresh] = useState(0)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completionDate, setCompletionDate] = useState('')
  const [completionRemarks, setCompletionRemarks] = useState('')
  const [completing, setCompleting] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

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
  }, [id, navigate])

  useEffect(() => {
    const loadExpenses = async () => {
      try {
        const q1 = query(collection(db, 'expenses'), where('tenderRef', '==', id))
        const snap = await getDocs(q1)
        setExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } catch (err) {
        console.error('Failed to load expenses:', err)
        toast.error('Failed to load expenses')
      }
    }
    loadExpenses()
  }, [id, saving, expRefresh])

  useEffect(() => {
    const loadPOs = async () => {
      if (!tender) return
      try {
        // Primary: exact tenderRef match
        const snap = await getDocs(query(collection(db, 'payOrders'), where('tenderRef', '==', id)))
        let matched = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        // Fallback: legacy data without tenderRef — match by NIT/name/linkedPO
        if (matched.length === 0) {
          const all = await getDocs(collection(db, 'payOrders'))
          const nit = (tender.nit || '').trim()
          const linkedPO = (tender.linkedPO || '').trim()
          const name = (tender.name || '').trim()
          matched = all.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => {
            if (p.tenderRef) return false
            const pNit = (p.nit || '').trim()
            const pPO = (p.po || '').trim()
            const pTender = (p.tender || '').trim()
            return (nit && pNit && pNit === nit) ||
                   (linkedPO && pPO && pPO === linkedPO) ||
                   (name && pTender && pTender === name)
          })
        }
        setLinkedPOs(matched)
      } catch (err) {
        console.error('Failed to load linked pay orders:', err)
        toast.error('Failed to load pay orders')
      }
    }
    loadPOs()
  }, [id, tender, poRefresh])

  // Expense sub-totals (exclude Tender Fee from the "tracked total")
  const expenseOther = useMemo(
    () => expenses.filter((e) => e.category !== 'Tender Fees').reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  )
  const expenseTotal = expenseOther // what the user asked to show as the visible total

  // PO bucketing by purpose + status
  const bidSecurityHeld = useMemo(
    () => linkedPOs.filter((p) => p.purpose === 'Bid Security' && ['Held', 'Encashed'].includes(p.status))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [linkedPOs]
  )
  const perfGuaranteeHeld = useMemo(
    () => linkedPOs.filter((p) => p.purpose === 'Performance Guarantee' && ['Held', 'Encashed'].includes(p.status))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [linkedPOs]
  )
  const bidSecurityAtRisk = useMemo(
    () => linkedPOs.filter((p) => p.purpose === 'Bid Security' && ['Pending', 'Submitted'].includes(p.status))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0),
    [linkedPOs]
  )
  const sunkCost = useMemo(
    () => {
      const forfeited = linkedPOs.filter((p) => p.status === 'Forfeited').reduce((s, p) => s + (Number(p.amount) || 0), 0)
      return expenseOther + forfeited
    },
    [linkedPOs, expenseOther]
  )
  const heldByAgency = bidSecurityHeld + perfGuaranteeHeld

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

  // --- Pay Order CRUD (writes to payOrders collection with tenderRef=id) ---
  const openPoDialog = (item = null, defaultPurpose = null) => {
    setEditPo(item)
    setPoForm(item
      ? { po: item.po || '', bank: item.bank || '', amount: item.amount || '', purpose: item.purpose || 'Bid Security', status: item.status || 'Pending', submitted: item.submitted || '', notes: item.notes || '' }
      : { ...EMPTY_PO, purpose: defaultPurpose || EMPTY_PO.purpose, submitted: new Date().toISOString().slice(0, 10) })
    setPoDialogOpen(true)
  }
  const savePo = async () => {
    if (!poForm.po) { toast.error('PO number is required'); return }
    setPoSaving(true)
    try {
      const amountNum = Number(poForm.amount) || 0
      const payload = {
        po: poForm.po,
        bank: poForm.bank || '',
        amount: amountNum,
        purpose: poForm.purpose || 'Other',
        status: poForm.status || 'Pending',
        submitted: poForm.submitted || '',
        notes: poForm.notes || '',
        tender: tender?.name || '',
        nit: tender?.nit || '',
        agency: tender?.agency || '',
        tenderRef: id,
        bidResult: 'N/A',
        updatedAt: serverTimestamp(),
      }
      if (editPo) {
        await updateDoc(doc(db, 'payOrders', editPo.id), payload)
        toast.success('Pay order updated')
      } else {
        await addDoc(collection(db, 'payOrders'), { ...payload, createdAt: serverTimestamp() })
        toast.success('Pay order added')
      }
      // Mirror bid security amount to tender doc for display
      if (poForm.purpose === 'Bid Security' && amountNum > 0) {
        try { await updateDoc(doc(db, 'tenders', id), { bidSecurity: amountNum, updatedAt: serverTimestamp() }) } catch {}
      }
      setPoDialogOpen(false)
      setPoRefresh((n) => n + 1)
    } catch {
      toast.error('Failed to save pay order')
    } finally {
      setPoSaving(false)
    }
  }
  const removePo = async () => {
    if (!deletePoId) return
    try {
      await deleteDoc(doc(db, 'payOrders', deletePoId))
      toast.success('Pay order deleted')
      setDeletePoId(null)
      setPoRefresh((n) => n + 1)
    } catch {
      toast.error('Failed to delete')
    }
  }
  const setPoF = (k) => (e) => setPoForm((p) => ({ ...p, [k]: e.target?.value ?? e }))

  const updateForm = (key, value) => {
    setForm((p) => ({ ...p, [key]: value }))
    setDirty(true)
  }

  const updateTenderStatus = (status) => {
    if (status === 'Completed' && form.status !== 'Completed') {
      openCompleteDialog()
      return
    }
    setForm((p) => ({
      ...p,
      status,
      ...(status === 'Completed'
        ? {}
        : {
            completionDate: '',
            completionRemarks: '',
            completionSnapshot: null,
          }),
    }))
    setDirty(true)
  }

  const openCompleteDialog = () => {
    setCompletionDate(form.completionDate || new Date().toISOString().slice(0, 10))
    setCompletionRemarks(form.completionRemarks || '')
    setCompleteOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const tenderFeeNum = Number(form.tenderFee) || 0
      const data = cleanTenderPayload(form, form.value, tenderFeeNum)
      if (data.status !== 'Completed') {
        data.completionDate = ''
        data.completionRemarks = ''
        data.completionSnapshot = null
      }
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

      // Lifecycle automation: auto-update linked POs based on tender outcome
      if (tender.status !== form.status) {
        const transitions = {
          Lost: { purposes: ['Bid Security', 'Performance Guarantee'], newStatus: 'Returned', from: ['Pending', 'Submitted', 'Held'] },
          Cancelled: { purposes: ['Bid Security', 'Performance Guarantee'], newStatus: 'Returned', from: ['Pending', 'Submitted', 'Held'] },
          Awarded: { purposes: ['Bid Security', 'Performance Guarantee'], newStatus: 'Held', from: ['Pending', 'Submitted'] },
        }
        const rule = transitions[form.status]
        if (rule) {
          const affected = linkedPOs.filter((p) => rule.purposes.includes(p.purpose) && rule.from.includes(p.status))
          if (affected.length > 0) {
            try {
              await Promise.all(affected.map((p) =>
                updateDoc(doc(db, 'payOrders', p.id), { status: rule.newStatus, updatedAt: serverTimestamp() })
              ))
              toast.info(`${affected.length} pay order(s) marked ${rule.newStatus}`)
              setPoRefresh((n) => n + 1)
            } catch (err) {
              console.error('Failed to update linked pay orders:', err)
              toast.warning('Tender saved, but linked pay orders could not be auto-updated')
            }
          }
        }
      }

      setTender(data)
      setForm(data)
      setDirty(false)
      toast.success('Tender saved')
    } catch (err) {
      console.error('Failed to save tender:', err)
      toast.error(`Failed to save: ${err?.code || err?.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const completeTender = async () => {
    if (!completionDate) {
      toast.error('Completion date is required')
      return
    }
    if (completionIssues.length > 0 && !completionRemarks.trim()) {
      toast.error('Final remarks are required when unresolved items remain')
      return
    }
    setCompleting(true)
    try {
      const tenderFeeNum = Number(form.tenderFee) || 0
      const nextStatusHistory = tender.status === 'Completed'
        ? (form.statusHistory || tender.statusHistory || [])
        : [
            ...(form.statusHistory || tender.statusHistory || []),
            {
              from: tender.status,
              to: 'Completed',
              date: completionDate,
              ts: Date.now(),
            },
          ]
      const data = {
        ...cleanTenderPayload(form, form.value, tenderFeeNum),
        status: 'Completed',
        value: Number(form.value) || 0,
        tenderFee: tenderFeeNum,
        completionDate,
        completionRemarks: completionRemarks.trim(),
        completionSnapshot: {
          contractValue,
          totalExpenses,
          totalReceived,
          receivable,
          outstandingRevenue: receivable,
          expectedProfit,
          cashPosition,
          projectedProfit: expectedProfit,
          realizedProfit: cashPosition,
          projectedMargin,
          billTotal,
          billPaid,
          raBillTotal,
          raBillPaid,
          linkedPayOrders: linkedPOs.length,
          expenses: expenses.length,
          capturedAt: new Date().toISOString(),
        },
        statusHistory: nextStatusHistory,
      }

      await updateDoc(doc(db, 'tenders', id), { ...data, updatedAt: serverTimestamp() })
      await logActivity({
        type: 'tender',
        action: 'completed',
        title: data.name || 'Untitled tender',
        entityId: id,
        by: displayName,
        meta: {
          completionDate,
          expectedProfit,
          cashPosition,
          receivable,
          projectedProfit: expectedProfit,
          realizedProfit: cashPosition,
        },
      })
      setTender(data)
      setForm(data)
      setDirty(false)
      setCompleteOpen(false)
      toast.success('Tender marked completed')
    } catch (err) {
      console.error('Failed to complete tender:', err)
      toast.error(`Failed to complete tender: ${err?.code || err?.message || 'Unknown error'}`)
    } finally {
      setCompleting(false)
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

  const addDocument = () => {
    updateForm('documents', [
      ...(form.documents || []),
      { id: uid(), title: '', type: 'Document', url: '', notes: '', addedAt: new Date().toISOString().slice(0, 10) },
    ])
  }
  const updateDocument = (documentId, patch) => {
    updateForm('documents', (form.documents || []).map((item) => item.id === documentId ? { ...item, ...patch } : item))
  }
  const removeDocument = (documentId) => {
    updateForm('documents', (form.documents || []).filter((item) => item.id !== documentId))
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
  const paidBillCount = (form.bills || []).filter((b) => b.status === 'Paid').length + (form.raBills || []).filter((b) => b.status === 'Paid').length
  const contractValue = Number(form.value) || 0
  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const totalReceived = billPaid + raBillPaid
  const receivable = Math.max(contractValue - totalReceived, 0)
  const expectedProfit = contractValue - totalExpenses
  const cashPosition = totalReceived - totalExpenses
  const projectedMargin = contractValue > 0 ? Math.round((expectedProfit / contractValue) * 100) : null
  const completionIssues = [
    expenses.length === 0 ? 'No expenses are recorded for this tender.' : null,
    totalReceived <= 0 ? 'No payment has been recorded yet.' : null,
    paidBillCount === 0 ? 'No final bill or RA bill is marked Paid.' : null,
    billTotal > billPaid ? `${formatCurrency(billTotal - billPaid)} in regular bills is still outstanding.` : null,
    raBillTotal > raBillPaid ? `${formatCurrency(raBillTotal - raBillPaid)} in RA bills is still outstanding.` : null,
    bidSecurityAtRisk > 0 ? `${formatCurrency(bidSecurityAtRisk)} bid security is still pending/submitted.` : null,
    heldByAgency > 0 ? `${formatCurrency(heldByAgency)} is still held by the agency.` : null,
    linkedPOs.filter((p) => ['Pending', 'Submitted', 'Held'].includes(p.status)).length > 0
      ? `${linkedPOs.filter((p) => ['Pending', 'Submitted', 'Held'].includes(p.status)).length} linked pay order(s) are not released/returned/encashed.`
      : null,
  ].filter(Boolean)
  const hasCompletionWarnings = completionIssues.length > 0
  const summaryRows = [
    ['Status', form.status || '-'],
    ['NIT / Reference', form.nit || '-'],
    ['Agency', form.agency || '-'],
    ['Contract Value', formatCurrency(contractValue)],
    ['Total Expenses', formatCurrency(totalExpenses)],
    ['Expected Profit', formatCurrency(expectedProfit)],
    ['Cash Position', formatCurrency(cashPosition)],
    ['Receivable', formatCurrency(receivable)],
    ['Received From Bills/RA Bills', formatCurrency(totalReceived)],
    ['Linked Pay Orders', String(linkedPOs.length)],
  ]

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSummaryOpen(true)}
            >
              <FileText className="h-4 w-4" /> Summary
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/tenders/${id}/report`}>
                <Printer className="h-4 w-4" /> Report
              </Link>
            </Button>
            {isAdmin && form.status !== 'Completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={openCompleteDialog}
              >
                <CheckCircle className="h-4 w-4" /> Mark Completed
              </Button>
            )}
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
              <Select value={form.status || ''} onValueChange={updateTenderStatus} disabled={!isAdmin}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TENDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              {STATUS_MEANINGS[form.status] && (
                <p className="text-xs text-muted-foreground">
                  {STATUS_MEANINGS[form.status]}
                </p>
              )}
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
          <TabsTrigger value="payorders">Pay Orders ({linkedPOs.length})</TabsTrigger>
          <TabsTrigger value="bills">Bills ({(form.bills || []).length})</TabsTrigger>
          <TabsTrigger value="rabills">RA Bills ({(form.raBills || []).length})</TabsTrigger>
          <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({(form.documents || []).length})</TabsTrigger>
          <TabsTrigger value="contact">Contact</TabsTrigger>
        </TabsList>

        {/* Overview tab: checklist + notes + history */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4" /> Profit & Expenses
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-0">
              <FinancialMetric label="Contract Value" value={formatCurrency(contractValue)} />
              <FinancialMetric label="Total Expenses" value={formatCurrency(totalExpenses)} tone="expense" />
              <FinancialMetric
                label="Expected Profit"
                value={formatCurrency(expectedProfit)}
                tone={expectedProfit >= 0 ? 'profit' : 'loss'}
                helper={projectedMargin !== null ? `${projectedMargin}% margin` : undefined}
              />
              <FinancialMetric
                label="Cash Position"
                value={formatCurrency(cashPosition)}
                tone={cashPosition >= 0 ? 'profit' : 'loss'}
                helper={`${formatCurrency(totalReceived)} received from paid bills/RA bills`}
              />
              <FinancialMetric
                label="Receivable"
                value={formatCurrency(receivable)}
                tone={receivable > 0 ? 'expense' : 'profit'}
                helper="Contract value minus received payments"
              />
              <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
                Received payments are calculated from Bills and RA Bills marked as Paid.
              </p>
              {form.status === 'Completed' && form.completionSnapshot && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200 sm:col-span-2 lg:col-span-4">
                  <p className="font-medium">
                    Completed {formatDate(form.completionDate)}
                  </p>
                  <p className="mt-1 text-xs opacity-80">
                    Final snapshot: expected profit {formatCurrency(form.completionSnapshot.expectedProfit ?? form.completionSnapshot.projectedProfit)}, cash position {formatCurrency(form.completionSnapshot.cashPosition ?? form.completionSnapshot.realizedProfit)}, receivable {formatCurrency(form.completionSnapshot.receivable ?? form.completionSnapshot.outstandingRevenue)}.
                  </p>
                  {form.completionRemarks && (
                    <p className="mt-2 text-xs opacity-80">{form.completionRemarks}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

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

        {/* Pay Orders tab */}
        <TabsContent value="payorders" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" /> Pay Orders for this tender
                </CardTitle>
                {isAdmin && <Button size="sm" onClick={() => openPoDialog()}><Plus className="h-3.5 w-3.5" /> Add Pay Order</Button>}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {linkedPOs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No pay orders linked yet. Add one here, or link from the Pay Orders page.
                </p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="md:hidden space-y-2">
                    {linkedPOs.map((p) => (
                      <div key={p.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium break-words">PO {p.po || '—'}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{p.bank || '—'}{p.submitted && <> · {formatDate(p.submitted)}</>}</p>
                            {p.purpose && <Badge variant="secondary" className="text-xs mt-1.5">{p.purpose}</Badge>}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono tabular-nums text-sm font-semibold whitespace-nowrap">{formatCurrency(p.amount)}</span>
                            {p.status && <StatusBadge status={p.status} />}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex justify-end gap-1 mt-2">
                            <Button variant="ghost" size="icon-sm" onClick={() => openPoDialog(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeletePoId(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <Table className="hidden md:table">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>PO #</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Purpose</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        {isAdmin && <TableHead className="w-20"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {linkedPOs.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm font-medium font-mono">{p.po || '—'}</TableCell>
                          <TableCell className="text-sm">{p.bank || '—'}</TableCell>
                          <TableCell className="text-sm">{p.purpose && <Badge variant="secondary" className="text-xs">{p.purpose}</Badge>}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(p.submitted)}</TableCell>
                          <TableCell>{p.status && <StatusBadge status={p.status} />}</TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-sm">{formatCurrency(p.amount)}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon-sm" onClick={() => openPoDialog(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeletePoId(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

        {/* Expenses tab */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          {/* Summary — Sunk / At Risk / Held */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-lg font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">{formatCurrency(sunkCost)}</p>
              <p className="text-xs text-muted-foreground">Sunk cost</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">expenses + forfeited</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-lg font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">{formatCurrency(bidSecurityAtRisk)}</p>
              <p className="text-xs text-muted-foreground">At risk</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">bid security pending</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-lg font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">{formatCurrency(heldByAgency)}</p>
              <p className="text-xs text-muted-foreground">Held by agency</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">refundable on release</p>
            </CardContent></Card>
          </div>

          {/* Expenses */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Receipt className="h-4 w-4" /> Expenses
                  <span className="text-muted-foreground font-normal">· total {formatCurrency(expenseTotal)}</span>
                </CardTitle>
                {isAdmin && <Button size="sm" onClick={() => openExpDialog()}><Plus className="h-3.5 w-3.5" /> Add Expense</Button>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Tender fees are tracked separately and excluded from this total.</p>
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

        <TabsContent value="documents" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-4 w-4" /> Documents & Links
                </CardTitle>
                {isAdmin && (
                  <Button size="sm" onClick={addDocument}>
                    <Plus className="h-3.5 w-3.5" /> Add Document
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(form.documents || []).map((item) => (
                <div key={item.id} className="rounded-md border p-3">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_0.8fr_1.4fr_auto] lg:items-end">
                    <div className="space-y-1.5">
                      <Label>Title</Label>
                      <Input
                        value={item.title || ''}
                        onChange={(e) => updateDocument(item.id, { title: e.target.value })}
                        disabled={!isAdmin}
                        placeholder="e.g. Award letter"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Input
                        value={item.type || ''}
                        onChange={(e) => updateDocument(item.id, { type: e.target.value })}
                        disabled={!isAdmin}
                        placeholder="Document"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>URL</Label>
                      <Input
                        value={item.url || ''}
                        onChange={(e) => updateDocument(item.id, { url: e.target.value })}
                        disabled={!isAdmin}
                        placeholder="https://..."
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {item.url && (
                        <Button variant="outline" size="icon" asChild>
                          <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open ${item.title || 'document'}`}>
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeDocument(item.id)} aria-label={`Remove ${item.title || 'document'}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <Label>Notes</Label>
                    <Textarea
                      value={item.notes || ''}
                      onChange={(e) => updateDocument(item.id, { notes: e.target.value })}
                      disabled={!isAdmin}
                      rows={2}
                      placeholder="Optional notes about this file or link"
                    />
                  </div>
                </div>
              ))}
              {(form.documents || []).length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No documents or links added yet.
                </p>
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

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete tender?</DialogTitle>
            <DialogDescription>
              This saves the tender as completed and captures today&apos;s financial snapshot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {completionIssues.length > 0 ? (
              <div className="rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-medium">Review before completing</p>
                <p className="mt-1 text-xs">
                  Add final remarks to confirm why this tender can be closed with these unresolved items.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {completionIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-md border border-emerald-300/70 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                No unresolved bills, RA bills, expenses, or pay order warnings found.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FinancialMetric label="Expected Profit" value={formatCurrency(expectedProfit)} tone={expectedProfit >= 0 ? 'profit' : 'loss'} />
              <FinancialMetric label="Cash Position" value={formatCurrency(cashPosition)} tone={cashPosition >= 0 ? 'profit' : 'loss'} helper={`${formatCurrency(totalReceived)} received from paid bills/RA bills`} />
              <FinancialMetric label="Receivable" value={formatCurrency(receivable)} tone={receivable > 0 ? 'expense' : 'profit'} />
            </div>
            <p className="text-xs text-muted-foreground">
              Received payments are calculated from Bills and RA Bills marked as Paid.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="completion-date">Completion Date</Label>
              <Input
                id="completion-date"
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="completion-remarks">
                Final Remarks {hasCompletionWarnings && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id="completion-remarks"
                value={completionRemarks}
                onChange={(e) => setCompletionRemarks(e.target.value)}
                rows={3}
                placeholder="Completion certificate, final payment notes, or closure remarks..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setCompleteOpen(false)} disabled={completing}>
              Cancel
            </Button>
            <Button onClick={completeTender} disabled={completing}>
              {completing && <Loader2 className="h-4 w-4 animate-spin" />}
              {hasCompletionWarnings ? 'Complete Anyway & Save' : 'Mark Completed & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Tender Summary</DialogTitle>
            <DialogDescription>
              Printable snapshot of status, payments, expenses, pay orders, and completion details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold">{form.name || 'Untitled Tender'}</h3>
              <p className="text-sm text-muted-foreground">{form.nit || 'No NIT / Reference'}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {summaryRows.map(([label, value]) => (
                <div key={label} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-medium">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FinancialMetric label="Bills Paid" value={formatCurrency(billPaid)} helper={`${formatCurrency(billTotal)} total`} />
              <FinancialMetric label="RA Bills Paid" value={formatCurrency(raBillPaid)} helper={`${formatCurrency(raBillTotal)} total`} />
              <FinancialMetric label="Paid Bill Entries" value={String(paidBillCount)} />
            </div>
            {form.status === 'Completed' && form.completionSnapshot && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <p className="font-medium">Completed {formatDate(form.completionDate)}</p>
                <p className="mt-1 text-xs opacity-80">
                  Snapshot: expected profit {formatCurrency(form.completionSnapshot.expectedProfit ?? form.completionSnapshot.projectedProfit)}, cash position {formatCurrency(form.completionSnapshot.cashPosition ?? form.completionSnapshot.realizedProfit)}, receivable {formatCurrency(form.completionSnapshot.receivable ?? form.completionSnapshot.outstandingRevenue)}.
                </p>
                {form.completionRemarks && <p className="mt-2 text-xs opacity-80">{form.completionRemarks}</p>}
              </div>
            )}
            {completionIssues.length > 0 && (
              <div className="rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-medium">Open items</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {completionIssues.map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Cash Position uses payments from Bills and RA Bills marked as Paid, minus recorded expenses.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setSummaryOpen(false)}>Close</Button>
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / Save PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Pay Order Sheet */}
      <Sheet open={poDialogOpen} onOpenChange={setPoDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle>{editPo ? 'Edit Pay Order' : 'New Pay Order'}</SheetTitle>
            <SheetDescription>
              {editPo ? 'Update pay order details.' : 'Attach a pay order to this tender. It will also appear in the global Pay Orders list.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="td-po-num">PO Number <span className="text-destructive">*</span></Label>
                <Input id="td-po-num" value={poForm.po} onChange={setPoF('po')} className="font-mono" placeholder="PO-2024-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Select value={poForm.bank} onValueChange={setPoF('bank')}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>{BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="td-po-amt">Amount (PKR)</Label>
                <Input id="td-po-amt" type="number" value={poForm.amount} onChange={setPoF('amount')} placeholder="0" className="font-mono tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="td-po-sub">Submitted</Label>
                <Input id="td-po-sub" type="date" value={poForm.submitted} onChange={setPoF('submitted')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Purpose</Label>
                <Select value={poForm.purpose} onValueChange={setPoF('purpose')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PO_PURPOSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={poForm.status} onValueChange={setPoF('status')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="td-po-notes">Notes</Label>
              <Textarea id="td-po-notes" value={poForm.notes} onChange={setPoF('notes')} rows={3} />
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t border-border bg-background sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setPoDialogOpen(false)}>Cancel</Button>
            <Button onClick={savePo} disabled={poSaving}>
              {poSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editPo ? 'Save Changes' : 'Add Pay Order'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDelete
        open={!!deletePoId}
        onOpenChange={() => setDeletePoId(null)}
        onConfirm={removePo}
        title="Delete pay order"
        description="This will permanently remove this pay order from the tender and the global list."
      />
    </div>
  )
}

function FinancialMetric({ label, value, tone, helper }) {
  const toneClass =
    tone === 'profit'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'loss' || tone === 'expense'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground'

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {helper && <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>}
    </div>
  )
}
