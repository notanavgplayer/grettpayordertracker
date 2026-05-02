import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Download, ExternalLink, FileArchive, FileSpreadsheet, FileText, FileType,
  FolderOpen, Image as ImageIcon, Link as LinkIcon, Search, Upload,
} from 'lucide-react'
import { useCollection } from '@/hooks/useFirestore'
import { formatDate } from '@/lib/utils'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import PageHeader from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const TYPE_FILTERS = ['All', 'PDF', 'Image', 'Excel', 'Word', 'Other']

function getDocumentKind(document = {}) {
  const explicit = String(document.type || document.category || '').trim()
  if (TYPE_FILTERS.includes(explicit)) return explicit

  const name = `${document.fileName || ''} ${document.title || ''} ${document.url || ''}`.toLowerCase()
  if (/\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/.test(name)) return 'Image'
  if (/\.pdf(\?|$)/.test(name)) return 'PDF'
  if (/\.(xls|xlsx|csv)(\?|$)/.test(name)) return 'Excel'
  if (/\.(doc|docx)(\?|$)/.test(name)) return 'Word'
  return explicit || 'Other'
}

function getDocumentIcon(kind) {
  if (kind === 'Image') return ImageIcon
  if (kind === 'PDF') return FileText
  if (kind === 'Excel') return FileSpreadsheet
  if (kind === 'Word') return FileType
  return FileArchive
}

function getKindClass(kind) {
  if (kind === 'Image') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (kind === 'PDF') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (kind === 'Excel') return 'border-green-200 bg-green-50 text-green-700'
  if (kind === 'Word') return 'border-blue-200 bg-blue-50 text-blue-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}

function formatFileSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatDocumentDate(value) {
  if (!value) return '-'
  if (typeof value?.toDate === 'function') return formatDate(value.toDate().toISOString())
  if (typeof value?.seconds === 'number') return formatDate(new Date(value.seconds * 1000).toISOString())
  return formatDate(value)
}

function flattenText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(flattenText).join(' ')
  if (typeof value === 'object') return Object.values(value).map(flattenText).join(' ')
  return ''
}

function buildDocuments(tenders = []) {
  return tenders.flatMap((tender) => (
    (tender.documents || []).map((document, index) => {
      const kind = getDocumentKind(document)
      const title = document.title || document.fileName || document.type || 'Untitled document'
      return {
        ...document,
        id: document.id || `${tender.id}-${index}`,
        key: `${tender.id}-${document.id || document.fileName || index}`,
        kind,
        title,
        tenderId: tender.id,
        tenderName: tender.name || 'Untitled tender',
        tenderAgency: tender.agency || '',
        tenderNit: tender.nit || tender.nitRef || '',
        searchText: flattenText({ ...document, title, kind, tenderName: tender.name, agency: tender.agency, nit: tender.nit }).toLowerCase(),
      }
    })
  ))
}

function DocumentStat({ icon: Icon, label, value, tone = 'emerald' }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    red: 'bg-rose-50 text-rose-700',
    amber: 'bg-amber-50 text-amber-700',
  }

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone] || tones.emerald}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function DocumentCard({ document }) {
  const [imageFailed, setImageFailed] = useState(false)
  const Icon = getDocumentIcon(document.kind)
  const isImage = document.kind === 'Image' && document.url && !imageFailed

  return (
    <Card className="min-w-0 self-start overflow-hidden">
      <CardContent className="min-w-0 space-y-3.5 p-4">
        <div className="aspect-video overflow-hidden rounded-xl border border-border/80 bg-muted/30">
          {isImage ? (
            <img src={document.url} alt={document.title} className="h-full w-full object-cover" loading="lazy" onError={() => setImageFailed(true)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-background shadow-sm">
                <Icon className="h-7 w-7" />
              </div>
              <Badge variant="outline" className={`rounded-full ${getKindClass(document.kind)}`}>{document.kind}</Badge>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground" title={document.title}>{document.title}</p>
              <Link to={`/tenders/${document.tenderId}`} className="mt-1 block truncate text-xs font-medium text-emerald-700 hover:text-emerald-800" title={document.tenderName}>
                {document.tenderName}
              </Link>
            </div>
            <Badge variant="outline" className={`shrink-0 rounded-full ${getKindClass(document.kind)}`}>{document.kind}</Badge>
          </div>

          <p className="line-clamp-2 text-xs text-muted-foreground" title={document.tenderAgency}>
            {document.tenderAgency || document.tenderNit || 'Linked tender document'}
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="min-w-0 rounded-lg bg-muted/35 p-2">
              <p className="font-medium text-foreground">Uploaded</p>
              <p className="mt-0.5">{formatDocumentDate(document.uploadedAt || document.addedAt)}</p>
            </div>
            <div className="min-w-0 rounded-lg bg-muted/35 p-2">
              <p className="font-medium text-foreground">Size</p>
              <p className="mt-0.5">{formatFileSize(document.fileSize)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {document.url ? (
            <>
              <Button variant="outline" size="sm" className="h-9 min-w-0" asChild>
                <a href={document.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Preview
                </a>
              </Button>
              <Button variant="outline" size="sm" className="h-9 min-w-0" asChild>
                <a href={document.url} download={document.fileName || document.title}>
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="h-9 min-w-0" asChild>
              <Link to={`/tenders/${document.tenderId}`}>
                <LinkIcon className="h-3.5 w-3.5" /> Open tender
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Documents() {
  const { data: tenders, loading } = useCollection('tenders', 'updatedAt', 'desc')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')

  const documents = useMemo(() => buildDocuments(tenders), [tenders])
  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase()
    return documents.filter((document) => {
      if (typeFilter !== 'All' && document.kind !== typeFilter) return false
      if (!query) return true
      return document.searchText.includes(query)
    })
  }, [documents, search, typeFilter])

  const stats = useMemo(() => ({
    total: documents.length,
    images: documents.filter((document) => document.kind === 'Image').length,
    pdfs: documents.filter((document) => document.kind === 'PDF').length,
    linkedTenders: new Set(documents.map((document) => document.tenderId)).size,
    recent: documents.filter((document) => {
      const value = document.uploadedAt || document.addedAt
      const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value)
      if (Number.isNaN(date.getTime())) return false
      return (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24) <= 30
    }).length,
  }), [documents])

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: 'Home', href: '/home' }, { label: 'Documents' }]} />
      <PageHeader
        title="Documents"
        description="View uploaded tender documents, images, BOQs, work orders, and supporting records across all tenders."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <DocumentStat icon={FolderOpen} label="Total Documents" value={stats.total} />
        <DocumentStat icon={ImageIcon} label="Images" value={stats.images} />
        <DocumentStat icon={FileText} label="PDFs" value={stats.pdfs} tone="red" />
        <DocumentStat icon={LinkIcon} label="Linked Tenders" value={stats.linkedTenders} tone="blue" />
        <DocumentStat icon={Upload} label="Recent Uploads" value={stats.recent} tone="amber" />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 w-full lg:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents, tenders, agencies..." className="h-11 pl-9" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin lg:pb-0">
              {TYPE_FILTERS.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={`h-9 flex-shrink-0 rounded-full border px-3 text-sm font-medium transition-colors ${
                    typeFilter === type
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-border bg-background text-muted-foreground hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-72 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <FolderOpen className="h-7 w-7" />
          </div>
          <p className="mt-4 text-base font-semibold text-foreground">No documents uploaded yet.</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">Documents uploaded inside Tender Detail will appear here automatically.</p>
          <Button asChild className="mt-5 bg-emerald-600 text-white hover:bg-emerald-700">
            <Link to="/tenders">Open tenders</Link>
          </Button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 p-8 text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No documents match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another search term or file type.</p>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredDocuments.map((document) => (
            <DocumentCard key={document.key} document={document} />
          ))}
        </div>
      )}
    </div>
  )
}
