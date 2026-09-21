import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, Download, ExternalLink, Eye, FileArchive, FileSpreadsheet, FileText,
  FileType, FolderOpen, Grid2X2, Image as ImageIcon, List, Pencil, Plus, Search,
  Trash2, Upload, X, MoreHorizontal,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { useCollection, useFirestoreCRUD } from '@/hooks/useFirestore'
import { uid } from '@/lib/utils'
import { rowsToCSV } from '@/lib/csv'
import { safeHttpUrl } from '@/lib/data'
import { getTenderDocumentUrl, hasSupabaseStorageConfig, uploadTenderDocument } from '@/lib/supabaseStorage'
import Breadcrumbs from '@/components/shared/Breadcrumbs'
import ConfirmDelete from '@/components/shared/ConfirmDelete'
import KpiCard from '@/components/shared/KpiCard'
import PageHeader from '@/components/shared/PageHeader'
import LoadState from '@/components/shared/LoadState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const TYPE_FILTERS = ['All', 'Image', 'PDF', 'Excel', 'Word', 'Other']
const DOCUMENT_CATEGORIES = [
  'BOQ',
  'Work Order',
  'Agreement',
  'Drawing',
  'Site Photos',
  'Letters',
  'NIT',
  'Tender',
  'Material',
  'Invoice',
  'Other',
]

function hasImageExtension(value) {
  const path = String(value || '').split('?')[0].split('#')[0].toLowerCase()
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/.test(path)
}

function isImageDocument(document = {}) {
  const mime = String(document.mimeType || document.fileType || '').toLowerCase()
  const type = String(document.type || document.kind || '').trim().toLowerCase()
  const category = String(document.category || '').trim().toLowerCase()
  const url = getDocumentUrl(document)
  return (
    mime.startsWith('image/') ||
    type.includes('image') ||
    category === 'image' ||
    category.includes('photo') ||
    hasImageExtension(document.fileName || document.name || document.title) ||
    hasImageExtension(url)
  )
}

function getDocumentKind(document = {}) {
  const mime = String(document.mimeType || document.fileType || '').toLowerCase()
  const explicit = String(document.kind || '').trim()
  if (TYPE_FILTERS.includes(explicit)) return explicit

  const source = [
    document.fileName,
    document.name,
    document.title,
    document.type,
    document.category,
    document.url,
    document.fileUrl,
    document.publicUrl,
    document.downloadUrl,
    mime,
  ].join(' ').toLowerCase()

  if (isImageDocument(document)) return 'Image'
  if (mime.includes('pdf') || /\.pdf(\?|$)/.test(source)) return 'PDF'
  if (mime.includes('spreadsheet') || mime.includes('excel') || /\.(xls|xlsx|csv)(\?|$)/.test(source)) return 'Excel'
  if (mime.includes('word') || /\.(doc|docx)(\?|$)/.test(source)) return 'Word'
  return 'Other'
}

function getDocumentIcon(kind) {
  if (kind === 'Image') return ImageIcon
  if (kind === 'PDF') return FileText
  if (kind === 'Excel') return FileSpreadsheet
  if (kind === 'Word') return FileType
  return FileArchive
}

function getKindBadgeClass(kind) {
  if (kind === 'Image') return 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
  if (kind === 'PDF') return 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
  if (kind === 'Excel') return 'border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300'
  if (kind === 'Word') return 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
}

function getKindIconClass(kind) {
  if (kind === 'Image') return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
  if (kind === 'PDF') return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
  if (kind === 'Excel') return 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300'
  if (kind === 'Word') return 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
  return 'bg-slate-50 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
}

function getCategoryBadgeClass(category = '') {
  const value = category.toLowerCase()
  if (value.includes('site') || value.includes('photo')) return 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
  if (value.includes('boq') || value.includes('tender') || value.includes('nit')) return 'border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
  if (value.includes('drawing') || value.includes('material')) return 'border-cyan-200 dark:border-cyan-900/60 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300'
  if (value.includes('letter') || value.includes('work')) return 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
}

function formatFileSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function toDate(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatSafeDate(value) {
  const date = toDate(value)
  if (!date) return '-'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function dateInputValue(value) {
  const date = toDate(value)
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

function flattenText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(flattenText).join(' ')
  if (typeof value === 'object') return Object.values(value).map(flattenText).join(' ')
  return ''
}

function safeText(value, fallback = '-') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function getTenderName(tender = {}) {
  return tender.name || tender.title || tender.projectName || tender.tenderName || 'Untitled tender'
}

function getTenderNit(tender = {}) {
  return tender.nit || tender.nitRef || tender.ref || tender.reference || tender.nitNo || ''
}

function getDocumentTitle(document = {}) {
  return document.title || document.name || document.fileName || document.type || document.category || 'Untitled document'
}

function getDocumentUrl(document = {}) {
  return safeHttpUrl(document.fileUrl || document.url || document.publicUrl || document.downloadUrl || '')
}

function getDocumentCategory(document = {}) {
  return document.category || document.type || 'Other'
}

function buildDocuments(tenders = []) {
  return tenders.flatMap((tender) => {
    const tenderId = tender.id
    const tenderName = getTenderName(tender)
    const tenderNit = getTenderNit(tender)
    return (Array.isArray(tender.documents) ? tender.documents : []).map((document, index) => {
      const kind = getDocumentKind(document)
      const title = getDocumentTitle(document)
      const category = getDocumentCategory(document)
      const url = getDocumentUrl(document)
      const id = document.id || `${tenderId}-${index}`
      return {
        ...document,
        id,
        originalId: document.id,
        originalIndex: index,
        key: `${tenderId}-${document.id || document.fileName || document.name || index}`,
        kind,
        title,
        category,
        url,
        fileName: document.fileName || document.name || title,
        fileSize: document.fileSize || document.size || '',
        mimeType: document.mimeType || document.fileType || '',
        uploadedAt: document.uploadedAt || document.createdAt || document.addedAt || '',
        tenderId,
        tenderName,
        tenderNit,
        tenderAgency: tender.agency || tender.client || '',
        searchText: flattenText({
          ...document,
          title,
          category,
          kind,
          tenderName,
          tenderNit,
          agency: tender.agency || tender.client,
        }).toLowerCase(),
      }
    })
  })
}

function exportDocumentsCSV(documents) {
  if (!documents.length) {
    toast.error('No documents to export')
    return
  }
  const headers = ['Title', 'File Type', 'Category', 'Tender / Project', 'NIT / Ref', 'Uploaded', 'Size', 'URL', 'Notes']
  const rows = documents.map((document) => [
    document.title,
    document.kind,
    document.category,
    document.tenderName,
    document.tenderNit,
    formatSafeDate(document.uploadedAt),
    formatFileSize(document.fileSize),
    document.url,
    document.notes,
  ])
  const csv = rowsToCSV(headers, rows)
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `documents-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  toast.success('Documents exported')
}

function emptyDocumentForm() {
  return {
    id: uid(),
    tenderId: '',
    title: '',
    category: 'Other',
    notes: '',
    url: '',
    fileName: '',
    fileSize: '',
    mimeType: '',
    storageProvider: '',
    storageBucket: '',
    storagePath: '',
    uploadedAt: '',
    addedAt: new Date().toISOString().slice(0, 10),
  }
}

function makeDocumentPayload(form) {
  const category = form.category || 'Other'
  const storedUrl = form.storagePath ? '' : safeHttpUrl(form.url)
  return {
    id: form.id || uid(),
    title: form.title || form.fileName || category || 'Untitled document',
    name: form.fileName || form.title || '',
    fileName: form.fileName || '',
    url: storedUrl,
    fileUrl: storedUrl,
    type: category,
    category,
    notes: form.notes || '',
    fileType: form.mimeType || '',
    mimeType: form.mimeType || '',
    fileSize: form.fileSize || '',
    size: form.fileSize || '',
    storageProvider: form.storageProvider || '',
    storageBucket: form.storageBucket || '',
    storagePath: form.storagePath || '',
    uploadedAt: form.uploadedAt || new Date().toISOString().slice(0, 10),
    addedAt: form.addedAt || new Date().toISOString().slice(0, 10),
  }
}

function replaceDocument(documents = [], target, payload) {
  const items = Array.isArray(documents) ? documents : []
  return items.map((item, index) => {
    const matchesId = target.originalId && item.id === target.originalId
    const matchesIndex = !target.originalId && index === target.originalIndex
    return matchesId || matchesIndex ? { ...item, ...payload } : item
  })
}

function removeDocument(documents = [], target) {
  const items = Array.isArray(documents) ? documents : []
  return items.filter((item, index) => {
    const matchesId = target.originalId && item.id === target.originalId
    const matchesIndex = !target.originalId && index === target.originalIndex
    return !(matchesId || matchesIndex)
  })
}

function StatCard({ icon: Icon, label, value, helper, tone = 'emerald' }) {
  return <KpiCard icon={Icon} label={label} value={value} helper={helper} tone={tone} />
}

function DocumentBadge({ children, className = '' }) {
  return (
    <Badge variant="outline" className={`max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      {children}
    </Badge>
  )
}

function DocumentPreview({ document, imageFailed, setImageFailed }) {
  const Icon = getDocumentIcon(document.kind)
  const imageUrl = getDocumentUrl(document)
  const isImage = isImageDocument(document) && imageUrl && !imageFailed
  return (
    <div className="aspect-[16/11] overflow-hidden rounded-xl border border-border/80 bg-muted/40 sm:aspect-video">
      {isImage ? (
        <img
          src={imageUrl}
          alt={document.title}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground sm:gap-2.5">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl sm:h-14 sm:w-14 ${getKindIconClass(document.kind)}`}>
            <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <DocumentBadge className={getKindBadgeClass(document.kind)}>{document.kind}</DocumentBadge>
        </div>
      )}
    </div>
  )
}

function DocumentCard({ document, isAdmin, onPreview, onEdit, onDelete }) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <Card className="min-w-0 self-start overflow-hidden rounded-xl border bg-card transition hover:border-emerald-200 hover:shadow-md dark:hover:border-emerald-900">
      <CardContent className="min-w-0 space-y-2.5 p-3 sm:space-y-3 sm:p-3.5">
        <DocumentPreview document={document} imageFailed={imageFailed} setImageFailed={setImageFailed} />
        <div className="min-w-0 space-y-1.5 sm:space-y-2">
          <div className="min-w-0 space-y-1.5">
            <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground" title={document.title}>{document.title}</p>
            <div className="flex min-w-0 flex-wrap gap-1">
              <DocumentBadge className={getKindBadgeClass(document.kind)}>{document.kind}</DocumentBadge>
              <DocumentBadge className={getCategoryBadgeClass(document.category)}>{safeText(document.category, 'Other')}</DocumentBadge>
            </div>
          </div>
          <div className="min-w-0 rounded-lg bg-muted/30 px-2.5 py-1.5 text-xs leading-5 text-muted-foreground sm:px-3 sm:py-2">
            <Link to={`/tenders/${document.tenderId}`} className="block truncate font-medium text-foreground hover:text-emerald-700 dark:hover:text-emerald-300" title={document.tenderName}>
              {document.tenderName}
            </Link>
            <p className="truncate text-xs text-muted-foreground" title={document.tenderNit || document.tenderAgency}>
              {document.tenderNit || document.tenderAgency || 'Linked tender'}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-1.5 text-xs text-muted-foreground sm:gap-3 sm:pt-2">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{formatSafeDate(document.uploadedAt)}</span>
            </span>
            <span className="flex-shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium">{formatFileSize(document.fileSize)}</span>
          </div>
        </div>
        <DocumentActions document={document} isAdmin={isAdmin} onPreview={onPreview} onEdit={onEdit} onDelete={onDelete} />
      </CardContent>
    </Card>
  )
}

function DocumentActions({ document, isAdmin, onPreview, onEdit, onDelete }) {
  return (
    <div className="flex items-center gap-2 border-t border-border/70 pt-3">
      <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => onPreview(document)}>
        <Eye className="h-4 w-4" /> Preview
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="More document actions"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild disabled={!document.url}>
            <a href={document.url || undefined} download={document.fileName || document.title}><Download /> Download</a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onEdit(document)} disabled={!isAdmin}><Pencil /> Edit details</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDelete(document)} disabled={!isAdmin} className="text-destructive focus:text-destructive"><Trash2 /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function DocumentsTable({ documents, isAdmin, onPreview, onEdit, onDelete }) {
  return (
    <Card className="hidden overflow-hidden rounded-xl border bg-card lg:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-muted/35 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">File</th>
              <th className="px-4 py-3 text-left font-semibold">Type</th>
              <th className="px-4 py-3 text-left font-semibold">Category</th>
              <th className="px-4 py-3 text-left font-semibold">Linked Tender</th>
              <th className="px-4 py-3 text-left font-semibold">NIT / Ref</th>
              <th className="px-4 py-3 text-left font-semibold">Uploaded</th>
              <th className="px-4 py-3 text-left font-semibold">Size</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => {
              const Icon = getDocumentIcon(document.kind)
              return (
                <tr key={document.key} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${getKindIconClass(document.kind)}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="max-w-[240px] truncate font-semibold text-foreground" title={document.title}>{document.title}</p>
                        <p className="max-w-[240px] truncate text-xs text-muted-foreground" title={document.fileName}>{safeText(document.fileName)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><DocumentBadge className={getKindBadgeClass(document.kind)}>{document.kind}</DocumentBadge></td>
                  <td className="px-4 py-3"><DocumentBadge className={getCategoryBadgeClass(document.category)}>{document.category}</DocumentBadge></td>
                  <td className="px-4 py-3">
                    <Link to={`/tenders/${document.tenderId}`} className="block max-w-[220px] truncate font-medium text-foreground hover:text-emerald-700 dark:hover:text-emerald-300">
                      {document.tenderName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{safeText(document.tenderNit)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSafeDate(document.uploadedAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatFileSize(document.fileSize)}</td>
                  <td className="px-4 py-3">
                    <div className="ml-auto flex justify-end gap-2">
                      <Button type="button" variant="outline" size="icon-sm" onClick={() => onPreview(document)} aria-label="Preview document"><Eye className="h-3.5 w-3.5" /></Button>
                      {document.url ? (
                        <Button type="button" variant="outline" size="icon-sm" asChild>
                          <a href={document.url} download={document.fileName || document.title} aria-label="Download document"><Download className="h-3.5 w-3.5" /></a>
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="icon-sm" disabled aria-label="Download unavailable"><Download className="h-3.5 w-3.5" /></Button>
                      )}
                      <Button type="button" variant="outline" size="icon-sm" onClick={() => onEdit(document)} disabled={!isAdmin} aria-label="Edit document"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="outline" size="icon-sm" className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 dark:hover:text-rose-300" onClick={() => onDelete(document)} disabled={!isAdmin} aria-label="Delete document"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function Documents() {
  const { isAdmin } = useAuth()
  const { data: tenders, loading, error } = useCollection('tenders', 'updatedAt', 'desc')
  const { update } = useFirestoreCRUD('tenders')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [tenderFilter, setTenderFilter] = useState('All')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingDocument, setEditingDocument] = useState(null)
  const [documentForm, setDocumentForm] = useState(emptyDocumentForm)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [previewDocument, setPreviewDocument] = useState(null)

  const rawDocuments = useMemo(() => buildDocuments(tenders), [tenders])
  const [signedUrls, setSignedUrls] = useState({})
  useEffect(() => {
    let active = true
    const paths = [...new Set(rawDocuments.map((document) => document.storagePath).filter(Boolean))]
    if (!paths.length) { setSignedUrls({}); return undefined }
    Promise.allSettled(paths.map(async (path) => [path, await getTenderDocumentUrl(path)]))
      .then((results) => {
        if (!active) return
        setSignedUrls(Object.fromEntries(results.filter((result) => result.status === 'fulfilled').map((result) => result.value)))
      })
    return () => { active = false }
  }, [rawDocuments])
  const documents = useMemo(() => rawDocuments.map((document) => {
    const signedUrl = document.storagePath ? signedUrls[document.storagePath] : ''
    return signedUrl ? { ...document, url: signedUrl, fileUrl: signedUrl } : document
  }), [rawDocuments, signedUrls])
  const tenderOptions = useMemo(() => tenders.map((tender) => ({ id: tender.id, name: getTenderName(tender), nit: getTenderNit(tender) })), [tenders])
  const categories = useMemo(() => {
    const values = new Set(DOCUMENT_CATEGORIES)
    documents.forEach((document) => values.add(document.category || 'Other'))
    return ['All', ...Array.from(values).filter(Boolean).sort((a, b) => a.localeCompare(b))]
  }, [documents])

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase()
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null
    return documents.filter((document) => {
      if (typeFilter !== 'All' && document.kind !== typeFilter) return false
      if (categoryFilter !== 'All' && document.category !== categoryFilter) return false
      if (tenderFilter !== 'All' && document.tenderId !== tenderFilter) return false
      const uploaded = toDate(document.uploadedAt)
      if (from && (!uploaded || uploaded < from)) return false
      if (to && (!uploaded || uploaded > to)) return false
      if (!query) return true
      return document.searchText.includes(query)
    })
  }, [documents, search, typeFilter, categoryFilter, tenderFilter, dateFrom, dateTo])

  const stats = useMemo(() => {
    const recentCutoff = Date.now() - (30 * 24 * 60 * 60 * 1000)
    return {
      total: documents.length,
      images: documents.filter((document) => document.kind === 'Image').length,
      pdfs: documents.filter((document) => document.kind === 'PDF').length,
      linkedTenders: new Set(documents.map((document) => document.tenderId).filter(Boolean)).size,
      recent: documents.filter((document) => {
        const uploaded = toDate(document.uploadedAt)
        return uploaded ? uploaded.getTime() >= recentCutoff : false
      }).length,
    }
  }, [documents])

  const hasFilters = Boolean(search || typeFilter !== 'All' || categoryFilter !== 'All' || tenderFilter !== 'All' || dateFrom || dateTo)

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('All')
    setCategoryFilter('All')
    setTenderFilter('All')
    setDateFrom('')
    setDateTo('')
  }

  const openAddDocument = () => {
    setEditingDocument(null)
    setDocumentForm(emptyDocumentForm())
    setUploadProgress(0)
    setSheetOpen(true)
  }

  const openEditDocument = (document) => {
    setEditingDocument(document)
    setDocumentForm({
      id: document.originalId || document.id || uid(),
      tenderId: document.tenderId || '',
      title: document.title || '',
      category: document.category || 'Other',
      notes: document.notes || '',
      url: document.url || '',
      fileName: document.fileName || '',
      fileSize: document.fileSize || '',
      mimeType: document.mimeType || document.fileType || '',
      storageProvider: document.storageProvider || '',
      storageBucket: document.storageBucket || '',
      storagePath: document.storagePath || '',
      uploadedAt: dateInputValue(document.uploadedAt),
      addedAt: dateInputValue(document.addedAt) || new Date().toISOString().slice(0, 10),
    })
    setUploadProgress(0)
    setSheetOpen(true)
  }

  const setFormValue = (key) => (event) => {
    const value = event?.target?.value ?? event
    setDocumentForm((previous) => ({ ...previous, [key]: value }))
  }

  const selectedTender = tenderOptions.find((tender) => tender.id === documentForm.tenderId)

  const handleDocumentUpload = async (file) => {
    if (!file) return
    if (!documentForm.tenderId) {
      toast.error('Select a tender before uploading a file.')
      return
    }
    if (!hasSupabaseStorageConfig()) {
      toast.error('Storage is not configured. Add Supabase storage settings before uploading files.')
      return
    }
    setUploading(true)
    setUploadProgress(0)
    try {
      const uploaded = await uploadTenderDocument({
        tenderId: documentForm.tenderId,
        documentId: documentForm.id,
        file,
        onProgress: setUploadProgress,
      })
      setDocumentForm((previous) => ({
        ...previous,
        title: previous.title || file.name,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || '',
        url: uploaded.url,
        fileUrl: uploaded.url,
        storageProvider: 'supabase',
        storageBucket: uploaded.bucket,
        storagePath: uploaded.path,
        uploadedAt: new Date().toISOString().slice(0, 10),
      }))
      toast.success('File uploaded. Save the document to attach it.')
    } catch (uploadError) {
      console.error('Document upload failed', uploadError)
      toast.error('The file could not be uploaded. Check your connection and storage permissions, then try again.')
    } finally {
      setUploading(false)
    }
  }

  const saveDocument = async () => {
    if (!documentForm.tenderId) {
      toast.error('Select a tender or project first.')
      return
    }
    const tender = tenders.find((item) => item.id === documentForm.tenderId)
    if (!tender) {
      toast.error('Selected tender could not be found.')
      return
    }

    const payload = makeDocumentPayload(documentForm)
    try {
      if (editingDocument) {
        const targetTender = tenders.find((item) => item.id === editingDocument.tenderId)
        if (!targetTender) {
          toast.error('Linked tender could not be found.')
          return
        }
        const nextDocuments = replaceDocument(targetTender.documents, editingDocument, payload)
        await update(targetTender.id, { documents: nextDocuments })
        toast.success('Document updated')
      } else {
        await update(tender.id, { documents: [...(Array.isArray(tender.documents) ? tender.documents : []), payload] })
        toast.success('Document uploaded')
      }
      setSheetOpen(false)
      setEditingDocument(null)
    } catch {
      toast.error('Could not save the document. Please try again.')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const tender = tenders.find((item) => item.id === deleteTarget.tenderId)
    if (!tender) {
      toast.error('Linked tender could not be found.')
      setDeleteTarget(null)
      return
    }
    try {
      await update(tender.id, { documents: removeDocument(tender.documents, deleteTarget) })
      toast.success('Document deleted')
    } catch {
      toast.error('Could not delete the document. Please try again.')
    } finally {
      setDeleteTarget(null)
    }
  }

  const preview = (document) => {
    if (document.kind === 'Image' && document.url) {
      setPreviewDocument(document)
      return
    }
    if (document.url) {
      window.open(document.url, '_blank', 'noopener,noreferrer')
      return
    }
    toast.error('No preview URL is available for this document.')
  }

  return (
    <div className="space-y-6 pb-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/home' }, { label: 'Documents' }]} />
      <PageHeader
        title="Documents"
        description="Manage tender documents, images, BOQs, work orders, letters, drawings, and supporting records across all projects."
        actions={(
          <Button onClick={openAddDocument} disabled={!isAdmin} className="h-11 w-full gap-2 rounded-lg bg-emerald-600 px-4 text-white hover:bg-emerald-700 sm:w-auto">
            <Plus className="h-4 w-4" /> Upload Document
          </Button>
        )}
      />

      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FolderOpen} label="Total Documents" value={stats.total} helper="All tenders" />
        <StatCard icon={ImageIcon} label="Images" value={stats.images} helper={stats.total ? `${Math.round((stats.images / stats.total) * 100)}% of total` : 'No images yet'} tone="blue" />
        <StatCard icon={FileText} label="PDFs" value={stats.pdfs} helper={stats.total ? `${Math.round((stats.pdfs / stats.total) * 100)}% of total` : 'No PDFs yet'} tone="rose" />
        <StatCard icon={FolderOpen} label="Linked Tenders" value={stats.linkedTenders} helper="Across all documents" tone="violet" />
      </div>

      <Card className="rounded-xl border bg-card">
        <CardContent className="space-y-3 p-3.5 sm:p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_minmax(150px,220px)_auto] md:items-end">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search documents" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents..." className="h-10 pl-9" />
            </div>
            <FilterSelect label="File Type" value={typeFilter} onValueChange={setTypeFilter} options={TYPE_FILTERS} />
            <Button type="button" variant="outline" className="h-10 w-full gap-2 whitespace-nowrap md:w-auto" onClick={() => exportDocumentsCSV(filteredDocuments)}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          </div>
          <details className="group rounded-lg border border-border/70 bg-muted/15">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium text-foreground marker:hidden">
              <span>More filters</span>
              <span className="text-xs font-normal text-muted-foreground group-open:hidden">Category, tender, and date</span>
              <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">Hide filters</span>
            </summary>
            <div className="grid gap-3 border-t border-border/70 p-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterSelect label="Category" value={categoryFilter} onValueChange={setCategoryFilter} options={categories} />
            <FilterSelect
              label="Tender / Project"
              value={tenderFilter}
              onValueChange={setTenderFilter}
              options={['All', ...tenderOptions.map((tender) => tender.id)]}
              renderLabel={(value) => value === 'All' ? 'All Tenders' : tenderOptions.find((tender) => tender.id === value)?.name || 'Untitled tender'}
            />
            <DateField label="Date From" value={dateFrom} onChange={setDateFrom} />
            <DateField label="Date To" value={dateTo} onChange={setDateTo} />
            <Button type="button" variant="outline" className="h-10 w-full gap-2 whitespace-nowrap md:w-auto" onClick={resetFilters} disabled={!hasFilters}>
              <X className="h-4 w-4" /> Clear
            </Button>
            </div>
          </details>
          <div className="flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Showing {filteredDocuments.length} of {documents.length} documents</p>
            <div className="inline-flex w-fit overflow-hidden rounded-lg border border-border/80 bg-background">
              <Button type="button" variant={viewMode === 'grid' ? 'secondary' : 'ghost'} className="h-9 w-10 rounded-none" onClick={() => setViewMode('grid')} aria-label="Grid view">
                <Grid2X2 className="h-4 w-4" />
              </Button>
              <Button type="button" variant={viewMode === 'list' ? 'secondary' : 'ghost'} className="h-9 w-10 rounded-none border-l border-border/80" onClick={() => setViewMode('list')} aria-label="List view">
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Card key={index} className="h-60 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : error ? (
        <LoadState title="Documents could not be loaded" error={error} />
      ) : documents.length === 0 ? (
        <EmptyDocuments isAdmin={isAdmin} onAdd={openAddDocument} />
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            <FolderOpen className="h-7 w-7" />
          </div>
          <p className="mt-4 text-base font-semibold text-foreground">No matching documents</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Try changing search, file type, category, tender, or date filters.</p>
        </div>
      ) : viewMode === 'list' ? (
        <>
          <DocumentsTable documents={filteredDocuments} isAdmin={isAdmin} onPreview={preview} onEdit={openEditDocument} onDelete={setDeleteTarget} />
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 lg:hidden">
            {filteredDocuments.map((document) => (
              <DocumentCard key={document.key} document={document} isAdmin={isAdmin} onPreview={preview} onEdit={openEditDocument} onDelete={setDeleteTarget} />
            ))}
          </div>
        </>
      ) : (
        <div className="grid min-w-0 grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredDocuments.map((document) => (
            <DocumentCard key={document.key} document={document} isAdmin={isAdmin} onPreview={preview} onEdit={openEditDocument} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full min-w-0 flex-col gap-0 overflow-x-hidden p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
            <SheetTitle>{editingDocument ? 'Edit Document' : 'Upload Document'}</SheetTitle>
            <SheetDescription>
              Select a tender, upload the file, and save its metadata in that tender's document list.
            </SheetDescription>
          </SheetHeader>
          <div className="min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
            <div className="space-y-1.5">
              <Label htmlFor="document-tender">Tender / Project</Label>
              <Select value={documentForm.tenderId || ''} onValueChange={setFormValue('tenderId')} disabled={!!editingDocument}>
                <SelectTrigger id="document-tender"><SelectValue placeholder="Select tender / project" /></SelectTrigger>
                <SelectContent>
                  {tenderOptions.map((tender) => (
                    <SelectItem key={tender.id} value={tender.id}>{tender.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingDocument ? <p className="text-xs text-muted-foreground">Linked tender is locked while editing to keep existing records safe.</p> : null}
              {selectedTender?.nit ? <p className="truncate text-xs text-muted-foreground">NIT / Ref: {selectedTender.nit}</p> : null}
            </div>

            <div className="min-w-0 rounded-xl border border-dashed border-border bg-muted/20 p-4">
              <Label htmlFor="document-upload" className="text-sm font-medium">Upload file / image</Label>
              <Input
                id="document-upload"
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv"
                className="mt-2"
                disabled={!isAdmin || uploading || !documentForm.tenderId}
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  await handleDocumentUpload(file)
                }}
              />
              {uploading ? <p className="mt-2 text-xs text-muted-foreground">Uploading {uploadProgress}%...</p> : null}
              {(documentForm.fileName || documentForm.url) ? (
                <div className="mt-3 min-w-0 rounded-lg bg-background p-3 text-xs text-muted-foreground">
                  <p className="truncate font-semibold text-foreground" title={documentForm.fileName || documentForm.title}>
                    {documentForm.fileName || documentForm.title || 'Uploaded file'}
                  </p>
                  {documentForm.fileSize ? <p className="mt-1">Size: {formatFileSize(documentForm.fileSize)}</p> : null}
                  {documentForm.url ? <p className="mt-1 break-all">URL saved for this document.</p> : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="document-title">Title</Label>
              <Input id="document-title" value={documentForm.title} onChange={setFormValue('title')} placeholder="e.g. Site Visit - Foundation Work" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="document-category">Category</Label>
              <Select value={documentForm.category || 'Other'} onValueChange={setFormValue('category')}>
                <SelectTrigger id="document-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="document-notes">Notes</Label>
              <Textarea id="document-notes" value={documentForm.notes} onChange={setFormValue('notes')} rows={4} placeholder="Optional notes about this file" />
            </div>
          </div>
          <SheetFooter className="gap-2 border-t border-border px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:pb-4">
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={saveDocument} disabled={!isAdmin || uploading}>
              {editingDocument ? 'Save Document' : 'Upload Document'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDelete
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete document"
        description="This will remove the document from its linked tender. This action cannot be undone."
      />

      <Dialog open={!!previewDocument} onOpenChange={() => setPreviewDocument(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-x-hidden overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewDocument?.title || 'Document preview'}</DialogTitle>
            <DialogDescription>{previewDocument?.tenderName || 'Linked tender document'}</DialogDescription>
          </DialogHeader>
          {previewDocument?.url ? (
            <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-muted/20">
              <img src={previewDocument.url} alt={previewDocument.title} className="max-h-[70vh] w-full max-w-full object-contain" />
            </div>
          ) : null}
          <DialogFooter>
            {previewDocument?.url ? (
              <Button variant="outline" asChild>
                <a href={previewDocument.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Open original
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterSelect({ label, value, onValueChange, options, renderLabel }) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} className="h-10 min-w-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>{renderLabel ? renderLabel(option) : option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function DateField({ label, value, onChange }) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mobile-date-input" />
    </div>
  )
}

function EmptyDocuments({ isAdmin, onAdd }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
        <FolderOpen className="h-7 w-7" />
      </div>
      <p className="mt-4 text-base font-semibold text-foreground">No documents uploaded yet</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        Upload tender documents, site photos, BOQs, work orders, letters, and drawings to keep records organized.
      </p>
      <Button onClick={onAdd} disabled={!isAdmin} className="mt-5 h-11 rounded-lg bg-emerald-600 px-4 text-white hover:bg-emerald-700">
        <Plus className="h-4 w-4" /> Upload first document
      </Button>
    </div>
  )
}
