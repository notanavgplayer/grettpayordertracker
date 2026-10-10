import { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, addDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp, deleteField, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { queueTenderIntegrationSync } from '@/lib/tenderIntegrations'
import { useAuth } from '@/context/AuthContext'
import { logActivity } from '@/lib/activity'
import { getTenderDocumentLinks, hasSupabaseStorageConfig, uploadTenderDocument } from '@/lib/supabaseStorage'
import { formatDate, formatCurrency, formatCurrencyPrecise, calculateTenderFinancials, getTenderDisplayStatus, TENDER_STATUSES, EXPENSE_CATEGORIES, PO_STATUSES, PO_PURPOSES, BANKS, uid } from '@/lib/utils'
import { nonNegativeNumber, nullableNumber, safeHttpUrl, stripUndefined } from '@/lib/data'
import { billAmounts, billDate, tenderContractValue, projectFinancials, executionState, securityAmounts, validateEvents, validateBillLedger, expenseAmounts } from '@/lib/financials'
import { billDisplayStatus, billLedger, deductionRowAmount, validateCumulativeBill, validateProjectReceiptReferences } from '@/lib/billingLedger'
import { tenderFeeExpenseNeedsSync, tenderSaveErrorMessage } from '@/lib/tenderSave'
import BillActionDialog, { BillStageActions } from '@/components/tenders/BillActionDialog'
import { rowsToCSV } from '@/lib/csv'
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
import KpiCard from '@/components/shared/KpiCard'
import DeadlineBadge from '@/components/shared/DeadlineBadge'
import TenderExpenseDialog from '@/components/tenders/TenderExpenseDialog'
import TenderPayOrderSheet from '@/components/tenders/TenderPayOrderSheet'
import SiteVisitSheet from '@/components/tenders/SiteVisitSheet'
import AwardWorkOrderSheet from '@/components/tenders/AwardWorkOrderSheet'
import BillEditorDialog from '@/components/tenders/BillEditorDialog'
import { getInvalidBillAmount } from '@/lib/billValidation'
import { getInvalidAwardField } from '@/lib/awardValidation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ArrowLeft, Save, Plus, Trash2, Pencil, Loader2, CheckSquare, CheckCircle,
  DollarSign, History, User, Receipt, FileText, Printer, Paperclip, ExternalLink,
  Banknote, CalendarDays, ClipboardList, FolderOpen, Landmark, WalletCards,
  Hash, Link as LinkIcon, Upload, Download, ChevronDown, BarChart3, PieChart,
  Search, Image as ImageIcon, FileSpreadsheet, FileType2, Clock, Eye, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { getTenderDeadline } from '@/lib/tenderDeadlines'

const EMPTY_EXP = { description: '', category: EXPENSE_CATEGORIES[0], amount: '', calculationMethod: 'manual', amountBasis: 'manual', percentage: '', date: '', note: '', v2: { kind: 'cost', payee: '', invoice: '', boqItemId: '', payments: [] } }
const EMPTY_PO = { po: '', bank: '', amount: '', purpose: 'Bid Security', status: 'Pending', submitted: '', notes: '', v2: { instrument: 'pay-order', refunds: [] } }
const SITE_VISIT_STATUSES = ['Completed', 'Partial', 'Issue']
const EXPENSE_CALC_SOURCE_PREFIX = 'tdx'
const UNSUPPORTED_EXPENSE_DOC_FIELDS = [
  'calculationMethod',
  'amountBasis',
  'baseAmount',
  'percentage',
  'calculatedAmount',
  'grossAmount',
  'deductionAmount',
  'netAmount',
  'deductionType',
]
const EMPTY_SITE_VISIT = {
  id: '',
  visitDate: '',
  visitTime: '',
  location: '',
  workCompleted: '',
  labourUsed: '',
  materialUsed: '',
  issues: '',
  nextDayPlan: '',
  notes: '',
  status: 'Completed',
  photos: [],
}
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
const AWARD_STATUSES = ['Not Awarded', 'Awarded', 'Work Order Issued', 'In Progress', 'Completed', 'Closed']
const EMPTY_AWARD_WORK_ORDER = {
  awardStatus: 'Not Awarded',
  awardDate: '',
  workOrderNumber: '',
  workOrderDate: '',
  contractValue: '',
  departmentReference: '',
  startDate: '',
  completionPeriod: '',
  expectedCompletionDate: '',
  actualCompletionDate: '',
  extensionGranted: 'No',
  extensionDays: '',
  extensionRemarks: '',
  performanceSecurityAmount: '',
  performanceSecurityType: '',
  performanceSecurityExpiryDate: '',
  retentionPercentage: '',
  srbPercentage: '',
  incomeTaxPercentage: '',
  retentionAmount: '',
  mobilizationAdvance: '',
  siteHandoverDate: '',
  engineerContact: '',
  contractorRepresentative: '',
  executionStatus: '',
  remarks: '',
}
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
const MISSING_VALUE = '\u2014'

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
    PDF: 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
    Image: 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    Excel: 'border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300',
    Word: 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    Other: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300',
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
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...payload } = form
  const data = {
    ...payload,
    value: Number(fallbackValue) || 0,
    estimatedCost: nullableNumber(payload.estimatedCost),
    quotedAmount: nullableNumber(payload.quotedAmount),
    tenderFee: Number(fallbackTenderFee) || 0,
    documents: sanitizeStoredAssets(payload.documents || []),
    siteVisits: (payload.siteVisits || []).map((visit) => ({
      ...visit,
      photos: sanitizeStoredAssets(visit.photos || []),
    })),
  }
  return stripUndefined(data)
}

function sanitizeStoredAssets(items = []) {
  return items.map((item) => {
    if (item?.storagePath) return { ...item, url: '', fileUrl: '', downloadUrl: '', urlExpiresAt: null }
    const url = safeHttpUrl(item?.url || item?.fileUrl || '')
    return { ...item, url, fileUrl: url }
  })
}

async function hydrateStoredAssets(tender) {
  const urlCache = new Map()
  const resolveAsset = async (asset, identity) => {
    if (!asset?.storagePath) return asset
    const key = JSON.stringify(identity)
    if (!urlCache.has(key)) {
      urlCache.set(key, getTenderDocumentLinks(identity).catch(() => null))
    }
    const links = await urlCache.get(key)
    return links ? { ...asset, url: links.url, fileUrl: links.url, downloadUrl: links.downloadUrl, urlExpiresAt: Date.now() + 14 * 60 * 1000 }
      : { ...asset, url: '', fileUrl: '', downloadUrl: '', urlExpiresAt: null }
  }
  const documents = await Promise.all((tender.documents || []).map((asset, index) => resolveAsset(asset, {
    tenderId: tender.id, documentId: asset.id || `${tender.id}-${index}`,
  })))
  const siteVisits = await Promise.all((tender.siteVisits || []).map(async (visit, visitIndex) => ({
    ...visit,
    photos: await Promise.all((visit.photos || []).map((asset, photoIndex) => resolveAsset(asset, {
      tenderId: tender.id, documentId: asset.id || `${visit.id || `${tender.id}-visit-${visitIndex}`}-photo-${photoIndex}`,
      assetType: 'site-visit-photo', siteVisitId: visit.id || `${tender.id}-visit-${visitIndex}`,
    }))),
  })))
  return { ...tender, documents, siteVisits }
}

function toBillNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getBillAmounts(bill = {}) {
  return billAmounts(bill)
}

function getBillDate(bill = {}) {
  return billDate(bill)
}

function getBillTitle(bill = {}, fallback = 'Bill') {
  return bill.no || bill.billNo || bill.desc || fallback
}

function getEnteredNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getBoqActualCost(item = {}) {
  return getEnteredNumber(item.actualCost)
}

function getBoqProfitTone(value) {
  if (value === null || value === undefined) return 'pending'
  if (value < 0) return 'loss'
  if (value > 0) return 'profit'
  return 'neutral'
}

function getBillSummary(bills = []) {
  return bills.reduce((summary, bill) => {
    const amounts = getBillAmounts(bill)
    return {
      submitted: summary.submitted + amounts.submitted,
      approved: summary.approved + amounts.approved,
      received: summary.received + (amounts.received ?? 0),
      deductions: summary.deductions + amounts.deductions,
      balance: amounts.balance === null || summary.balance === null ? null : summary.balance + amounts.balance,
      unknownReceiptCount: summary.unknownReceiptCount + (amounts.approved > 0 && !amounts.receiptHistoryKnown ? 1 : 0),
    }
  }, { submitted: 0, approved: 0, received: 0, deductions: 0, balance: 0, unknownReceiptCount: 0 })
}

function addDaysToDate(dateValue, daysValue) {
  if (!dateValue || !daysValue) return ''
  const date = new Date(dateValue)
  const days = Number(daysValue)
  if (Number.isNaN(date.getTime()) || !Number.isFinite(days)) return ''
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function getAwardWorkOrderDetails(form = {}) {
  const stored = form.awardWorkOrder || form.award || form.workOrder || {}
  const contractValue = stored.contractValue ?? form.contractValue ?? form.awardedValue ?? ''
  const startDate = stored.startDate ?? form.startDate ?? ''
  const completionPeriod = stored.completionPeriod ?? form.completionPeriod ?? ''
  const calculatedCompletionDate = addDaysToDate(startDate, completionPeriod)
  const retentionPercentage = stored.retentionPercentage ?? ''
  const retentionAmount = stored.retentionAmount || (
    Number(contractValue) > 0 && Number(retentionPercentage) > 0
      ? String((Number(contractValue) * Number(retentionPercentage)) / 100)
      : ''
  )

  return {
    ...EMPTY_AWARD_WORK_ORDER,
    ...stored,
    awardStatus: executionState(form) === 'Completed' ? 'Completed' : stored.awardStatus || stored.status || (['Awarded', 'In Progress'].includes(form.status) ? form.status : 'Not Awarded'),
    contractValue,
    startDate,
    completionPeriod,
    expectedCompletionDate: stored.expectedCompletionDate || form.expectedCompletionDate || calculatedCompletionDate || '',
    actualCompletionDate: stored.actualCompletionDate || form.completionDate || '',
    retentionAmount,
  }
}

function getAwardStatusClass(status) {
  if (status === 'Completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
  if (status === 'Closed') return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300'
  if (status === 'In Progress') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'
  if (status === 'Work Order Issued') return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300'
  if (status === 'Awarded') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300'
  return 'border-muted bg-muted/40 text-muted-foreground'
}

function getAwardTimelineSummary(details = {}) {
  const expected = details.expectedCompletionDate ? new Date(details.expectedCompletionDate) : null
  if (!expected || Number.isNaN(expected.getTime())) return { label: '-', helper: 'No expected completion date', tone: 'neutral' }
  if (['Completed', 'Closed'].includes(details.awardStatus)) return { label: details.actualCompletionDate ? 'Completed' : 'Completion date missing', helper: details.actualCompletionDate ? formatDate(details.actualCompletionDate) : 'Review closeout record', tone: details.actualCompletionDate ? 'profit' : 'loss' }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  expected.setHours(0, 0, 0, 0)
  const diffDays = Math.ceil((expected.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return { label: `${Math.abs(diffDays)} days overdue`, helper: `Expected ${formatDate(details.expectedCompletionDate)}`, tone: 'loss' }
  if (diffDays === 0) return { label: 'Due today', helper: `Expected ${formatDate(details.expectedCompletionDate)}`, tone: 'accent' }
  return { label: `${diffDays} days remaining`, helper: `Expected ${formatDate(details.expectedCompletionDate)}`, tone: 'profit' }
}

function firstFiniteAmount(...values) {
  for (const value of values) {
    if (value === '' || value === null || value === undefined) continue
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return 0
}

function optionalFiniteAmount(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function compactFiniteAmount(value) {
  const number = optionalFiniteAmount(value)
  if (number === null) return ''
  return Number(number.toFixed(6)).toString()
}

function getTenderGrossNetValues(tender = {}) {
  const grossValue = optionalFiniteAmount(tender.grossValue)
    ?? tenderContractValue(tender)
    ?? optionalFiniteAmount(tender.quotedAmount)
  const netValue = optionalFiniteAmount(tender.netValue) ?? optionalFiniteAmount(tender.netAmount)
  return {
    grossValue,
    netValue,
    difference: grossValue === null || netValue === null ? null : grossValue - netValue,
  }
}

function getExpensePreviewBaseAmount(amountBasis, tenderValues = {}) {
  if (amountBasis === 'gross') return firstFiniteAmount(tenderValues.grossValue, 0)
  if (amountBasis === 'net') return firstFiniteAmount(tenderValues.netValue, 0)
  return null
}

function getExpenseCalcSource(expense = {}) {
  if (typeof expense.source !== 'string' || !expense.source.startsWith(`${EXPENSE_CALC_SOURCE_PREFIX}|`)) return {}
  const [, methodCode, basisCode, percentageValue, baseAmountValue, calculatedAmountValue] = expense.source.split('|')
  const amountBasis = basisCode === 'g' ? 'gross' : basisCode === 'n' ? 'net' : 'manual'
  return {
    calculationMethod: methodCode === 'p' ? 'percentage' : 'manual',
    amountBasis,
    percentage: amountBasis === 'manual' ? null : optionalFiniteAmount(percentageValue),
    baseAmount: amountBasis === 'manual' ? null : optionalFiniteAmount(baseAmountValue),
    calculatedAmount: optionalFiniteAmount(calculatedAmountValue),
  }
}

function normalizeExpenseCalculation(expense = {}, tenderValues = {}) {
  const parsed = getExpenseCalcSource(expense)
  const calculationMethod = (expense.calculationMethod || parsed.calculationMethod) === 'percentage' ? 'percentage' : 'manual'
  const rawBasis = expense.amountBasis || parsed.amountBasis
  const amountBasis = ['gross', 'net', 'manual'].includes(rawBasis) ? rawBasis : 'manual'
  const amount = firstFiniteAmount(expense.amount, parsed.calculatedAmount, 0)
  const baseCandidate = optionalFiniteAmount(expense.baseAmount) ?? parsed.baseAmount ?? getExpensePreviewBaseAmount(amountBasis, tenderValues)
  const baseAmount = amountBasis === 'manual' ? null : optionalFiniteAmount(baseCandidate)
  const enteredPercentage = optionalFiniteAmount(expense.percentage) ?? parsed.percentage ?? optionalFiniteAmount(expense.previewPercentage)
  let percentage = amountBasis === 'manual' ? null : enteredPercentage
  let calculatedAmount = amount

  if (calculationMethod === 'percentage') {
    percentage = optionalFiniteAmount(enteredPercentage) ?? 0
    calculatedAmount = baseAmount && baseAmount > 0 ? (baseAmount * percentage) / 100 : amount
  } else if (amountBasis !== 'manual') {
    percentage = baseAmount && baseAmount > 0 ? (amount / baseAmount) * 100 : null
  }

  const safeCalculatedAmount = Number.isFinite(calculatedAmount) ? calculatedAmount : amount
  return {
    calculationMethod,
    amountBasis,
    baseAmount,
    percentage: Number.isFinite(percentage) ? percentage : null,
    calculatedAmount: safeCalculatedAmount,
    amount: safeCalculatedAmount,
  }
}

function encodeExpenseCalcSource(calculation = {}) {
  const methodCode = calculation.calculationMethod === 'percentage' ? 'p' : 'm'
  const basisCode = calculation.amountBasis === 'gross' ? 'g' : calculation.amountBasis === 'net' ? 'n' : 'm'
  return [
    EXPENSE_CALC_SOURCE_PREFIX,
    methodCode,
    basisCode,
    compactFiniteAmount(calculation.percentage),
    compactFiniteAmount(calculation.baseAmount),
    compactFiniteAmount(calculation.calculatedAmount),
  ].join('|')
}

function hydrateExpenseCalculation(expense = {}, tenderValues = {}) {
  const calculation = normalizeExpenseCalculation(expense, tenderValues)
  return {
    ...expense,
    calculationMethod: calculation.calculationMethod,
    amountBasis: calculation.amountBasis,
    baseAmount: calculation.baseAmount,
    percentage: calculation.percentage,
    calculatedAmount: calculation.calculatedAmount,
  }
}

function getUnsupportedExpenseFieldDeletes(expense = {}) {
  return Object.fromEntries(
    UNSUPPORTED_EXPENSE_DOC_FIELDS
      .filter((field) => field in expense)
      .map((field) => [field, deleteField()])
  )
}

function getExpenseBasisLabel(amountBasis) {
  if (amountBasis === 'gross') return 'Gross'
  if (amountBasis === 'net') return 'Net'
  return 'Manual'
}

function formatExpensePercent(value) {
  if (value === '' || value === null || value === undefined) return '—'
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : '—'
}

function getExpenseCalculationPreview(expense = {}, tenderValues = {}) {
  return normalizeExpenseCalculation(expense, tenderValues)
}

function formatPreviewPercent(value) {
  if (value === '' || value === null || value === undefined) return '—'
  const number = Number(value)
  return Number.isFinite(number) ? `${number.toFixed(2)}%` : '—'
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
  const [grossNetDialogOpen, setGrossNetDialogOpen] = useState(false)
  const [grossNetForm, setGrossNetForm] = useState({ grossValue: '', netValue: '' })
  const [grossNetSaving, setGrossNetSaving] = useState(false)
  const [viewExpense, setViewExpense] = useState(null)
  const [expenseSearch, setExpenseSearch] = useState('')
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('All')
  const [expenseDateFrom, setExpenseDateFrom] = useState('')
  const [expenseDateTo, setExpenseDateTo] = useState('')
  const [poDialogOpen, setPoDialogOpen] = useState(false)
  const [editPo, setEditPo] = useState(null)
  const [poForm, setPoForm] = useState(EMPTY_PO)
  const [poSaving, setPoSaving] = useState(false)
  const [deletePoId, setDeletePoId] = useState(null)
  const [poRefresh, setPoRefresh] = useState(0)
  const [siteVisitDialogOpen, setSiteVisitDialogOpen] = useState(false)
  const [editSiteVisit, setEditSiteVisit] = useState(null)
  const [viewSiteVisit, setViewSiteVisit] = useState(null)
  const [siteVisitForm, setSiteVisitForm] = useState(EMPTY_SITE_VISIT)
  const [deleteSiteVisitId, setDeleteSiteVisitId] = useState(null)
  const [siteVisitPhotoUploading, setSiteVisitPhotoUploading] = useState(false)
  const [siteVisitPhotoProgress, setSiteVisitPhotoProgress] = useState(0)
  const [siteVisitPhotoError, setSiteVisitPhotoError] = useState('')
  const [siteVisitPhotoPreview, setSiteVisitPhotoPreview] = useState({ photos: [], index: 0 })
  const [awardDialogOpen, setAwardDialogOpen] = useState(false)
  const [awardForm, setAwardForm] = useState(EMPTY_AWARD_WORK_ORDER)
  const [expectedCompletionManuallyEdited, setExpectedCompletionManuallyEdited] = useState(false)
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
  const [activeTenderTab, setActiveTenderTab] = useState('overview')
  const autoSaveTimerRef = useRef(null)
  const autoSavePayloadRef = useRef({})
  const tenderIdRef = useRef(id)
  const loadGenerationRef = useRef(0)

  useEffect(() => {
    const generation = ++loadGenerationRef.current
    tenderIdRef.current = id
    setLoading(true)
    setTender(null)
    setExpenses([])
    setLinkedPOs([])
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, 'tenders', id))
        if (generation !== loadGenerationRef.current) return
        if (!snap.exists()) { navigate('/tenders'); return }
        const data = await hydrateStoredAssets({ ...snap.data(), id: snap.id })
        setTender(data)
        setForm(data)
      } catch {
        if (generation !== loadGenerationRef.current) return
        toast.error('Failed to load tender')
      } finally {
        if (generation === loadGenerationRef.current) setLoading(false)
      }
    }
    load()
  }, [id, navigate])

  const flushAutoSave = useCallback(async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    const payload = { ...autoSavePayloadRef.current }
    if (Object.keys(payload).length === 0) {
      setAutoSaving(false)
      return true
    }
    setAutoSaving(true)
    try {
      await updateDoc(doc(db, 'tenders', tenderIdRef.current), { ...payload, updatedAt: serverTimestamp() })
      if (['name', 'nit', 'agency', 'submissionDate', 'status'].some((key) => key in payload)) queueTenderIntegrationSync(tenderIdRef.current)
      for (const [key, value] of Object.entries(payload)) {
        if (autoSavePayloadRef.current[key] === value) delete autoSavePayloadRef.current[key]
      }
      setTender((prev) => prev ? { ...prev, ...payload } : prev)
      setAutoSaveError(false)
      return true
    } catch (err) {
      console.error('Failed to auto-save tender work item:', err)
      setAutoSaveError(true)
      setDirty(true)
      toast.error('Auto-save failed. Try Save Changes before leaving.')
      return false
    } finally {
      setAutoSaving(false)
    }
  }, [])

  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (Object.keys(autoSavePayloadRef.current).length === 0) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload)
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      if (Object.keys(autoSavePayloadRef.current).length > 0) void flushAutoSave()
    }
  }, [flushAutoSave])

  useEffect(() => {
    const loadExpenses = async () => {
      try {
        const q1 = query(collection(db, 'expenses'), where('tenderRef', '==', id))
        const snap = await getDocs(q1)
        setExpenses(snap.docs.map((d) => hydrateExpenseCalculation({ ...d.data(), id: d.id })))
      } catch (err) {
        console.error('Failed to load expenses:', err)
        toast.error('Failed to load expenses')
      }
    }
    loadExpenses()
  }, [id, expRefresh])

  useEffect(() => {
    const loadPOs = async () => {
      if (!tender) return
      try {
        // Primary: exact tenderRef match
        const snap = await getDocs(query(collection(db, 'payOrders'), where('tenderRef', '==', id)))
        const matched = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
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
    () => expenses.filter((e) => e.category !== 'Tender Fees').reduce((s, e) => s + expenseAmounts(e).incurred, 0),
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

  const openGrossNetDialog = () => {
    const values = getTenderGrossNetValues(form)
    setGrossNetForm({
      grossValue: String(values.grossValue || ''),
      netValue: values.netValue === null ? '' : String(values.netValue),
    })
    setGrossNetDialogOpen(true)
  }

  const saveGrossNetValues = async () => {
    setGrossNetSaving(true)
    try {
      const grossValue = firstFiniteAmount(grossNetForm.grossValue, getTenderGrossNetValues(form).grossValue, 0)
      const netValue = optionalFiniteAmount(grossNetForm.netValue)
      const payload = { grossValue, netValue, updatedAt: serverTimestamp() }
      await updateDoc(doc(db, 'tenders', id), payload)
      setForm((previous) => ({ ...previous, grossValue, netValue }))
      setTender((previous) => previous ? { ...previous, grossValue, netValue } : previous)
      setGrossNetDialogOpen(false)
      toast.success('Gross / Net values updated')
    } catch (error) {
      console.error('Failed to save gross/net values:', error)
      toast.error('Failed to save Gross / Net values')
    } finally {
      setGrossNetSaving(false)
    }
  }

  const openExpDialog = (item = null) => {
    setEditExp(item)
    const calculation = normalizeExpenseCalculation(item || {}, getTenderGrossNetValues(form))
    setExpForm(item
      ? {
          description: item.description || '',
          category: item.category || EXPENSE_CATEGORIES[0],
          amount: item.amount ?? calculation.amount,
          calculationMethod: calculation.calculationMethod,
          amountBasis: calculation.amountBasis,
          percentage: calculation.percentage ?? '',
          date: item.date || '',
          note: item.note || '',
          v2: { ...EMPTY_EXP.v2, ...item.v2, payments: item.v2?.payments },
        }
      : { ...EMPTY_EXP, v2: { ...EMPTY_EXP.v2 }, date: new Date().toISOString().slice(0, 10) })
    setExpDialogOpen(true)
  }

  const saveExpense = async () => {
    if (!expForm.description.trim()) { toast.error('Description is required'); return }
    if (expForm.calculationMethod !== 'percentage' && nonNegativeNumber(expForm.amount) === null) {
      toast.error('Enter a valid expense amount of zero or more')
      return
    }
    if (expForm.calculationMethod === 'percentage' && nonNegativeNumber(expForm.percentage) === null) {
      toast.error('Enter a valid percentage of zero or more')
      return
    }
    setExpSaving(true)
    try {
      const calculation = normalizeExpenseCalculation(expForm, getTenderGrossNetValues(form))
      const paymentIssue = validateEvents(expForm.v2?.payments || [], calculation.amount)
      if (paymentIssue) { toast.error(paymentIssue); return }
      const { payments, ...otherV2 } = expForm.v2 || {}
      const payload = {
        description: expForm.description.trim(),
        category: expForm.category,
        amount: calculation.amount,
        date: expForm.date || new Date().toISOString().slice(0, 10),
        note: expForm.note || '',
        tenderId: (tender?.nit || id),
        tenderRef: id,
        source: encodeExpenseCalcSource(calculation),
        v2: payments === undefined ? otherV2 : { ...otherV2, payments },
        updatedAt: serverTimestamp(),
      }
      const uiExpense = hydrateExpenseCalculation({ ...payload, ...calculation }, getTenderGrossNetValues(form))
      if (editExp) {
        await updateDoc(doc(db, 'expenses', editExp.id), { ...payload, ...getUnsupportedExpenseFieldDeletes(editExp) })
        setExpenses((previous) => previous.map((expense) => (
          expense.id === editExp.id ? { ...expense, ...uiExpense } : expense
        )))
        toast.success('Expense updated')
      } else {
        const ref = await addDoc(collection(db, 'expenses'), { ...payload, createdAt: serverTimestamp() })
        setExpenses((previous) => [{ id: ref.id, ...uiExpense }, ...previous])
        toast.success('Expense added')
      }
      setExpDialogOpen(false)
    } catch (error) {
      console.error('Tender Detail expense save failed', {
        error,
        message: error?.message,
        code: error?.code,
      })
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
      setExpenses((previous) => previous.filter((expense) => expense.id !== deleteExpId))
      setDeleteExpId(null)
    } catch {
      toast.error('Failed to delete')
    }
  }

  const setExpF = (k) => (e) => {
    const value = e.target?.value ?? e
    setExpForm((previous) => {
      const next = { ...previous, [k]: value }
      const method = next.calculationMethod === 'percentage' ? 'percentage' : 'manual'
      const basis = ['gross', 'net', 'manual'].includes(next.amountBasis) ? next.amountBasis : 'manual'
      if (method === 'percentage' && basis !== 'manual' && ['calculationMethod', 'amountBasis', 'percentage'].includes(k)) {
        const baseAmount = getExpensePreviewBaseAmount(basis, getTenderGrossNetValues(form))
        const percentage = firstFiniteAmount(next.percentage, 0)
        next.amount = baseAmount ? String((baseAmount * percentage) / 100) : '0'
      }
      return next
    })
  }

  // --- Pay Order CRUD (writes to payOrders collection with tenderRef=id) ---
  const openPoDialog = (item = null, defaultPurpose = null) => {
    setEditPo(item)
    setPoForm(item
      ? { po: item.po || '', bank: item.bank || '', amount: item.amount || '', purpose: item.purpose || 'Bid Security', status: item.status || 'Pending', submitted: item.submitted || '', notes: item.notes || '', v2: { ...EMPTY_PO.v2, ...item.v2 } }
      : { ...EMPTY_PO, v2: { ...EMPTY_PO.v2 }, purpose: defaultPurpose || EMPTY_PO.purpose, submitted: new Date().toISOString().slice(0, 10) })
    setPoDialogOpen(true)
  }
  const savePo = async () => {
    if (!poForm.po.trim()) {
      toast.error('PO number is required')
      window.requestAnimationFrame(() => document.getElementById('td-po-num')?.focus())
      return
    }
    const amountNum = nonNegativeNumber(poForm.amount)
    if (amountNum === null) {
      toast.error('Amount must be a non-negative number')
      window.requestAnimationFrame(() => document.getElementById('td-po-amt')?.focus())
      return
    }
    const refundIssue = validateEvents(poForm.v2.refunds || [], securityAmounts(poForm).funded ?? 0)
    if (refundIssue) { toast.error(refundIssue); return }
    setPoSaving(true)
    try {
      const matchingNumbers = await getDocs(query(collection(db, 'payOrders'), where('po', '==', poForm.po.trim())))
      if (matchingNumbers.docs.some((item) => item.id !== editPo?.id)) { toast.error('This pay order number already exists. Open and link the existing instrument instead.'); return }
      const payload = {
        po: poForm.po.trim(),
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
        bidResult: editPo?.bidResult || 'N/A',
        v2: poForm.v2,
        updatedAt: serverTimestamp(),
      }
      const batch = writeBatch(db)
      if (editPo) {
        batch.update(doc(db, 'payOrders', editPo.id), payload)
      } else {
        batch.set(doc(collection(db, 'payOrders')), { ...payload, createdAt: serverTimestamp() })
      }
      // Mirror bid security amount to tender doc for display
      if (poForm.purpose === 'Bid Security' && amountNum > 0) {
        batch.update(doc(db, 'tenders', id), { bidSecurity: amountNum, updatedAt: serverTimestamp() })
      }
      await batch.commit()
      toast.success(editPo ? 'Pay order updated' : 'Pay order added')
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
    const sanitizedPatch = {
      ...patch,
      ...(patch.documents ? { documents: sanitizeStoredAssets(patch.documents) } : {}),
      ...(patch.siteVisits ? { siteVisits: patch.siteVisits.map((visit) => ({ ...visit, photos: sanitizeStoredAssets(visit.photos || []) })) } : {}),
    }
    autoSavePayloadRef.current = {
      ...autoSavePayloadRef.current,
      ...stripUndefined(sanitizedPatch),
    }
    setAutoSaving(true)
    setAutoSaveError(false)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => void flushAutoSave(), 700)
  }

  const updateAutosavedForm = (key, value) => {
    const nextValue = typeof value === 'function' ? value(form[key], form) : value
    setForm((prev) => ({ ...prev, [key]: nextValue }))
    scheduleAutoSave({ [key]: nextValue })
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
      await flushAutoSave()
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

      // Commit the tender, its fee expense, and deterministic lifecycle updates
      // together so a network failure cannot leave partially updated records.
      const batch = writeBatch(db)
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
      const syncFeeExpense = tenderFeeExpenseNeedsSync(tender, form)
      const existingExpRef = existingExpId ? doc(db, 'expenses', existingExpId) : null
      const linkedExpenseExists = syncFeeExpense && existingExpRef ? (await getDoc(existingExpRef)).exists() : false
      if (syncFeeExpense && tenderFeeNum > 0 && linkedExpenseExists) {
        batch.update(existingExpRef, expPayload)
      } else if (syncFeeExpense && tenderFeeNum > 0 && !linkedExpenseExists) {
        const ref = doc(collection(db, 'expenses'))
        batch.set(ref, { ...expPayload, createdAt: serverTimestamp() })
        data.tenderFeeExpenseId = ref.id
      } else if (syncFeeExpense && tenderFeeNum <= 0 && linkedExpenseExists) {
        batch.delete(existingExpRef)
        data.tenderFeeExpenseId = null
      } else if (syncFeeExpense && tenderFeeNum <= 0 && existingExpId) {
        data.tenderFeeExpenseId = null
      }

      let transitionedPayOrders = 0
      if (tender.status !== form.status) {
        // Awarding a tender holds its active guarantees. Lost/cancelled tenders
        // deliberately do not mark money returned: that requires confirmation
        // that a refund actually occurred.
        const transitions = {
          Awarded: { purposes: ['Bid Security', 'Performance Guarantee'], newStatus: 'Held', from: ['Pending', 'Submitted'] },
        }
        const rule = transitions[form.status]
        if (rule) {
          const affected = linkedPOs.filter((p) => rule.purposes.includes(p.purpose) && rule.from.includes(p.status))
          affected.forEach((p) => batch.update(doc(db, 'payOrders', p.id), { status: rule.newStatus, updatedAt: serverTimestamp() }))
          transitionedPayOrders = affected.length
        }
      }
      batch.update(doc(db, 'tenders', id), { ...data, updatedAt: serverTimestamp() })
      await batch.commit()
      queueTenderIntegrationSync(id)
      if (transitionedPayOrders > 0) {
        toast.info(`${transitionedPayOrders} pay order(s) marked Held`)
        setPoRefresh((n) => n + 1)
      }

      setTender(data)
      setForm(data)
      setDirty(false)
      toast.success('Tender saved')
    } catch (err) {
      toast.error(tenderSaveErrorMessage(err))
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
        awardWorkOrder: { ...(form.awardWorkOrder || {}), awardStatus: 'Completed', actualCompletionDate: completionDate },
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
      queueTenderIntegrationSync(id)
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
      toast.error('The tender could not be completed. Check your connection and permissions, then try again.')
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
  const addBill = (bill = {}) => {
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
        ...bill,
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
  const addRABill = (bill = {}) => {
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
        ...bill,
      },
    ])
  }
  const updateRABill = (billId, patch) => {
    updateAutosavedForm('raBills', (items = []) => items.map((b) => b.id === billId ? { ...b, ...patch } : b))
  }
  const removeRABill = (billId) => {
    updateAutosavedForm('raBills', (items = []) => items.filter((b) => b.id !== billId))
  }

  const addDocument = (document = {}) => {
    updateAutosavedForm('documents', (items = []) => [
      ...items,
      {
        id: document.id || uid(),
        title: '',
        type: 'Other',
        url: '',
        notes: '',
        addedAt: new Date().toISOString().slice(0, 10),
        ...document,
      },
    ])
  }
  const updateDocument = (documentId, patch) => {
    updateAutosavedForm('documents', (items = []) => items.map((item) => item.id === documentId ? { ...item, ...patch } : item))
  }
  const removeDocument = (documentId) => {
    updateAutosavedForm('documents', (items = []) => items.filter((item) => item.id !== documentId))
  }

  const uploadDocumentAsset = async (documentId, file) => {
    if (!file) return null
    setUploadingDocumentId(documentId)
    setDocumentUploadProgress((prev) => ({ ...prev, [documentId]: 0 }))
    try {
      const uploaded = await uploadTenderDocument({
        tenderId: id,
        documentId,
        file,
        onProgress: (progress) => setDocumentUploadProgress((prev) => ({ ...prev, [documentId]: progress })),
      })
      return {
        url: uploaded.url,
        fileName: file.name,
        fileType: file.type || '',
        fileSize: file.size,
        storageProvider: 'supabase',
        storageBucket: uploaded.bucket,
        storagePath: uploaded.path,
        uploadedAt: new Date().toISOString().slice(0, 10),
      }
    } catch (err) {
      toast.error(err?.message || 'The file could not be uploaded. Please retry.')
      return null
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

  // Site Visits — stored on the tender doc under `siteVisits`. Autosaved.
  const openSiteVisitDialog = (item = null) => {
    setViewSiteVisit(null)
    setEditSiteVisit(item)
    setSiteVisitPhotoError('')
    setSiteVisitPhotoProgress(0)
    setSiteVisitForm(item
      ? {
          id: item.id || uid(),
          visitDate: item.visitDate || item.date || '',
          visitTime: item.visitTime || item.time || item.visit_time || '',
          location: item.location || '',
          workCompleted: item.workCompleted || '',
          labourUsed: item.labourUsed || '',
          materialUsed: item.materialUsed || '',
          issues: item.issues || '',
          nextDayPlan: item.nextDayPlan || '',
          notes: item.notes || '',
          status: item.status || 'Completed',
          photos: normalizeSiteVisitPhotos(item.photos),
        }
      : { ...EMPTY_SITE_VISIT, id: uid(), visitDate: new Date().toISOString().slice(0, 10), photos: [] })
    setSiteVisitDialogOpen(true)
  }
  const saveSiteVisit = () => {
    if (!siteVisitForm.visitDate) { toast.error('Visit date is required'); return }
    const nowIso = new Date().toISOString()
    const payload = { ...siteVisitForm, id: siteVisitForm.id || editSiteVisit?.id || uid(), photos: normalizeSiteVisitPhotos(siteVisitForm.photos) }
    if (editSiteVisit && editSiteVisit.id) {
      updateAutosavedForm('siteVisits', (items = []) => items.map((v) =>
        v.id === editSiteVisit.id ? { ...v, ...payload, updatedAt: nowIso } : v
      ))
      toast.success('Site visit updated')
    } else {
      const newItem = { ...payload, createdAt: nowIso, updatedAt: nowIso }
      updateAutosavedForm('siteVisits', (items = []) => [...items, newItem])
      toast.success('Site visit added')
    }
    setSiteVisitDialogOpen(false)
  }
  const removeSiteVisit = () => {
    if (!deleteSiteVisitId) return
    updateAutosavedForm('siteVisits', (items = []) => items.filter((v) => v.id !== deleteSiteVisitId))
    toast.success('Site visit deleted')
    setDeleteSiteVisitId(null)
  }
  const setSiteVisitF = (k) => (e) => setSiteVisitForm((p) => ({ ...p, [k]: e.target?.value ?? e }))
  const uploadSiteVisitPhotos = async (files) => {
    const imageFiles = Array.from(files || []).filter((file) => /^image\/(jpeg|jpg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name))
    if (!imageFiles.length) {
      if (files?.length) {
        const message = 'Please select JPG, PNG, or WEBP photos.'
        setSiteVisitPhotoError(message)
        toast.error(message)
      }
      return
    }
    if (!hasSupabaseStorageConfig()) {
      setSiteVisitPhotoError('Photo upload storage is not configured.')
      toast.error('Photo upload storage is not configured.')
      return
    }
    const visitId = siteVisitForm.id || uid()
    setSiteVisitForm((previous) => ({ ...previous, id: previous.id || visitId }))
    setSiteVisitPhotoUploading(true)
    setSiteVisitPhotoError('')
    setSiteVisitPhotoProgress(0)
    try {
      const uploadedPhotos = []
      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index]
        const photoId = uid()
        const uploaded = await uploadTenderDocument({
          tenderId: id,
          documentId: `site-visit-${visitId}-${photoId}`,
          file,
          onProgress: (progress) => {
            const completed = index / imageFiles.length
            const current = progress / 100 / imageFiles.length
            setSiteVisitPhotoProgress(Math.round((completed + current) * 100))
          },
        })
        uploadedPhotos.push({
          id: photoId,
          url: uploaded.url,
          fileUrl: uploaded.url,
          name: file.name,
          fileName: file.name,
          size: file.size,
          fileSize: file.size,
          type: file.type || '',
          mimeType: file.type || '',
          storageProvider: 'supabase',
          storageBucket: uploaded.bucket,
          storagePath: uploaded.path,
          caption: '',
          uploadedAt: new Date().toISOString(),
        })
      }
      setSiteVisitForm((previous) => ({
        ...previous,
        photos: [...normalizeSiteVisitPhotos(previous.photos), ...uploadedPhotos],
      }))
      toast.success(`${uploadedPhotos.length} photo${uploadedPhotos.length === 1 ? '' : 's'} uploaded`)
    } catch (error) {
      const message = error?.message || 'The photos could not be uploaded. Please retry.'
      setSiteVisitPhotoError(message)
      toast.error(message)
    } finally {
      setSiteVisitPhotoUploading(false)
      setSiteVisitPhotoProgress(0)
    }
  }
  const removeSiteVisitPhoto = (photoId) => {
    setSiteVisitForm((previous) => ({
      ...previous,
      photos: normalizeSiteVisitPhotos(previous.photos).filter((photo) => photo.id !== photoId),
    }))
  }
  const openSiteVisitPhotoPreview = (photos = [], index = 0) => {
    const normalizedPhotos = normalizeSiteVisitPhotos(photos).filter((photo) => getSiteVisitPhotoUrl(photo))
    if (!normalizedPhotos.length) {
      toast.error('Image preview unavailable.')
      return
    }
    const safeIndex = Math.min(Math.max(Number(index) || 0, 0), normalizedPhotos.length - 1)
    setSiteVisitPhotoPreview({ photos: normalizedPhotos, index: safeIndex })
  }
  const openAwardDialog = () => {
    const nextAwardForm = getAwardWorkOrderDetails(form)
    const autoExpectedCompletionDate = addDaysToDate(nextAwardForm.startDate, nextAwardForm.completionPeriod)
    setExpectedCompletionManuallyEdited(Boolean(nextAwardForm.expectedCompletionDate && nextAwardForm.expectedCompletionDate !== autoExpectedCompletionDate))
    setAwardForm(nextAwardForm)
    setAwardDialogOpen(true)
  }
  const setAwardField = (key) => (valueOrEvent) => {
    const value = valueOrEvent?.target ? valueOrEvent.target.value : valueOrEvent
    setAwardForm((previous) => {
      const next = { ...previous, [key]: value }
      if (key === 'startDate' || key === 'completionPeriod') {
        const startDate = key === 'startDate' ? value : next.startDate
        const completionPeriod = key === 'completionPeriod' ? value : next.completionPeriod
        const calculated = addDaysToDate(startDate, completionPeriod)
        if (!expectedCompletionManuallyEdited) next.expectedCompletionDate = calculated
      }
      if (key === 'expectedCompletionDate') {
        const calculated = addDaysToDate(next.startDate, next.completionPeriod)
        setExpectedCompletionManuallyEdited(Boolean(value && value !== calculated))
      }
      if (key === 'contractValue' || key === 'retentionPercentage') {
        const contractValue = Number(key === 'contractValue' ? value : next.contractValue)
        const retentionPercentage = Number(key === 'retentionPercentage' ? value : next.retentionPercentage)
        if (Number.isFinite(contractValue) && Number.isFinite(retentionPercentage) && contractValue > 0 && retentionPercentage >= 0) {
          next.retentionAmount = String((contractValue * retentionPercentage) / 100)
        }
      }
      return next
    })
  }
  const saveAwardDetails = () => {
    const invalidField = getInvalidAwardField(awardForm)
    if (invalidField) {
      toast.error(invalidField.message)
      document.getElementById(invalidField.id)?.focus()
      return
    }
    if (awardForm.awardStatus !== 'Not Awarded' && (!awardForm.workOrderNumber?.trim() || !awardForm.workOrderDate || nonNegativeNumber(awardForm.contractValue) === null || Number(awardForm.contractValue) <= 0)) {
      toast.error('Award needs a work-order number, date and confirmed positive contract amount.')
      return
    }
    const next = {
      ...awardForm,
      awardStatus: form.status === 'Completed' ? 'Completed' : awardForm.awardStatus,
      actualCompletionDate: form.status === 'Completed' ? form.completionDate || awardForm.actualCompletionDate : awardForm.actualCompletionDate,
      expectedCompletionDate: awardForm.expectedCompletionDate || addDaysToDate(awardForm.startDate, awardForm.completionPeriod),
      retentionAmount: awardForm.retentionAmount || (
        Number(awardForm.contractValue) > 0 && Number(awardForm.retentionPercentage) > 0
          ? String((Number(awardForm.contractValue) * Number(awardForm.retentionPercentage)) / 100)
          : ''
      ),
      updatedAt: new Date().toISOString(),
    }
    updateAutosavedForm('awardWorkOrder', next)
    setAwardDialogOpen(false)
    toast.success('Award details saved')
  }
  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  if (!tender) return null

  const checklist = form.checklist || []
  const doneCount = checklist.filter((c) => c.done).length
  const pct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0

  const billTotal = (form.bills || []).reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const billPaid = (form.bills || []).reduce((s, b) => s + (billAmounts(b).received ?? 0), 0)
  const raBillTotal = (form.raBills || []).reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const raBillPaid = (form.raBills || []).reduce((s, b) => s + (billAmounts(b).received ?? 0), 0)
  const paidBillCount = (form.bills || []).filter((b) => b.status === 'Paid').length + (form.raBills || []).filter((b) => b.status === 'Paid').length
  const financialView = projectFinancials({ ...form, id }, expenses)
  const contractValue = tenderContractValue(form)
  const tenderGrossNetValues = getTenderGrossNetValues(form)
  const totalExpenses = expenses.reduce((s, e) => s + expenseAmounts(e).incurred, 0)
  const totalReceived = billPaid + raBillPaid
  const receivable = financialView.outstanding
  const expectedProfit = financialView.profit
  const cashPosition = financialView.cash
  const projectedMargin = financialView.margin === null ? null : Math.round(financialView.margin)
  const tenderFinancials = calculateTenderFinancials(form)
  const submissionDeadline = getTenderDeadline(form)
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
    const actualCost = getBoqActualCost(item)
    return {
      quotedAmount: totals.quotedAmount + quotedAmount,
      actualCost: totals.actualCost + (actualCost ?? 0),
      profitLoss: actualCost === null ? totals.profitLoss : totals.profitLoss + quotedAmount - actualCost,
      enteredActualCount: totals.enteredActualCount + (actualCost === null ? 0 : 1),
      missingActualCount: totals.missingActualCount + (actualCost === null ? 1 : 0),
    }
  }, { quotedAmount: 0, actualCost: 0, profitLoss: 0, enteredActualCount: 0, missingActualCount: 0 })
  const hasBoqActualCosts = boqTotals.enteredActualCount > 0
  const allBoqActualCostsEntered = boqItems.length > 0 && boqTotals.missingActualCount === 0
  const boqExpectedProfit = boqItems.length > 0 ? (allBoqActualCostsEntered ? boqTotals.profitLoss : null) : expectedProfit
  const boqProfitMargin = allBoqActualCostsEntered && boqTotals.quotedAmount > 0 ? Math.round((boqTotals.profitLoss / boqTotals.quotedAmount) * 100) : null
  const savedProgress = Number(form.progress ?? form.progressPercent ?? form.workProgress) || 0
  const dashboardProgress = form.status === 'Completed' ? 100 : Math.max(0, Math.min(savedProgress, 99))
  const progressMessage = {
    Pending: 'Work has not started.',
    'In Progress': 'Work is underway.',
    Completed: form.completionDate ? 'Work is complete.' : 'Completion date not recorded',
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
  const expenseRows = [...expenses]
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  const expenseCategoryOptions = Array.from(new Set([...EXPENSE_CATEGORIES, ...expenses.map((expense) => expense.category).filter(Boolean)]))
  const filteredExpenses = expenseRows.filter((expense) => {
    const searchText = `${expense.description || ''} ${expense.note || ''} ${expense.category || ''}`.toLowerCase()
    if (expenseSearch && !searchText.includes(expenseSearch.toLowerCase())) return false
    if (expenseCategoryFilter !== 'All' && (expense.category || EXPENSE_CATEGORIES[0]) !== expenseCategoryFilter) return false
    if (expenseDateFrom && (!expense.date || expense.date < expenseDateFrom)) return false
    if (expenseDateTo && (!expense.date || expense.date > expenseDateTo)) return false
    return true
  })
  const expenseFiltersActive = Boolean(expenseSearch || expenseCategoryFilter !== 'All' || expenseDateFrom || expenseDateTo)
  const exportFilteredExpenses = () => {
    const headers = ['Date', 'Description', 'Category', 'Notes', 'Amount', 'Calculation Method', 'Based On', 'Base Amount', 'Percentage', 'Calculated Amount', 'Status / Type']
    const rows = filteredExpenses.map((expense) => [
      expense.date || '-',
      expense.description || '-',
      expense.category || '-',
      expense.note || '-',
      Number(expense.amount) || 0,
      expense.calculationMethod || 'manual',
      getExpenseBasisLabel(expense.amountBasis),
      expense.baseAmount ?? '',
      expense.percentage ?? '',
      expense.calculatedAmount ?? (Number(expense.amount) || 0),
      getExpenseStatusLabel(expense),
    ])
    const csv = rowsToCSV(headers, rows, new Set([2, 6, 8, 9, 10, 11]))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'expenses.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  const clearExpenseFilters = () => {
    setExpenseSearch('')
    setExpenseCategoryFilter('All')
    setExpenseDateFrom('')
    setExpenseDateTo('')
  }
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
    : form.linkedPO ? `Legacy reference ${form.linkedPO} — verify link` : '-'
  const completionIssues = [
    expenses.length === 0 ? 'No expenses are recorded for this tender.' : null,
    totalReceived <= 0 ? 'No payment has been recorded yet.' : null,
    paidBillCount === 0 ? 'No final bill or RA bill is marked Paid.' : null,
    (form.bills || []).some((bill) => billAmounts(bill).balance > 0) ? `${formatCurrency((form.bills || []).reduce((sum, bill) => sum + billAmounts(bill).balance, 0))} in approved regular bills is still outstanding.` : null,
    (form.raBills || []).some((bill) => billAmounts(bill).balance > 0) ? `${formatCurrency((form.raBills || []).reduce((sum, bill) => sum + billAmounts(bill).balance, 0))} in approved RA bills is still outstanding.` : null,
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
    ['Forecast Profit', expectedProfit === null ? 'Forecast incomplete' : formatCurrency(expectedProfit)],
    ['Cash Movement', cashPosition === null ? 'Payment history incomplete' : formatCurrency(cashPosition)],
    ['Approved Bills Outstanding', formatCurrency(receivable)],
    ['Received From Bills/RA Bills', formatCurrency(totalReceived)],
    ['Linked Pay Orders', String(linkedPOs.length)],
  ]
  const awardDetails = getAwardWorkOrderDetails(form)
  const awardTimeline = getAwardTimelineSummary(awardDetails)
  const compactTabs = [
    ['overview', 'Overview'],
    ['award', 'Award / Work Order'],
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
  const expenseCalculationPreview = getExpenseCalculationPreview(expForm, tenderGrossNetValues)

  return (
    <div className={`mx-auto max-w-[1500px] space-y-4 md:space-y-5 md:pb-0 ${isAdmin && dirty ? 'pb-[calc(env(safe-area-inset-bottom)+120px)]' : 'pb-4'}`}>
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="space-y-2">
            <h1 className="page-title max-w-5xl break-words">
              {form.name || 'Untitled Tender'}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {form.agency && <span className="break-words">{form.agency}</span>}
              <span className="break-all font-mono">{form.nit || 'No NIT / Reference'}</span>
              {displayTenderStatus && <StatusBadge status={displayTenderStatus} />}
              {dirty && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Unsaved changes</span>}
              {autoSaving && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">Auto-saving</span>}
              {autoSaveError && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">Auto-save failed</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
          {isAdmin && <Button variant={detailsEditing ? 'secondary' : 'outline'} size="sm" className="h-9 rounded-lg" onClick={() => setDetailsEditing((value) => !value)}>
            <Pencil className="h-3.5 w-3.5" /> {detailsEditing ? 'Close Details' : 'Edit Details'}
          </Button>}
          <Button variant="outline" size="sm" className="h-9 w-full rounded-lg sm:w-auto" onClick={() => setSummaryOpen(true)}>
            <FileText className="h-4 w-4" /> Summary
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9 w-full rounded-lg sm:w-auto">
            <Link to={`/tenders/${id}/report`}>
              <Printer className="h-4 w-4" /> Report
            </Link>
          </Button>
          {isAdmin && form.status !== 'Completed' && (
            <Button variant="outline" size="sm" className="h-9 w-full rounded-lg sm:w-auto" onClick={openCompleteDialog}>
              <CheckCircle className="h-4 w-4" /> Mark Completed
            </Button>
          )}
          {isAdmin && dirty && (
            <Button onClick={save} disabled={saving} size="sm" className="h-9 w-full rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ProjectMetric icon={Banknote} label="Contract Value" value={formatCurrency(contractValue)} />
        <ProjectMetric icon={WalletCards} label="Recorded Costs" value={formatCurrency(totalExpenses)} />
        <ProjectMetric icon={Receipt} label="Approved Receivables" value={formatCurrency(receivable)} />
        <ProjectMetric icon={Landmark} label="Securities Held" value={formatCurrency(linkedPOs.reduce((sum, po) => sum + (securityAmounts(po).remaining || 0), 0))} />
      </div>
      <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 xl:grid-cols-3">
        <ProjectSecondary label="Approved Gross Bills" value={formatCurrency(financialView.approvedGross)} />
        <ProjectSecondary label="Net Payable" value={formatCurrency(financialView.netPayable)} />
        <ProjectSecondary label="Cleared / Recorded Receipts" value={formatCurrency(totalReceived)} />
        <ProjectSecondary label="Pending Clearance" value={formatCurrency(financialView.pendingReceipts)} />
        <ProjectSecondary label="RM Held" value={formatCurrency(financialView.retentionHeld)} />
        <ProjectSecondary label="Unbilled Contract" value={formatCurrency(financialView.unbilled)} />
        <ProjectSecondary label="Forecast" value={expectedProfit === null ? 'Incomplete' : formatCurrency(expectedProfit)} />
        {financialView.unknownBillBasis && <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-3">Unbilled amount unavailable: legacy bill gross/net basis needs review.</p>}
        {financialView.unknownReceiptCount > 0 && <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-3">{financialView.unknownReceiptCount} approved bill receipt histories are unverified; outstanding is unknown.</p>}
      </div>

      <div className="min-w-0">
          <Tabs value={activeTenderTab} onValueChange={setActiveTenderTab} className="flex min-w-0 flex-col gap-4 md:gap-5">
          {(detailsEditing || !isAdmin) && <Card data-project-details-editor className="order-2 rounded-xl border-border/80 bg-background">
            <CardHeader className="p-4 pb-3 md:p-5 md:pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                    <FileText className="h-4 w-4" />
                  </span>
                  Tender Details
                </CardTitle>
                {isAdmin && (
                  <Button variant={detailsEditing ? 'secondary' : 'outline'} size="sm" className="h-9 rounded-lg" onClick={() => setDetailsEditing((value) => !value)}>
                    <Pencil className="h-3.5 w-3.5" /> {detailsEditing ? 'Viewing' : 'Edit Details'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 md:px-5 md:pb-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                  {detailsEditing ? <Input aria-label="NIT or reference" value={form.nit || ''} onChange={(e) => updateForm('nit', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{form.nit || '-'}</DetailValue>}
                </DetailRow>
                <DetailRow icon={Banknote} label="Legacy tender value (PKR)" note="Recorded legacy amount; the awarded contract is in Award / Work Order.">
                  {detailsEditing ? <div><Input aria-label="Legacy tender value" type="number" min="0" value={form.value ?? ''} onChange={(e) => updateForm('value', e.target.value)} className={INLINE_INPUT_CLASS} /><p className="text-xs text-muted-foreground">{formatCurrencyPrecise(form.value, 0)}</p></div> : <DetailValue>{formatCurrencyPrecise(form.value, 0)}</DetailValue>}
                </DetailRow>
                <DetailRow icon={Banknote} label="Estimated Cost (PKR)" note="Official department / NIT estimate.">
                  {detailsEditing ? <div><Input aria-label="Estimated cost" type="number" min="0" value={form.estimatedCost ?? ''} onChange={(e) => updateForm('estimatedCost', e.target.value)} className={INLINE_INPUT_CLASS} /><p className="text-xs text-muted-foreground">{formatCurrencyPrecise(form.estimatedCost, 0)}</p></div> : <DetailValue>{formatCurrencyPrecise(form.estimatedCost, 0)}</DetailValue>}
                </DetailRow>
                <DetailRow icon={WalletCards} label="Quoted Amount (PKR)" note="Submitted financial bid amount.">
                  {detailsEditing ? <div><Input aria-label="Quoted amount" type="number" min="0" value={form.quotedAmount ?? ''} onChange={(e) => updateForm('quotedAmount', e.target.value)} className={INLINE_INPUT_CLASS} /><p className="text-xs text-muted-foreground">{formatCurrencyPrecise(form.quotedAmount, 0)}</p></div> : <DetailValue>{formatCurrencyPrecise(form.quotedAmount, 0)}</DetailValue>}
                </DetailRow>
                <DetailRow icon={Receipt} label="Tender Fee (PKR)" note="Automatically tracked as an expense.">
                  {detailsEditing ? <Input aria-label="Tender fee" type="number" min="0" value={form.tenderFee || ''} onChange={(e) => updateForm('tenderFee', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{form.tenderFee || '-'}</DetailValue>}
                </DetailRow>
                <DetailRow icon={Landmark} label="Procuring Agency" className="md:col-span-2 xl:col-span-1">
                  {detailsEditing ? <Input aria-label="Agency or department" value={form.agency || ''} onChange={(e) => updateForm('agency', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{form.agency || '-'}</DetailValue>}
                </DetailRow>
                <DetailRow icon={CalendarDays} label="Tender Due Date / Bid Submission Deadline">
                  {detailsEditing ? <Input aria-label="Tender due date or bid submission deadline" type="date" value={form.submissionDate || ''} onChange={(e) => updateForm('submissionDate', e.target.value)} className={INLINE_INPUT_CLASS} /> : (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <DetailValue>{formatDate(form.submissionDate)}</DetailValue>
                      <DeadlineBadge tender={form} deadline={submissionDeadline} />
                    </div>
                  )}
                </DetailRow>
                <DetailRow icon={CalendarDays} label="Opening Date">
                  {detailsEditing ? <Input aria-label="Opening date" type="date" value={form.openingDate || ''} onChange={(e) => updateForm('openingDate', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{formatDate(form.openingDate)}</DetailValue>}
                </DetailRow>
                <DetailRow icon={LinkIcon} label="Linked Pay Order">
                  <p className="truncate text-sm font-medium leading-5 md:text-base" title={linkedPayOrderDisplay}>
                    {linkedPayOrderDisplay}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Managed from linked Pay Orders.</p>
                </DetailRow>
                <DetailRow icon={CalendarDays} label="Completion Date">
                  {detailsEditing ? <Input aria-label="Completion date" type="date" value={form.completionDate || ''} onChange={(e) => updateForm('completionDate', e.target.value)} className={INLINE_INPUT_CLASS} /> : <DetailValue>{formatDate(form.completionDate)}</DetailValue>}
                </DetailRow>
              </div>
            </CardContent>
          </Card>}

      {/* Tabs */}
        <TabsList className="sticky top-0 z-20 order-1 -mx-1 flex h-auto max-w-full justify-start gap-1.5 overflow-x-auto whitespace-nowrap rounded-none border-b bg-background/95 px-1 pb-0 backdrop-blur [scrollbar-width:none] md:mx-0 md:gap-2 md:rounded-lg md:border md:bg-background/95 md:p-1.5 [&::-webkit-scrollbar]:hidden">
          {compactTabs.map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-10 flex-shrink-0 rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-sm text-muted-foreground data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-emerald-700 data-[state=active]:shadow-none dark:data-[state=active]:text-emerald-400 sm:h-11 sm:text-base md:h-9 md:rounded-md md:border-b-0 md:px-4 md:py-2 md:text-sm md:data-[state=active]:bg-emerald-50 md:data-[state=active]:text-emerald-700 md:dark:data-[state=active]:bg-emerald-950/40"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Overview tab: tender control dashboard */}
        <TabsContent value="overview" className="order-3 mt-0 space-y-5">
          <TenderOverviewDashboard
            form={form}
            displayTenderStatus={displayTenderStatus}
            dirty={dirty}
            autoSaving={autoSaving}
            autoSaveError={autoSaveError}
            linkedPayOrderDisplay={linkedPayOrderDisplay}
            linkedPOs={linkedPOs}
            tenderFinancials={tenderFinancials}
            tenderFinancialTone={tenderFinancialTone}
            tenderFinancialDirectionText={tenderFinancialDirectionText}
            contractValue={contractValue}
            expectedProfit={expectedProfit}
            projectedMargin={projectedMargin}
            totalExpenses={totalExpenses}
            totalReceived={totalReceived}
            receivable={receivable}
            cashPosition={cashPosition}
            boqTotals={boqTotals}
            boqProfitMargin={boqProfitMargin}
            hasBoqActualCosts={hasBoqActualCosts}
            allBoqActualCostsEntered={allBoqActualCostsEntered}
            billSummary={billSummary}
            raBillSummary={raBillSummary}
            dashboardProgress={dashboardProgress}
            progressMessage={progressMessage}
            projectHealth={projectHealth}
            projectHealthTone={projectHealthTone}
            doneCount={doneCount}
            checklist={checklist}
            pct={pct}
            expenses={expenses}
            documents={documents}
            recentActivity={recentActivity}
            recentSiteVisits={recentSiteVisits}
            recentDocuments={recentDocuments}
            recentExpenses={recentExpenses}
            recentBills={recentBills}
            financialView={financialView}
            checklistExpanded={checklistExpanded}
            setChecklistExpanded={setChecklistExpanded}
            addChecklistItem={addChecklistItem}
            updateChecklistItem={updateChecklistItem}
            removeChecklistItem={removeChecklistItem}
            isAdmin={isAdmin}
            onNotesChange={(value) => updateAutosavedForm('notes', value)}
            onEditDetails={() => {
              setDetailsEditing(true)
              requestAnimationFrame(() => document.querySelector('[data-project-details-editor]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
            }}
            onViewTab={setActiveTenderTab}
          />
          {false && (
          <>
          <Card className="overflow-hidden border-emerald-100 dark:border-emerald-900/40">
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
                    <SnapshotRow label="Linked POs" value={String(linkedPOs.length)} tone="accent" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-3 md:p-6 md:pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
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
              <div className="col-span-2 xl:col-span-4"><Label htmlFor="revised-contract">Revised contract value (PKR)</Label><Input id="revised-contract" type="number" min="0" step="0.01" placeholder="Optional — leave blank to use work order value" value={form.v2?.revisedContractValue ?? ''} onChange={(event) => updateForm('v2', { ...form.v2, revisedContractValue: event.target.value === '' ? null : Number(event.target.value) })} disabled={!isAdmin} /><p className="mt-1 text-xs text-muted-foreground">The awarded work order remains unchanged; enter an approved revision only when documented.</p></div>
              <FinancialMetric label="Tender Fee" value={formatCurrency(Number(form.tenderFee) || 0)} tone="expense" helper="Auto expense" />
              <FinancialMetric label="Bid Security / Linked PO" value={linkedPOs.length ? formatCurrency(linkedPOs.reduce((sum, po) => sum + (Number(po.amount) || 0), 0)) : (form.linkedPO || '—')} tone="accent" helper={linkedPOs.length ? `${linkedPOs.length} pay order${linkedPOs.length === 1 ? '' : 's'}` : 'Managed from Pay Orders'} />
              <FinancialMetric label="Forecast profit" value={expectedProfit === null ? 'Forecast incomplete' : formatCurrency(expectedProfit)} tone={expectedProfit === null ? 'accent' : expectedProfit >= 0 ? 'profit' : 'loss'} helper={projectedMargin !== null ? `${projectedMargin}% margin` : 'Enter forecast remaining costs'} />
              <div className="col-span-2 xl:col-span-4"><Label htmlFor="remaining-cost">Forecast remaining cost (PKR)</Label><Input id="remaining-cost" type="number" min="0" step="0.01" placeholder="Leave blank until estimated" value={form.v2?.forecastRemaining ?? ''} onChange={(event) => updateForm('v2', { ...form.v2, forecastRemaining: event.target.value === '' ? null : Number(event.target.value) })} disabled={!isAdmin} /><p className="mt-1 text-xs text-muted-foreground">Forecast profit = contract value − costs recorded − remaining costs. Blank means no reliable final margin.</p></div>
              <FinancialMetric label="Total Expenses" value={formatCurrency(totalExpenses)} tone="expense" />
              <FinancialMetric label="Known cost payments" value={formatCurrency(financialView.paidCostsKnown)} tone="expense" helper="Excludes payments missing from legacy records" />
              <FinancialMetric label="Known supplier dues" value={formatCurrency(financialView.knownPayable)} tone="expense" helper={financialView.unknownPaymentCount ? `${financialView.unknownPaymentCount} legacy payment histories unresolved` : 'All payment histories recorded'} />
              <FinancialMetric label="Received" value={formatCurrency(totalReceived)} tone="profit" helper="Recorded receipt amounts; status alone is not payment" />
              <FinancialMetric label="Approved bills outstanding" value={formatCurrency(receivable)} tone={receivable > 0 ? 'expense' : 'profit'} />
              <FinancialMetric label="Unbilled contract value" value={formatCurrency(financialView.unbilled)} tone="accent" helper={financialView.unknownBillBasis ? 'Legacy bill gross/net basis needs review' : 'Contract less verified gross submitted bills'} />
              <FinancialMetric label="Retention withheld" value={formatCurrency(financialView.retention)} tone="accent" helper="From itemized bill deductions" />
              <FinancialMetric label="Cash movement" value={cashPosition === null ? 'Payment history incomplete' : formatCurrency(cashPosition)} tone={cashPosition === null ? 'accent' : cashPosition >= 0 ? 'profit' : 'loss'} />
              <p className="col-span-2 text-xs text-muted-foreground xl:col-span-4">
                Legacy expense payments have no transaction dates; cash movement remains incomplete until reconciled.
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
            <Card>
              <CardHeader className="p-4 pb-3 md:p-6 md:pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
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
                          <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 text-destructive" onClick={() => removeChecklistItem(item.id)} aria-label="Delete checklist item">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <WalletCards className="h-4 w-4 text-emerald-600" /> Payment Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="space-y-3 rounded-xl border bg-muted/10 p-4">
                  <PaymentSummaryRow label="Received" value={formatCurrency(totalReceived)} tone="profit" />
                  <PaymentSummaryRow label="Approved bills outstanding" value={formatCurrency(receivable)} tone={receivable > 0 ? 'accent' : 'profit'} />
                  <PaymentSummaryRow label="Cash movement" value={cashPosition === null ? 'Payment history incomplete' : formatCurrency(cashPosition)} tone={cashPosition === null ? 'accent' : cashPosition >= 0 ? 'profit' : 'loss'} />
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
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
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
            <CardHeader className="pb-2"><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={form.notes || ''} onChange={(e) => updateAutosavedForm('notes', e.target.value)} disabled={!isAdmin} rows={4} placeholder="Add notes about this tender…" />
            </CardContent>
          </Card>

          {(form.statusHistory || []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg"><History className="h-4 w-4" /> Status History</CardTitle>
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
          </>
          )}
        </TabsContent>

        <TabsContent value="award" className="order-3 mt-0 space-y-4">
          <AwardWorkOrderSection
            details={awardDetails}
            timeline={awardTimeline}
            isAdmin={isAdmin}
            onEdit={openAwardDialog}
          />
        </TabsContent>

        <TabsContent value="boq" className="order-3 mt-0 space-y-4 md:space-y-5">
          <div>
            <h2 className="text-base font-semibold tracking-tight md:text-lg">BOQ / Profit Tracking</h2>
            <div className="mt-2 h-1 w-10 rounded-full bg-emerald-600" />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
            <BoqMetric icon={FileText} label="Quoted Total" value={formatCurrency(boqTotals.quotedAmount)} tone="emerald" />
            <BoqMetric icon={WalletCards} label="Actual Cost" value={hasBoqActualCosts ? formatCurrency(boqTotals.actualCost) : 'Pending'} tone="orange" />
            <BoqMetric icon={BarChart3} label="Expected Profit" value={allBoqActualCostsEntered ? formatCurrency(boqTotals.profitLoss) : 'Pending actual costs'} tone="blue" />
            <BoqMetric icon={PieChart} label="Profit Margin" value={boqProfitMargin === null ? '-' : `${boqProfitMargin}%`} tone="violet" />
          </div>

          <Card>
            <CardContent className="space-y-4 p-3.5 md:space-y-5 md:p-5">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30 sm:h-9 sm:w-auto"
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
                  <Button size="sm" className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:h-9 sm:w-auto" onClick={addBoqItem}>
                    <Plus className="h-4 w-4" /> Add Item
                  </Button>
                )}
                <Button variant="outline" size="sm" className="col-span-2 h-10 w-full sm:col-span-1 sm:h-9 sm:w-auto" onClick={() => window.print()}>
                  <Download className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>

              {boqItems.length === 0 ? (
                <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No BOQ items yet.
                </p>
              ) : (
                <>
                <div className="space-y-3 pb-[calc(env(safe-area-inset-bottom)+11rem)] md:hidden">
                  {boqItems.map((item, index) => {
                    const quotedAmount = (Number(item.qty) || 0) * (Number(item.quotedRate) || 0)
                    const actualCost = getBoqActualCost(item)
                    const profitLoss = actualCost === null ? null : quotedAmount - actualCost
                    const isEditing = editingBoqItemId === item.id
                    return (
                      <div key={item.id} className="rounded-xl border bg-card p-3 min-[430px]:p-3.5">
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
                                className={`w-full text-left text-sm font-medium leading-5 min-[430px]:text-base min-[430px]:leading-6 ${item.description ? '' : 'text-muted-foreground'}`}
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
                                  className="h-8 w-8 text-muted-foreground hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300"
                                  onClick={() => setEditingBoqItemId(isEditing ? null : item.id)}
                                  aria-label={`${isEditing ? 'Finish editing' : 'Edit'} BOQ item ${index + 1}`}
                                >
                                  {isEditing ? <CheckCircle className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-8 w-8 text-muted-foreground hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-destructive"
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
                              value={isEditing ? item.actualCost === 0 ? '' : item.actualCost ?? '' : actualCost === null ? 'Pending' : formatCurrency(actualCost)}
                              editing={isEditing}
                              onChange={(value) => updateBoqItem(item.id, { actualCost: value })}
                              inputMode="decimal"
                            />
                            <MobileBoqStat label="Profit / Loss" value={profitLoss === null ? 'Pending cost' : formatCurrency(profitLoss)} tone={getBoqProfitTone(profitLoss)} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-20 rounded-2xl border border-emerald-200 bg-emerald-50/95 p-3 shadow-lg shadow-emerald-900/10 ring-1 ring-emerald-100 backdrop-blur supports-[backdrop-filter]:bg-emerald-50/85 dark:border-emerald-800/70 dark:bg-emerald-950/80 dark:ring-emerald-800/50 min-[430px]:p-4">
                    <div className="grid grid-cols-3 gap-1.5 text-center min-[420px]:gap-2">
                      <MobileBoqStat label="Total Quoted Amount" value={formatCurrency(boqTotals.quotedAmount)} tone="profit" large />
                      <MobileBoqStat label="Actual Cost" value={hasBoqActualCosts ? formatCurrency(boqTotals.actualCost) : 'Pending'} tone="loss" large />
                      <MobileBoqStat label="Profit / Loss" value={allBoqActualCostsEntered ? formatCurrency(boqTotals.profitLoss) : 'Pending cost'} tone={getBoqProfitTone(allBoqActualCostsEntered ? boqTotals.profitLoss : null)} large />
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
                        const actualCost = getBoqActualCost(item)
                        const profitLoss = actualCost === null ? null : quotedAmount - actualCost
                        const isEditing = editingBoqItemId === item.id
                        const profitTone = getBoqProfitTone(profitLoss)
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
                                      className="h-6 w-6 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300"
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
                                  {actualCost === null ? 'Pending' : formatCurrency(actualCost)}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className={`!px-2 !py-3 text-right align-middle font-mono text-sm tabular-nums ${profitTone === 'loss' ? 'text-rose-600 dark:text-rose-400' : profitTone === 'profit' ? 'text-emerald-600 dark:text-emerald-400' : profitTone === 'neutral' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                              {profitLoss === null ? 'Pending cost' : formatCurrency(profitLoss)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      <TableRow className="bg-emerald-50/60 font-semibold hover:bg-emerald-50/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/20">
                        <TableCell colSpan={5} className="px-2 py-4 text-right">Total</TableCell>
                        <TableCell className="px-2 py-4 text-right font-mono tabular-nums">{formatCurrency(boqTotals.quotedAmount)}</TableCell>
                        <TableCell className="px-2 py-4 text-right font-mono tabular-nums">{hasBoqActualCosts ? formatCurrency(boqTotals.actualCost) : 'Pending'}</TableCell>
                        <TableCell className={`px-2 py-4 text-right font-mono tabular-nums ${getBoqProfitTone(allBoqActualCostsEntered ? boqTotals.profitLoss : null) === 'loss' ? 'text-rose-600 dark:text-rose-400' : getBoqProfitTone(allBoqActualCostsEntered ? boqTotals.profitLoss : null) === 'profit' ? 'text-emerald-600 dark:text-emerald-400' : getBoqProfitTone(allBoqActualCostsEntered ? boqTotals.profitLoss : null) === 'neutral' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{allBoqActualCostsEntered ? formatCurrency(boqTotals.profitLoss) : 'Pending cost'}</TableCell>
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
            documents={form.documents || []}
            onViewDocuments={() => setActiveTenderTab('documents')}
            otherBills={raBills}
            contract={contractValue}
            deductionDefaults={[
              { kind: 'RM', method: 'percentage', base: 'approved', rate: form.awardWorkOrder?.retentionPercentage, adjustment: 0, reason: '' },
              { kind: 'SRB', method: 'percentage', base: 'approved', rate: form.awardWorkOrder?.srbPercentage, adjustment: 0, reason: '' },
              { kind: 'Income Tax', method: 'percentage', base: 'approved', rate: form.awardWorkOrder?.incomeTaxPercentage, adjustment: 0, reason: '' },
            ].filter((row) => row.rate !== '' && row.rate != null)}
          />
        </TabsContent>

        {/* RA Bills tab */}
        <TabsContent value="rabills" className="order-3 mt-0 space-y-4">
          <BillFinanceSection
            title="RA Bills"
            description="Track running account bills, approvals, payments, deductions, and receivables."
            bills={raBills}
            summary={raBillSummary}
            isAdmin={isAdmin}
            onAdd={addRABill}
            onUpdate={updateRABill}
            onRemove={removeRABill}
            addLabel="Add RA Bill"
            emptyTitle="No RA bills added yet"
            dateKey="submitted"
            documents={form.documents || []}
            onViewDocuments={() => setActiveTenderTab('documents')}
            otherBills={bills}
            paidDateKey="paid"
            contract={contractValue}
            deductionDefaults={[
              { kind: 'RM', method: 'percentage', base: 'approved', rate: form.awardWorkOrder?.retentionPercentage, adjustment: 0, reason: '' },
              { kind: 'SRB', method: 'percentage', base: 'approved', rate: form.awardWorkOrder?.srbPercentage, adjustment: 0, reason: '' },
              { kind: 'Income Tax', method: 'percentage', base: 'approved', rate: form.awardWorkOrder?.incomeTaxPercentage, adjustment: 0, reason: '' },
            ].filter((row) => row.rate !== '' && row.rate != null)}
          />
        </TabsContent>

        {/* Pay Orders tab */}
        <TabsContent value="payorders" className="order-3 mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-4 w-4" /> Pay Orders for this tender
                </CardTitle>
                {isAdmin && <Button size="sm" className="h-10 md:h-9" onClick={() => openPoDialog()}><Plus className="h-3.5 w-3.5" /> Add Pay Order</Button>}
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
                            <Button variant="ghost" size="icon-sm" onClick={() => openPoDialog(p)} aria-label="Edit pay order"><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeletePoId(p.id)} aria-label="Delete pay order"><Trash2 className="h-3.5 w-3.5" /></Button>
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
                                <Button variant="ghost" size="icon-sm" onClick={() => openPoDialog(p)} aria-label="Edit pay order"><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeletePoId(p.id)} aria-label="Delete pay order"><Trash2 className="h-3.5 w-3.5" /></Button>
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
          <ExpensesFinanceSection
            expenses={expenses}
            filteredExpenses={filteredExpenses}
            expenseTotal={expenseTotal}
            expenseOther={expenseOther}
            heldByAgency={heldByAgency}
            bidSecurityAtRisk={bidSecurityAtRisk}
            sunkCost={sunkCost}
            tenderGrossNetValues={tenderGrossNetValues}
            openGrossNetDialog={openGrossNetDialog}
            isAdmin={isAdmin}
            openExpDialog={openExpDialog}
            setDeleteExpId={setDeleteExpId}
            setViewExpense={setViewExpense}
            expenseSearch={expenseSearch}
            setExpenseSearch={setExpenseSearch}
            expenseCategoryFilter={expenseCategoryFilter}
            setExpenseCategoryFilter={setExpenseCategoryFilter}
            expenseCategoryOptions={expenseCategoryOptions}
            expenseDateFrom={expenseDateFrom}
            setExpenseDateFrom={setExpenseDateFrom}
            expenseDateTo={expenseDateTo}
            setExpenseDateTo={setExpenseDateTo}
            expenseFiltersActive={expenseFiltersActive}
            clearExpenseFilters={clearExpenseFilters}
            exportFilteredExpenses={exportFilteredExpenses}
          />
          {false && (
          <>
          {/* Summary — Sunk / At Risk / Held */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <Card><CardContent className="p-4 text-center">
              <p className="text-lg font-mono tabular-nums font-bold text-rose-600 dark:text-rose-400">{formatCurrency(sunkCost)}</p>
              <p className="text-xs text-muted-foreground">Sunk cost</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">expenses + forfeited</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-lg font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400">{formatCurrency(bidSecurityAtRisk)}</p>
              <p className="text-xs text-muted-foreground">At risk</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">bid security pending</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-lg font-mono tabular-nums font-bold text-blue-600 dark:text-blue-400">{formatCurrency(heldByAgency)}</p>
              <p className="text-xs text-muted-foreground">Held by agency</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">refundable on release</p>
            </CardContent></Card>
          </div>

          {/* Expenses */}
          <Card>
            <CardHeader className="p-4 pb-3 md:p-6 md:pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
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
                      <div key={e.id} className="rounded-xl border border-border bg-card p-3.5">
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
                                <Button variant="ghost" size="icon-sm" onClick={() => openExpDialog(e)} aria-label="Edit expense"><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => setDeleteExpId(e.id)} aria-label="Delete expense"><Trash2 className="h-3.5 w-3.5" /></Button>
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
          </>
          )}
        </TabsContent>

        <TabsContent value="site-visits" className="order-3 mt-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarDays className="h-4 w-4" /> Site Visits
                    <span className="text-muted-foreground font-normal">· {(form.siteVisits || []).length} recorded</span>
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Track daily execution updates, labour, materials, issues, and next-day plans.
                  </p>
                </div>
                {isAdmin && (
                  <Button type="button" size="sm" className="h-10 md:h-9" onClick={() => openSiteVisitDialog()}>
                    <Plus className="h-3.5 w-3.5" /> Add Site Visit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {(form.siteVisits || []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 text-sm font-semibold">No site visits added yet.</h3>
                  <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
                    Record daily progress, labour, materials, issues, and next-day plans.
                  </p>
                  {isAdmin && (
                    <Button type="button" size="sm" className="mt-4 h-10 md:h-9" onClick={() => openSiteVisitDialog()}>
                      <Plus className="h-3.5 w-3.5" /> Add first site visit
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
                  {[...(form.siteVisits || [])]
                    .sort((a, b) => new Date(b.visitDate || 0) - new Date(a.visitDate || 0))
                    .map((visit, index) => (
                      <SiteVisitCard
                        key={visit.id || `visit-${index}`}
                        visit={visit}
                        tenderName={form.name}
                        isAdmin={isAdmin}
                        onView={() => setViewSiteVisit(visit)}
                        onEdit={() => openSiteVisitDialog(visit)}
                        onDelete={() => setDeleteSiteVisitId(visit.id)}
                        onPhotoPreview={openSiteVisitPhotoPreview}
                      />
                    ))}
                </div>
              )}
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
            uploadDocumentAsset={uploadDocumentAsset}
            updateDocument={updateDocument}
            removeDocument={removeDocument}
            uploadingDocumentId={uploadingDocumentId}
            documentUploadProgress={documentUploadProgress}
            tenderName={form.name}
            isAdmin={isAdmin}
          />
        </TabsContent>

        {/* Contact tab */}
        <TabsContent value="contact" className="order-3 mt-0">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><User className="h-4 w-4" /> Contact Person</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {['name', 'phone', 'email', 'role'].map((field) => (
                <div key={field} className="min-w-0 space-y-1.5">
                  <Label htmlFor={`contact-${field}`} className="capitalize">{field}</Label>
                  <Input
                    id={`contact-${field}`}
                    value={(form.contactPerson || {})[field] || ''}
                    onChange={(e) => updateAutosavedForm('contactPerson', { ...(form.contactPerson || {}), [field]: e.target.value })}
                    disabled={!isAdmin}
                  />
                </div>
              ))}
              <div className="min-w-0 space-y-1.5 sm:col-span-2">
                <Label htmlFor="contact-notes">Notes</Label>
                <Textarea
                  id="contact-notes"
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

      {/* Floating save for mobile */}
      {isAdmin && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
          <Button onClick={save} disabled={saving || !dirty} size="lg" className="h-12 w-full rounded-xl bg-emerald-600 text-white shadow-lg hover:bg-emerald-700">
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
              <FinancialMetric label="Forecast profit" value={expectedProfit === null ? 'Forecast incomplete' : formatCurrency(expectedProfit)} tone={expectedProfit === null ? 'accent' : expectedProfit >= 0 ? 'profit' : 'loss'} />
              <FinancialMetric label="Cash movement" value={cashPosition === null ? 'Payment history incomplete' : formatCurrency(cashPosition)} tone={cashPosition === null ? 'accent' : cashPosition >= 0 ? 'profit' : 'loss'} helper={`${formatCurrency(totalReceived)} bill receipts`} />
              <FinancialMetric label="Approved bills outstanding" value={formatCurrency(receivable)} tone={receivable > 0 ? 'expense' : 'profit'} />
            </div>
            <p className="text-xs text-muted-foreground">Only recorded cleared receipts count as received payment; a Paid label alone is not evidence.</p>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="completion-date">Completion Date</Label>
              <Input
                id="completion-date"
                type="date"
                value={completionDate}
                onChange={(e) => setCompletionDate(e.target.value)}
                className="mobile-date-input"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
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
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setCompleteOpen(false)} disabled={completing}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={completeTender} disabled={completing}>
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
            <p className="text-xs text-muted-foreground">Cash position uses recorded bill receipts minus recorded expense payments, where payment histories are complete.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSummaryOpen(false)}>Close</Button>
            <Button className="w-full sm:w-auto" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / Save PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TenderExpenseDialog
        open={expDialogOpen}
        onOpenChange={setExpDialogOpen}
        editing={Boolean(editExp)}
        form={expForm}
        setField={setExpF}
        categories={EXPENSE_CATEGORIES}
        boqItems={boqItems}
        preview={{
          baseAmount: expenseCalculationPreview.baseAmount ? formatCurrency(expenseCalculationPreview.baseAmount) : '—',
          percentage: formatPreviewPercent(expenseCalculationPreview.percentage),
          calculatedAmount: formatCurrency(expenseCalculationPreview.calculatedAmount),
        }}
        onSave={saveExpense}
        saving={expSaving}
      />

      <Dialog open={grossNetDialogOpen} onOpenChange={setGrossNetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Gross / Net</DialogTitle>
            <DialogDescription>Set tender-level values used by expense calculation previews.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="td-gross-value">Gross Value</Label>
              <Input
                id="td-gross-value"
                type="number"
                value={grossNetForm.grossValue}
                onChange={(event) => setGrossNetForm((previous) => ({ ...previous, grossValue: event.target.value }))}
                placeholder="0"
                className="font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="td-net-value">Net Value</Label>
              <Input
                id="td-net-value"
                type="number"
                value={grossNetForm.netValue}
                onChange={(event) => setGrossNetForm((previous) => ({ ...previous, netValue: event.target.value }))}
                placeholder="Not set"
                className="font-mono tabular-nums"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGrossNetDialogOpen(false)}>Cancel</Button>
            <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={saveGrossNetValues} disabled={grossNetSaving}>
              {grossNetSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Values
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExpenseViewDialog expense={viewExpense} onOpenChange={(open) => !open && setViewExpense(null)} />
      <ConfirmDelete
        open={!!deleteExpId}
        onOpenChange={() => setDeleteExpId(null)}
        onConfirm={removeExpense}
        title="Delete expense"
        description="This will permanently remove this expense record."
      />

      <TenderPayOrderSheet
        open={poDialogOpen}
        onOpenChange={setPoDialogOpen}
        editing={Boolean(editPo)}
        form={poForm}
        setField={setPoF}
        banks={BANKS}
        purposes={PO_PURPOSES}
        statuses={PO_STATUSES}
        onSave={savePo}
        saving={poSaving}
        tender={form}
      />

      <ConfirmDelete
        open={!!deletePoId}
        onOpenChange={() => setDeletePoId(null)}
        onConfirm={removePo}
        title="Delete pay order"
        description="This will permanently remove this pay order from the tender and the global list."
      />

      <SiteVisitViewDialog
        open={!!viewSiteVisit}
        visit={viewSiteVisit}
        tenderName={form.name}
        isAdmin={isAdmin}
        onOpenChange={(open) => {
          if (!open) setViewSiteVisit(null)
        }}
        onEdit={(visit) => openSiteVisitDialog(visit)}
        onPhotoPreview={openSiteVisitPhotoPreview}
      />

      <SiteVisitPhotoPreviewDialog
        preview={siteVisitPhotoPreview}
        onOpenChange={(open) => {
          if (!open) setSiteVisitPhotoPreview({ photos: [], index: 0 })
        }}
        onNavigate={(index) => setSiteVisitPhotoPreview((previous) => ({ ...previous, index }))}
      />

      <AwardWorkOrderSheet
        open={awardDialogOpen}
        onOpenChange={setAwardDialogOpen}
        form={awardForm}
        setField={setAwardField}
        onSave={saveAwardDetails}
        isAdmin={isAdmin}
        statuses={AWARD_STATUSES}
      />

      <SiteVisitSheet
        open={siteVisitDialogOpen}
        onOpenChange={setSiteVisitDialogOpen}
        editing={Boolean(editSiteVisit)}
        form={siteVisitForm}
        setField={setSiteVisitF}
        statuses={SITE_VISIT_STATUSES}
        isAdmin={isAdmin}
        uploading={siteVisitPhotoUploading}
        uploadProgress={siteVisitPhotoProgress}
        uploadError={siteVisitPhotoError}
        onUpload={uploadSiteVisitPhotos}
        photos={normalizeSiteVisitPhotos(siteVisitForm.photos)}
        renderPhoto={(photo) => <SiteVisitPhotoTile key={photo.id} photo={photo} onRemove={() => removeSiteVisitPhoto(photo.id)} editable />}
        onSave={saveSiteVisit}
      />

      <ConfirmDelete
        open={!!deleteSiteVisitId}
        onOpenChange={() => setDeleteSiteVisitId(null)}
        onConfirm={removeSiteVisit}
        title="Delete site visit"
        description="This will permanently remove this site visit record from the tender."
      />
    </div>
  )
}

function AwardWorkOrderSection({ details, timeline, isAdmin, onEdit }) {
  const hasDetails = Boolean(
    details.workOrderNumber ||
    details.awardDate ||
    details.workOrderDate ||
    details.startDate ||
    details.expectedCompletionDate ||
    Number(details.contractValue) > 0 ||
    details.awardStatus !== 'Not Awarded'
  )

  if (!hasDetails) {
    return (
      <Card className="rounded-xl border-border/80">
        <CardContent className="flex flex-col items-center justify-center px-5 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
            <ClipboardList className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No award or work order details added yet</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Add award and work order information when the tender is awarded or execution starts.
          </p>
          {isAdmin && (
            <Button className="mt-5 bg-emerald-600 text-white hover:bg-emerald-700" onClick={onEdit}>
              <Plus className="h-4 w-4" /> Add Award Details
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-xl border-border/80">
        <CardHeader className="p-3 pb-2 md:p-5 md:pb-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium tracking-normal text-emerald-700 dark:text-emerald-300 sm:font-semibold sm:uppercase sm:tracking-[0.18em] md:text-xs md:tracking-[0.22em]">Post Award</p>
              <CardTitle className="mt-0.5 text-base md:mt-1 md:text-lg">Award / Work Order</CardTitle>
              <p className="mt-1 text-xs leading-5 text-muted-foreground md:text-sm">
                Track award details, work order information, contract period, securities, and project execution dates.
              </p>
            </div>
            {isAdmin && (
              <Button className="h-10 w-full bg-emerald-600 text-sm text-white hover:bg-emerald-700 sm:w-auto" onClick={onEdit}>
                <Pencil className="h-4 w-4" /> Edit Award Details
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-3 pt-0 md:space-y-4 md:p-5 md:pt-0">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 min-[1800px]:grid-cols-6">
            <AwardMetric icon={CheckCircle} label="Award Status" value={details.awardStatus || 'Not Awarded'} badgeClass={getAwardStatusClass(details.awardStatus)} />
            <AwardMetric icon={Banknote} label="Contract Value" value={Number(details.contractValue) > 0 ? formatCurrency(details.contractValue) : MISSING_VALUE} helper="Awarded value" />
            <AwardMetric icon={FileText} label="Work Order Date" value={formatDate(details.workOrderDate) || MISSING_VALUE} helper={details.workOrderNumber || 'No work order #'} />
            <AwardMetric icon={CalendarDays} label="Start Date" value={formatDate(details.startDate) || MISSING_VALUE} />
            <AwardMetric icon={CalendarDays} label="Expected Completion" value={formatDate(details.expectedCompletionDate) || MISSING_VALUE} />
            <AwardMetric icon={Clock} label="Timeline" value={timeline.label === '-' ? MISSING_VALUE : timeline.label} helper={timeline.helper} tone={timeline.tone} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AwardDetailCard title="Award Details" icon={FileText} rows={[
          ['Award date', formatDate(details.awardDate) || MISSING_VALUE],
          ['Work order number', details.workOrderNumber || MISSING_VALUE],
          ['Work order date', formatDate(details.workOrderDate) || MISSING_VALUE],
          ['Department / agency reference', details.departmentReference || MISSING_VALUE],
        ]} />
        <AwardDetailCard title="Contract Period" icon={CalendarDays} rows={[
          ['Start date', formatDate(details.startDate) || MISSING_VALUE],
          ['Completion period', details.completionPeriod ? `${details.completionPeriod} days` : MISSING_VALUE],
          ['Expected completion', formatDate(details.expectedCompletionDate) || MISSING_VALUE],
          ['Actual completion', formatDate(details.actualCompletionDate) || MISSING_VALUE],
          ['Extension granted', details.extensionGranted || 'No'],
          ['Extension days', details.extensionDays ? `${details.extensionDays} days` : MISSING_VALUE],
          ['Extension remarks', details.extensionRemarks || MISSING_VALUE],
        ]} />
        <AwardDetailCard title="Securities / Deductions" icon={Landmark} rows={[
          ['Performance security', Number(details.performanceSecurityAmount) > 0 ? formatCurrency(details.performanceSecurityAmount) : MISSING_VALUE],
          ['Security type', details.performanceSecurityType || MISSING_VALUE],
          ['Security expiry', formatDate(details.performanceSecurityExpiryDate) || MISSING_VALUE],
          ['Retention percentage', details.retentionPercentage ? `${details.retentionPercentage}%` : MISSING_VALUE],
          ['Retention amount', Number(details.retentionAmount) > 0 ? formatCurrency(details.retentionAmount) : MISSING_VALUE],
          ['Mobilization advance', Number(details.mobilizationAdvance) > 0 ? formatCurrency(details.mobilizationAdvance) : MISSING_VALUE],
        ]} />
        <AwardDetailCard title="Execution Details" icon={User} rows={[
          ['Site handover date', formatDate(details.siteHandoverDate) || MISSING_VALUE],
          ['Engineer / department contact', details.engineerContact || MISSING_VALUE],
          ['Contractor representative', details.contractorRepresentative || MISSING_VALUE],
          ['Current execution status', details.executionStatus || MISSING_VALUE],
          ['Remarks / notes', details.remarks || MISSING_VALUE],
        ]} />
      </div>
    </div>
  )
}

function AwardMetric({ icon: Icon, label, value, helper, tone, badgeClass }) {
  const toneClass = tone === 'loss' ? 'text-rose-700 dark:text-rose-300' : tone === 'accent' ? 'text-amber-700 dark:text-amber-300' : tone === 'profit' ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground'
  const iconClass = tone === 'loss'
    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
    : tone === 'accent'
      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
  return (
    <div className="flex h-full min-h-0 max-w-full min-w-0 items-start gap-3 rounded-xl border border-border/80 bg-card p-3 sm:p-4">
      {Icon && (
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="break-words text-xs font-medium leading-4 tracking-normal text-muted-foreground sm:text-xs sm:font-semibold sm:uppercase sm:tracking-wide">{label}</p>
        {badgeClass ? (
          <Badge variant="outline" className={`mt-1 max-w-full whitespace-normal break-words rounded-full px-2 py-0.5 text-xs leading-4 sm:mt-2 sm:px-2.5 sm:py-1 ${badgeClass}`}>{value}</Badge>
        ) : (
          <p className={`mt-1 max-w-full break-words font-mono text-sm font-semibold leading-5 tabular-nums [overflow-wrap:anywhere] sm:text-base sm:font-bold ${toneClass}`}>{value || MISSING_VALUE}</p>
        )}
        {helper && <p className="mt-1 line-clamp-2 max-w-full break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{helper}</p>}
      </div>
    </div>
  )
}

function AwardDetailCard({ title, icon: Icon, rows }) {
  return (
    <Card className="rounded-xl border-border/80">
      <CardHeader className="p-3 pb-1.5 sm:p-4 sm:pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 sm:h-8 sm:w-8">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-1 sm:p-4 sm:pt-1">
        <div className="divide-y divide-border/70">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-1 gap-1 py-2.5 first:pt-1 last:pb-0 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-start sm:gap-4 sm:py-3">
            <p className="text-xs font-medium tracking-normal text-muted-foreground sm:text-xs sm:uppercase sm:tracking-wide">{label}</p>
            <p className={`min-w-0 break-words text-[13px] font-semibold leading-5 sm:text-sm ${value === MISSING_VALUE ? 'text-muted-foreground' : 'text-foreground'}`}>
              {value || MISSING_VALUE}
            </p>
          </div>
        ))}
        </div>
      </CardContent>
    </Card>
  )
}

function normalizeSiteVisitPhotos(photos) {
  if (!Array.isArray(photos)) return []
  return photos
    .filter((photo) => photo && (photo.url || photo.fileUrl || photo.publicUrl || photo.downloadUrl))
    .map((photo, index) => ({
      id: photo.id || `photo-${index}`,
      url: photo.url || photo.fileUrl || photo.publicUrl || photo.downloadUrl || '',
      fileUrl: photo.fileUrl || photo.url || photo.publicUrl || photo.downloadUrl || '',
      name: photo.name || photo.fileName || `Photo ${index + 1}`,
      size: photo.size || photo.fileSize || '',
      type: photo.type || photo.mimeType || photo.fileType || '',
      caption: photo.caption || '',
      uploadedAt: photo.uploadedAt || photo.addedAt || '',
    }))
}

function getSiteVisitPhotoUrl(photo = {}) {
  return photo.url || photo.fileUrl || photo.publicUrl || photo.downloadUrl || ''
}

function formatSiteVisitPhotoCount(count) {
  return `${count} photo${count === 1 ? '' : 's'}`
}

function formatPhotoSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return ''
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function getSiteVisitDateValue(visit = {}) {
  return visit.visitDate || visit.date || visit.visitedAt || null
}

function parseSafeSiteVisitDate(value) {
  if (!value) return null
  let date = null

  if (typeof value?.toDate === 'function') {
    date = value.toDate()
  } else if (typeof value?.seconds === 'number') {
    date = new Date(value.seconds * 1000)
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch
      date = new Date(Number(year), Number(month) - 1, Number(day))
    } else {
      date = new Date(trimmed)
    }
  } else {
    date = new Date(value)
  }

  if (!date || Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  if (year < 2000 || year > 2100) return null
  return date
}

function getSafeSiteVisitDateParts(visit = {}) {
  const date = parseSafeSiteVisitDate(getSiteVisitDateValue(visit))
  if (!date) return { day: '—', month: '', year: '', label: '—' }

  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleString('en-GB', { month: 'short' }).toUpperCase()
  const year = String(date.getFullYear())
  return { day, month, year, label: `${day} ${month} ${year}` }
}

function getSiteVisitTime(visit = {}) {
  const directTime = visit.visitTime || visit.time || visit.visit_time
  if (directTime && String(directTime).trim()) return String(directTime).trim()
  if (!visit.visitedAt) return ''
  if (typeof visit.visitedAt === 'string') {
    const visitedAt = visit.visitedAt.trim()
    const timeOnly = /^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s?(AM|PM))?$/i.exec(visitedAt)
    if (timeOnly) return visitedAt
  }
  const date = parseSafeSiteVisitDate(visit.visitedAt)
  if (!date) return ''
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function getSiteVisitStatusClass(status) {
  return status === 'Issue'
    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
    : status === 'Partial'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'
}

function SiteVisitCard({ visit, tenderName, isAdmin, onView, onEdit, onDelete, onPhotoPreview }) {
  const dateObj = parseSafeSiteVisitDate(getSiteVisitDateValue(visit))
  const validDate = Boolean(dateObj)
  const day = validDate ? String(dateObj.getDate()).padStart(2, '0') : '—'
  const month = validDate ? dateObj.toLocaleString('en-GB', { month: 'short' }).toUpperCase() : ''
  const year = validDate ? dateObj.getFullYear() : ''

  const statusClass = visit.status === 'Issue'
    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'
    : visit.status === 'Partial'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'

  const hasLabourOrMaterials = Boolean((visit.labourUsed && String(visit.labourUsed).trim()) || (visit.materialUsed && String(visit.materialUsed).trim()))
  const workCompletedText = visit.workCompleted && String(visit.workCompleted).trim() ? visit.workCompleted : ''
  const issuesText = visit.issues && String(visit.issues).trim() ? visit.issues : ''
  const nextDayText = visit.nextDayPlan && String(visit.nextDayPlan).trim() ? visit.nextDayPlan : ''
  const notesText = visit.notes && String(visit.notes).trim() ? visit.notes : ''
  const photos = normalizeSiteVisitPhotos(visit.photos)

  return (
    <Card className="min-w-0 self-start overflow-hidden border-border/80 transition-shadow hover:shadow-md">
      <CardContent className="min-w-0 space-y-3.5 p-3.5 sm:p-4">
        {/* Header: date badge · title · time */}
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-[62px] w-[58px] shrink-0 flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-emerald-900/5 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            <span className="font-mono text-2xl font-semibold leading-none tabular-nums">{day}</span>
            <span className="mt-1 text-xs font-semibold leading-none tracking-normal sm:uppercase sm:tracking-wide">{month || 'DATE'}</span>
            {year && <span className="mt-1 text-[9px] font-medium leading-none text-emerald-700/65 dark:text-emerald-300/70">{year}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="break-words text-[15px] font-semibold leading-snug text-foreground">
              {visit.location || 'Site visit'}
            </p>
            {tenderName && (
              <p className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">{tenderName}</p>
            )}
          </div>
          {getSiteVisitTime(visit) && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="h-3 w-3" />
              {getSiteVisitTime(visit)}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 space-y-2.5">
          {workCompletedText ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <SiteVisitField label="Work completed" value={workCompletedText} />
            </div>
          ) : null}
          {hasLabourOrMaterials && (
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <SiteVisitField label="Labour" value={visit.labourUsed} compact />
              </div>
              <div className="rounded-xl border border-border/70 bg-background p-3">
                <SiteVisitField label="Materials" value={visit.materialUsed} compact />
              </div>
            </div>
          )}
          {issuesText && (
            <div className="rounded-xl border border-rose-200/70 bg-rose-50/60 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
              <p className="text-xs font-medium tracking-normal text-rose-700 dark:text-rose-300 sm:font-semibold sm:uppercase sm:tracking-wide">Issues / delays</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">{issuesText}</p>
            </div>
          )}
          {nextDayText && (
            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="text-xs font-medium tracking-normal text-emerald-700 dark:text-emerald-300 sm:font-semibold sm:uppercase sm:tracking-wide">Next-day plan</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">{nextDayText}</p>
            </div>
          )}
          {notesText && <SiteVisitField label="Notes" value={notesText} compact />}
          {photos.length > 0 && <SiteVisitPhotoStrip photos={photos} onOpenPhoto={(index) => onPhotoPreview?.(photos, index)} />}
        </div>

        {/* Footer: status badge left, actions right */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-3">
          {visit.status ? (
            <Badge variant="outline" className={`rounded-full px-2.5 py-1 text-xs ${statusClass}`}>{visit.status}</Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onView}>
              <Eye className="h-3.5 w-3.5" /> View
            </Button>
            {isAdmin && (
              <>
              <Button type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5 text-xs text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SiteVisitPhotoStrip({ photos, onOpenPhoto }) {
  const visible = photos.slice(0, 3)
  const extra = Math.max(photos.length - visible.length, 0)
  return (
    <div className="w-full rounded-xl border border-border/70 bg-muted/10 p-2.5 text-left">
      <div className="mb-2.5 flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
          <ImageIcon className="h-3.5 w-3.5" />
          Photos
        </span>
        <span className="text-muted-foreground">{formatSiteVisitPhotoCount(photos.length)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {visible.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => onOpenPhoto?.(index)}
            className="relative aspect-video overflow-hidden rounded-md border border-border/70 bg-muted transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
            aria-label={`Preview site visit photo ${index + 1}`}
          >
            <SiteVisitPhotoImage photo={photo} className="h-full w-full object-cover" />
            {index === visible.length - 1 && extra > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">+{extra}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function SiteVisitPhotoImage({ photo, className = '' }) {
  const [failed, setFailed] = useState(false)
  const photoUrl = getSiteVisitPhotoUrl(photo)
  if (!photoUrl || failed) {
    return (
      <div className={`flex items-center justify-center bg-muted text-muted-foreground ${className}`}>
        <ImageIcon className="h-5 w-5" />
      </div>
    )
  }
  return <img src={photoUrl} alt={photo.caption || photo.name || 'Site visit photo'} className={className} loading="lazy" onError={() => setFailed(true)} />
}

function SiteVisitPhotoTile({ photo, editable = false, onRemove, onOpen }) {
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-xl border border-border/80 bg-background">
      <button type="button" className="block aspect-square w-full overflow-hidden bg-muted" onClick={onOpen} disabled={!onOpen}>
        <SiteVisitPhotoImage photo={photo} className="h-full w-full object-cover" />
      </button>
      {editable && (
      <div className="min-w-0 px-2 py-1.5">
        <p className="truncate text-xs font-medium text-foreground" title={photo.name}>{photo.name || 'Photo'}</p>
        {formatPhotoSize(photo.size) && <p className="text-xs text-muted-foreground">{formatPhotoSize(photo.size)}</p>}
      </div>
      )}
      {editable && (
        <Button type="button" variant="secondary" size="icon-sm" className="absolute right-1.5 top-1.5 h-7 w-7 rounded-full bg-background/90 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" onClick={onRemove} aria-label="Remove photo">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

function SiteVisitViewDialog({ open, visit, tenderName, isAdmin, onOpenChange, onEdit, onPhotoPreview }) {
  if (!visit) return null

  const dateParts = getSafeSiteVisitDateParts(visit)
  const visitTime = getSiteVisitTime(visit)
  const statusClass = getSiteVisitStatusClass(visit.status)
  const photos = normalizeSiteVisitPhotos(visit.photos)
  const safe = (value) => (value && String(value).trim() ? value : '—')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl overflow-x-hidden overflow-y-auto rounded-2xl p-0">
        <DialogHeader className="border-b border-border px-4 py-4 text-left sm:px-6">
          <DialogTitle className="min-w-0 break-words text-xl font-semibold">
            {safe(visit.location || 'Site visit')}
          </DialogTitle>
          <DialogDescription className="min-w-0 break-words">
            {safe(tenderName)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4 sm:px-6">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            <SiteVisitDetailBox icon={CalendarDays} label="Visit Date" value={dateParts.label} />
            <SiteVisitDetailBox icon={Clock} label="Visit Time" value={visitTime || '\u2014'} />
            <div className="min-w-0 rounded-xl border border-border/80 bg-background p-3">
              <p className="text-xs font-medium tracking-normal text-muted-foreground sm:font-semibold sm:uppercase sm:tracking-wide">Status</p>
              {visit.status ? (
                <Badge variant="outline" className={`mt-2 rounded-full px-2.5 py-1 text-xs ${statusClass}`}>{visit.status}</Badge>
              ) : (
                <p className="mt-2 text-sm font-medium text-foreground">—</p>
              )}
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-1">
              <SiteVisitDetailSection label="Work Completed" value={visit.workCompleted} className="md:col-span-2 lg:col-span-1" />
              <SiteVisitDetailSection label="Labour Used" value={visit.labourUsed} />
              <SiteVisitDetailSection label="Material Used" value={visit.materialUsed} />
              <SiteVisitDetailSection label="Issues / Delays" value={visit.issues} tone="rose" />
              <SiteVisitDetailSection label="Next-Day Plan" value={visit.nextDayPlan} tone="emerald" />
              <SiteVisitDetailSection label="Notes" value={visit.notes} className="md:col-span-2 lg:col-span-1" />
            </div>
            <div className="min-w-0 rounded-xl border border-border/80 bg-background p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Photos ({photos.length})</p>
                {photos.length > 0 && <span className="text-xs text-muted-foreground">Click to preview</span>}
              </div>
              {photos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photos.map((photo, index) => (
                    <SiteVisitPhotoTile key={photo.id} photo={photo} onOpen={() => onPhotoPreview?.(photos, index)} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-muted/15 p-5 text-center text-sm text-muted-foreground">
                  No photos attached to this visit.
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border px-4 py-4 sm:px-6">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Close</Button>
          {isAdmin && (
            <Button type="button" className="w-full sm:w-auto" onClick={() => onEdit(visit)}>
              <Pencil className="h-4 w-4" /> Edit Site Visit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SiteVisitPhotoPreviewDialog({ preview, onOpenChange, onNavigate }) {
  const photos = normalizeSiteVisitPhotos(preview.photos)
  const open = photos.length > 0
  const safeIndex = Math.min(Math.max(Number(preview.index) || 0, 0), Math.max(photos.length - 1, 0))
  const photo = photos[safeIndex]
  const photoUrl = getSiteVisitPhotoUrl(photo)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [photoUrl])

  const goToPhoto = (nextIndex) => {
    if (!photos.length) return
    const wrappedIndex = (nextIndex + photos.length) % photos.length
    onNavigate(wrappedIndex)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-5xl overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-border px-4 py-3 text-left sm:px-5">
          <DialogTitle className="min-w-0 truncate text-base font-semibold">
            {photo?.name || 'Site visit photo'}
          </DialogTitle>
          <DialogDescription>
            {photos.length > 1 ? `${safeIndex + 1} of ${photos.length}` : 'Photo preview'}
          </DialogDescription>
        </DialogHeader>

        <div className="relative bg-muted/30 p-3 sm:p-4">
          <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-background sm:min-h-[420px]">
            {photoUrl && !failed ? (
              <img
                src={photoUrl}
                alt={photo?.caption || photo?.name || 'Site visit photo'}
                className="max-h-[calc(100dvh-10rem)] w-auto max-w-full object-contain sm:max-h-[72vh]"
                onError={() => setFailed(true)}
              />
            ) : (
              <div className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <ImageIcon className="h-8 w-8" />
                <span>Image preview unavailable.</span>
              </div>
            )}
          </div>

          {photos.length > 1 && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-background/90 shadow-md"
                onClick={() => goToPhoto(safeIndex - 1)}
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-5 top-1/2 h-10 w-10 -translate-y-1/2 rounded-full bg-background/90 shadow-md"
                onClick={() => goToPhoto(safeIndex + 1)}
                aria-label="Next photo"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SiteVisitDetailBox({ icon: Icon, label, value }) {
  const isEmpty = !value
  return (
    <div className="min-w-0 rounded-xl border border-border/80 bg-background p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-normal text-muted-foreground sm:font-semibold sm:uppercase sm:tracking-wide">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={`mt-2 break-words text-sm font-semibold ${isEmpty ? 'text-muted-foreground' : 'text-foreground'}`}>{value || '—'}</p>
    </div>
  )
}

function SiteVisitDetailSection({ label, value, tone, className = '' }) {
  const toneClass = tone === 'rose'
    ? 'border-rose-200/70 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20'
    : tone === 'emerald'
      ? 'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20'
      : 'border-border/80 bg-background'
  const isEmpty = !(value && String(value).trim())
  const display = isEmpty ? '-' : value

  return (
    <div className={`min-w-0 rounded-xl border p-3 ${toneClass} ${className}`}>
      <p className="text-xs font-medium tracking-normal text-muted-foreground sm:font-semibold sm:uppercase sm:tracking-wide">{label}</p>
      <p className={`mt-1 whitespace-pre-wrap break-words text-sm leading-5 ${isEmpty ? 'text-muted-foreground' : 'text-foreground'}`}>{display}</p>
    </div>
  )
}

function SiteVisitField({ label, value, compact = false }) {
  const isEmpty = !(value && String(value).trim())
  const display = isEmpty ? '-' : value
  return (
    <div>
      <p className="text-xs font-medium tracking-normal text-muted-foreground sm:font-semibold sm:uppercase sm:tracking-wide">{label}</p>
      <p className={`mt-0.5 whitespace-pre-wrap break-words ${compact ? 'text-xs' : 'text-sm'} text-foreground`}>{display}</p>
    </div>
  )
}

function TenderMetric({ icon: Icon, label, value, detail, tone, className = '' }) {
  return (
    <KpiCard
      className={className}
      icon={Icon}
      label={label}
      value={value}
      helper={detail}
      tone={tone || 'blue'}
      valueClassName="text-base sm:text-lg"
    />
  )
}

function BoqMetric({ icon: Icon, label, value, tone }) {
  const valueClasses = {
    emerald: 'text-emerald-700 dark:text-emerald-300',
    orange: 'text-orange-600 dark:text-orange-300',
    blue: 'text-emerald-700 dark:text-emerald-300',
    violet: 'text-violet-700 dark:text-violet-300',
  }

  return (
    <KpiCard
      icon={Icon}
      label={label}
      value={value}
      tone={tone || 'emerald'}
      valueClassName={`text-sm font-semibold sm:text-xl ${valueClasses[tone] || valueClasses.emerald}`}
    />
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
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'neutral'
          ? 'text-amber-600 dark:text-amber-400'
          : tone === 'pending'
            ? 'text-muted-foreground'
            : 'text-foreground'
  return (
    <div className="min-w-0">
      <p className={`${large ? 'text-xs font-medium text-foreground sm:text-sm' : 'text-xs font-medium text-muted-foreground sm:text-sm sm:font-normal'}`}>{label}</p>
      <p className={`mt-1 break-words font-mono ${large ? 'text-sm font-semibold sm:text-lg' : 'text-sm font-semibold sm:text-base'} leading-5 tabular-nums [overflow-wrap:anywhere] ${toneClass}`}>
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
    <div className={`min-w-0 rounded-xl border border-border/80 bg-card px-3 py-3 ${className}`}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium tracking-normal text-muted-foreground sm:font-semibold sm:uppercase sm:tracking-wide">
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/80" />
        <span>{label}</span>
      </div>
      <div className="min-w-0">
        {children}
        {note && <p className="mt-1 text-xs leading-4 text-muted-foreground">{note}</p>}
      </div>
    </div>
  )
}

function DetailValue({ children }) {
  return (
    <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-5 text-foreground [overflow-wrap:anywhere] md:text-[15px]">
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
      <span className={`max-w-full overflow-x-auto whitespace-nowrap text-right font-mono font-medium tabular-nums ${toneClass}`}>{value}</span>
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
      <div className="flex items-center gap-2 text-xs font-medium tracking-normal text-muted-foreground sm:uppercase sm:tracking-wide">
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
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

function ProjectMetric({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="max-w-full overflow-x-auto whitespace-nowrap text-xl font-semibold tabular-nums tracking-tight text-foreground [scrollbar-width:thin] sm:text-2xl">{value}</p>
        </div>
      </div>
    </div>
  )
}

function ProjectSecondary({ label, value }) {
  return <div className="min-w-0 px-2 py-1 sm:border-r sm:last:border-r-0"><p className="text-xs text-muted-foreground">{label}</p><p className="max-w-full overflow-x-auto whitespace-nowrap text-base font-semibold tabular-nums [scrollbar-width:thin]">{value}</p></div>
}

function ProjectDetailValue({ label, value }) {
  return <div className="grid min-w-0 grid-cols-[minmax(100px,0.42fr)_minmax(0,1fr)] gap-3 border-b border-border/60 py-2 text-sm last:border-b-0"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words font-medium">{value || 'Not recorded'}</dd></div>
}

function ProjectRecordRow({ title, meta, value, tab, onViewTab }) {
  return <button type="button" onClick={() => onViewTab(tab)} className="flex w-full min-w-0 items-center justify-between gap-3 border-b border-border/60 py-2.5 text-left text-sm last:border-b-0 hover:text-emerald-700 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 dark:hover:text-emerald-300">
    <span className="min-w-0"><span className="block break-words font-medium">{title}</span><span className="block break-words text-xs text-muted-foreground">{meta}</span></span>
    {value && <span className="shrink-0 whitespace-nowrap tabular-nums">{value}</span>}
    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
  </button>
}

function TenderOverviewDashboard({ form, linkedPOs, expectedProfit, cashPosition, financialView, dashboardProgress, progressMessage, doneCount, checklist, expenses, documents, recentSiteVisits, recentDocuments, recentExpenses, recentBills, checklistExpanded, setChecklistExpanded, addChecklistItem, updateChecklistItem, removeChecklistItem, isAdmin, onNotesChange, onEditDetails, onViewTab }) {
  const award = getAwardWorkOrderDetails(form)
  const held = linkedPOs.reduce((sum, po) => sum + (securityAmounts(po).remaining || 0), 0)
  const missingCompletion = form.status === 'Completed' && !form.completionDate
  const actions = [
    missingCompletion && { title: 'Completion date not recorded', detail: 'Work is marked completed, but no completion date is saved.', label: 'Edit details', onClick: onEditDetails },
    expectedProfit === null && { title: 'Cost forecast incomplete', detail: 'Enter the remaining-cost forecast to complete the profit view.', label: 'Open BOQ', onClick: () => onViewTab('boq') },
    financialView.unknownPaymentCount > 0 && { title: 'Payment history incomplete', detail: `${financialView.unknownPaymentCount} expense payment histor${financialView.unknownPaymentCount === 1 ? 'y is' : 'ies are'} unresolved.`, label: 'View expenses', onClick: () => onViewTab('expenses') },
    held > 0 && { title: 'Security still held', detail: `${formatCurrency(held)} is recorded as held against this project.`, label: 'View pay orders', onClick: () => onViewTab('payorders') },
  ].filter(Boolean)
  const records = [
    ...recentDocuments.slice(0, 2).map((item) => ({ key: `doc-${item.id || item.title}`, title: item.title || item.type || 'Document', meta: `Document${item.addedAt ? ` · ${formatDate(item.addedAt)}` : ''}`, tab: 'documents' })),
    ...recentBills.slice(0, 2).map((item) => ({ key: `bill-${item.id || item.no}`, title: item.isRaBill ? `RA bill ${item.no || ''}` : (item.no || item.desc || 'Bill'), meta: item.status || 'Bill', tab: item.isRaBill ? 'rabills' : 'bills' })),
    ...linkedPOs.slice(0, 2).map((item) => ({ key: `po-${item.id}`, title: item.po || 'Pay order', meta: `Pay order · ${item.status || 'No status'}`, tab: 'payorders' })),
    ...recentSiteVisits.slice(0, 2).map((item) => ({ key: `visit-${item.id || item.visitDate}`, title: item.location || item.workCompleted || 'Site visit', meta: `Site visit · ${formatDate(item.date || item.visitDate)}`, tab: 'site-visits' })),
  ]
  const shortcuts = [
    { label: 'Checklist', count: `${doneCount}/${checklist.length}`, onClick: () => setChecklistExpanded((value) => !value) },
    { label: 'Site Visits', count: (form.siteVisits || form.visits || []).length, onClick: () => onViewTab('site-visits') },
    { label: 'Documents', count: documents.length, onClick: () => onViewTab('documents') },
    { label: 'Expenses', count: expenses.length, onClick: () => onViewTab('expenses') },
    { label: 'Pay Orders', count: linkedPOs.length, onClick: () => onViewTab('payorders') },
    { label: 'Bills / RA', count: (form.bills || []).length + (form.raBills || []).length, onClick: () => onViewTab('bills') },
  ]

  return <div className="space-y-4">
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(310px,1fr)]">
      <Card className="min-w-0 rounded-xl border-border/80">
        <CardHeader className="p-4 pb-2"><CardTitle className="text-lg">Project Details</CardTitle></CardHeader>
        <CardContent className="p-4 pt-0">
          <dl className="grid gap-x-6 md:grid-cols-2">
            <ProjectDetailValue label="Agency" value={form.agency} />
            <ProjectDetailValue label="Work order" value={award.workOrderNumber} />
            <ProjectDetailValue label="NIT / Reference" value={form.nit} />
            <ProjectDetailValue label="Work order date" value={award.workOrderDate ? formatDate(award.workOrderDate) : null} />
            <ProjectDetailValue label="Estimated cost" value={form.estimatedCost !== '' && form.estimatedCost != null ? formatCurrency(Number(form.estimatedCost)) : null} />
            <ProjectDetailValue label="Expected completion" value={award.expectedCompletionDate ? formatDate(award.expectedCompletionDate) : null} />
            <ProjectDetailValue label="Quoted amount" value={form.quotedAmount !== '' && form.quotedAmount != null ? formatCurrency(Number(form.quotedAmount)) : null} />
            <ProjectDetailValue label="Actual completion" value={form.completionDate ? formatDate(form.completionDate) : 'Not recorded'} />
          </dl>
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center justify-between gap-2 text-sm font-semibold"><span>Execution progress</span><span className="tabular-nums">{dashboardProgress}%</span></div>
            <Progress value={dashboardProgress} className="mt-2 h-2" />
            <p className="mt-2 text-xs text-muted-foreground">Recorded status: {form.status || 'Not recorded'} · {progressMessage}</p>
          </div>
        </CardContent>
      </Card>
      <Card className="min-w-0 self-start rounded-xl border-border/80">
        <CardHeader className="p-4 pb-2"><CardTitle className="text-lg">Next Actions</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-4 pt-0">
          {actions.length ? actions.map((item) => <div key={item.title} className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><p className="break-words text-sm font-semibold">{item.title}</p><p className="mt-0.5 break-words text-xs text-muted-foreground">{item.detail}</p></div>
            <Button type="button" variant="outline" size="sm" className="shrink-0 self-start" onClick={item.onClick}>{item.label}</Button>
          </div>) : <p className="text-sm text-muted-foreground">No supported follow-ups from the current records.</p>}
        </CardContent>
      </Card>
    </div>
    <div className="grid grid-cols-2 gap-1 rounded-xl border bg-card p-2 sm:grid-cols-3 xl:grid-cols-6">
      {shortcuts.map((item) => <button key={item.label} type="button" onClick={item.onClick} className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600"><span className="break-words text-emerald-700 dark:text-emerald-300">{item.label}</span><span className="shrink-0 font-semibold tabular-nums">{item.count}</span></button>)}
    </div>
    {checklistExpanded && <Card className="rounded-xl"><CardHeader className="flex flex-row items-center justify-between p-4 pb-2"><CardTitle className="text-lg">Checklist · {doneCount}/{checklist.length} complete</CardTitle>{isAdmin && <Button type="button" size="sm" variant="outline" onClick={addChecklistItem}><Plus className="h-4 w-4" /> Add Item</Button>}</CardHeader><CardContent className="space-y-2 p-4 pt-0">{checklist.length ? checklist.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2"><Checkbox checked={item.done} onCheckedChange={(value) => updateChecklistItem(item.id, { done: value })} disabled={!isAdmin} /><Input aria-label="Checklist item" value={item.label || ''} onChange={(event) => updateChecklistItem(item.id, { label: event.target.value })} disabled={!isAdmin} className="min-w-0 flex-1" />{isAdmin && <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete checklist item" onClick={() => removeChecklistItem(item.id)}><Trash2 className="h-4 w-4" /></Button>}</div>) : <p className="text-sm text-muted-foreground">No checklist items yet.</p>}</CardContent></Card>}
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card className="min-w-0 rounded-xl"><CardHeader className="flex flex-row items-center justify-between p-4 pb-2"><CardTitle className="text-lg">Recent Expenses</CardTitle><Button type="button" variant="ghost" size="sm" onClick={() => onViewTab('expenses')}>View all</Button></CardHeader><CardContent className="p-4 pt-0">{recentExpenses.length ? recentExpenses.slice(0, 4).map((item) => <ProjectRecordRow key={item.id} title={item.description || 'Expense'} meta={formatDate(item.date)} value={formatCurrency(Number(item.amount) || 0)} tab="expenses" onViewTab={onViewTab} />) : <p className="text-sm text-muted-foreground">No expenses recorded.</p>}</CardContent></Card>
      <Card className="min-w-0 self-start rounded-xl"><CardHeader className="p-4 pb-2"><CardTitle className="text-lg">Recent Records</CardTitle></CardHeader><CardContent className="p-4 pt-0">{records.length ? records.map((item) => <ProjectRecordRow key={item.key} title={item.title} meta={item.meta} tab={item.tab} onViewTab={onViewTab} />) : <p className="text-sm text-muted-foreground">No documents, bills, pay orders or site visits recorded.</p>}</CardContent></Card>
    </div>
    <details className="rounded-xl border bg-card p-4 text-sm"><summary className="cursor-pointer font-semibold">Notes &amp; Status History</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><div><Label htmlFor="project-notes">Project notes</Label><Textarea id="project-notes" value={form.notes || ''} onChange={(event) => onNotesChange(event.target.value)} disabled={!isAdmin} rows={4} className="mt-2" /></div><div><p className="font-medium">Status history</p>{(form.statusHistory || []).length ? <ul className="mt-2 space-y-2">{form.statusHistory.map((item, index) => <li key={index} className="break-words text-muted-foreground">{formatDate(item.date)} · {item.from || 'Unknown'} → {item.to || 'Unknown'}</li>)}</ul> : <p className="mt-2 text-muted-foreground">No status changes recorded.</p>}</div></div></details>
    {cashPosition === null && <p className="text-xs text-muted-foreground">Payment history is incomplete; cash movement remains unverified.</p>}
  </div>
}

function ExpensesFinanceSection({
  expenses,
  filteredExpenses,
  expenseTotal,
  expenseOther,
  heldByAgency,
  bidSecurityAtRisk,
  sunkCost,
  tenderGrossNetValues,
  openGrossNetDialog,
  isAdmin,
  openExpDialog,
  setDeleteExpId,
  setViewExpense,
  expenseSearch,
  setExpenseSearch,
  expenseCategoryFilter,
  setExpenseCategoryFilter,
  expenseCategoryOptions,
  expenseDateFrom,
  setExpenseDateFrom,
  expenseDateTo,
  setExpenseDateTo,
  expenseFiltersActive,
  clearExpenseFilters,
  exportFilteredExpenses,
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-border/80 bg-background p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Expenses</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Track project-related spending, documentation, and recoverable amounts.
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:h-11 sm:w-auto" onClick={() => openExpDialog()}>
            <Plus className="h-4 w-4" /> Add Expense
          </Button>
        )}
      </div>

      <section className="rounded-xl border border-border/80 bg-slate-50/40 dark:bg-slate-900/30 p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Contract Financial Basis</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Used for Gross/Net based expense percentage calculations.
            </p>
          </div>
          {isAdmin && (
            <Button type="button" variant="outline" size="sm" className="w-full shrink-0 sm:w-auto" onClick={openGrossNetDialog}>
              <Pencil className="h-3.5 w-3.5" /> Edit Gross / Net
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <GrossNetSummaryCard icon={DollarSign} label="Gross Basis" value={formatCurrency(tenderGrossNetValues.grossValue)} helper="Recorded gross, contract or quote" tone="emerald" />
          <GrossNetSummaryCard icon={Banknote} label="Recorded Net Value" value={tenderGrossNetValues.netValue === null ? 'Not set' : formatCurrency(tenderGrossNetValues.netValue)} helper="Separate from payment receipts" tone="blue" />
          <GrossNetSummaryCard icon={Receipt} label="Gross Minus Net" value={tenderGrossNetValues.difference === null ? '—' : formatCurrency(tenderGrossNetValues.difference)} helper="Not an itemized deduction total" tone="amber" />
        </div>
      </section>

      <div className="metric-grid-five">
        <ExpenseSummaryCard icon={WalletCards} label="Total Expenses" value={expenseTotal} helper="All recorded expenses" tone="emerald" />
        <ExpenseSummaryCard icon={CheckCircle} label="Paid Expenses" value={expenseOther} helper="Recorded project spend" tone="green" />
        <ExpenseSummaryCard icon={Landmark} label="Recoverable / Held" value={heldByAgency} helper="Recoverable / held by agency" tone="blue" />
        <ExpenseSummaryCard icon={Receipt} label="At Risk" value={bidSecurityAtRisk} helper="Potentially at risk" tone="amber" />
        <ExpenseSummaryCard icon={Trash2} label="Sunk Cost / Non-Recoverable" value={sunkCost} helper="Non-recoverable expenses" tone="red" />
      </div>

      <div className="rounded-xl border border-border/80 bg-background p-3 md:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.4fr)_minmax(170px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto_auto] lg:items-end">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search tender expenses" type="search" value={expenseSearch} onChange={(event) => setExpenseSearch(event.target.value)} placeholder="Search expenses..." className="h-10 pl-9 sm:h-11" />
          </div>
          <BillSelect label="Category" value={expenseCategoryFilter} onValueChange={setExpenseCategoryFilter} options={['All', ...expenseCategoryOptions]} />
          <BillDateFilter label="Date From" value={expenseDateFrom} onChange={(event) => setExpenseDateFrom(event.target.value)} />
          <BillDateFilter label="Date To" value={expenseDateTo} onChange={(event) => setExpenseDateTo(event.target.value)} />
          {expenseFiltersActive && (
            <Button type="button" variant="outline" className="h-10 sm:h-11" onClick={clearExpenseFilters}>
              <Clock className="h-4 w-4" /> Clear filters
            </Button>
          )}
          <Button type="button" variant="outline" className="h-10 sm:h-11" onClick={exportFilteredExpenses} disabled={filteredExpenses.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {expenses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
            <Receipt className="h-7 w-7" />
          </div>
          <p className="mt-4 text-base font-semibold text-foreground">No expenses added yet</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Add project expenses to track spending, recoverables, and deductions.
          </p>
          {isAdmin && (
            <Button onClick={() => openExpDialog()} className="mt-5 bg-emerald-600 text-white hover:bg-emerald-700">
              <Plus className="h-4 w-4" /> Add first expense
            </Button>
          )}
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No expenses match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a different search, category, or date range.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filteredExpenses.map((expense) => (
              <ExpenseMobileCard key={expense.id} expense={expense} isAdmin={isAdmin} onView={setViewExpense} onEdit={openExpDialog} onDelete={setDeleteExpId} />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-xl border border-border/80 bg-background md:block">
            <Table className="min-w-[1040px]">
              <TableHeader>
                <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 dark:bg-slate-900/45 dark:hover:bg-slate-900/45">
                  <TableHead className="w-[130px] whitespace-nowrap pl-6 text-xs font-semibold uppercase text-slate-500">Date</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Description</TableHead>
                  <TableHead className="w-[170px] text-xs font-semibold uppercase text-slate-500">Category</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Notes</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Amount</TableHead>
                  <TableHead className="w-[105px] text-xs font-semibold uppercase text-slate-500">Based On</TableHead>
                  <TableHead className="w-[90px] text-right text-xs font-semibold uppercase text-slate-500">%</TableHead>
                  <TableHead className="text-xs font-semibold uppercase text-slate-500">Status / Type</TableHead>
                  <TableHead className="pr-6 text-right text-xs font-semibold uppercase text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExpenses.map((expense) => (
                  <TableRow key={expense.id} className="h-16 border-border/70 hover:bg-slate-50/50 dark:hover:bg-slate-900/35">
                    <TableCell className="whitespace-nowrap pl-6 text-sm text-slate-700 dark:text-slate-300">{formatDate(expense.date)}</TableCell>
                    <TableCell className="max-w-[260px] text-sm font-medium text-foreground">
                      <span className="line-clamp-2">{expense.description || '-'}</span>
                    </TableCell>
                    <TableCell className="max-w-[170px]"><ExpenseCategoryBadge category={expense.category || 'Miscellaneous'} /></TableCell>
                    <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                      <span className="line-clamp-2">{expense.note || '-'}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-slate-950 dark:text-slate-50">{formatCurrency(Number(expense.amount) || 0)}</TableCell>
                    <TableCell><AmountBasisBadge basis={expense.amountBasis} compact /></TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-sm tabular-nums text-muted-foreground">{formatExpensePercent(expense.percentage)}</TableCell>
                    <TableCell><ExpenseStatusBadge status={getExpenseStatusLabel(expense)} /></TableCell>
                    <TableCell className="pr-6">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="icon-sm" onClick={() => setViewExpense(expense)} aria-label="View expense"><Eye className="h-3.5 w-3.5" /></Button>
                        {isAdmin && <Button type="button" variant="outline" size="icon-sm" onClick={() => openExpDialog(expense)} aria-label="Edit expense"><Pencil className="h-3.5 w-3.5" /></Button>}
                        {isAdmin && <Button type="button" variant="outline" size="icon-sm" className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300" onClick={() => setDeleteExpId(expense.id)} aria-label="Delete expense"><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t border-border/80 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
              <span>Showing 1 to {filteredExpenses.length} of {expenses.length} expenses</span>
              <span>{filteredExpenses.length === expenses.length ? 'All expenses visible' : 'Filtered view'}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ExpenseSummaryCard({ icon: Icon, label, value, helper, tone }) {
  return <BillSummaryCard icon={Icon} label={label} value={value} helper={helper} tone={tone} />
}

function GrossNetSummaryCard({ icon: Icon, label, value, helper, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    blue: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
  }
  const valueTone = {
    emerald: 'text-emerald-700 dark:text-emerald-300',
    blue: 'text-blue-700 dark:text-blue-300',
    amber: 'text-amber-700 dark:text-amber-300',
  }
  return (
    <div className="rounded-xl border border-border/80 bg-background p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.emerald}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className={`mt-1 break-words font-mono text-lg font-bold tabular-nums ${valueTone[tone] || valueTone.emerald}`}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
      </div>
    </div>
  )
}

function AmountBasisBadge({ basis, compact = false }) {
  const normalized = ['gross', 'net', 'manual'].includes(basis) ? basis : 'manual'
  const className = normalized === 'gross'
    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
    : normalized === 'net'
      ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
  return (
    <Badge variant="outline" className={`max-w-full shrink-0 rounded-full ${compact ? 'px-2 py-0.5 text-xs' : ''} ${className}`}>
      {getExpenseBasisLabel(normalized)}
    </Badge>
  )
}

function getExpenseStatusLabel(expense = {}) {
  return expense.status || expense.type || 'Paid'
}

function ExpenseCategoryBadge({ category }) {
  const normalized = category || 'Miscellaneous'
  const className = normalized === 'Printing & Documentation'
    ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
    : normalized === 'Miscellaneous'
      ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
      : normalized.includes('Fuel')
        ? 'border-cyan-200 dark:border-cyan-900/60 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300'
        : normalized.includes('Labour')
          ? 'border-orange-200 dark:border-orange-900/60 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
          : normalized.includes('Tender')
            ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
            : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
  return <Badge variant="outline" className={`max-w-full shrink-0 truncate rounded-full ${className}`}>{normalized}</Badge>
}

function ExpenseStatusBadge({ status }) {
  const normalized = status || 'Paid'
  const className = ['Paid', 'Recoverable'].includes(normalized)
    ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
    : normalized === 'Held by Agency'
      ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
      : normalized === 'At Risk'
        ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
        : ['Sunk Cost', 'Non-Recoverable'].includes(normalized)
          ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
          : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
  return <Badge variant="outline" className={`shrink-0 rounded-full ${className}`}>{normalized}</Badge>
}

function ExpenseMobileCard({ expense, isAdmin, onView, onEdit, onDelete }) {
  const basisLabel = getExpenseBasisLabel(expense.amountBasis)
  const percentLabel = formatExpensePercent(expense.percentage)
  return (
    <div className="rounded-xl border border-border/80 bg-background p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold text-foreground">{expense.description || '-'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ExpenseCategoryBadge category={expense.category || 'Miscellaneous'} />
            <ExpenseStatusBadge status={getExpenseStatusLabel(expense)} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Based on: <span className="font-medium text-slate-700 dark:text-slate-300">{basisLabel}</span> &middot; <span className="font-mono tabular-nums">{percentLabel}</span>
          </p>
        </div>
        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-950 dark:text-slate-50">{formatCurrency(Number(expense.amount) || 0)}</p>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{formatDate(expense.date)}</p>
      {expense.note && <p className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40 text-sm text-muted-foreground">{expense.note}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onView(expense)} aria-label="View expense"><Eye className="h-3.5 w-3.5" /></Button>
        {isAdmin && <Button type="button" variant="outline" size="icon-sm" onClick={() => onEdit(expense)} aria-label="Edit expense"><Pencil className="h-3.5 w-3.5" /></Button>}
        {isAdmin && <Button type="button" variant="outline" size="icon-sm" className="text-rose-600" onClick={() => onDelete(expense.id)} aria-label="Delete expense"><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  )
}

function ExpenseViewDialog({ expense, onOpenChange }) {
  return (
    <Dialog open={!!expense} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense?.description || 'Expense'}</DialogTitle>
          <DialogDescription>Expense details, category, amount, and notes.</DialogDescription>
        </DialogHeader>
        {expense && (
          <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <BillDetail label="Date" value={formatDate(expense.date)} />
            <BillDetail label="Amount" value={formatCurrency(Number(expense.amount) || 0)} />
            <BillDetail label="Category" value={expense.category || '-'} />
            <BillDetail label="Status / Type" value={getExpenseStatusLabel(expense)} />
            <div className="sm:col-span-2">
              <BillDetail label="Notes" value={expense.note || '-'} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function BillFinanceSection(props) {
  if (props.title === 'Bills / Invoices') {
    return <BillsInvoicesSection {...props} />
  }
  if (props.title === 'RA Bills') {
    return <RABillsSection {...props} />
  }
  return <LegacyBillFinanceSection {...props} />
}

function BillsInvoicesSection({
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
  documents = [],
  onViewDocuments,
  otherBills = [],
  contract,
  deductionDefaults = [],
}) {
  const emptyBillForm = () => ({
    id: '',
    no: '',
    type: 'Running Bill',
    date: '',
    documentId: '',
    amount: '',
    approvedAmount: '',
    receivedAmount: '',
    deductions: '',
    status: 'Draft',
    remarks: '',
    desc: '',
    v2: { billing: { basis: 'incremental', previousCertifiedGross: [...bills, ...otherBills].reduce((sum, item) => sum + billAmounts(item).approved, 0), contractBasis: contract, deductionRows: deductionDefaults.map((row) => ({ ...row, id: uid() })), retentionReleases: [] }, receipts: [] },
  })
  const [billFormOpen, setBillFormOpen] = useState(false)
  const [editingBill, setEditingBill] = useState(null)
  const [viewingBill, setViewingBill] = useState(null)
  const [billForm, setBillForm] = useState(emptyBillForm)
  const [billFormError, setBillFormError] = useState('')
  const [billAction, setBillAction] = useState(null)
  const billSaveRef = useRef(false)
  const [deleteBillId, setDeleteBillId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const billTypeOptions = Array.from(new Set([...BILL_TYPES, ...bills.map((bill) => bill.type).filter(Boolean)]))
  const billStatusOptions = Array.from(new Set([...BILL_STATUS_OPTIONS, 'Pending Clearance', ...bills.map(billDisplayStatus).filter(Boolean)]))
  const filteredBills = bills.filter((bill) => {
    const billNo = String(bill.no || bill.billNo || '').toLowerCase()
    const billType = bill.type || 'Running Bill'
    const billStatus = billDisplayStatus(bill)
    const billDate = getBillDate(bill)
    if (searchTerm && !billNo.includes(searchTerm.toLowerCase())) return false
    if (typeFilter !== 'All' && billType !== typeFilter) return false
    if (statusFilter !== 'All' && billStatus !== statusFilter) return false
    if (dateFrom && (!billDate || billDate < dateFrom)) return false
    if (dateTo && (!billDate || billDate > dateTo)) return false
    return true
  })

  const setBillFormValue = (key) => (event) => {
    const value = event?.target?.value ?? event
    setBillForm((previous) => ({ ...previous, [key]: value }))
  }
  const openAddBill = () => {
    billSaveRef.current = false
    setBillFormError('')
    setEditingBill(null)
    setBillForm(emptyBillForm())
    setBillFormOpen(true)
  }
  const openEditBill = (bill) => {
    if (!bill.v2?.billing || ['Approved', 'Paid', 'Partially Paid'].includes(bill.status)) return
    billSaveRef.current = false
    setBillFormError('')
    setEditingBill(bill)
    setBillForm({
      id: bill.id || '',
      no: bill.no || bill.billNo || '',
      type: bill.type || 'Running Bill',
      date: bill[dateKey] || '',
      documentId: bill.documentId || '',
      amount: bill.submittedAmount ?? bill.amount ?? '',
      approvedAmount: bill.approvedAmount ?? '',
      receivedAmount: bill.receivedAmount ?? '',
      deductions: bill.deductions ?? '',
      status: bill.status || 'Draft',
      remarks: bill.remarks || bill.desc || '',
      desc: bill.desc || bill.remarks || '',
      v2: bill.v2 || {},
    })
    setBillFormOpen(true)
  }
  const saveBillForm = (nextStatus) => {
    if (billSaveRef.current) return
    const candidate = { ...billForm, status: nextStatus }
    const fail = (message) => { setBillFormError(message); toast.error(message) }
    if (!candidate.no.trim()) { fail('Bill number is required.'); return }
    if (!candidate.date) { fail('Bill date is required.'); return }
    if (nonNegativeNumber(candidate.amount) === null) { fail('Submitted gross amount must be a valid non-negative number.'); return }
    if (bills.some((bill) => bill.id !== editingBill?.id && String(bill.no || bill.billNo || '').trim().toLowerCase() === candidate.no.trim().toLowerCase())) { fail('Bill number already exists on this project.'); return }
    const otherProjectBills = [...bills.filter((bill) => bill.id !== editingBill?.id), ...otherBills]
    const issue = validateCumulativeBill(candidate, otherProjectBills) || validateProjectReceiptReferences(candidate, otherProjectBills) || validateBillLedger(candidate)
    if (issue) { fail(issue); return }
    const payload = {
      no: billForm.no || '',
      type: billForm.type || 'Running Bill',
      [dateKey]: billForm.date || '',
      documentId: billForm.documentId || '',
      amount: billForm.amount === '' ? 0 : billForm.amount,
      submittedAmount: billForm.amount === '' ? 0 : billForm.amount,
      approvedAmount: billForm.approvedAmount === '' ? '' : billForm.approvedAmount,
      receivedAmount: billForm.receivedAmount === '' ? '' : billForm.receivedAmount,
      deductions: billForm.deductions === '' ? '' : billForm.deductions,
      status: nextStatus,
      remarks: billForm.remarks || '',
      desc: billForm.remarks || '',
      v2: billForm.v2 || {},
    }
    billSaveRef.current = true
    if (editingBill?.id) {
      onUpdate(editingBill.id, payload)
      toast.success('Bill updated')
    } else {
      onAdd(payload)
      toast.success('Bill added')
    }
    setBillFormOpen(false)
    setEditingBill(null)
  }
  const commitBillAction = (next) => {
    if (!isAdmin || !billAction) return
    onUpdate(next.id, { approvedAmount: next.approvedAmount ?? '', status: next.status, v2: next.v2 })
    setBillAction(null)
    toast.success('Bill ledger updated')
  }
  const exportBills = () => {
    const headers = ['Bill No.', 'Type', 'Date', 'Submitted', 'Approved', 'Received', 'Deductions', 'Balance', 'Status']
    const rows = filteredBills.map((bill) => {
      const amounts = getBillAmounts(bill)
      return [
        getBillTitle(bill, '-'),
        bill.type || 'Running Bill',
        getBillDate(bill) || '-',
        amounts.submitted,
        amounts.approved,
        amounts.received,
        amounts.deductions,
        amounts.balance,
        billDisplayStatus(bill),
      ]
    })
    const csv = rowsToCSV(headers, rows, new Set([4, 5, 6, 7, 8]))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bills-invoices.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  const clearFilters = () => {
    setSearchTerm('')
    setTypeFilter('All')
    setStatusFilter('All')
    setDateFrom('')
    setDateTo('')
  }

  const summaryCards = [
    { icon: FileText, label: 'Total Billed', value: summary.submitted, helper: 'Submitted amount', tone: 'emerald' },
    { icon: CheckCircle, label: 'Approved Amount', value: summary.approved, helper: 'Legacy amounts may need review', tone: 'blue' },
    { icon: WalletCards, label: 'Received Amount', value: summary.received, helper: 'Payments received', tone: 'green' },
    { icon: BarChart3, label: 'Balance / Receivable', value: summary.balance, helper: 'Approved minus received', tone: 'amber' },
    { icon: Receipt, label: 'Deductions', value: summary.deductions, helper: 'Recorded deductions', tone: 'red' },
  ]

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-xl border border-border/80 bg-background p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              <Receipt className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {isAdmin && (
            <Button className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:h-11 sm:w-auto" onClick={openAddBill}>
              <Plus className="h-4 w-4" /> {addLabel}
            </Button>
          )}
        </div>

        <div className="metric-grid-five">
          {summaryCards.map((card) => (
            <BillSummaryCard key={card.label} {...card} />
          ))}
        </div>

        <div className="rounded-xl border border-border/80 bg-background p-3 md:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.4fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto_auto] lg:items-end">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search bills" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by bill no..." className="h-10 pl-9 sm:h-11" />
            </div>
            <BillSelect label="Type" value={typeFilter} onValueChange={setTypeFilter} options={['All', ...billTypeOptions]} />
            <BillSelect label="Status" value={statusFilter} onValueChange={setStatusFilter} options={['All', ...billStatusOptions]} />
            <BillDateFilter label="Date From" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <BillDateFilter label="Date To" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            <Button type="button" variant="outline" className="h-10 sm:h-11" onClick={exportBills} disabled={filteredBills.length === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button type="button" variant="outline" className="h-10 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 sm:h-11" onClick={clearFilters}>
              <ChevronDown className="h-4 w-4" /> Filters
            </Button>
          </div>
        </div>

        {bills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              <Receipt className="h-7 w-7" />
            </div>
            <p className="mt-4 text-base font-semibold text-foreground">{emptyTitle}</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Add project bills, approved amounts, received payments, and deductions to track receivables.
            </p>
            {isAdmin && (
              <Button onClick={openAddBill} className="mt-5 bg-emerald-600 text-white hover:bg-emerald-700">
                <Plus className="h-4 w-4" /> Add first bill
              </Button>
            )}
          </div>
        ) : filteredBills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
            <Search className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No bills match these filters.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different bill number, type, status, or date range.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredBills.map((bill) => (
                <BillsMobileCard key={bill.id} bill={bill} isAdmin={isAdmin} onView={setViewingBill} onEdit={openEditBill} onDelete={setDeleteBillId} onAction={(mode) => setBillAction({ mode, bill })} />
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-xl border border-border/80 bg-background md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 dark:bg-slate-900/45 dark:hover:bg-slate-900/45">
                    <TableHead className="pl-6 text-xs font-semibold uppercase text-slate-500">Bill No.</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-slate-500">Type</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-slate-500">Date</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Submitted</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Approved</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Received</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Deductions</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Balance</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-slate-500">Status</TableHead>
                    <TableHead className="pr-6 text-right text-xs font-semibold uppercase text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBills.map((bill) => {
                    const amounts = getBillAmounts(bill)
                    return (
                      <TableRow key={bill.id} className="h-16 border-border/70 hover:bg-slate-50/50 dark:hover:bg-slate-900/35">
                        <TableCell className="pl-6 font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">{getBillTitle(bill, '-')}</TableCell>
                        <TableCell><BillTypeBadge type={bill.type || 'Running Bill'} /></TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">{formatDate(getBillDate(bill))}</TableCell>
                        <BillMoneyCell value={amounts.submitted} />
                        <BillMoneyCell value={amounts.approved} />
                        <BillMoneyCell value={amounts.received} />
                        <BillMoneyCell value={amounts.deductions} />
                        <BillMoneyCell value={amounts.balance} strong />
                        <TableCell><BillInvoiceStatusBadge status={billDisplayStatus(bill)} /></TableCell>
                        <TableCell className="pr-6">
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="icon-sm" onClick={() => setViewingBill(bill)} aria-label="View bill"><Eye className="h-3.5 w-3.5" /></Button>
                            <BillStageActions bill={bill} isAdmin={isAdmin} onOpen={(mode) => setBillAction({ mode, bill })} />
                            {isAdmin && bill.v2?.billing && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && <Button type="button" variant="outline" size="icon-sm" onClick={() => openEditBill(bill)} aria-label="Edit bill"><Pencil className="h-3.5 w-3.5" /></Button>}
                            {isAdmin && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && <Button type="button" variant="outline" size="icon-sm" className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300" onClick={() => setDeleteBillId(bill.id)} aria-label="Delete bill"><Trash2 className="h-3.5 w-3.5" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 border-t border-border/80 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
                <span>Showing 1 to {filteredBills.length} of {bills.length} bills</span>
                <span>{filteredBills.length === bills.length ? 'All bills visible' : 'Filtered view'}</span>
              </div>
            </div>
          </>
        )}
      </div>

      <BillEditorDialog
        open={billFormOpen}
        onOpenChange={setBillFormOpen}
        editing={Boolean(editingBill)}
        form={billForm}
        setField={setBillFormValue}
        typeOptions={billTypeOptions}
        statusOptions={billStatusOptions}
        isAdmin={isAdmin}
        onSave={saveBillForm}
        original={editingBill}
        contract={billForm.v2?.billing?.contractBasis ?? contract}
        documents={documents}
        error={billFormError}
      />

      {billAction && <BillActionDialog key={`${billAction.bill.id}-${billAction.mode}`} mode={billAction.mode} bill={billAction.bill} onClose={() => setBillAction(null)} onCommit={commitBillAction} otherBills={[...bills.filter((bill) => bill.id !== billAction.bill.id), ...otherBills]} />}

      <BillViewDialog bill={viewingBill} documents={documents} onViewDocuments={onViewDocuments} onOpenChange={(open) => !open && setViewingBill(null)} />
      <ConfirmDelete
        open={!!deleteBillId}
        onOpenChange={() => setDeleteBillId(null)}
        onConfirm={() => {
          if (!deleteBillId) return
          const target = bills.find((bill) => bill.id === deleteBillId)
          if (target && (['Approved', 'Paid', 'Partially Paid'].includes(target.status) || target.v2?.receipts?.length || target.v2?.billing?.retentionReleases?.length || Number(target.receivedAmount) > 0)) { toast.error('Approved bill or transaction history cannot be deleted.'); setDeleteBillId(null); return }
          onRemove(deleteBillId)
          setDeleteBillId(null)
          toast.success('Bill deleted')
        }}
        title="Delete bill"
        description="This will permanently remove this bill from the tender."
      />
    </>
  )
}

function BillSummaryCard({ icon: Icon, label, value, helper, tone }) {
  const valueTone = {
    emerald: 'text-emerald-700 dark:text-emerald-300',
    green: 'text-emerald-700 dark:text-emerald-300',
    blue: 'text-blue-700 dark:text-blue-300',
    amber: 'text-amber-700 dark:text-amber-300',
    red: 'text-rose-700 dark:text-rose-300',
  }
  return (
    <KpiCard
      icon={Icon}
      label={label}
      value={formatCurrency(value || 0)}
      helper={helper}
      tone={tone || 'emerald'}
      valueClassName={`text-base font-semibold sm:text-xl ${valueTone[tone] || valueTone.emerald}`}
    />
  )
}

function BillSelect({ label, value, onValueChange, options }) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="h-10 bg-background sm:h-11"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>{option === 'All' ? `All ${label === 'Status' ? 'Statuses' : `${label}s`}` : option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function BillDateFilter({ label, value, onChange }) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input id={id} type="date" value={value} onChange={onChange} className="mobile-date-input bg-background" />
    </div>
  )
}

function BillMoneyCell({ value, strong = false }) {
  return (
    <TableCell className={`text-right font-mono text-sm tabular-nums ${strong ? 'font-semibold text-slate-950 dark:text-slate-50' : 'text-slate-700 dark:text-slate-300'}`}>
      {formatCurrency(value)}
    </TableCell>
  )
}

function BillTypeBadge({ type }) {
  const normalized = type || 'Running Bill'
  const className =
    normalized === 'Final Bill'
      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
      : normalized === 'Invoice'
        ? 'border-violet-200 dark:border-violet-900/60 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
        : 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
  return <Badge variant="outline" className={`shrink-0 rounded-full ${className}`}>{normalized}</Badge>
}

function BillInvoiceStatusBadge({ status }) {
  const normalized = status || 'Draft'
  const className =
    ['Paid', 'Approved'].includes(normalized)
      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
      : ['Partial', 'Partially Paid'].includes(normalized)
        ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
        : ['Pending'].includes(normalized)
          ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
          : normalized === 'Rejected'
            ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
            : ['Submitted', 'Under Review'].includes(normalized)
              ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
              : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
  return <Badge variant="outline" className={`shrink-0 rounded-full ${className}`}>{normalized}</Badge>
}

function BillsMobileCard({ bill, isAdmin, onView, onEdit, onDelete, onAction }) {
  const amounts = getBillAmounts(bill)
  return (
    <div className="rounded-xl border border-border/80 bg-background p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-base font-semibold text-emerald-700 dark:text-emerald-300">{getBillTitle(bill, '-')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(getBillDate(bill))}</p>
        </div>
        <BillInvoiceStatusBadge status={billDisplayStatus(bill)} />
      </div>
      <div className="mt-3">
        <BillTypeBadge type={bill.type || 'Running Bill'} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
        <MobileBillAmount label="Submitted" value={amounts.submitted} />
        <MobileBillAmount label="Approved" value={amounts.approved} />
        <MobileBillAmount label="Received" value={amounts.received} tone="profit" />
        <MobileBillAmount label="Deductions" value={amounts.deductions} />
        <MobileBillAmount label="Balance" value={amounts.balance} tone={amounts.balance > 0 ? 'accent' : 'profit'} />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onView(bill)} aria-label="View bill"><Eye className="h-3.5 w-3.5" /></Button>
        <BillStageActions bill={bill} isAdmin={isAdmin} onOpen={onAction} />
        {isAdmin && bill.v2?.billing && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && <Button type="button" variant="outline" size="icon-sm" onClick={() => onEdit(bill)} aria-label="Edit bill"><Pencil className="h-3.5 w-3.5" /></Button>}
        {isAdmin && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && <Button type="button" variant="outline" size="icon-sm" className="text-rose-600" onClick={() => onDelete(bill.id)} aria-label="Delete bill"><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  )
}

function BillViewDialog({ bill, documents = [], onViewDocuments, onOpenChange }) {
  const amounts = getBillAmounts(bill || {})
  const linkedDocument = documents.find((item) => item.id === bill?.documentId)
  return (
    <Dialog open={!!bill} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bill ? getBillTitle(bill, 'Bill') : 'Bill'}</DialogTitle>
          <DialogDescription>Bill / invoice details and payment status.</DialogDescription>
        </DialogHeader>
        {bill && (
          <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <BillDetail label="Type" value={bill.type || 'Running Bill'} />
            <BillDetail label="Status" value={billDisplayStatus(bill)} />
            <BillDetail label="Date" value={formatDate(getBillDate(bill))} />
            <BillDetail label="Submitted" value={formatCurrency(amounts.submitted)} />
            <BillDetail label="Approved" value={formatCurrency(amounts.approved)} />
            <BillDetail label="Received" value={formatCurrency(amounts.received)} />
            <BillDetail label="Deductions" value={formatCurrency(amounts.deductions)} />
            <BillDetail label="Balance" value={formatCurrency(amounts.balance)} />
            {bill.documentId && <div className="sm:col-span-2"><BillDetail label="Linked document" value={linkedDocument?.name || linkedDocument?.title || (linkedDocument ? linkedDocument.id : 'Document link missing')} />{linkedDocument && onViewDocuments && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => { onOpenChange(false); onViewDocuments() }}>Open documents</Button>}</div>}
            <div className="sm:col-span-2">
              <BillDetail label="Remarks / Notes" value={bill.remarks || bill.desc || '-'} />
            </div>
            <BillLedgerDetail bill={bill} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function BillDetail({ label, value }) {
  return (
    <div className="rounded-xl border border-border/80 bg-slate-50/70 dark:bg-slate-900/35 p-3">
      <p className="text-xs font-medium tracking-normal text-muted-foreground sm:uppercase sm:tracking-wide">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-foreground">{value || '-'}</p>
    </div>
  )
}

function BillLedgerDetail({ bill }) {
  if (!bill.v2?.billing) return <p className="sm:col-span-2 text-sm text-amber-700 dark:text-amber-300">Legacy gross, deduction and receipt basis needs source-document review.</p>
  const ledger = billLedger(bill, nullableNumber(bill.v2.billing.contractBasis))
  return <div className="space-y-2 sm:col-span-2">
    <BillDetail label="Net payable" value={formatCurrency(ledger.net)} />
    <BillDetail label="Pending clearance" value={formatCurrency(ledger.pending)} />
    <BillDetail label="RM held" value={formatCurrency(ledger.retentionHeld)} />
    {bill.v2.billing.deductionRows?.map((row) => <p key={row.id} className="rounded-lg border p-2 text-sm">{row.kind} · {row.method === 'percentage' ? `${row.rate}%` : 'Fixed'} · {formatCurrency(deductionRowAmount(row, ledger.approved, nullableNumber(bill.v2.billing.contractBasis)))}</p>)}
    {bill.v2.receipts?.map((receipt) => <p key={receipt.id} className="rounded-lg border p-2 text-sm">Payment {formatDate(receipt.date)} · {formatCurrency(receipt.amount)} · {receipt.status || 'Cleared'} · {receipt.reference} · {receipt.history?.length || 1} history event(s)</p>)}
    {bill.v2.billing.retentionReleases?.map((release) => <p key={release.id} className="rounded-lg border p-2 text-sm">RM release {formatDate(release.date)} · {formatCurrency(release.amount)} · {release.reference}</p>)}
  </div>
}

function RABillsSection({
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
  documents = [],
  onViewDocuments,
  otherBills = [],
  contract,
  deductionDefaults = [],
}) {
  const emptyRaBillForm = () => ({
    id: '',
    no: '',
    date: '',
    documentId: '',
    amount: '',
    approvedAmount: '',
    receivedAmount: '',
    deductions: '',
    status: 'Submitted',
    remarks: '',
    v2: { billing: { basis: 'incremental', previousCertifiedGross: [...bills, ...otherBills].reduce((sum, item) => sum + billAmounts(item).approved, 0), contractBasis: contract, deductionRows: deductionDefaults.map((row) => ({ ...row, id: uid() })), retentionReleases: [] }, receipts: [] },
  })
  const [raBillFormOpen, setRaBillFormOpen] = useState(false)
  const [editingRaBill, setEditingRaBill] = useState(null)
  const [viewingRaBill, setViewingRaBill] = useState(null)
  const [raBillForm, setRaBillForm] = useState(emptyRaBillForm)
  const [raBillFormError, setRaBillFormError] = useState('')
  const [raBillAction, setRaBillAction] = useState(null)
  const raBillSaveRef = useRef(false)
  const [deleteRaBillId, setDeleteRaBillId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const raStatusOptions = Array.from(new Set([...BILL_STATUS_OPTIONS, 'Pending Clearance', ...bills.map(billDisplayStatus).filter(Boolean)]))
  const filteredRaBills = bills.filter((bill) => {
    const billNo = String(bill.no || bill.billNo || '').toLowerCase()
    const billStatus = billDisplayStatus(bill)
    const billDate = getBillDate(bill)
    if (searchTerm && !billNo.includes(searchTerm.toLowerCase())) return false
    if (statusFilter !== 'All' && billStatus !== statusFilter) return false
    if (dateFrom && (!billDate || billDate < dateFrom)) return false
    if (dateTo && (!billDate || billDate > dateTo)) return false
    return true
  })

  const setRaBillFormValue = (key) => (event) => {
    const value = event?.target?.value ?? event
    setRaBillForm((previous) => ({ ...previous, [key]: value }))
  }
  const openAddRaBill = () => {
    raBillSaveRef.current = false
    setRaBillFormError('')
    setEditingRaBill(null)
    setRaBillForm(emptyRaBillForm())
    setRaBillFormOpen(true)
  }
  const openEditRaBill = (bill) => {
    if (!bill.v2?.billing || ['Approved', 'Paid', 'Partially Paid'].includes(bill.status)) return
    raBillSaveRef.current = false
    setRaBillFormError('')
    setEditingRaBill(bill)
    setRaBillForm({
      id: bill.id || '',
      no: bill.no || bill.billNo || '',
      date: bill[dateKey] || bill.date || '',
      documentId: bill.documentId || '',
      amount: bill.submittedAmount ?? bill.amount ?? '',
      approvedAmount: bill.approvedAmount ?? '',
      receivedAmount: bill.receivedAmount ?? '',
      deductions: bill.deductions ?? '',
      status: bill.status || 'Submitted',
      remarks: bill.remarks || bill.desc || '',
      v2: bill.v2 || {},
    })
    setRaBillFormOpen(true)
  }
  const saveRaBillForm = (nextStatus) => {
    if (raBillSaveRef.current) return
    const candidate = { ...raBillForm, status: nextStatus }
    const fail = (message) => { setRaBillFormError(message); toast.error(message) }
    if (!candidate.no.trim()) { fail('RA bill number is required.'); return }
    if (!candidate.date) { fail('RA bill date is required.'); return }
    if (nonNegativeNumber(candidate.amount) === null) { fail('Submitted gross amount must be a valid non-negative number.'); return }
    if (bills.some((bill) => bill.id !== editingRaBill?.id && String(bill.no || bill.billNo || '').trim().toLowerCase() === candidate.no.trim().toLowerCase())) { fail('RA bill number already exists on this project.'); return }
    const otherProjectBills = [...bills.filter((bill) => bill.id !== editingRaBill?.id), ...otherBills]
    const issue = validateCumulativeBill(candidate, otherProjectBills) || validateProjectReceiptReferences(candidate, otherProjectBills) || validateBillLedger(candidate)
    if (issue) { fail(issue); return }
    raBillSaveRef.current = true
    const payload = {
      no: raBillForm.no || '',
      type: 'Running Bill',
      [dateKey]: raBillForm.date || '',
      documentId: raBillForm.documentId || '',
      amount: raBillForm.amount === '' ? 0 : raBillForm.amount,
      submittedAmount: raBillForm.amount === '' ? 0 : raBillForm.amount,
      approvedAmount: raBillForm.approvedAmount === '' ? '' : raBillForm.approvedAmount,
      receivedAmount: raBillForm.receivedAmount === '' ? '' : raBillForm.receivedAmount,
      deductions: raBillForm.deductions === '' ? '' : raBillForm.deductions,
      status: nextStatus,
      remarks: raBillForm.remarks || '',
      desc: raBillForm.remarks || '',
      v2: raBillForm.v2 || {},
    }
    if (editingRaBill?.id) {
      onUpdate(editingRaBill.id, payload)
      toast.success('RA bill updated')
    } else {
      onAdd(payload)
      toast.success('RA bill added')
    }
    setRaBillFormOpen(false)
    setEditingRaBill(null)
  }
  const commitRaBillAction = (next) => {
    if (!isAdmin || !raBillAction) return
    onUpdate(next.id, { approvedAmount: next.approvedAmount ?? '', status: next.status, v2: next.v2 })
    setRaBillAction(null)
    toast.success('RA bill ledger updated')
  }
  const exportRaBills = () => {
    const headers = ['RA Bill No.', 'Date', 'Submitted', 'Approved', 'Received', 'Deductions', 'Balance', 'Status']
    const rows = filteredRaBills.map((bill) => {
      const amounts = getBillAmounts(bill)
      return [
        getBillTitle(bill, '-'),
        getBillDate(bill) || '-',
        amounts.submitted,
        amounts.approved,
        amounts.received,
        amounts.deductions,
        amounts.balance,
        billDisplayStatus(bill),
      ]
    })
    const csv = rowsToCSV(headers, rows, new Set([4, 5, 6, 7, 8]))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ra-bills.csv'
    link.click()
    URL.revokeObjectURL(url)
  }
  const clearRaFilters = () => {
    setSearchTerm('')
    setStatusFilter('All')
    setDateFrom('')
    setDateTo('')
  }

  const summaryCards = [
    { icon: FileText, label: 'Total RA Billed', value: summary.submitted, helper: 'Submitted amount', tone: 'emerald' },
    { icon: CheckCircle, label: 'Approved Amount', value: summary.approved, helper: 'Legacy amounts may need review', tone: 'blue' },
    { icon: WalletCards, label: 'Received Amount', value: summary.received, helper: 'Payments received', tone: 'green' },
    { icon: BarChart3, label: 'Balance / Receivable', value: summary.balance, helper: 'Approved minus received', tone: 'amber' },
    { icon: Receipt, label: 'Deductions', value: summary.deductions, helper: 'Recorded deductions', tone: 'red' },
  ]

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 rounded-xl border border-border/80 bg-background p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {isAdmin && (
            <Button className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:h-11 sm:w-auto" onClick={openAddRaBill}>
              <Plus className="h-4 w-4" /> {addLabel}
            </Button>
          )}
        </div>

        <div className="metric-grid-five">
          {summaryCards.map((card) => (
            <BillSummaryCard key={card.label} {...card} />
          ))}
        </div>

        <div className="rounded-xl border border-border/80 bg-background p-3 md:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1.4fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto_auto] lg:items-end">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search RA bills" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search by RA bill no..." className="h-10 pl-9 sm:h-11" />
            </div>
            <BillSelect label="Status" value={statusFilter} onValueChange={setStatusFilter} options={['All', ...raStatusOptions]} />
            <BillDateFilter label="Date From" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            <BillDateFilter label="Date To" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            <Button type="button" variant="outline" className="h-10 sm:h-11" onClick={exportRaBills} disabled={filteredRaBills.length === 0}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button type="button" variant="outline" className="h-10 border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 sm:h-11" onClick={clearRaFilters}>
              <ChevronDown className="h-4 w-4" /> Clear filters
            </Button>
          </div>
        </div>

        {bills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              <FileText className="h-7 w-7" />
            </div>
            <p className="mt-4 text-base font-semibold text-foreground">{emptyTitle}</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Add running account bills to track submitted, approved, received, and outstanding amounts.
            </p>
            {isAdmin && (
              <Button onClick={openAddRaBill} className="mt-5 bg-emerald-600 text-white hover:bg-emerald-700">
                <Plus className="h-4 w-4" /> Add first RA bill
              </Button>
            )}
          </div>
        ) : filteredRaBills.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background p-8 text-center">
            <Search className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No RA bills match these filters.</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a different RA bill number, status, or date range.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {filteredRaBills.map((bill) => (
                <RABillMobileCard key={bill.id} bill={bill} isAdmin={isAdmin} onView={setViewingRaBill} onEdit={openEditRaBill} onDelete={setDeleteRaBillId} onAction={(mode) => setRaBillAction({ mode, bill })} />
              ))}
            </div>

            <div className="hidden overflow-hidden rounded-xl border border-border/80 bg-background md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 dark:bg-slate-900/45 dark:hover:bg-slate-900/45">
                    <TableHead className="pl-6 text-xs font-semibold uppercase text-slate-500">RA Bill No.</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-slate-500">Date</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Submitted</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Approved</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Received</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Deductions</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase text-slate-500">Balance</TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-slate-500">Status</TableHead>
                    <TableHead className="pr-6 text-right text-xs font-semibold uppercase text-slate-500">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRaBills.map((bill) => {
                    const amounts = getBillAmounts(bill)
                    return (
                      <TableRow key={bill.id} className="h-16 border-border/70 hover:bg-slate-50/50 dark:hover:bg-slate-900/35">
                        <TableCell className="pl-6 font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-300">{getBillTitle(bill, '-')}</TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">{formatDate(getBillDate(bill))}</TableCell>
                        <BillMoneyCell value={amounts.submitted} />
                        <BillMoneyCell value={amounts.approved} />
                        <BillMoneyCell value={amounts.received} />
                        <BillMoneyCell value={amounts.deductions} />
                        <BillMoneyCell value={amounts.balance} strong />
                        <TableCell><BillInvoiceStatusBadge status={billDisplayStatus(bill)} /></TableCell>
                        <TableCell className="pr-6">
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="icon-sm" onClick={() => setViewingRaBill(bill)} aria-label="View RA bill"><Eye className="h-3.5 w-3.5" /></Button>
                            <BillStageActions bill={bill} isAdmin={isAdmin} onOpen={(mode) => setRaBillAction({ mode, bill })} />
                            {isAdmin && bill.v2?.billing && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && <Button type="button" variant="outline" size="icon-sm" onClick={() => openEditRaBill(bill)} aria-label="Edit RA bill"><Pencil className="h-3.5 w-3.5" /></Button>}
                            {isAdmin && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && <Button type="button" variant="outline" size="icon-sm" className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300" onClick={() => setDeleteRaBillId(bill.id)} aria-label="Delete RA bill"><Trash2 className="h-3.5 w-3.5" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-col gap-3 border-t border-border/80 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between md:px-6">
                <span>Showing 1 to {filteredRaBills.length} of {bills.length} RA bills</span>
                <span>{filteredRaBills.length === bills.length ? 'All RA bills visible' : 'Filtered view'}</span>
              </div>
            </div>
          </>
        )}
      </div>

      <BillEditorDialog
        open={raBillFormOpen}
        onOpenChange={setRaBillFormOpen}
        editing={Boolean(editingRaBill)}
        form={raBillForm}
        setField={setRaBillFormValue}
        statusOptions={raStatusOptions}
        isAdmin={isAdmin}
        onSave={saveRaBillForm}
        variant="ra-bill"
        original={editingRaBill}
        contract={raBillForm.v2?.billing?.contractBasis ?? contract}
        documents={documents}
        error={raBillFormError}
      />

      {raBillAction && <BillActionDialog key={`${raBillAction.bill.id}-${raBillAction.mode}`} mode={raBillAction.mode} bill={raBillAction.bill} onClose={() => setRaBillAction(null)} onCommit={commitRaBillAction} otherBills={[...bills.filter((bill) => bill.id !== raBillAction.bill.id), ...otherBills]} />}

      <RABillViewDialog bill={viewingRaBill} documents={documents} onViewDocuments={onViewDocuments} onOpenChange={(open) => !open && setViewingRaBill(null)} />
      <ConfirmDelete
        open={!!deleteRaBillId}
        onOpenChange={() => setDeleteRaBillId(null)}
        onConfirm={() => {
          if (!deleteRaBillId) return
          const target = bills.find((bill) => bill.id === deleteRaBillId)
          if (target && (['Approved', 'Paid', 'Partially Paid'].includes(target.status) || target.v2?.receipts?.length || target.v2?.billing?.retentionReleases?.length || Number(target.receivedAmount) > 0)) { toast.error('Approved RA bill or transaction history cannot be deleted.'); setDeleteRaBillId(null); return }
          onRemove(deleteRaBillId)
          setDeleteRaBillId(null)
          toast.success('RA bill deleted')
        }}
        title="Delete RA bill"
        description="This will permanently remove this RA bill from the tender."
      />
    </>
  )
}

function RABillMobileCard({ bill, isAdmin, onView, onEdit, onDelete, onAction }) {
  const amounts = getBillAmounts(bill)
  return (
    <div className="rounded-xl border border-border/80 bg-background p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-base font-semibold text-emerald-700 dark:text-emerald-300">{getBillTitle(bill, '-')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(getBillDate(bill))}</p>
        </div>
        <BillInvoiceStatusBadge status={billDisplayStatus(bill)} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/40">
        <MobileBillAmount label="Submitted" value={amounts.submitted} />
        <MobileBillAmount label="Approved" value={amounts.approved} />
        <MobileBillAmount label="Received" value={amounts.received} tone="profit" />
        <MobileBillAmount label="Deductions" value={amounts.deductions} />
        <MobileBillAmount label="Balance" value={amounts.balance} tone={amounts.balance > 0 ? 'accent' : 'profit'} />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="icon-sm" onClick={() => onView(bill)} aria-label="View RA bill"><Eye className="h-3.5 w-3.5" /></Button>
        <BillStageActions bill={bill} isAdmin={isAdmin} onOpen={onAction} />
        {isAdmin && bill.v2?.billing && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && <Button type="button" variant="outline" size="icon-sm" onClick={() => onEdit(bill)} aria-label="Edit RA bill"><Pencil className="h-3.5 w-3.5" /></Button>}
        {isAdmin && !['Approved', 'Paid', 'Partially Paid'].includes(bill.status) && <Button type="button" variant="outline" size="icon-sm" className="text-rose-600" onClick={() => onDelete(bill.id)} aria-label="Delete RA bill"><Trash2 className="h-3.5 w-3.5" /></Button>}
      </div>
    </div>
  )
}

function RABillViewDialog({ bill, documents = [], onViewDocuments, onOpenChange }) {
  const amounts = getBillAmounts(bill || {})
  const linkedDocument = documents.find((item) => item.id === bill?.documentId)
  return (
    <Dialog open={!!bill} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bill ? getBillTitle(bill, 'RA Bill') : 'RA Bill'}</DialogTitle>
          <DialogDescription>RA bill approvals, payments, deductions, and receivable details.</DialogDescription>
        </DialogHeader>
        {bill && (
          <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <BillDetail label="Status" value={billDisplayStatus(bill)} />
            <BillDetail label="Date" value={formatDate(getBillDate(bill))} />
            <BillDetail label="Submitted" value={formatCurrency(amounts.submitted)} />
            <BillDetail label="Approved" value={formatCurrency(amounts.approved)} />
            <BillDetail label="Received" value={formatCurrency(amounts.received)} />
            <BillDetail label="Deductions" value={formatCurrency(amounts.deductions)} />
            <BillDetail label="Balance" value={formatCurrency(amounts.balance)} />
            {bill.documentId && <div className="sm:col-span-2"><BillDetail label="Linked document" value={linkedDocument?.name || linkedDocument?.title || (linkedDocument ? linkedDocument.id : 'Document link missing')} />{linkedDocument && onViewDocuments && <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => { onOpenChange(false); onViewDocuments() }}>Open documents</Button>}</div>}
            <div className="sm:col-span-2">
              <BillDetail label="Remarks / Notes" value={bill.remarks || bill.desc || '-'} />
            </div>
            <BillLedgerDetail bill={bill} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function LegacyBillFinanceSection({
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
    { label: 'Approved Amount', value: summary.approved, tone: 'text-blue-700 dark:text-blue-300', helper: 'Legacy amounts may need review' },
    { label: 'Received Amount', value: summary.received, tone: 'text-emerald-700 dark:text-emerald-300', helper: 'Payments received' },
    { label: 'Balance / Receivable', value: summary.balance, tone: 'text-amber-700 dark:text-amber-300', helper: 'Approved minus received' },
    { label: 'Deductions', value: summary.deductions, tone: 'text-rose-700 dark:text-rose-300', helper: 'Recorded deductions' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        {isAdmin && (
          <Button className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" onClick={onAdd}>
            <Plus className="h-4 w-4" /> {addLabel}
          </Button>
        )}
      </div>

      <div className="metric-grid-five">
        {summaryCards.map((card) => (
          <KpiCard
            key={card.label}
            label={card.label}
            value={formatCurrency(card.value)}
            helper={card.helper}
            valueClassName={`text-base sm:text-lg ${card.tone}`}
          />
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

          <Card className="hidden overflow-hidden rounded-xl md:block">
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
                            <Input type="date" value={bill[dateKey] || ''} onChange={(e) => onUpdate(bill.id, { [dateKey]: e.target.value })} disabled={!isAdmin} className="mobile-date-input" />
                            {paidDateKey && (
                              <Input type="date" value={bill[paidDateKey] || ''} onChange={(e) => onUpdate(bill.id, { [paidDateKey]: e.target.value })} disabled={!isAdmin} className="mobile-date-input" aria-label="Paid date" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right"><BillAmountField value={bill.amount} onChange={(value) => onUpdate(bill.id, { amount: value })} disabled={!isAdmin} /></TableCell>
                        <TableCell className="text-right"><BillAmountField value={bill.approvedAmount} onChange={(value) => onUpdate(bill.id, { approvedAmount: value })} disabled={!isAdmin} /></TableCell>
                        <TableCell className="table-amount">{bill.v2?.receipts ? <span className="whitespace-nowrap">{formatCurrency(amounts.received)}</span> : <BillAmountField value={bill.receivedAmount} onChange={(value) => onUpdate(bill.id, { receivedAmount: value })} disabled={!isAdmin} />}</TableCell>
                        <TableCell className="table-amount">{bill.v2?.deductions ? <span className="whitespace-nowrap">{formatCurrency(amounts.deductions)}</span> : <BillAmountField value={bill.deductions} onChange={(value) => onUpdate(bill.id, { deductions: value })} disabled={!isAdmin} />}</TableCell>
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
  const typeId = useId()
  const statusId = useId()
  return (
    <Card className="rounded-xl">
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-normal text-muted-foreground sm:uppercase sm:tracking-wide">Bill No.</p>
            <Input value={bill.no || bill.billNo || ''} onChange={(e) => onUpdate(bill.id, { no: e.target.value })} disabled={!isAdmin} placeholder="Bill no." className="mt-1 h-9 font-mono" />
          </div>
          <BillStatusBadge status={bill.status || 'Draft'} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={typeId} className="text-xs">Type</Label>
            <Select value={bill.type || 'Running Bill'} onValueChange={(value) => onUpdate(bill.id, { type: value })} disabled={!isAdmin}>
              <SelectTrigger id={typeId} className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{BILL_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={statusId} className="text-xs">Status</Label>
            <Select value={bill.status || 'Draft'} onValueChange={(value) => onUpdate(bill.id, { status: value })} disabled={!isAdmin}>
              <SelectTrigger id={statusId} className="h-9"><SelectValue /></SelectTrigger>
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
          {bill.v2?.receipts ? <BillDetail label="Received (receipt ledger)" value={formatCurrency(getBillAmounts(bill).received)} /> : <BillField label="Received" type="number" value={bill.receivedAmount ?? ''} onChange={(value) => onUpdate(bill.id, { receivedAmount: value })} disabled={!isAdmin} />}
          {bill.v2?.deductions ? <BillDetail label="Deductions (itemized)" value={formatCurrency(getBillAmounts(bill).deductions)} /> : <BillField label="Deductions" type="number" value={bill.deductions ?? ''} onChange={(value) => onUpdate(bill.id, { deductions: value })} disabled={!isAdmin} />}
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
  uploadDocumentAsset,
  updateDocument,
  removeDocument,
  uploadingDocumentId,
  documentUploadProgress,
  tenderName,
  isAdmin,
}) {
  const emptyDocumentForm = () => ({
    id: uid(),
    title: '',
    type: 'Other',
    url: '',
    notes: '',
    fileName: '',
    fileType: '',
    fileSize: '',
    storageProvider: '',
    storageBucket: '',
    storagePath: '',
    uploadedAt: '',
    addedAt: new Date().toISOString().slice(0, 10),
  })
  const [documentSheetOpen, setDocumentSheetOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState(null)
  const [documentForm, setDocumentForm] = useState(emptyDocumentForm)
  const [deleteDocumentId, setDeleteDocumentId] = useState(null)

  const handleAddDocument = () => {
    setEditingDocument(null)
    setDocumentForm(emptyDocumentForm())
    setDocumentSheetOpen(true)
  }
  const handleEditDocument = (item) => {
    setEditingDocument(item)
    setDocumentForm({
      id: item.id || uid(),
      title: item.title || '',
      type: item.type || 'Other',
      url: item.url || '',
      notes: item.notes || '',
      fileName: item.fileName || '',
      fileType: item.fileType || '',
      fileSize: item.fileSize || '',
      storageProvider: item.storageProvider || '',
      storageBucket: item.storageBucket || '',
      storagePath: item.storagePath || '',
      uploadedAt: item.uploadedAt || '',
      addedAt: item.addedAt || new Date().toISOString().slice(0, 10),
    })
    setDocumentSheetOpen(true)
  }
  const setDocumentFormValue = (key) => (event) => {
    const value = event?.target?.value ?? event
    setDocumentForm((previous) => ({ ...previous, [key]: value }))
  }
  const handleDocumentUpload = async (file) => {
    if (!file) return
    const uploaded = await uploadDocumentAsset(documentForm.id, file)
    if (!uploaded) return
    setDocumentForm((previous) => ({
      ...previous,
      title: previous.title || file.name,
      ...uploaded,
    }))
    toast.success('File uploaded. Save the document to attach it.')
  }
  const saveDocumentForm = () => {
    const payload = {
      ...documentForm,
      title: documentForm.title || documentForm.fileName || documentForm.type || 'Untitled document',
      type: documentForm.type || 'Other',
      url: documentForm.url || '',
      notes: documentForm.notes || '',
      addedAt: documentForm.addedAt || new Date().toISOString().slice(0, 10),
    }
    if (editingDocument?.id) {
      updateDocument(editingDocument.id, payload)
      toast.success('Document updated')
    } else {
      addDocument(payload)
      toast.success('Document added')
    }
    setDocumentSheetOpen(false)
    setEditingDocument(null)
  }

  return (
    <>
    <Card className="rounded-xl border-border/80">
      <CardHeader className="p-3.5 pb-3.5 md:p-6 md:pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Paperclip className="h-5 w-5 text-emerald-600" /> Documents
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage tender files, images, BOQs, work orders, and supporting records
            </p>
          </div>
          {isAdmin && (
            <Button onClick={handleAddDocument} className="h-10 w-full bg-emerald-600 text-white hover:bg-emerald-700 md:w-auto">
              <Plus className="h-4 w-4" /> Upload Document
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3.5 p-3.5 pt-0 md:space-y-5 md:p-6 md:pt-0">
        <div className="metric-grid-five">
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
              <Input aria-label="Search tender documents" type="search" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Search documents..." className="h-10 bg-background pl-9 md:h-11" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin lg:pb-0">
              {DOCUMENT_TYPE_FILTERS.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDocumentTypeFilter(type)}
                  className={`h-9 flex-shrink-0 rounded-full border px-3 text-sm font-medium transition-colors ${
                    documentTypeFilter === type
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-border bg-background text-muted-foreground hover:border-emerald-200 dark:hover:border-emerald-900/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 dark:hover:text-emerald-300'
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
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
              <FolderOpen className="h-7 w-7" />
            </div>
            <p className="mt-4 text-base font-semibold text-foreground">No documents uploaded yet.</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Upload tender documents, site photos, BOQs, and work orders to keep records organized.
            </p>
            {isAdmin && (
              <Button onClick={handleAddDocument} className="mt-5 bg-emerald-600 text-white hover:bg-emerald-700">
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
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredDocuments.map((item) => (
              <DocumentCard
                key={item.id}
                item={item}
                isAdmin={isAdmin}
                tenderName={tenderName}
                onEdit={() => handleEditDocument(item)}
                onDelete={() => setDeleteDocumentId(item.id)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>

    <Sheet open={documentSheetOpen} onOpenChange={setDocumentSheetOpen}>
      <SheetContent side="right" className="flex w-full min-w-0 flex-col gap-0 overflow-x-hidden p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
          <SheetTitle>{editingDocument ? 'Edit Document' : 'Add Document'}</SheetTitle>
          <SheetDescription>
            Upload a tender file and save the metadata. Document cards stay compact in the grid.
          </SheetDescription>
        </SheetHeader>
        <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
          <div className="min-w-0 rounded-xl border border-dashed border-border bg-muted/20 p-4">
            <Label htmlFor="td-document-upload" className="text-sm font-medium">Upload file / image</Label>
            <Input
              id="td-document-upload"
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              className="mt-2"
              disabled={!isAdmin || uploadingDocumentId === documentForm.id}
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                await handleDocumentUpload(file)
              }}
            />
            {uploadingDocumentId === documentForm.id && (
              <p className="mt-2 text-xs text-muted-foreground">Uploading {documentUploadProgress[documentForm.id] ?? 0}%...</p>
            )}
            {(documentForm.url || documentForm.fileName) && (
              <div className="mt-3 min-w-0 rounded-lg bg-background p-3 text-xs text-muted-foreground">
                <p className="truncate font-medium text-foreground" title={documentForm.fileName || documentForm.title}>
                  {documentForm.fileName || documentForm.title || 'Uploaded file'}
                </p>
                {documentForm.fileSize ? <p className="mt-1">Size: {formatFileSize(documentForm.fileSize)}</p> : null}
                {documentForm.url ? <p className="mt-1 break-all">URL saved for this document.</p> : null}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-document-title">Title</Label>
            <Input
              id="td-document-title"
              value={documentForm.title}
              onChange={setDocumentFormValue('title')}
              placeholder="e.g. Award letter"
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-document-category">Category</Label>
            <Select value={documentForm.type || 'Other'} onValueChange={setDocumentFormValue('type')}>
              <SelectTrigger id="td-document-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-document-url">URL</Label>
            <Input
              id="td-document-url"
              value={documentForm.url}
              onChange={setDocumentFormValue('url')}
              placeholder="https://..."
              className="min-w-0"
            />
            <p className="text-xs text-muted-foreground">Optional. Full URLs are only shown here, not on document cards.</p>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="td-document-notes">Notes</Label>
            <Textarea
              id="td-document-notes"
              value={documentForm.notes}
              onChange={setDocumentFormValue('notes')}
              rows={3}
              placeholder="Optional notes about this file or link"
            />
          </div>
        </div>
        <SheetFooter className="gap-2 border-t border-border px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:pb-4">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setDocumentSheetOpen(false)}>Cancel</Button>
          <Button type="button" className="w-full sm:w-auto" onClick={saveDocumentForm} disabled={!isAdmin}>
            {editingDocument ? 'Save Document' : 'Add Document'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    <ConfirmDelete
      open={!!deleteDocumentId}
      onOpenChange={() => setDeleteDocumentId(null)}
      onConfirm={() => {
        if (!deleteDocumentId) return
        removeDocument(deleteDocumentId)
        setDeleteDocumentId(null)
        toast.success('Document deleted')
      }}
      title="Delete document"
      description="This will permanently remove this document from the tender."
    />
    </>
  )
}

function DocumentStat({ icon: Icon, label, value, tone, className = '' }) {
  return (
    <KpiCard className={className} icon={Icon} label={label} value={value} tone={tone || 'emerald'} />
  )
}

function DocumentCard({ item, isAdmin, onDelete, tenderName, onEdit }) {
  const kind = getDocumentKind(item)
  const Icon = getDocumentIcon(kind)
  const isImage = kind === 'Image' && item.url
  const title = item.title || item.fileName || item.type || 'Untitled document'
  const date = item.uploadedAt || item.addedAt

  return (
    <Card className="min-w-0 self-start overflow-hidden rounded-xl border-border/80 transition hover:shadow-md">
      <CardContent className="min-w-0 space-y-3 p-3.5 md:space-y-4 md:p-4">
        <div className="aspect-[16/10] overflow-hidden rounded-xl border border-border/80 bg-muted/30">
          {isImage ? (
            <img src={item.url} alt={title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background sm:h-14 sm:w-14">
                <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <DocumentKindBadge kind={kind} />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
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
          {item.url && (
            <>
              <Button variant="outline" size="sm" className="h-10 sm:h-9" asChild>
                <a href={item.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Preview
                </a>
              </Button>
              <Button variant="outline" size="sm" className="h-10 sm:h-9" asChild>
                <a href={item.storagePath ? item.downloadUrl : item.url} download={item.storagePath ? undefined : item.fileName || title}>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </Button>
            </>
          )}
          {isAdmin && (
            <>
            <Button variant="outline" size="sm" className="h-10 sm:h-9" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="ghost" size="sm" className="h-10 text-destructive sm:h-9" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
            </>
          )}
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
  const id = useId()
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} className={type === 'date' ? 'mobile-date-input' : type === 'number' ? 'font-mono tabular-nums' : ''} />
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
      <p className="text-xs font-medium tracking-normal text-muted-foreground sm:uppercase sm:tracking-wide">{label}</p>
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
    <KpiCard label={label} value={value} helper={helper} tone={tone === 'loss' || tone === 'expense' ? 'rose' : tone === 'profit' ? 'emerald' : 'slate'} valueClassName={`text-sm sm:text-base md:text-lg ${toneClass}`} />
  )
}

