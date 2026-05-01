import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, addDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { logActivity } from '@/lib/activity'
import { getSupabaseStorageBucket, uploadTenderDocument } from '@/lib/supabaseStorage'
import { formatDate, formatCurrency, formatCurrencyPrecise, calculateTenderFinancials, getTenderDisplayStatus, TENDER_STATUSES, EXPENSE_CATEGORIES, PO_STATUSES, PO_PURPOSES, BANKS, uid } from '@/lib/utils'
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import StatusBadge from '@/components/shared/StatusBadge'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ArrowLeft, Save, Plus, Trash2, Pencil, Loader2, CheckSquare, CheckCircle,
  DollarSign, History, User, Receipt, FileText, Printer, Paperclip, ExternalLink,
  Banknote, CalendarDays, ClipboardList, FolderOpen, Landmark, WalletCards,
  Hash, Link as LinkIcon, Upload, Download, ChevronDown, BarChart3, PieChart,
  Search, Image as ImageIcon, FileSpreadsheet, FileType2,
} from 'lucide-react'
import { toast } from 'sonner'

const EMPTY_EXP = { description: '', category: EXPENSE_CATEGORIES[0], amount: '', date: '', note: '' }
const EMPTY_PO = { po: '', bank: '', amount: '', purpose: 'Bid Security', status: 'Pending', submitted: '', notes: '' }
const INLINE_INPUT_CLASS = 'h-8 border-transparent bg-transparent px-0 text-sm shadow-none hover:border-input focus-visible:px-3 focus-visible:ring-1 md:text-base'
const INLINE_TEXTAREA_CLASS = 'min-h-[44px] resize-none border-transparent bg-transparent px-0 py-1 text-sm shadow-none hover:border-input focus-visible:px-3 focus-visible:ring-1 md:text-base'
const DOCUMENT_CATEGORIES = [
  'Work Order',
  'BOQ',
  'Site Photos',
  'Material Invoices',
  'Bills',
  'Inspection Letters',
  'Completion Certificate',
  'Security Refund',
  'Other',
]
const BILL_STATUSES = ['Draft', 'Submitted', 'Approved', 'Paid', 'Partially Paid', 'Rejected']
const BILL_STATUS_OPTIONS = ['Pending', 'Under Review', ...BILL_STATUSES]
const BILL_TYPES = ['Running Bill', 'Final Bill', 'Invoice']
const STATUS_MEANINGS = {
  Awarded: 'Won and awaiting kickoff or formal work start.',
  'In Progress': 'Won and work is underway.',
  Completed: 'Work finished and closed. Completion date, remarks, and profit snapshot are saved.',
  Lost: 'Bid was not won. No active execution.',
  Cancelled: 'Tender was cancelled. No active execution.',
  Pending: 'Work has not started.',
  'On Hold': 'Work is paused.',
}

const DOCUMENT_TYPE_FILTERS = ['All', 'PDF', 'Image', 'Excel', 'Word', 'Other']

function getDocumentKind(document = {}) {
  const text = `${document.fileType || ''} ${document.fileName || ''} ${document.title || ''} ${document.type || ''} ${document.url || ''}`.toLowerCase()
  if (text.includes('pdf') || text.endsWith('.pdf')) return 'PDF'
  if (text.includes('image') || /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(text)) return 'Image'
  if (text.includes('spreadsheet') || text.includes('excel') || /\.(xls|xlsx|csv)(\?|$)/.test(text)) return 'Excel'
  if (text.includes('word') || /\.(doc|docx)(\?|$)/.test(text)) return 'Word'
  return 'Other'
}

function getDocumentTypeClasses(kind) {
  const tones = {
    PDF: 'border-red-200 bg-red-50 text-red-700',
    Image: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Excel: 'border-green-200 bg-green-50 text-green-700',
    Word: 'border-blue-200 bg-blue-50 text-blue-700',
    Other: 'border-slate-200 bg-slate-100 text-slate-700',
  }
  return tones[kind] || tones.Other
}

function getDocumentIcon(kind) {
  const icons = {
    Image: ImageIcon,
    Excel: FileSpreadsheet,
    Word: FileType2,
    PDF: FileText,
    Other: Paperclip,
  }
  return icons[kind] || Paperclip
}

function formatFileSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function daysSince(dateValue) {
  if (!dateValue) return Infinity
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return Infinity
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.floor((today - date) / (1000 * 60 * 60 * 24))
}

function cleanTenderPayload(form, fallbackValue, fallbackTenderFee) {
  const { id: _id, ...payload } = form
  const data = {
    ...payload,
    value: Number(fallbackValue) || 0,
    estimatedCost: payload.estimatedCost === '' || payload.estimatedCost === undefined ? null : Number(payload.estimatedCost) || 0,
    quotedAmount: payload.quotedAmount === '' || payload.quotedAmount === undefined ? null : Number(payload.quotedAmount) || 0,
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

function toBillNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getBillAmounts(bill = {}) {
  const submitted = toBillNumber(bill.submittedAmount ?? bill.amount) ?? 0
  const approved = toBillNumber(bill.approvedAmount) ?? submitted
  const received = toBillNumber(bill.receivedAmount) ?? (bill.status === 'Paid' ? approved : 0)
  const deductions = toBillNumber(bill.deductions) ?? Math.max(submitted - approved, 0)
  const balance = Math.max(approved - received, 0)
  return { submitted, approved, received, deductions, balance }
}

function getBillDate(bill = {}) {
  return bill.date || bill.submitted || bill.paid || ''
}

function getBillTitle(bill = {}, fallback = 'Bill') {
  return bill.no || bill.billNo || bill.desc || fallback
}

function getBillSummary(bills = []) {
  return bills.reduce((summary, bill) => {
    const amounts = getBillAmounts(bill)
    return {
      submitted: summary.submitted + amounts.submitted,
      approved: summary.approved + amounts.approved,
      received: summary.received + amounts.received,
      deductions: summary.deductions + amounts.deductions,
      balance: summary.balance + amounts.balance,
    }
  }, { submitted: 0, approved: 0, received: 0, deductions: 0, balance: 0 })
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
  const [detailsEditing, setDetailsEditing] = useState(false)
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
  const [documentSearch, setDocumentSearch] = useState('')
  const [documentTypeFilter, setDocumentTypeFilter] = useState('All')
  const [uploadingDocumentId, setUploadingDocumentId] = useState(null)
  const [documentUploadProgress, setDocumentUploadProgress] = useState({})
  const [checklistExpanded, setChecklistExpanded] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaveError, setAutoSaveError] = useState(false)
  const [boqEditMode, setBoqEditMode] = useState(false)
  const [editingBoqItemId, setEditingBoqItemId] = useState(null)
  const autoSaveTimerRef = useRef(null)
  const autoSavePayloadRef = useRef({})

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

  useEffect(() => () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
  }, [])

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

  const scheduleAutoSave = (patch) => {
    if (!isAdmin) return
    autoSavePayloadRef.current = {
      ...autoSavePayloadRef.current,
      ...stripUndefined(patch),
    }
    setAutoSaving(true)
    setAutoSaveError(false)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(async () => {
      const payload = autoSavePayloadRef.current
      autoSavePayloadRef.current = {}
      try {
        await updateDoc(doc(db, 'tenders', id), { ...payload, updatedAt: serverTimestamp() })
        setTender((prev) => prev ? { ...prev, ...payload } : prev)
      } catch (err) {
        console.error('Failed to auto-save tender work item:', err)
        setAutoSaveError(true)
        setDirty(true)
        toast.error('Auto-save failed. Try Save Changes before leaving.')
      } finally {
        setAutoSaving(false)
      }
    }, 700)
  }

  const updateAutosavedForm = (key, value) => {
    setForm((prev) => {
      const nextValue = typeof value === 'function' ? value(prev[key], prev) : value
      scheduleAutoSave({ [key]: nextValue })
      return { ...prev, [key]: nextValue }
    })
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
          boqExpectedProfit,
          boqQuotedAmount: boqTotals.quotedAmount,
          boqActualCost: boqTotals.actualCost,
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
    updateAutosavedForm('checklist', (items = []) => [...items, item])
  }
  const updateChecklistItem = (itemId, patch) => {
    updateAutosavedForm('checklist', (items = []) => items.map((c) => c.id === itemId ? { ...c, ...patch } : c))
  }
  const removeChecklistItem = (itemId) => {
    updateAutosavedForm('checklist', (items = []) => items.filter((c) => c.id !== itemId))
  }

  // Bills helpers
  const addBill = () => {
    updateAutosavedForm('bills', (items = []) => [
      ...items,
      {
        id: uid(),
        no: '',
        desc: '',
        type: 'Running Bill',
        amount: 0,
        approvedAmount: '',
        receivedAmount: '',
        deductions: '',
        date: '',
        status: 'Draft',
        remarks: '',
      },
    ])
  }
  const updateBill = (billId, patch) => {
    updateAutosavedForm('bills', (items = []) => items.map((b) => b.id === billId ? { ...b, ...patch } : b))
  }
  const removeBill = (billId) => {
    updateAutosavedForm('bills', (items = []) => items.filter((b) => b.id !== billId))
  }

  // RA Bills helpers
  const addRABill = () => {
    updateAutosavedForm('raBills', (items = []) => [
      ...items,
      {
        id: uid(),
        no: '',
        type: 'Running Bill',
        amount: 0,
        approvedAmount: '',
        receivedAmount: '',
        deductions: '',
        submitted: '',
        paid: '',
        status: 'Submitted',
        remarks: '',
      },
    ])
  }
  const updateRABill = (billId, patch) => {
    updateAutosavedForm('raBills', (items = []) => items.map((b) => b.id === billId ? { ...b, ...patch } : b))
  }
  const removeRABill = (billId) => {
    updateAutosavedForm('raBills', (items = []) => items.filter((b) => b.id !== billId))
  }

  const addDocument = () => {
    updateAutosavedForm('documents', (items = []) => [
      ...items,
      { id: uid(), title: '', type: 'Other', url: '', notes: '', addedAt: new Date().toISOString().slice(0, 10) },
    ])
  }
  const updateDocument = (documentId, patch) => {
    updateAutosavedForm('documents', (items = []) => items.map((item) => item.id === documentId ? { ...item, ...patch } : item))
  }
  const removeDocument = (documentId) => {
    updateAutosavedForm('documents', (items = []) => items.filter((item) => item.id !== documentId))
  }

  const uploadDocumentFile = async (documentId, file) => {
    if (!file) return
    setUploadingDocumentId(documentId)
    setDocumentUploadProgress((prev) => ({ ...prev, [documentId]: 0 }))
    try {
      const uploaded = await uploadTenderDocument({
        tenderId: id,
        documentId,
        file,
        onProgress: (progress) => setDocumentUploadProgress((prev) => ({ ...prev, [documentId]: progress })),
      })
      updateDocument(documentId, {
        title: (form.documents || []).find((item) => item.id === documentId)?.title || file.name,
        url: uploaded.url,
        fileName: file.name,
        fileType: file.type || '',
        fileSize: file.size,
        storageProvider: 'supabase',
        storageBucket: uploaded.bucket,
        storagePath: uploaded.path,
        uploadedAt: new Date().toISOString().slice(0, 10),
      })
      toast.success('File uploaded and attached.')
    } catch (err) {
      console.error('Failed to upload document:', err)
      const message = err?.message || err?.code || 'Unknown error'
      toast.error(`Failed to upload file: ${message}`)
    } finally {
      setUploadingDocumentId(null)
      setDocumentUploadProgress((prev) => {
        const next = { ...prev }
        delete next[documentId]
        return next
      })
    }
  }

  const addBoqItem = () => {
    const newItem = { id: uid(), description: '', qty: '', unit: 'Nos', quotedRate: '', actualCost: '' }
    updateAutosavedForm('boqItems', (items = []) => [
      ...items,
      newItem,
    ])
    setBoqEditMode(true)
    setEditingBoqItemId(newItem.id)
  }
  const updateBoqItem = (itemId, patch) => {
    updateAutosavedForm('boqItems', (items = []) => items.map((item) => item.id === itemId ? { ...item, ...patch } : item))
  }
  const removeBoqItem = (itemId) => {
    updateAutosavedForm('boqItems', (items = []) => items.filter((item) => item.id !== itemId))
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
  const tenderFinancials = calculateTenderFinancials(form)
  const displayTenderStatus = getTenderDisplayStatus(form)
  const tenderFinancialDirectionText =
    tenderFinancials.direction === 'below'
      ? 'Below'
      : tenderFinancials.direction === 'above'
        ? 'Above'
        : tenderFinancials.direction === 'at'
          ? 'At Estimate'
          : ''
  const tenderFinancialTone =
    tenderFinancials.direction === 'above'
      ? 'expense'
      : tenderFinancials.direction === 'at'
        ? 'accent'
        : 'profit'
  const boqItems = form.boqItems || []
  const boqTotals = boqItems.reduce((totals, item) => {
    const quotedAmount = (Number(item.qty) || 0) * (Number(item.quotedRate) || 0)
    const actualCost = Number(item.actualCost) || 0
    return {
      quotedAmount: totals.quotedAmount + quotedAmount,
      actualCost: totals.actualCost + actualCost,
      profitLoss: totals.profitLoss + quotedAmount - actualCost,
    }
  }, { quotedAmount: 0, actualCost: 0, profitLoss: 0 })
  const boqExpectedProfit = boqItems.length > 0 ? boqTotals.profitLoss : expectedProfit
  const boqProfitMargin = boqTotals.quotedAmount > 0 ? Math.round((boqTotals.profitLoss / boqTotals.quotedAmount) * 100) : 0
  const savedProgress = Number(form.progress ?? form.progressPercent ?? form.workProgress) || 0
  const dashboardProgress = form.status === 'Completed' ? 100 : Math.max(0, Math.min(savedProgress, 99))
  const progressMessage = {
    Pending: 'Work has not started.',
    'In Progress': 'Work is underway.',
    Completed: 'Work is complete.',
    'On Hold': 'Work is paused.',
  }[form.status] || (dashboardProgress > 0 ? 'Work is underway.' : 'Work has not started.')
  const projectHealth =
    form.status === 'Completed'
      ? 'Complete'
      : form.status === 'On Hold'
        ? 'Paused'
        : dashboardProgress > 0
          ? 'On Track'
          : 'Needs update'
  const projectHealthTone =
    form.status === 'Completed' || projectHealth === 'On Track'
      ? 'profit'
      : form.status === 'On Hold'
        ? 'accent'
        : 'loss'
  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .slice(0, 5)
  const bills = form.bills || []
  const raBills = form.raBills || []
  const billSummary = getBillSummary(bills)
  const raBillSummary = getBillSummary(raBills)
  const paidRegularBills = bills.filter((b) => b.status === 'Paid').length
  const paidRaBills = raBills.filter((b) => b.status === 'Paid').length
  const documents = form.documents || []
  const documentStats = DOCUMENT_TYPE_FILTERS.filter((type) => type !== 'All').reduce((summary, type) => ({
    ...summary,
    [type]: documents.filter((item) => getDocumentKind(item) === type).length,
  }), {})
  const documentCategoryCounts = DOCUMENT_CATEGORIES.map((category) => ({
    category,
    count: documents.filter((item) => (item.type || 'Other') === category).length,
  }))
  const linkedTenderDocumentCount = documents.filter((item) => item.tenderRef || item.linkedTender || item.linkedProject || item.url || item.fileName).length
  const recentUploadCount = documents.filter((item) => daysSince(item.uploadedAt || item.addedAt) <= 30).length
  const filteredDocuments = documents.filter((item) => {
    const kind = getDocumentKind(item)
    if (documentTypeFilter !== 'All' && kind !== documentTypeFilter) return false
    if (!documentSearch) return true
    const queryText = documentSearch.toLowerCase()
    return [item.title, item.fileName, item.type, item.url, item.notes, form.name, form.nit]
      .some((value) => String(value || '').toLowerCase().includes(queryText))
  })
  const pendingChecklist = checklist.filter((item) => !item.done).slice(0, 4)
  const recentDocuments = [...(form.documents || [])]
    .sort((a, b) => new Date(b.addedAt || b.uploadedAt || 0) - new Date(a.addedAt || a.uploadedAt || 0))
    .slice(0, 4)
  const recentSiteVisits = [...(form.siteVisits || form.visits || [])]
    .sort((a, b) => new Date(b.date || b.visitDate || 0) - new Date(a.date || a.visitDate || 0))
    .slice(0, 4)
  const recentBills = [...bills, ...raBills.map((bill) => ({ ...bill, isRaBill: true }))]
    .sort((a, b) => new Date((b.paid || b.submitted || b.date) || 0) - new Date((a.paid || a.submitted || a.date) || 0))
    .slice(0, 4)
  const linkedPayOrderDisplay = linkedPOs.length > 0
    ? linkedPOs.map((po) => po.po).filter(Boolean).join(', ')
    : form.linkedPO || '-'
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
    ['Status', displayTenderStatus || '-'],
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
  const compactTabs = [
    ['overview', 'Overview'],
    ['boq', 'BOQ / Profit'],
    ['bills', `Bills (${(form.bills || []).length})`],
    ['expenses', `Expenses (${expenses.length})`],
    ['site-visits', 'Site Visits'],
    ['documents', `Documents (${(form.documents || []).length})`],
    ['payorders', 'Pay Orders'],
    ['rabills', 'RA Bills'],
    ['contact', 'Contact'],
  ]
  const recentActivity = [
    form.status === 'Completed' && form.completionDate ? {
      id: 'completed',
      icon: CheckCircle,
      title: 'Tender marked completed',
      date: form.completionDate,
    } : null,
    ...(form.statusHistory || []).map((item, index) => ({
      id: `status-${item.ts || item.date || index}`,
      icon: History,
      title: `Status changed from ${item.from || 'Unknown'} to ${item.to || 'Unknown'}`,
      date: item.date,
    })),
    ...(form.bills || []).map((bill) => ({
      id: `bill-${bill.id}`,
      icon: FileText,
      title: `Bill ${bill.desc || bill.id || 'added'} ${bill.status ? `is ${bill.status}` : ''}`,
      date: bill.date,
    })),
    ...(form.raBills || []).map((bill) => ({
      id: `ra-${bill.id}`,
      icon: Receipt,
      title: `RA bill ${bill.no || bill.id || 'added'} ${bill.status ? `is ${bill.status}` : ''}`,
      date: bill.paid || bill.submitted,
    })),
    ...(form.documents || []).map((document) => ({
      id: `doc-${document.id || document.title || document.url}`,
      icon: Paperclip,
      title: `Document ${document.title || document.type || 'added'}`,
      date: document.addedAt,
    })),
    ...(boqItems || []).map((item) => ({
      id: `boq-${item.id}`,
      icon: ClipboardList,
      title: `BOQ item ${item.description || 'added'}`,
      date: item.updatedAt || item.addedAt,
    })),
  ].filter(Boolean).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 6)

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-[calc(6rem+env(safe-area-inset-bottom))] md:space-y-5 md:pb-0">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/home' },
          { label: 'Tenders', href: '/tenders' },
          { label: form.name || 'Tender Detail' },
        ]}
        className="hidden sm:block"
      />
      <Breadcrumbs
        items={[
          { label: 'Tenders', href: '/tenders' },
          { label: 'Details' },
        ]}
        className="mb-2 sm:hidden"
      />
      <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-xl border bg-card p-3 shadow-sm md:hidden">
        <div className="aspect-square overflow-hidden rounded-lg border bg-emerald-50 dark:bg-emerald-950/30">
          <div className="relative h-full w-full">
            <div className="absolute bottom-4 left-4 h-8 w-14 rounded-t-full border-t-4 border-emerald-600" />
            <div className="absolute bottom-6 left-8 h-10 w-1.5 rounded bg-emerald-700" />
            <div className="absolute bottom-6 right-3 h-8 w-5 rounded-full bg-emerald-500/70" />
            <div className="absolute bottom-0 left-0 h-8 w-full rounded-t-[60%] bg-slate-300 dark:bg-slate-700" />
            <div className="absolute bottom-2 left-2 h-1 w-20 rotate-[-20deg] rounded bg-white" />
          </div>
        </div>
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-lg font-bold leading-snug tracking-tight sm:text-2xl">
            {form.name || 'Untitled Tender'}
          </h1>
          <p className="break-words text-xs text-muted-foreground sm:text-sm">{form.nit ? `NIT ${form.nit}` : 'No NIT / Reference'}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {displayTenderStatus && <StatusBadge status={displayTenderStatus} className="px-2.5 py-1 text-xs" />}
            {form.agency && <span className="max-w-full truncate text-xs text-muted-foreground">{form.agency}</span>}
          </div>
        </div>
      </div>

      <div className="hidden flex-col gap-4 md:flex lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <Link to="/tenders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Tenders
          </Link>
          <div className="space-y-2">
            <h1 className="max-w-5xl text-xl font-bold tracking-tight sm:text-2xl lg:text-3xl">
              {form.name || 'Untitled Tender'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono">{form.nit || 'No NIT / Reference'}</span>
              {displayTenderStatus && <StatusBadge status={displayTenderStatus} />}
              {dirty && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Unsaved changes</span>}
              {autoSaving && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">Auto-saving</span>}
              {autoSaveError && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">Auto-save failed</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setSummaryOpen(true)}>
            <FileText className="h-4 w-4" /> Summary
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <Link to={`/tenders/${id}/report`}>
              <Printer className="h-4 w-4" /> Report
            </Link>
          </Button>
          {isAdmin && form.status !== 'Completed' && (
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={openCompleteDialog}>
              <CheckCircle className="h-4 w-4" /> Mark Completed
            </Button>
          )}
          {isAdmin && (
            <Button onClick={save} disabled={saving || !dirty} size="sm" className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <TenderMetric icon={Banknote} label="Contract Value" value={formatCurrency(contractValue)} detail="PKR" tone="emerald" />
        <TenderMetric icon={Receipt} label="Tender Fee" value={formatCurrency(Number(form.tenderFee) || 0)} detail="Auto expense" tone="sky" />
        <TenderMetric icon={Landmark} label="Linked Pay Orders" value={linkedPOs.length || (form.linkedPO ? 1 : 0)} detail={form.linkedPO || 'Total'} tone="violet" />
        <TenderMetric icon={FileText} label="Bills" value={(form.bills || []).length} detail={formatCurrency(billTotal)} tone="orange" className="hidden md:block" />
        <TenderMetric icon={WalletCards} label="Expenses" value={expenses.length} detail={formatCurrency(totalExpenses)} tone="rose" />
        <TenderMetric icon={CheckSquare} label="Execution Progress" value={`${dashboardProgress}%`} detail={form.status === 'Completed' ? 'Completed' : 'Manual update'} tone="blue" className="hidden md:block" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Tabs defaultValue="overview" className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card className="order-1">
            <CardHeader className="p-4 pb-2 md:p-6 md:pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-emerald-600" /> Tender Details
                </CardTitle>
                {isAdmin && (
                  <Button variant={detailsEditing ? 'secondary' : 'outline'} size="sm" className="h-10 md:h-9" onClick={() => setDetailsEditing((value) => !value)}>
                    <Pencil className="h-3.5 w-3.5" /> {detailsEditing ? 'Viewing' : 'Edit Details'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 md:px-5 md:pb-5">
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                <DetailRow icon={FileText} label="Tender Name" className="md:col-span-2 xl:col-span-2">
                  {detailsEditing ? (
                    <Textarea value={form.name || ''} onChange={(e) => updateForm('name', e.target.value)} rows={2} className={`${INLINE_TEXTAREA_CLASS} min-h-[48px] overflow-hidden font-medium leading-snug`} />
                  ) : (
                    <DetailValue>{form.name || '-'}</DetailValue>
                  )}
                </DetailRow>
                <DetailRow icon={CheckCircle} label="Status" note={STATUS_MEANINGS[form.status]}>
                  {detailsEditing ? (
                    <Select value={form.status || ''} onValueChange={updateTenderStatus}>
                      <SelectTrigger className="h-9 border-transparent bg-transparent px-0 shadow-none hover:border-input focus:px-3">
                        {displayTenderStatus ? <StatusBadge status={displayTenderStatus} /> : <SelectValue />}
                      </SelectTrigger>
                      <SelectContent>{TENDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <div className="py-1">{displayTenderStatus ? <StatusBadge status={displayTenderStatus} /> : <DetailValue>-</DetailValue>}</div>
                  )}
                </DetailRow>
                <DetailRow icon={Hash} label="NIT / Reference">
                  {detailsEditing ? <Input value={form.nit || ''} onChange={(e) => updateForm('nit', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{form.nit || '-'}</DetailValue>}
                </DetailRow>
                <DetailRow icon={Banknote} label="Value (PKR)">
                  {detailsEditing ? <Input type="number" value={form.value || ''} onChange={(e) => updateForm('value', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{form.value || '-'}</DetailValue>}
                </DetailRow>
                <DetailRow icon={Banknote} label="Estimated Cost (PKR)" note="Official department / NIT estimate.">
                  {detailsEditing ? <Input type="number" value={form.estimatedCost ?? ''} onChange={(e) => updateForm('estimatedCost', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{form.estimatedCost || '-'}</DetailValue>}
                </DetailRow>
                <DetailRow icon={WalletCards} label="Quoted Amount (PKR)" note="Submitted financial bid amount.">
                  {detailsEditing ? <Input type="number" value={form.quotedAmount ?? ''} onChange={(e) => updateForm('quotedAmount', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{form.quotedAmount || '-'}</DetailValue>}
                </DetailRow>
                <DetailRow icon={Receipt} label="Tender Fee (PKR)" note="Automatically tracked as an expense.">
                  {detailsEditing ? <Input type="number" value={form.tenderFee || ''} onChange={(e) => updateForm('tenderFee', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{form.tenderFee || '-'}</DetailValue>}
                </DetailRow>
                <DetailRow icon={Landmark} label="Procuring Agency" className="md:col-span-2 xl:col-span-1">
                  {detailsEditing ? <Input value={form.agency || ''} onChange={(e) => updateForm('agency', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{form.agency || '-'}</DetailValue>}
                </DetailRow>
                <DetailRow icon={CalendarDays} label="Submission Date">
                  {detailsEditing ? <Input type="date" value={form.submissionDate || ''} onChange={(e) => updateForm('submissionDate', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{formatDate(form.submissionDate)}</DetailValue>}
                </DetailRow>
                <DetailRow icon={CalendarDays} label="Opening Date">
                  {detailsEditing ? <Input type="date" value={form.openingDate || ''} onChange={(e) => updateForm('openingDate', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{formatDate(form.openingDate)}</DetailValue>}
                </DetailRow>
                <DetailRow icon={LinkIcon} label="Linked Pay Order">
                  <p className="truncate text-sm font-medium leading-5 md:text-base" title={linkedPayOrderDisplay}>
                    {linkedPayOrderDisplay}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Managed from linked Pay Orders.</p>
                </DetailRow>
                <DetailRow icon={CalendarDays} label="Completion Date">
                  {detailsEditing ? <Input type="date" value={form.completionDate || ''} onChange={(e) => updateForm('completionDate', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{formatDate(form.completionDate)}</DetailValue>}
                </DetailRow>
              </div>
            </CardContent>
          </Card>

      {/* Tabs */}
        <TabsList className="order-2 -mx-1 flex h-auto max-w-full justify-start gap-1.5 overflow-x-auto whitespace-nowrap rounded-none border-b bg-transparent px-1 pb-0 [scrollbar-width:none] md:mx-0 md:gap-2 md:rounded-lg md:border md:bg-muted/40 md:p-1.5 lg:flex-wrap [&::-webkit-scrollbar]:hidden">
          {compactTabs.map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-11 flex-shrink-0 rounded-none border-b-2 border-transparent px-3 pb-3 pt-2 text-sm text-muted-foreground data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-emerald-700 data-[state=active]:shadow-none dark:data-[state=active]:text-emerald-400 sm:text-base md:h-9 md:rounded-md md:border-b-0 md:px-4 md:py-2 md:text-sm md:data-[state=active]:bg-emerald-50 md:data-[state=active]:text-emerald-700 md:dark:data-[state=active]:bg-emerald-950/40"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview tab: tender control dashboard */}
        <TabsContent value="overview" className="order-3 mt-0 space-y-5">
          <Card className="overflow-hidden border-emerald-100 shadow-sm dark:border-emerald-900/40">
            <CardContent className="p-3.5 md:p-5">
              <div className="grid gap-4 md:gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-3 md:space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {displayTenderStatus && <StatusBadge status={displayTenderStatus} />}
                    {dirty && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Unsaved changes</span>}
                    {autoSaving && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">Auto-saving</span>}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold leading-snug tracking-tight md:text-2xl">
                      {form.name || 'Untitled Tender'}
                    </h2>
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                      {form.agency || 'No agency recorded'}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <OverviewInfo icon={Hash} label="NIT / Ref" value={form.nit || '—'} />
                    <OverviewInfo icon={CalendarDays} label="Submission" value={formatDate(form.submissionDate) || '—'} />
                    <OverviewInfo icon={CalendarDays} label="Opening" value={formatDate(form.openingDate) || '—'} />
                  </div>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3.5 md:p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Execution Progress</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-3xl font-semibold tracking-tight">{dashboardProgress}%</p>
                      <p className="mt-1 text-sm text-muted-foreground">{progressMessage}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full">{projectHealth}</Badge>
                  </div>
                  <Progress value={dashboardProgress} className="mt-4 h-2" />
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
                    <SnapshotRow label="Checklist" value={`${doneCount}/${checklist.length}`} tone={pct === 100 ? 'profit' : 'accent'} />
                    <SnapshotRow label="Linked POs" value={String(linkedPOs.length || (form.linkedPO ? 1 : 0))} tone="accent" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-3 md:p-6 md:pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Banknote className="h-4 w-4 text-emerald-600" /> Financial Snapshot
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Estimate, quote, award value, and security position.</p>
                </div>
                {tenderFinancials.direction !== 'none' && <StatusBadge status={tenderFinancials.positionLabel} />}
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2.5 p-4 pt-0 sm:gap-3 md:p-6 md:pt-0 xl:grid-cols-4">
              <FinancialMetric label="Estimated Cost" value={formatCurrencyPrecise(tenderFinancials.estimatedCost, 0)} tone="accent" />
              <FinancialMetric label="Quoted Amount" value={formatCurrencyPrecise(tenderFinancials.quotedAmount, 0)} tone="accent" />
              <FinancialMetric
                label="Difference"
                value={tenderFinancials.difference === null ? '—' : formatCurrencyPrecise(tenderFinancials.difference, 0)}
                tone={tenderFinancialTone}
                helper={tenderFinancials.difference === null ? undefined : tenderFinancialDirectionText}
              />
              <FinancialMetric
                label="Quoted %"
                value={tenderFinancials.percentage === null ? '—' : `${tenderFinancials.percentage.toFixed(2)}%`}
                tone={tenderFinancialTone}
                helper={tenderFinancials.percentage === null ? undefined : tenderFinancialDirectionText}
              />
              <FinancialMetric label="Contract Value" value={formatCurrency(contractValue)} />
              <FinancialMetric label="Tender Fee" value={formatCurrency(Number(form.tenderFee) || 0)} tone="expense" helper="Auto expense" />
              <FinancialMetric label="Bid Security / Linked PO" value={linkedPOs.length ? formatCurrency(linkedPOs.reduce((sum, po) => sum + (Number(po.amount) || 0), 0)) : (form.linkedPO || '—')} tone="accent" helper={linkedPOs.length ? `${linkedPOs.length} pay order${linkedPOs.length === 1 ? '' : 's'}` : 'Managed from Pay Orders'} />
              <FinancialMetric label="Expected Profit" value={formatCurrency(expectedProfit)} tone={expectedProfit >= 0 ? 'profit' : 'loss'} helper={projectedMargin !== null ? `${projectedMargin}% margin` : undefined} />
              <FinancialMetric label="Total Expenses" value={formatCurrency(totalExpenses)} tone="expense" />
              <FinancialMetric label="Received" value={formatCurrency(totalReceived)} tone="profit" helper="Bills / RA bills marked paid" />
              <FinancialMetric label="Receivable" value={formatCurrency(receivable)} tone={receivable > 0 ? 'expense' : 'profit'} />
              <FinancialMetric label="Cash Position" value={formatCurrency(cashPosition)} tone={cashPosition >= 0 ? 'profit' : 'loss'} />
              <p className="col-span-2 text-xs text-muted-foreground xl:col-span-4">
                Received payments are calculated from Bills and RA Bills marked as Paid.
              </p>
              {form.status === 'Completed' && form.completionSnapshot && (
                <div className="col-span-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200 xl:col-span-4">
                  <p className="font-medium">Completed {formatDate(form.completionDate)}</p>
                  <p className="mt-1 text-xs opacity-80">
                    Final snapshot: expected profit {formatCurrency(form.completionSnapshot.expectedProfit ?? form.completionSnapshot.projectedProfit)}, cash position {formatCurrency(form.completionSnapshot.cashPosition ?? form.completionSnapshot.realizedProfit)}, receivable {formatCurrency(form.completionSnapshot.receivable ?? form.completionSnapshot.outstandingRevenue)}.
                  </p>
                  {form.completionRemarks && <p className="mt-2 text-xs opacity-80">{form.completionRemarks}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="shadow-sm">
              <CardHeader className="p-4 pb-3 md:p-6 md:pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CheckSquare className="h-4 w-4 text-emerald-600" /> Checklist Progress
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {checklistExpanded && isAdmin && <Button size="sm" variant="outline" className="h-10 flex-1 sm:h-9 sm:flex-none" onClick={addChecklistItem}><Plus className="h-3.5 w-3.5" /> Add Item</Button>}
                    <Button size="sm" variant="outline" className="h-10 flex-1 sm:h-9 sm:flex-none" onClick={() => setChecklistExpanded((value) => !value)}>
                      {checklistExpanded ? 'Hide Checklist' : 'Show Checklist'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 pt-0 md:p-6 md:pt-0">
                <div className="rounded-xl border bg-muted/10 p-4">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-2xl font-semibold tracking-tight">{doneCount}/{checklist.length}</p>
                      <p className="mt-1 text-sm text-muted-foreground">Checklist items complete</p>
                    </div>
                    <p className="font-mono text-lg font-semibold text-emerald-700 dark:text-emerald-300">{pct}%</p>
                  </div>
                  <Progress value={pct} className="mt-4 h-2" />
                </div>
                {!checklistExpanded && (
                  <div className="space-y-2">
                    {pendingChecklist.length === 0 ? (
                      <p className="rounded-lg border border-dashed py-5 text-center text-sm text-muted-foreground">
                        {checklist.length === 0 ? 'No checklist items yet.' : 'All checklist items are complete.'}
                      </p>
                    ) : (
                      pendingChecklist.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
                          <span className="h-2 w-2 rounded-full bg-amber-500" />
                          <span className="line-clamp-1">{item.label || 'Untitled checklist item'}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
                {checklistExpanded && (
                  <div className="space-y-2">
                    {checklist.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">No checklist items yet.</p>}
                    {checklist.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 group">
                        <Checkbox checked={item.done} onCheckedChange={(v) => updateChecklistItem(item.id, { done: v })} disabled={!isAdmin} />
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
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <WalletCards className="h-4 w-4 text-emerald-600" /> Payment Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-3 rounded-xl border bg-muted/10 p-4">
                  <PaymentSummaryRow label="Received" value={formatCurrency(totalReceived)} tone="profit" />
                  <PaymentSummaryRow label="Receivable" value={formatCurrency(receivable)} tone={receivable > 0 ? 'accent' : 'profit'} />
                  <PaymentSummaryRow label="Cash Position" value={formatCurrency(cashPosition)} tone={cashPosition >= 0 ? 'profit' : 'loss'} />
                  <div className="border-t pt-3">
                    <Progress value={contractValue > 0 ? Math.min(Math.round((totalReceived / contractValue) * 100), 100) : 0} className="h-2" />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {contractValue > 0 ? `${Math.min(Math.round((totalReceived / contractValue) * 100), 100)}% of contract value received.` : 'Add contract value to calculate collection progress.'}
                    </p>
                  </div>
                </div>
                {(bills.length > 0 || raBills.length > 0) && (
                  <div className="space-y-3 text-sm">
                    <SnapshotRow label={`Bills (${paidRegularBills}/${bills.length} paid)`} value={formatCurrency(billPaid)} tone="profit" />
                    <SnapshotRow label="Bills Outstanding" value={formatCurrency(billTotal - billPaid)} tone={billTotal - billPaid > 0 ? 'accent' : 'profit'} />
                    <SnapshotRow label={`RA Bills (${paidRaBills}/${raBills.length} paid)`} value={formatCurrency(raBillPaid)} tone="profit" />
                    <SnapshotRow label="RA Outstanding" value={formatCurrency(raBillTotal - raBillPaid)} tone={raBillTotal - raBillPaid > 0 ? 'accent' : 'profit'} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <OverviewListCard
              icon={Landmark}
              title="Linked Pay Orders"
              empty="No linked pay orders."
              items={linkedPOs.slice(0, 4)}
              renderItem={(po) => (
                <OverviewListItem
                  key={po.id}
                  title={po.po || 'Pay order'}
                  meta={`${po.bank || 'No bank'}${po.submitted ? ` · ${formatDate(po.submitted)}` : ''}`}
                  value={formatCurrency(po.amount)}
                  badge={po.status}
                />
              )}
            />
            <OverviewListCard
              icon={Receipt}
              title="Recent Expenses"
              empty="No expenses recorded yet."
              items={recentExpenses.slice(0, 4)}
              renderItem={(expense) => (
                <OverviewListItem
                  key={expense.id}
                  title={expense.description || 'Expense'}
                  meta={`${formatDate(expense.date) || 'No date'}${expense.category ? ` · ${expense.category}` : ''}`}
                  value={formatCurrency(expense.amount)}
                  tone="expense"
                />
              )}
            />
            <OverviewListCard
              icon={Paperclip}
              title="Recent Documents"
              empty="No documents uploaded yet."
              items={recentDocuments}
              renderItem={(document) => (
                <OverviewListItem
                  key={document.id || document.title || document.url}
                  title={document.title || document.type || 'Document'}
                  meta={`${document.type || 'Other'}${document.addedAt ? ` · ${formatDate(document.addedAt)}` : ''}`}
                />
              )}
            />
            <OverviewListCard
              icon={CalendarDays}
              title="Recent Site Visits"
              empty="No site visits recorded yet."
              items={recentSiteVisits}
              renderItem={(visit) => (
                <OverviewListItem
                  key={visit.id || visit.date || visit.visitDate}
                  title={visit.location || visit.workCompleted || 'Site visit'}
                  meta={formatDate(visit.date || visit.visitDate) || 'No date'}
                />
              )}
            />
            <OverviewListCard
              icon={FileText}
              title="Bills / RA Bills"
              empty="No bills or RA bills yet."
              items={recentBills}
              renderItem={(bill) => (
                <OverviewListItem
                  key={`${bill.isRaBill ? 'ra' : 'bill'}-${bill.id || bill.no || bill.desc}`}
                  title={bill.isRaBill ? `RA bill ${bill.no || ''}`.trim() : (bill.desc || 'Bill')}
                  meta={`${bill.status || 'No status'}${(bill.paid || bill.submitted || bill.date) ? ` · ${formatDate(bill.paid || bill.submitted || bill.date)}` : ''}`}
                  value={formatCurrency(bill.amount)}
                  badge={bill.status}
                />
              )}
            />
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-4 w-4 text-emerald-600" /> Tender Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {recentActivity.length === 0 && <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">No activity yet.</p>}
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex gap-3 rounded-lg border bg-muted/10 p-3 text-sm">
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                      <activity.icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-medium">{activity.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(activity.date) || 'No date'}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={form.notes || ''} onChange={(e) => updateAutosavedForm('notes', e.target.value)} disabled={!isAdmin} rows={4} placeholder="Add notes about this tender…" />
            </CardContent>
          </Card>

          {(form.statusHistory || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm"><History className="h-4 w-4" /> Status History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {(form.statusHistory || []).map((h, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-3 text-sm">
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

        <TabsContent value="boq" className="order-3 mt-0 space-y-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">BOQ / Profit Tracking</h2>
            <div className="mt-2 h-1 w-10 rounded-full bg-emerald-600" />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
            <BoqMetric icon={FileText} label="Quoted Total" value={formatCurrency(boqTotals.quotedAmount)} tone="emerald" />
            <BoqMetric icon={WalletCards} label="Actual Cost" value={formatCurrency(boqTotals.actualCost)} tone="orange" />
            <BoqMetric icon={BarChart3} label="Expected Profit" value={formatCurrency(boqTotals.profitLoss)} tone="blue" />
            <BoqMetric icon={PieChart} label="Profit Margin" value={`${boqProfitMargin}%`} tone="violet" />
          </div>

          <Card className="shadow-sm">
            <CardContent className="space-y-5 p-4 md:p-5">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30 sm:h-9 sm:w-auto"
                    onClick={() => {
                      const nextMode = !boqEditMode
                      setBoqEditMode(nextMode)
                      setEditingBoqItemId(null)
                    }}
                    disabled={boqItems.length === 0}
                  >
                    <Pencil className="h-4 w-4" /> {boqEditMode ? 'Done Editing' : 'Edit BOQ'}
                  </Button>
                )}
                {isAdmin && (
                  <Button size="sm" className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:h-9 sm:w-auto" onClick={addBoqItem}>
                    <Plus className="h-4 w-4" /> Add Item
                  </Button>
                )}
                <Button variant="outline" size="sm" className="col-span-2 h-11 w-full sm:col-span-1 sm:h-9 sm:w-auto" onClick={() => window.print()}>
                  <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>

              {boqItems.length === 0 ? (
                <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No BOQ items yet.
                </p>
              ) : (
                <>
                <div className="space-y-3 pb-24 md:hidden">
                  {boqItems.map((item, index) => {
                    const quotedAmount = (Number(item.qty) || 0) * (Number(item.quotedRate) || 0)
                    const actualCost = Number(item.actualCost) || 0
                    const profitLoss = quotedAmount - actualCost
                    const isEditing = editingBoqItemId === item.id
                    return (
                      <div key={item.id} className="rounded-xl border bg-card p-3.5 shadow-sm">
                        <div className="flex items-start gap-3">
                          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-emerald-50 font-mono text-base font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <AutoResizeTextarea
                                value={item.description || ''}
                                onChange={(e) => updateBoqItem(item.id, { description: e.target.value })}
                                disabled={!isAdmin}
                                placeholder="Item description"
                                minRows={2}
                                className="px-2 py-1.5 leading-5"
                              />
                            ) : (
                              <button
                                type="button"
                                className={`w-full text-left text-base leading-6 ${item.description ? '' : 'text-muted-foreground'}`}
                                onClick={() => boqEditMode && isAdmin && setEditingBoqItemId(item.id)}
                                disabled={!isAdmin || !boqEditMode}
                              >
                                {item.description || 'Add item description'}
                              </button>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isAdmin && boqEditMode && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-8 w-8 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
                                  onClick={() => setEditingBoqItemId(isEditing ? null : item.id)}
                                  aria-label={`${isEditing ? 'Finish editing' : 'Edit'} BOQ item ${index + 1}`}
                                >
                                  {isEditing ? <CheckCircle className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-8 w-8 text-muted-foreground hover:bg-rose-50 hover:text-destructive"
                                  onClick={() => removeBoqItem(item.id)}
                                  aria-label={`Remove BOQ item ${index + 1}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {!boqEditMode && <ChevronDown className="mt-1 h-5 w-5 text-foreground" />}
                          </div>
                        </div>
                        <div className="mt-3 border-t pt-3">
                          <div className="grid grid-cols-2 gap-x-3 gap-y-3 min-[430px]:grid-cols-3">
                            <MobileBoqField
                              label="Qty"
                              value={isEditing ? item.qty ?? '' : formatPlainNumber(item.qty)}
                              editing={isEditing}
                              onChange={(value) => updateBoqItem(item.id, { qty: value })}
                              inputMode="decimal"
                            />
                            <MobileBoqField
                              label="Unit"
                              value={isEditing ? item.unit || '' : item.unit || '-'}
                              editing={isEditing}
                              onChange={(value) => updateBoqItem(item.id, { unit: value })}
                            />
                            <MobileBoqField
                              label="Rate"
                              value={isEditing ? item.quotedRate === 0 ? '' : item.quotedRate ?? '' : formatCurrency(Number(item.quotedRate) || 0)}
                              editing={isEditing}
                              onChange={(value) => updateBoqItem(item.id, { quotedRate: value })}
                              inputMode="decimal"
                            />
                            <MobileBoqStat label="Quoted Amount" value={formatCurrency(quotedAmount)} />
                            <MobileBoqField
                              label="Actual Cost"
                              value={isEditing ? item.actualCost === 0 ? '' : item.actualCost ?? '' : formatCurrency(actualCost)}
                              editing={isEditing}
                              onChange={(value) => updateBoqItem(item.id, { actualCost: value })}
                              inputMode="decimal"
                            />
                            <MobileBoqStat label="Profit / Loss" value={formatCurrency(profitLoss)} tone={profitLoss < 0 ? 'loss' : 'profit'} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div className="sticky bottom-20 z-20 rounded-2xl border border-emerald-200 bg-emerald-50/95 p-3 shadow-lg shadow-emerald-900/10 ring-1 ring-emerald-100 backdrop-blur supports-[backdrop-filter]:bg-emerald-50/85 dark:border-emerald-800/70 dark:bg-emerald-950/80 dark:ring-emerald-800/50 min-[430px]:p-4">
                    <div className="grid grid-cols-3 gap-1.5 text-center min-[420px]:gap-2">
                      <MobileBoqStat label="Total Quoted Amount" value={formatCurrency(boqTotals.quotedAmount)} tone="profit" large />
                      <MobileBoqStat label="Actual Cost" value={formatCurrency(boqTotals.actualCost)} tone="loss" large />
                      <MobileBoqStat label="Profit / Loss" value={formatCurrency(boqTotals.profitLoss)} tone={boqTotals.profitLoss < 0 ? 'loss' : 'profit'} large />
                    </div>
                  </div>
                </div>

                <div className="hidden overflow-x-auto rounded-lg border md:block">
                  <Table className="min-w-[1080px] table-fixed">
                    <TableHeader>
                      <TableRow className="border-emerald-100 bg-emerald-50/70 hover:bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/20">
                        <TableHead className="w-[5%] px-2 font-semibold text-emerald-900 dark:text-emerald-200">Item</TableHead>
                        <TableHead className="w-[36%] px-2 font-semibold text-emerald-900 dark:text-emerald-200">Description</TableHead>
                        <TableHead className="w-[7%] px-2 text-right font-semibold text-emerald-900 dark:text-emerald-200">Qty</TableHead>
                        <TableHead className="w-[7%] px-2 font-semibold text-emerald-900 dark:text-emerald-200">Unit</TableHead>
                        <TableHead className="w-[11%] px-2 text-right font-semibold text-emerald-900 dark:text-emerald-200">Rate</TableHead>
                        <TableHead className="w-[12%] px-2 text-right font-semibold text-emerald-900 dark:text-emerald-200">Quoted Amount</TableHead>
                        <TableHead className="w-[11%] px-2 text-right font-semibold text-emerald-900 dark:text-emerald-200">Actual Cost</TableHead>
                        <TableHead className="w-[11%] px-2 text-right font-semibold text-emerald-900 dark:text-emerald-200">Profit / Loss</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {boqItems.map((item, index) => {
                        const quotedAmount = (Number(item.qty) || 0) * (Number(item.quotedRate) || 0)
                        const actualCost = Number(item.actualCost) || 0
                        const profitLoss = quotedAmount - actualCost
                        const isEditing = editingBoqItemId === item.id
                        return (
                          <TableRow key={item.id} className={`group hover:bg-muted/20 ${isEditing ? 'bg-muted/20' : ''}`}>
                            <TableCell className="!px-2 !py-2 align-middle">
                              <div className="flex flex-col items-center gap-1">
                                <span className="pt-1 font-mono text-sm">{index + 1}</span>
                                {isAdmin && boqEditMode && (
                                  <div className="flex flex-col gap-0.5">
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="h-6 w-6 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30"
                                      onClick={() => setEditingBoqItemId(isEditing ? null : item.id)}
                                      aria-label={`${isEditing ? 'Finish editing' : 'Edit'} BOQ item ${index + 1}`}
                                      title={isEditing ? 'Done' : 'Edit item'}
                                    >
                                      {isEditing ? <CheckCircle className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      className="h-6 w-6 text-muted-foreground hover:bg-rose-50 hover:text-destructive dark:hover:bg-rose-950/30"
                                      onClick={() => removeBoqItem(item.id)}
                                      aria-label={`Remove BOQ item ${index + 1}`}
                                      title="Remove item"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="!px-2 !py-2 align-top">
                              {isEditing ? (
                                <AutoResizeTextarea
                                  value={item.description || ''}
                                  onChange={(e) => updateBoqItem(item.id, { description: e.target.value })}
                                  disabled={!isAdmin}
                                  placeholder="Item description"
                                  minRows={2}
                                  className="px-2 py-1.5 leading-5"
                                />
                              ) : (
                                <div
                                  className={`rounded-md px-2 py-1 text-sm leading-5 ${boqEditMode && isAdmin ? 'cursor-pointer transition-colors hover:bg-muted/40' : ''}`}
                                  onClick={() => boqEditMode && isAdmin && setEditingBoqItemId(item.id)}
                                >
                                  <span className={`block whitespace-pre-wrap break-words ${item.description ? '' : 'text-muted-foreground'}`}>
                                    {item.description || 'Add item description'}
                                  </span>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="!px-2 !py-2 align-middle text-right">
                              {isEditing ? (
                                <Input type="text" inputMode="decimal" value={item.qty ?? ''} onChange={(e) => updateBoqItem(item.id, { qty: e.target.value })} disabled={!isAdmin} className="h-8 px-2 text-right" />
                              ) : (
                                <button type="button" className={`w-full rounded-md px-2 py-1 text-right font-mono text-sm tabular-nums ${boqEditMode && isAdmin ? 'transition-colors hover:bg-muted/40' : ''}`} onClick={() => boqEditMode && isAdmin && setEditingBoqItemId(item.id)} disabled={!isAdmin || !boqEditMode}>
                                  {formatPlainNumber(item.qty)}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="!px-2 !py-2 align-middle">
                              {isEditing ? (
                                <Input value={item.unit || ''} onChange={(e) => updateBoqItem(item.id, { unit: e.target.value })} disabled={!isAdmin} className="h-8 px-2" />
                              ) : (
                                <button type="button" className={`w-full rounded-md px-2 py-1 text-left text-sm ${boqEditMode && isAdmin ? 'transition-colors hover:bg-muted/40' : ''}`} onClick={() => boqEditMode && isAdmin && setEditingBoqItemId(item.id)} disabled={!isAdmin || !boqEditMode}>
                                  {item.unit || '-'}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="!px-2 !py-2 align-middle text-right">
                              {isEditing ? (
                                <Input type="text" inputMode="decimal" value={item.quotedRate === 0 ? '' : item.quotedRate ?? ''} onChange={(e) => updateBoqItem(item.id, { quotedRate: e.target.value })} disabled={!isAdmin} className="h-8 px-2 text-right" />
                              ) : (
                                <button type="button" className={`w-full rounded-md px-2 py-1 text-right font-mono text-sm tabular-nums ${boqEditMode && isAdmin ? 'transition-colors hover:bg-muted/40' : ''}`} onClick={() => boqEditMode && isAdmin && setEditingBoqItemId(item.id)} disabled={!isAdmin || !boqEditMode}>
                                  {formatPlainNumber(item.quotedRate)}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="!px-2 !py-3 text-right align-middle font-mono text-sm tabular-nums">{formatCurrency(quotedAmount)}</TableCell>
                            <TableCell className="!px-2 !py-2 align-middle text-right">
                              {isEditing ? (
                                <Input type="text" inputMode="decimal" value={item.actualCost === 0 ? '' : item.actualCost ?? ''} onChange={(e) => updateBoqItem(item.id, { actualCost: e.target.value })} disabled={!isAdmin} className="h-8 px-2 text-right" />
                              ) : (
                                <button type="button" className={`w-full rounded-md px-2 py-1 text-right font-mono text-sm tabular-nums ${boqEditMode && isAdmin ? 'transition-colors hover:bg-muted/40' : ''}`} onClick={() => boqEditMode && isAdmin && setEditingBoqItemId(item.id)} disabled={!isAdmin || !boqEditMode}>
                                  {formatCurrency(actualCost)}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className={`!px-2 !py-3 text-right align-middle font-mono text-sm tabular-nums ${profitLoss < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {formatCurrency(profitLoss)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      <TableRow className="bg-emerald-50/60 font-semibold hover:bg-emerald-50/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/20">
                        <TableCell colSpan={5} className="px-2 py-4 text-right">Total</TableCell>
                        <TableCell className="px-2 py-4 text-right font-mono tabular-nums">{formatCurrency(boqTotals.quotedAmount)}</TableCell>
                        <TableCell className="px-2 py-4 text-right font-mono tabular-nums">{formatCurrency(boqTotals.actualCost)}</TableCell>
                        <TableCell className={`px-2 py-4 text-right font-mono tabular-nums ${boqTotals.profitLoss < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatCurrency(boqTotals.profitLoss)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bills tab */}
        <TabsContent value="bills" className="order-3 mt-0 space-y-4">
          <BillFinanceSection
            title="Bills / Invoices"
            description="Track submitted, approved, received, deductions, and receivable amounts."
            bills={bills}
            summary={billSummary}
            isAdmin={isAdmin}
            onAdd={addBill}
            onUpdate={updateBill}
            onRemove={removeBill}
            addLabel="Add Bill / RA Bill"
            emptyTitle="No bills or RA bills added yet."
            dateKey="date"
          />
        </TabsContent>

        {/* RA Bills tab */}
        <TabsContent value="rabills" className="order-3 mt-0 space-y-4">
          <BillFinanceSection
            title="RA Bills"
            description="Track running account bills, approvals, payments, and outstanding receivables."
            bills={raBills}
            summary={raBillSummary}
            isAdmin={isAdmin}
            onAdd={addRABill}
            onUpdate={updateRABill}
            onRemove={removeRABill}
            addLabel="Add Bill / RA Bill"
            emptyTitle="No bills or RA bills added yet."
            dateKey="submitted"
            paidDateKey="paid"
          />
        </TabsContent>

        {/* Pay Orders tab */}
        <TabsContent value="payorders" className="order-3 mt-0 space-y-4">
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
        <TabsContent value="expenses" className="order-3 mt-0 space-y-4">
          {/* Summary — Sunk / At Risk / Held */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
            <CardHeader className="p-4 pb-3 md:p-6 md:pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Receipt className="h-4 w-4" /> Expenses
                  <span className="text-muted-foreground font-normal">· total {formatCurrency(expenseTotal)}</span>
                </CardTitle>
                {isAdmin && <Button size="sm" className="h-10 w-full sm:h-9 sm:w-auto" onClick={() => openExpDialog()}><Plus className="h-3.5 w-3.5" /> Add Expense</Button>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Tender fees are tracked separately and excluded from this total.</p>
            </CardHeader>
            <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
              {expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No expenses linked to this tender yet.
                </p>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="space-y-3 md:hidden">
                    {expenses.map((e) => (
                      <div key={e.id} className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground break-words">{e.description || '—'}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(e.date)}{e.category && <> · {e.category}</>}</p>
                          </div>
                          <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">{formatCurrency(e.amount)}</span>
                        </div>
                        {e.note && <p className="text-xs text-muted-foreground mt-1.5 break-words">{e.note}</p>}
                        {isAdmin && (
                          <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3">
                            <Button variant="outline" size="sm" className="h-10" onClick={() => openExpDialog(e)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                            <Button variant="ghost" size="sm" className="h-10 text-destructive" onClick={() => setDeleteExpId(e.id)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
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

        <TabsContent value="site-visits" className="order-3 mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CalendarDays className="h-4 w-4" /> Site Visits
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Track daily execution updates, labour, materials, issues, photos, and next-day plans.
                  </p>
                </div>
                <Button size="sm" disabled={!isAdmin}>
                  <Plus className="h-3.5 w-3.5" /> Add Site Visit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <h3 className="mt-3 text-sm font-semibold">No site visits recorded yet.</h3>
                <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
                  Future entries will capture visit date, visit time, location, work completed, labour used, material used, issues or delays, photos, and next-day plan.
                </p>
                <div className="mt-5 grid grid-cols-1 gap-2 text-left text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                  {['Visit date', 'Visit time', 'Location', 'Work completed', 'Labour used', 'Material used', 'Issues / delays', 'Photos', 'Next-day plan'].map((field) => (
                    <div key={field} className="rounded-md border bg-muted/20 px-3 py-2">{field}</div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="order-3 mt-0 space-y-4">
          <DocumentsManager
            documents={documents}
            filteredDocuments={filteredDocuments}
            documentStats={documentStats}
            linkedTenderDocumentCount={linkedTenderDocumentCount}
            recentUploadCount={recentUploadCount}
            documentSearch={documentSearch}
            setDocumentSearch={setDocumentSearch}
            documentTypeFilter={documentTypeFilter}
            setDocumentTypeFilter={setDocumentTypeFilter}
            addDocument={addDocument}
            uploadDocumentFile={uploadDocumentFile}
            updateDocument={updateDocument}
            removeDocument={removeDocument}
            uploadingDocumentId={uploadingDocumentId}
            documentUploadProgress={documentUploadProgress}
            tenderName={form.name}
            isAdmin={isAdmin}
          />
          {false && (
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
              {(form.documents || []).length === 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {documentCategoryCounts.map(({ category, count }) => (
                    <div key={category} className="rounded-md border bg-muted/20 p-3">
                      <p className="text-xs font-medium text-muted-foreground">{category}</p>
                      <p className="mt-1 font-mono text-lg font-semibold">{count}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {documentCategoryCounts.filter(({ count }) => count > 0).map(({ category, count }) => (
                    <Badge key={category} variant="secondary" className="gap-1.5">
                      {category}
                      <span className="font-mono">{count}</span>
                    </Badge>
                  ))}
                </div>
              )}
              {(form.documents || []).map((item) => (
                <div key={item.id} className="rounded-md border bg-muted/10 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title || item.fileName || item.type || 'Untitled document'}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.fileName ? `Uploaded file: ${item.fileName}` : item.url ? 'Linked document' : `Draft document · Supabase bucket: ${getSupabaseStorageBucket()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        id={`document-upload-${item.id}`}
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        className="sr-only"
                        disabled={!isAdmin || uploadingDocumentId === item.id}
                        onChange={(event) => {
                          const file = event.target.files?.[0]
                          event.target.value = ''
                          uploadDocumentFile(item.id, file)
                        }}
                      />
                      {isAdmin && (
                        <Button variant="outline" size="sm" asChild>
                          <label htmlFor={`document-upload-${item.id}`} className="cursor-pointer">
                            {uploadingDocumentId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {uploadingDocumentId === item.id
                              ? `Uploading ${documentUploadProgress[item.id] ?? 0}%`
                              : 'Upload'}
                          </label>
                        </Button>
                      )}
                      {item.url && (
                        <Button variant="outline" size="icon-sm" asChild>
                          <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open ${item.title || 'document'}`}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      {isAdmin && (
                        <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => removeDocument(item.id)} aria-label={`Remove ${item.title || 'document'}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_0.75fr_1.25fr] lg:items-end">
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
                      <Label>Category</Label>
                      <Select value={item.type || 'Other'} onValueChange={(value) => updateDocument(item.id, { type: value })} disabled={!isAdmin}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_CATEGORIES.map((category) => (
                            <SelectItem key={category} value={category}>{category}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">No documents or links added yet.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add work orders, BOQs, site photos, material invoices, bills, inspection letters, completion certificates, security refunds, or other project files.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </TabsContent>

        {/* Contact tab */}
        <TabsContent value="contact" className="order-3 mt-0">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><User className="h-4 w-4" /> Contact Person</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {['name', 'phone', 'email', 'role'].map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label className="capitalize">{field}</Label>
                  <Input
                    value={(form.contactPerson || {})[field] || ''}
                    onChange={(e) => updateAutosavedForm('contactPerson', { ...(form.contactPerson || {}), [field]: e.target.value })}
                    disabled={!isAdmin}
                  />
                </div>
              ))}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  value={(form.contactPerson || {}).notes || ''}
                  onChange={(e) => updateAutosavedForm('contactPerson', { ...(form.contactPerson || {}), notes: e.target.value })}
                  disabled={!isAdmin}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUpIcon /> Project Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:block lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-6">
                <div className="space-y-2">
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-3xl font-semibold text-emerald-600 dark:text-emerald-400">{dashboardProgress}%</span>
                    {displayTenderStatus && <StatusBadge status={displayTenderStatus} />}
                  </div>
                  <Progress value={dashboardProgress} className="h-2" />
                  <p className="text-sm text-muted-foreground">{progressMessage}</p>
                </div>
                <div className="space-y-2 border-t pt-3 text-sm md:border-t-0 md:pt-0 lg:border-l lg:pl-6">
                  <SnapshotRow label="Start Date" value={formatDate(form.submissionDate)} />
                  <SnapshotRow label="Estimated Completion" value={formatDate(form.completionDate)} />
                  <SnapshotRow label="Project Health" value={projectHealth} tone={projectHealthTone} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Important Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <SnapshotRow label="Submission Date" value={formatDate(form.submissionDate)} />
              <SnapshotRow label="Opening Date" value={formatDate(form.openingDate)} />
              <SnapshotRow label="Completion" value={formatDate(form.completionDate)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Financial Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <SnapshotRow label="Contract Value" value={formatCurrency(contractValue)} />
              <SnapshotRow label="Total Expenses" value={formatCurrency(totalExpenses)} />
              <SnapshotRow label="BOQ Expected Profit" value={formatCurrency(boqExpectedProfit)} tone={boqExpectedProfit >= 0 ? 'profit' : 'loss'} />
              <SnapshotRow label="Received from bills / RA bills" value={formatCurrency(totalReceived)} tone="profit" />
              <SnapshotRow label="Outstanding Billing" value={formatCurrency(receivable)} tone="accent" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex gap-3 text-sm">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                    <activity.icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2">{activity.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(activity.date)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Floating save for mobile */}
      {isAdmin && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 p-4 backdrop-blur md:hidden">
          <Button onClick={save} disabled={saving || !dirty} size="lg" className="h-14 w-full rounded-xl bg-emerald-600 text-white shadow-lg hover:bg-emerald-700">
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

function TenderMetric({ icon: Icon, label, value, detail, tone, className = '' }) {
  const toneClasses = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400',
  }
  return (
    <Card className={className}>
      <CardContent className="flex min-h-[86px] items-center gap-2.5 p-3 sm:min-h-[96px] sm:gap-3 sm:p-4 md:gap-4">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full sm:h-14 sm:w-14 md:h-11 md:w-11 ${toneClasses[tone] || toneClasses.blue}`}>
          <Icon className="h-[18px] w-[18px] sm:h-6 sm:w-6 md:h-5 md:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground sm:text-sm md:text-xs">{label}</p>
          <p className="break-words text-[clamp(0.95rem,4.2vw,1.15rem)] font-semibold leading-5 tabular-nums [overflow-wrap:anywhere] sm:text-xl sm:leading-6 md:text-lg">{value}</p>
          {detail && <p className="truncate text-[11px] text-muted-foreground sm:text-xs">{detail}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function BoqMetric({ icon: Icon, label, value, tone }) {
  const toneClasses = {
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
    orange: 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400',
  }
  const valueClasses = {
    emerald: 'text-emerald-700 dark:text-emerald-300',
    orange: 'text-orange-600 dark:text-orange-300',
    blue: 'text-emerald-700 dark:text-emerald-300',
    violet: 'text-violet-700 dark:text-violet-300',
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="flex min-h-[78px] items-center gap-2 p-2.5 sm:min-h-[88px] sm:gap-3 sm:p-4">
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 ${toneClasses[tone] || toneClasses.emerald}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
          <p className={`mt-0.5 whitespace-normal break-words font-mono text-sm font-semibold leading-5 tabular-nums [overflow-wrap:anywhere] sm:text-xl sm:leading-6 ${valueClasses[tone] || valueClasses.emerald}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function MobileBoqField({ label, value, editing, onChange, inputMode = 'text' }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {editing ? (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode={inputMode}
          className="mt-1 h-9 px-2 text-sm"
        />
      ) : (
        <p className="mt-1 break-words font-mono text-sm font-semibold leading-5 tabular-nums text-foreground [overflow-wrap:anywhere]">{value || '-'}</p>
      )}
    </div>
  )
}

function MobileBoqStat({ label, value, tone, large = false }) {
  const toneClass =
    tone === 'profit'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'loss'
        ? 'text-orange-600 dark:text-orange-400'
        : 'text-foreground'
  return (
    <div className="min-w-0">
      <p className={`${large ? 'text-xs font-medium text-foreground sm:text-sm' : 'text-sm text-muted-foreground'}`}>{label}</p>
      <p className={`mt-1 break-words font-mono ${large ? 'text-sm font-semibold sm:text-lg' : 'text-base'} leading-5 tabular-nums [overflow-wrap:anywhere] ${toneClass}`}>
        {value}
      </p>
    </div>
  )
}

function formatPlainNumber(value) {
  if (value === '' || value === null || value === undefined) return '-'
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return String(value)
  return numericValue.toLocaleString('en-US', {
    minimumFractionDigits: numericValue % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

function DetailRow({ icon: Icon, label, children, note, className = '' }) {
  return (
    <div className={`rounded-lg border bg-background px-3 py-2.5 ${className}`}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{label}</span>
      </div>
      <div className="min-w-0">
        {children}
        {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
      </div>
    </div>
  )
}

function DetailValue({ children }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm font-medium leading-5 [overflow-wrap:anywhere] md:text-base">
      {children || '-'}
    </p>
  )
}

function AutoResizeTextarea({ value, minRows = 1, className = '', ...props }) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const lineHeight = Number.parseFloat(window.getComputedStyle(node).lineHeight) || 20
    const verticalPadding = node.offsetHeight - node.clientHeight
    const minHeight = (lineHeight * minRows) + verticalPadding
    node.style.height = 'auto'
    node.style.height = `${Math.max(node.scrollHeight, minHeight)}px`
  }, [value, minRows])

  return (
    <Textarea
      ref={ref}
      value={value}
      rows={minRows}
      className={`resize-none overflow-hidden ${className}`}
      {...props}
    />
  )
}

function TrendingUpIcon() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center text-emerald-600">
      <span className="h-3 w-3 rotate-45 border-l-2 border-t-2 border-current" />
    </span>
  )
}

function SnapshotRow({ label, value, tone }) {
  const toneClass =
    tone === 'profit'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'loss'
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'accent'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-foreground'
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-mono font-medium ${toneClass}`}>{value}</span>
    </div>
  )
}

function PaymentSummaryRow({ label, value, tone }) {
  const toneClass =
    tone === 'profit'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'loss'
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'accent'
          ? 'text-blue-600 dark:text-blue-400'
          : 'text-foreground'
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-right font-mono text-base font-semibold tabular-nums ${toneClass}`}>{value}</span>
    </div>
  )
}

function OverviewInfo({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border bg-background/80 p-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <p className="mt-2 truncate text-sm font-semibold text-foreground" title={String(value || '—')}>
        {value || '—'}
      </p>
    </div>
  )
}

function OverviewListCard({ icon: Icon, title, empty, items, renderItem }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-emerald-600" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          items.map(renderItem)
        )}
      </CardContent>
    </Card>
  )
}

function OverviewListItem({ title, meta, value, tone, badge }) {
  const valueClass =
    tone === 'expense'
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-emerald-700 dark:text-emerald-300'

  return (
    <div className="rounded-lg border bg-muted/10 p-3 transition-colors hover:bg-muted/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium leading-5">{title || '—'}</p>
          {meta && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{meta}</p>}
          {badge && <div className="mt-2"><StatusBadge status={badge} /></div>}
        </div>
        {value && (
          <p className={`shrink-0 whitespace-nowrap font-mono text-sm font-semibold tabular-nums ${valueClass}`}>
            {value}
          </p>
        )}
      </div>
    </div>
  )
}

function BillFinanceSection({
  title,
  description,
  bills,
  summary,
  isAdmin,
  onAdd,
  onUpdate,
  onRemove,
  addLabel,
  emptyTitle,
  dateKey,
  paidDateKey,
}) {
  const summaryCards = [
    { label: 'Total Billed', value: summary.submitted, tone: 'text-foreground', helper: 'Submitted amount' },
    { label: 'Approved Amount', value: summary.approved, tone: 'text-blue-700 dark:text-blue-300', helper: 'Approved or submitted fallback' },
    { label: 'Received Amount', value: summary.received, tone: 'text-emerald-700 dark:text-emerald-300', helper: 'Payments received' },
    { label: 'Balance / Receivable', value: summary.balance, tone: 'text-amber-700 dark:text-amber-300', helper: 'Approved minus received' },
    { label: 'Deductions', value: summary.deductions, tone: 'text-rose-700 dark:text-rose-300', helper: 'Recorded deductions' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {isAdmin && (
          <Button className="h-11 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:h-10 sm:w-auto" onClick={onAdd}>
            <Plus className="h-4 w-4" /> {addLabel}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
        {summaryCards.map((card) => (
          <Card key={card.label} className="rounded-xl shadow-sm">
            <CardContent className="p-3.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className={`mt-2 font-mono text-base font-semibold tabular-nums sm:text-lg ${card.tone}`}>
                {formatCurrency(card.value)}
              </p>
              <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{card.helper}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {bills.length === 0 ? (
        <Card className="rounded-xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <Receipt className="h-9 w-9 text-muted-foreground/70" />
            <p className="mt-3 text-sm font-medium text-foreground">{emptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">Add billing records to track approvals, receipts, deductions, and balance.</p>
            {isAdmin && (
              <Button className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onAdd}>
                <Plus className="h-4 w-4" /> Add first bill
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {bills.map((bill) => (
              <MobileBillCard
                key={bill.id}
                bill={bill}
                isAdmin={isAdmin}
                onUpdate={onUpdate}
                onRemove={onRemove}
                dateKey={dateKey}
                paidDateKey={paidDateKey}
              />
            ))}
          </div>

          <Card className="hidden overflow-hidden rounded-xl shadow-sm md:block">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="min-w-[190px]">Bill No.</TableHead>
                    <TableHead className="min-w-[150px]">Type</TableHead>
                    <TableHead className="min-w-[150px]">Date</TableHead>
                    <TableHead className="min-w-[130px] text-right">Submitted</TableHead>
                    <TableHead className="min-w-[130px] text-right">Approved</TableHead>
                    <TableHead className="min-w-[130px] text-right">Received</TableHead>
                    <TableHead className="min-w-[130px] text-right">Deductions</TableHead>
                    <TableHead className="min-w-[120px] text-right">Balance</TableHead>
                    <TableHead className="min-w-[150px]">Status</TableHead>
                    {isAdmin && <TableHead className="w-16">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => {
                    const amounts = getBillAmounts(bill)
                    return (
                      <TableRow key={bill.id} className="align-top">
                        <TableCell>
                          <div className="space-y-2">
                            <Input value={bill.no || bill.billNo || ''} onChange={(e) => onUpdate(bill.id, { no: e.target.value })} disabled={!isAdmin} placeholder="Bill no." className="h-9 font-mono" />
                            <Input value={bill.desc || bill.remarks || ''} onChange={(e) => onUpdate(bill.id, { desc: e.target.value, remarks: e.target.value })} disabled={!isAdmin} placeholder="Remarks / notes" className="h-9" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select value={bill.type || 'Running Bill'} onValueChange={(value) => onUpdate(bill.id, { type: value })} disabled={!isAdmin}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {BILL_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <Input type="date" value={bill[dateKey] || ''} onChange={(e) => onUpdate(bill.id, { [dateKey]: e.target.value })} disabled={!isAdmin} className="h-9" />
                            {paidDateKey && (
                              <Input type="date" value={bill[paidDateKey] || ''} onChange={(e) => onUpdate(bill.id, { [paidDateKey]: e.target.value })} disabled={!isAdmin} className="h-9" aria-label="Paid date" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell><BillAmountField value={bill.amount} onChange={(value) => onUpdate(bill.id, { amount: value })} disabled={!isAdmin} /></TableCell>
                        <TableCell><BillAmountField value={bill.approvedAmount} onChange={(value) => onUpdate(bill.id, { approvedAmount: value })} disabled={!isAdmin} /></TableCell>
                        <TableCell><BillAmountField value={bill.receivedAmount} onChange={(value) => onUpdate(bill.id, { receivedAmount: value })} disabled={!isAdmin} /></TableCell>
                        <TableCell><BillAmountField value={bill.deductions} onChange={(value) => onUpdate(bill.id, { deductions: value })} disabled={!isAdmin} /></TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{formatCurrency(amounts.balance)}</TableCell>
                        <TableCell>
                          <div className="mb-2">
                            <BillStatusBadge status={bill.status || 'Draft'} />
                          </div>
                          <Select value={bill.status || 'Draft'} onValueChange={(value) => onUpdate(bill.id, { status: value })} disabled={!isAdmin}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Array.from(new Set([bill.status, ...BILL_STATUS_OPTIONS].filter(Boolean))).map((status) => (
                                <SelectItem key={status} value={status}>{status}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => onRemove(bill.id)} aria-label="Delete bill">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function MobileBillCard({ bill, isAdmin, onUpdate, onRemove, dateKey, paidDateKey }) {
  const amounts = getBillAmounts(bill)
  return (
    <Card className="rounded-xl shadow-sm">
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bill No.</p>
            <Input value={bill.no || bill.billNo || ''} onChange={(e) => onUpdate(bill.id, { no: e.target.value })} disabled={!isAdmin} placeholder="Bill no." className="mt-1 h-9 font-mono" />
          </div>
          <BillStatusBadge status={bill.status || 'Draft'} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={bill.type || 'Running Bill'} onValueChange={(value) => onUpdate(bill.id, { type: value })} disabled={!isAdmin}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{BILL_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={bill.status || 'Draft'} onValueChange={(value) => onUpdate(bill.id, { status: value })} disabled={!isAdmin}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set([bill.status, ...BILL_STATUS_OPTIONS].filter(Boolean))).map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-3">
          <MobileBillAmount label="Submitted" value={amounts.submitted} />
          <MobileBillAmount label="Received" value={amounts.received} tone="profit" />
          <MobileBillAmount label="Approved" value={amounts.approved} />
          <MobileBillAmount label="Balance" value={amounts.balance} tone={amounts.balance > 0 ? 'accent' : 'profit'} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <BillField label="Submitted" type="number" value={bill.amount ?? ''} onChange={(value) => onUpdate(bill.id, { amount: value })} disabled={!isAdmin} />
          <BillField label="Approved" type="number" value={bill.approvedAmount ?? ''} onChange={(value) => onUpdate(bill.id, { approvedAmount: value })} disabled={!isAdmin} />
          <BillField label="Received" type="number" value={bill.receivedAmount ?? ''} onChange={(value) => onUpdate(bill.id, { receivedAmount: value })} disabled={!isAdmin} />
          <BillField label="Deductions" type="number" value={bill.deductions ?? ''} onChange={(value) => onUpdate(bill.id, { deductions: value })} disabled={!isAdmin} />
          <BillField label="Bill date" type="date" value={bill[dateKey] || ''} onChange={(value) => onUpdate(bill.id, { [dateKey]: value })} disabled={!isAdmin} />
          {paidDateKey && <BillField label="Paid date" type="date" value={bill[paidDateKey] || ''} onChange={(value) => onUpdate(bill.id, { [paidDateKey]: value })} disabled={!isAdmin} />}
        </div>

        <BillField label="Remarks / notes" value={bill.desc || bill.remarks || ''} onChange={(value) => onUpdate(bill.id, { desc: value, remarks: value })} disabled={!isAdmin} placeholder="Add remarks" />

        {isAdmin && (
          <div className="flex justify-end border-t pt-2">
            <Button variant="ghost" size="sm" className="h-10 w-full text-destructive sm:w-auto" onClick={() => onRemove(bill.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DocumentsManager({
  documents,
  filteredDocuments,
  documentStats,
  linkedTenderDocumentCount,
  recentUploadCount,
  documentSearch,
  setDocumentSearch,
  documentTypeFilter,
  setDocumentTypeFilter,
  addDocument,
  uploadDocumentFile,
  updateDocument,
  removeDocument,
  uploadingDocumentId,
  documentUploadProgress,
  tenderName,
  isAdmin,
}) {
  return (
    <Card className="rounded-xl border-border/80 shadow-sm">
      <CardHeader className="p-4 pb-4 md:p-6 md:pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Paperclip className="h-5 w-5 text-emerald-600" /> Documents
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage tender files, images, BOQs, work orders, and supporting records
            </p>
          </div>
          {isAdmin && (
            <Button onClick={addDocument} className="h-11 w-full bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 md:h-10 md:w-auto">
              <Plus className="h-4 w-4" /> Upload Document
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 md:space-y-5 md:p-6 md:pt-0">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
          <DocumentStat icon={FolderOpen} label="Total Documents" value={documents.length} tone="emerald" />
          <DocumentStat icon={ImageIcon} label="Images" value={documentStats.Image || 0} tone="green" />
          <DocumentStat icon={FileText} label="PDFs" value={documentStats.PDF || 0} tone="red" />
          <DocumentStat icon={LinkIcon} label="Linked Tenders" value={linkedTenderDocumentCount} tone="blue" />
          <DocumentStat icon={Upload} label="Recent Uploads" value={recentUploadCount} tone="amber" className="col-span-2 lg:col-span-1" />
        </div>

        <div className="rounded-xl border border-border/80 bg-muted/15 p-3 md:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Search documents..." className="h-11 bg-background pl-9" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin lg:pb-0">
              {DOCUMENT_TYPE_FILTERS.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDocumentTypeFilter(type)}
                  className={`h-9 flex-shrink-0 rounded-full border px-3 text-sm font-medium transition-colors ${
                    documentTypeFilter === type
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </div>

        {documents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <FolderOpen className="h-7 w-7" />
            </div>
            <p className="mt-4 text-base font-semibold text-foreground">No documents uploaded yet.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Upload tender documents, site photos, BOQs, and work orders to keep records organized.
            </p>
            {isAdmin && (
              <Button onClick={addDocument} className="mt-5 bg-emerald-600 text-white hover:bg-emerald-700">
                <Plus className="h-4 w-4" /> Upload first document
              </Button>
            )}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No documents match these filters.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different search term or file type.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredDocuments.map((item) => (
              <DocumentCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                uploadingDocumentId={uploadingDocumentId}
                documentUploadProgress={documentUploadProgress}
                uploadDocumentFile={uploadDocumentFile}
                updateDocument={updateDocument}
                removeDocument={removeDocument}
                tenderName={tenderName}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DocumentStat({ icon: Icon, label, value, tone, className = '' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  }
  return (
    <div className={`rounded-xl border border-border/80 bg-background p-3 shadow-sm md:p-4 ${className}`}>
      <div className="flex items-center gap-2.5 md:gap-3">
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl md:h-10 md:w-10 ${tones[tone] || tones.emerald}`}>
          <Icon className="h-4 w-4 md:h-5 md:w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  )
}

function DocumentCard({ item, isAdmin, uploadingDocumentId, documentUploadProgress, uploadDocumentFile, updateDocument, removeDocument, tenderName }) {
  const kind = getDocumentKind(item)
  const Icon = getDocumentIcon(kind)
  const isImage = kind === 'Image' && item.url
  const title = item.title || item.fileName || item.type || 'Untitled document'
  const date = item.uploadedAt || item.addedAt
  const uploadId = `document-upload-${item.id}`

  return (
    <Card className="overflow-hidden rounded-xl border-border/80 shadow-sm transition hover:shadow-md">
      <CardContent className="space-y-3.5 p-3.5 md:space-y-4 md:p-4">
        <div className="aspect-[16/10] overflow-hidden rounded-xl border border-border/80 bg-muted/30">
          {isImage ? (
            <img src={item.url} alt={title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background shadow-sm">
                <Icon className="h-7 w-7" />
              </div>
              <DocumentKindBadge kind={kind} />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground" title={title}>{title}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {tenderName || 'Linked tender'}{item.fileName ? ` - ${item.fileName}` : ''}
              </p>
            </div>
            <DocumentKindBadge kind={kind} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="rounded-lg bg-muted/35 p-2">
              <p className="font-medium text-foreground">Uploaded</p>
              <p className="mt-0.5">{date ? formatDate(date) : '-'}</p>
            </div>
            <div className="rounded-lg bg-muted/35 p-2">
              <p className="font-medium text-foreground">Size</p>
              <p className="mt-0.5">{formatFileSize(item.fileSize)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <input
            id={uploadId}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="sr-only"
            disabled={!isAdmin || uploadingDocumentId === item.id}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              uploadDocumentFile(item.id, file)
            }}
          />
          {isAdmin && (
            <Button variant="outline" size="sm" className="h-10 sm:h-9" asChild>
              <label htmlFor={uploadId} className="cursor-pointer">
                {uploadingDocumentId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {uploadingDocumentId === item.id ? `${documentUploadProgress[item.id] ?? 0}%` : 'Upload'}
              </label>
            </Button>
          )}
          {item.url && (
            <>
              <Button variant="outline" size="sm" className="h-10 sm:h-9" asChild>
                <a href={item.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Preview
                </a>
              </Button>
              <Button variant="outline" size="sm" className="h-10 sm:h-9" asChild>
                <a href={item.url} download={item.fileName || title}>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </Button>
            </>
          )}
          {isAdmin && (
            <Button variant="ghost" size="sm" className="h-10 text-destructive sm:h-9" onClick={() => removeDocument(item.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>

        <div className="space-y-3 border-t border-border/70 pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input value={item.title || ''} onChange={(e) => updateDocument(item.id, { title: e.target.value })} disabled={!isAdmin} placeholder="e.g. Award letter" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={item.type || 'Other'} onValueChange={(value) => updateDocument(item.id, { type: value })} disabled={!isAdmin}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input value={item.url || ''} onChange={(e) => updateDocument(item.id, { url: e.target.value })} disabled={!isAdmin} placeholder="https://..." className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={item.notes || ''} onChange={(e) => updateDocument(item.id, { notes: e.target.value })} disabled={!isAdmin} rows={2} placeholder="Optional notes about this file or link" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DocumentKindBadge({ kind }) {
  return (
    <Badge variant="outline" className={`shrink-0 rounded-full text-xs ${getDocumentTypeClasses(kind)}`}>
      {kind}
    </Badge>
  )
}

function BillAmountField({ value, onChange, disabled }) {
  return (
    <Input
      type="number"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-9 text-right font-mono tabular-nums"
      placeholder="0"
    />
  )
}

function BillField({ label, value, onChange, disabled, type = 'text', placeholder }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} className={type === 'number' ? 'font-mono tabular-nums' : ''} />
    </div>
  )
}

function MobileBillAmount({ label, value, tone }) {
  const toneClass =
    tone === 'profit'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'accent'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-foreground'
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${toneClass}`}>{formatCurrency(value)}</p>
    </div>
  )
}

function BillStatusBadge({ status }) {
  const normalized = status || 'Draft'
  const className =
    ['Paid', 'Approved'].includes(normalized)
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
      : normalized === 'Partially Paid'
        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'
        : normalized === 'Rejected'
          ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
          : ['Submitted', 'Under Review'].includes(normalized)
            ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300'
            : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300'
  return <Badge variant="outline" className={`shrink-0 rounded-full ${className}`}>{normalized}</Badge>
}

function FinancialMetric({ label, value, tone, helper }) {
  const toneClass =
    tone === 'profit'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'loss' || tone === 'expense'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground'

  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/20 p-3 md:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 break-words font-mono text-sm font-bold leading-5 tabular-nums [overflow-wrap:anywhere] sm:text-base md:text-lg ${toneClass}`}>
        {value}
      </p>
      {helper && <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>}
    </div>
  )
}
