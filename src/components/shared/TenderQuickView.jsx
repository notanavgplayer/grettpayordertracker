import { Link } from 'react-router-dom'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Building2,
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
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/45 p-4 shadow-sm shadow-emerald-950/[0.02]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-base font-semibold leading-tight text-emerald-700">
            {valueOrFallback(value)}
          </p>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ icon: Icon, label, value, children }) {
  return (
    <div className="grid gap-3 border-b border-border/70 px-4 py-4 last:border-b-0 sm:grid-cols-[180px_1fr] sm:items-center sm:px-5">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="min-w-0 text-sm font-medium text-foreground sm:text-right">
        {children || valueOrFallback(value)}
      </div>
    </div>
  )
}

function MobileDetailRow({ icon: Icon, label, value }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(115px,auto)] items-center gap-3 border-b border-slate-200/80 px-4 py-3.5 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3 text-slate-500">
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate text-sm font-medium">{label}</span>
      </div>
      <p className="min-w-0 break-words text-right text-sm font-semibold leading-5 text-slate-950">
        {valueOrFallback(value)}
      </p>
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
  const status = tender.displayStatus || tender.status || FALLBACK
  const agency = tender.agency || tender.client || tender.department || FALLBACK
  const nitRef = tender.nitRef || tender.nit
  const linkedPayOrder = tender.linkedPayOrder || tender.linkedPO

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bottom-0 left-0 top-auto max-h-[92vh] w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-b-none rounded-t-[28px] border-border/80 bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl shadow-slate-950/30 sm:bottom-auto sm:left-[50%] sm:top-[50%] sm:max-h-[90vh] sm:max-w-[820px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:p-8 [&>button]:hidden">
        <div className="mx-auto mb-5 h-1.5 w-16 rounded-full bg-slate-200 sm:hidden" />

        <DialogHeader className="space-y-5 text-left sm:pr-12">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">
                Tender Quick View
              </p>
            </div>
            <DialogClose
              aria-label="Close tender quick view"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
            >
              <X className="h-5 w-5" />
            </DialogClose>
          </div>
          <div className="space-y-4">
            <DialogTitle className="line-clamp-3 break-words text-xl font-bold leading-[1.18] tracking-normal text-slate-950 sm:line-clamp-2 sm:text-2xl">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Quick summary and actions for the selected tender.
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-700">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
                {status}
              </span>
              <span className="h-5 w-px bg-border" />
              <span className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-slate-500 sm:bg-slate-100">
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="break-words">{agency}</span>
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard icon={WalletCards} label="Value" value={formatRs(tender.value)} />
          <SummaryCard icon={CalendarCheck} label="Submission" value={formatQuickDate(tender.submissionDate)} />
          <div className="hidden sm:block">
            <SummaryCard icon={Tag} label="Tender Fee" value={formatRs(tender.tenderFee)} />
          </div>
          <div className="hidden sm:block">
            <SummaryCard icon={LinkIcon} label="Linked PO" value={linkedPayOrder} />
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white sm:hidden">
          <MobileDetailRow icon={FileText} label="NIT / Ref" value={nitRef} />
          <MobileDetailRow icon={Tag} label="Tender Fee" value={formatRs(tender.tenderFee)} />
          <MobileDetailRow icon={CalendarDays} label="Opening" value={formatQuickDate(tender.openingDate)} />
          <MobileDetailRow icon={LinkIcon} label="Linked PO" value={linkedPayOrder} />
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-slate-700">Checklist</p>
                <p className="text-sm font-semibold text-slate-700">
                  {done}/{total}
                </p>
              </div>
              <Progress value={pct} className="mt-3 h-2 bg-slate-200 [&>div]:bg-emerald-600" />
            </div>
          </div>
        </div>

        <div className="mt-5 hidden overflow-hidden rounded-xl border border-border bg-white sm:block">
          <DetailRow icon={FileText} label="NIT / Ref" value={nitRef} />
          <DetailRow icon={Tag} label="Opening" value={formatQuickDate(tender.openingDate)} />
          <DetailRow icon={ClipboardCheck} label="Checklist">
            <div className="flex items-center gap-4">
              <span className="shrink-0 text-sm font-semibold text-foreground">
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
          {canEdit && (
            <Button
              onClick={onEdit}
              className="h-14 w-full rounded-xl bg-emerald-700 px-5 text-base font-semibold text-white shadow-sm hover:bg-emerald-800"
            >
              <Pencil className="h-5 w-5" /> Edit Tender
            </Button>
          )}
          <Button
            variant="outline"
            asChild
            className="h-14 w-full rounded-xl border-emerald-600 bg-white px-5 text-base font-semibold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Link to={`/tenders/${tender.id}`}>
              <ExternalLink className="h-5 w-5" /> View Full Details
            </Link>
          </Button>
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
