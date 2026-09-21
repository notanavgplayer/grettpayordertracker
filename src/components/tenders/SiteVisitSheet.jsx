import { Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

export default function SiteVisitSheet({
  open,
  onOpenChange,
  editing,
  form,
  setField,
  statuses,
  isAdmin,
  uploading,
  uploadProgress,
  uploadError,
  onUpload,
  photos,
  renderPhoto,
  onSave,
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full min-w-0 flex-col gap-0 overflow-x-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
          <SheetTitle>{editing ? 'Edit Site Visit' : 'New Site Visit'}</SheetTitle>
          <SheetDescription>
            {editing ? 'Update site visit details.' : 'Record daily progress, labour, materials, and issues.'}
          </SheetDescription>
        </SheetHeader>
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
          <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[1fr_0.95fr]">
            <div className="min-w-0 space-y-4">
              <div className="border-b border-border pb-2"><p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Visit Details</p></div>
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="td-sv-date">Visit Date <span className="text-destructive">*</span></Label>
                  <Input id="td-sv-date" required type="date" value={form.visitDate} onChange={setField('visitDate')} className="mobile-date-input" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="td-sv-time">Visit Time</Label>
                  <Input id="td-sv-time" type="time" value={form.visitTime} onChange={setField('visitTime')} />
                </div>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="td-sv-loc">Location / Site Area</Label>
                <Input id="td-sv-loc" value={form.location} onChange={setField('location')} placeholder="e.g. Block A, second floor" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="td-sv-work">Work Completed</Label>
                <Textarea id="td-sv-work" value={form.workCompleted} onChange={setField('workCompleted')} rows={3} placeholder="What was finished today?" />
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="td-sv-labour">Labour Used</Label>
                  <Textarea id="td-sv-labour" value={form.labourUsed} onChange={setField('labourUsed')} rows={2} placeholder="e.g. 4 masons, 6 helpers" />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor="td-sv-material">Material Used</Label>
                  <Textarea id="td-sv-material" value={form.materialUsed} onChange={setField('materialUsed')} rows={2} placeholder="e.g. 20 bags cement, 1 ton sand" />
                </div>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="td-sv-issues">Issues / Delays</Label>
                <Textarea id="td-sv-issues" value={form.issues} onChange={setField('issues')} rows={2} placeholder="Any blockers or delays?" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="td-sv-next">Next-Day Plan</Label>
                <Textarea id="td-sv-next" value={form.nextDayPlan} onChange={setField('nextDayPlan')} rows={2} placeholder="Plan for the next day" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="td-sv-status">Status</Label>
                <Select value={form.status} onValueChange={setField('status')}>
                  <SelectTrigger id="td-sv-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="td-sv-notes">Notes</Label>
                <Textarea id="td-sv-notes" value={form.notes} onChange={setField('notes')} rows={2} />
              </div>
            </div>

            <div className="min-w-0 space-y-4 lg:border-l lg:border-border lg:pl-5">
              <div className="border-b border-border pb-2"><p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Photos ({photos.length})</p></div>
              <div className="min-w-0 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
                <Input
                  id="td-sv-photos"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  disabled={!isAdmin || uploading}
                  onChange={async (event) => {
                    const files = Array.from(event.target.files || [])
                    event.target.value = ''
                    await onUpload(files)
                  }}
                />
                <Label
                  htmlFor="td-sv-photos"
                  role="button"
                  tabIndex={uploading || !isAdmin ? -1 : 0}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !uploading && isAdmin) {
                      event.preventDefault()
                      document.getElementById('td-sv-photos')?.click()
                    }
                  }}
                  className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg py-6 text-sm transition hover:bg-background/60 ${uploading || !isAdmin ? 'pointer-events-none opacity-60' : ''}`}
                >
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin text-emerald-600" /> : <Upload className="h-6 w-6 text-emerald-600" />}
                  <span className="font-semibold text-foreground">{uploading ? `Uploading ${uploadProgress}%` : 'Upload Photos'}</span>
                  <span className="text-xs text-muted-foreground">{isAdmin ? 'Click to select multiple JPG, PNG, or WEBP images' : 'Only admins can upload photos'}</span>
                </Label>
              </div>
              {uploadError && <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-700 dark:text-rose-300">{uploadError}</div>}
              {photos.length > 0 ? (
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">{photos.map(renderPhoto)}</div>
              ) : (
                <div className="rounded-xl border border-border/80 bg-background p-4 text-sm text-muted-foreground">No photos attached yet. You can save the visit without photos.</div>
              )}
            </div>
          </div>
        </div>
        <SheetFooter className="gap-2 border-t border-border bg-background px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:justify-end sm:px-6 sm:pb-4">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="w-full sm:w-auto" onClick={onSave} disabled={uploading}>{editing ? 'Save Changes' : 'Add Site Visit'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
