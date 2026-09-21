import { Link } from 'react-router-dom'
import { calculateTenderFinancials, formatCurrencyPrecise, getTenderDisplayStatus } from '@/lib/utils'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import KpiCard from '@/components/shared/KpiCard'
import {
  Building2,
  Calculator,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Info,
  Link as LinkIcon,
  Pencil,
  Tag,
  WalletCards,
  X,
} from 'lucide-react'

const FALLBACK = '—'

function valueOrFallback(value) {
  return value === null || value === undefined || value === '' ? FALLBACK : value
}

function formatRs(amount) {
  if (amount === null || amount === undefined || amount === '') return FALLBACK

  const numeric = Number(amount)
  if (Number.isNaN(numeric)) return amount

  return `Rs ${new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 0,
  }).format(numeric)}`
}

function formatQuickDate(dateStr) {
  if (!dateStr) return FALLBACK

  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <KpiCard
      icon={Icon}
      label={label}
      value={valueOrFallback(value)}
      tone="emerald"
      valueClassName="text-sm sm:text-base"
    />
  )
}

function FinancialSnapshot({ tender }) {
  const financials = calculateTenderFinancials(tender)
  const directionText = financials.direction === 'below'
    ? 'Below'
    : financials.direction === 'above'
      ? 'Above'
      : financials.direction === 'at'
        ? 'At Estimate'
        : ''
  const tone = financials.direction === 'above'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : financials.direction === 'at'
      ? 'border-blue-200 bg-blue-50 text-blue-800'
      : financials.direction === 'below'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-slate-50 text-slate-600'
  const valueTone = financials.direction === 'above'
    ? 'text-amber-700'
    : financials.direction === 'at'
      ? 'text-blue-700'
      : financials.direction === 'below'
        ? 'text-emerald-700'
        : 'text-slate-700'

  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-3 sm:mt-6 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
        <div>
          <p className="text-base font-bold leading-none text-slate-950 sm:text-sm sm:font-semibold sm:leading-5">Financial Snapshot</p>
          <p className="mt-1 text-xs text-slate-500">Estimate versus submitted quote</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
          {financials.positionLabel}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FinancialAmountCard
          icon={Calculator}
          label="Estimated Cost"
          value={formatCurrencyPrecise(financials.estimatedCost)}
        />
        <FinancialAmountCard
          icon={FileText}
          label="Quoted Amount"
          value={formatCurrencyPrecise(financials.quotedAmount)}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 rounded-xl border border-border bg-card p-2.5 text-center text-[11px] sm:p-3 sm:text-sm">
        <div className="border-r border-slate-200 px-1.5 sm:px-2">
          <p className="font-medium text-slate-500">Difference</p>
          <p className={`mt-1.5 break-words text-[12px] font-bold leading-tight min-[390px]:text-[13px] sm:mt-2 sm:text-base ${valueTone}`}>
            {financials.difference === null ? FALLBACK : (
              <>
                <span>{formatCurrencyPrecise(financials.difference, 2)} {directionText}</span>
              </>
            )}
          </p>
        </div>
        <div className="border-r border-slate-200 px-1.5 sm:px-2">
          <p className="font-medium text-slate-500">Quoted %</p>
          <p className={`mt-1.5 break-words text-[12px] font-bold leading-tight min-[390px]:text-[13px] sm:mt-2 sm:text-base ${valueTone}`}>
            {financials.percentage === null ? FALLBACK : `${financials.percentage.toFixed(2)}% ${directionText}`}
          </p>
        </div>
        <div className="px-1.5 sm:px-2">
          <p className="font-medium text-slate-500">Status</p>
          <p className={`mt-1.5 break-words text-[12px] font-bold leading-tight min-[390px]:text-[13px] sm:mt-2 sm:text-base ${valueTone}`}>{financials.positionLabel}</p>
        </div>
      </div>
    </div>
  )
}

function FinancialAmountCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-card p-2.5 shadow-sm shadow-emerald-950/[0.02] sm:p-4">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 sm:h-10 sm:w-10">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-600">{label}</p>
          <p className="mt-1 break-words text-sm font-bold leading-tight text-slate-950 min-[390px]:text-base sm:text-xl">
            {value}
          </p>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ icon: Icon, label, value, children }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,1fr)] items-center gap-3 border-b border-border/70 px-4 py-3.5 last:border-b-0 sm:grid-cols-[180px_1fr] sm:px-5 sm:py-4">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Icon className="h-[18px] w-[18px] shrink-0 sm:h-4 sm:w-4" />
        <span className="text-sm font-medium sm:text-sm">{label}</span>
      </div>
      <div className="min-w-0 break-words text-right text-sm font-medium text-foreground sm:text-sm">
        {children || valueOrFallback(value)}
      </div>
    </div>
  )
}

export default function TenderQuickView({ tender, open, onOpenChange, onEdit, canEdit }) {
  if (!tender) return null

  const checklist = tender.checklist || []
  const done = Number.isFinite(Number(tender.checklistCompleted))
    ? Number(tender.checklistCompleted)
    : checklist.filter((c) => c.done).length
  const total = Number.isFinite(Number(tender.checklistTotal))
    ? Number(tender.checklistTotal)
    : checklist.length
  const pct = total ? Math.round((done / total) * 100) : 0
  const title = tender.title || tender.name || 'Untitled tender'
  const status = getTenderDisplayStatus(tender) || FALLBACK
  const agency = tender.agency || tender.client || tender.department || FALLBACK
  const nitRef = tender.nitRef || tender.nit
  const linkedPayOrder = tender.linkedPayOrder || tender.linkedPO

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bottom-0 left-0 top-auto max-h-[calc(100dvh-72px)] w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto overscroll-contain rounded-b-none rounded-t-[28px] border-border bg-popover px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl shadow-slate-950/30 sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-h-[90vh] sm:max-w-[840px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:p-8 [&>button]:hidden">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-slate-200 sm:hidden" />

        <DialogHeader className="space-y-4 text-left sm:space-y-5 sm:pr-12">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                Tender Quick View
              </p>
            </div>
            <DialogClose
              aria-label="Close tender quick view"
              className="mr-1 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 sm:mr-0 sm:mt-0"
            >
              <X className="h-5 w-5" />
            </DialogClose>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <DialogTitle className="line-clamp-4 break-words text-2xl font-bold leading-[1.15] tracking-normal text-slate-950 sm:line-clamp-2 sm:text-[26px] sm:leading-[1.2]">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Quick summary and actions for the selected tender.
            </DialogDescription>
            <div className="flex min-w-0 items-center gap-2 sm:flex-wrap sm:gap-3">
              <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-700">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                {status}
              </span>
              <span className="hidden h-5 w-px bg-border sm:block" />
              <span className="inline-flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground sm:flex-none">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-50 text-slate-500 sm:h-8 sm:w-8 sm:bg-slate-100">
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 truncate">{agency}</span>
              </span>
            </div>
          </div>
        </DialogHeader>

        <FinancialSnapshot tender={tender} />

        <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-4">
          <SummaryCard icon={WalletCards} label="Value" value={formatRs(tender.value)} />
          <SummaryCard icon={CalendarCheck} label="Submission" value={formatQuickDate(tender.submissionDate)} />
          <SummaryCard icon={Tag} label="Tender Fee" value={formatRs(tender.tenderFee)} />
          <SummaryCard icon={LinkIcon} label="Linked PO" value={linkedPayOrder} />
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card sm:mt-5 sm:rounded-xl">
          <DetailRow icon={FileText} label="NIT / Ref" value={nitRef} />
          <DetailRow icon={CalendarDays} label="Opening" value={formatQuickDate(tender.openingDate)} />
          <DetailRow icon={ClipboardCheck} label="Checklist">
            <div className="flex items-center gap-4">
              <span className="shrink-0 text-sm font-semibold text-slate-950">
                {done}/{total}
              </span>
              <Progress value={pct} className="h-2 flex-1 bg-slate-200 [&>div]:bg-emerald-600" />
            </div>
          </DetailRow>
          <div className="px-4 pb-4 sm:px-5">
            <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-3 text-sm text-slate-600">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <p>Keep track of checklist items to stay on top of tender requirements.</p>
            </div>
          </div>
        </div>

        {tender.notes && (
          <div className="mt-5 rounded-xl border border-border bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{tender.notes}</p>
          </div>
        )}

        <DialogFooter className="mt-6 flex-col gap-3 sm:hidden sm:space-x-0">
          <Button
            variant="outline"
            asChild
            className="h-14 w-full rounded-xl border-primary bg-popover px-5 text-base font-semibold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Link to={`/tenders/${tender.id}`}>
              <ExternalLink className="h-5 w-5" /> View Full Details
            </Link>
          </Button>
          {canEdit && (
            <Button
              onClick={onEdit}
              className="h-14 w-full rounded-xl bg-emerald-700 px-5 text-base font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              <Pencil className="h-5 w-5" /> Edit Tender
            </Button>
          )}
        </DialogFooter>

        <DialogFooter className="mt-6 hidden gap-3 sm:flex sm:justify-end sm:space-x-0">
          <Button
            variant="outline"
            asChild
            className="h-11 w-full border-emerald-600 px-5 font-semibold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 sm:w-auto"
          >
            <Link to={`/tenders/${tender.id}`}>
              <ExternalLink className="h-4 w-4" /> View Full Details
            </Link>
          </Button>
          {canEdit && (
            <Button
              onClick={onEdit}
              className="h-11 w-full bg-emerald-700 px-5 font-semibold text-white hover:bg-emerald-800 sm:w-auto"
            >
              <Pencil className="h-4 w-4" /> Edit Tender
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
