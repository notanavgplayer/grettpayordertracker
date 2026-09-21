import { useId } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

export default function AwardWorkOrderSheet({ open, onOpenChange, form, setField, onSave, isAdmin, statuses }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full min-w-0 flex-col gap-0 overflow-x-hidden p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-border px-4 py-4 sm:px-6">
          <SheetTitle>Award / Work Order</SheetTitle>
          <SheetDescription>Update award, work order, contract period, securities, and execution details.</SheetDescription>
        </SheetHeader>
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-6">
          <div className="min-w-0 space-y-5 sm:space-y-6">
            <FormGroup title="Award Details">
              <SelectField label="Award status" value={form.awardStatus} onValueChange={setField('awardStatus')} options={statuses} disabled={!isAdmin} />
              <FormField label="Award date" type="date" value={form.awardDate} onChange={setField('awardDate')} disabled={!isAdmin} />
              <FormField label="Work order number" value={form.workOrderNumber} onChange={setField('workOrderNumber')} disabled={!isAdmin} />
              <FormField label="Work order date" type="date" value={form.workOrderDate} onChange={setField('workOrderDate')} disabled={!isAdmin} />
              <FormField id="award-contract-value" label="Contract value" type="number" min="0" step="0.01" value={form.contractValue} onChange={setField('contractValue')} disabled={!isAdmin} />
              <FormField label="Department / agency reference" value={form.departmentReference} onChange={setField('departmentReference')} disabled={!isAdmin} />
            </FormGroup>

            <FormGroup title="Contract Period">
              <FormField label="Start date" type="date" value={form.startDate} onChange={setField('startDate')} disabled={!isAdmin} />
              <FormField id="award-completion-period" label="Completion period (days)" type="number" min="0" step="1" value={form.completionPeriod} onChange={setField('completionPeriod')} disabled={!isAdmin} />
              <FormField label="Expected completion date" type="date" value={form.expectedCompletionDate} onChange={setField('expectedCompletionDate')} disabled={!isAdmin} />
              <FormField label="Actual completion date" type="date" value={form.actualCompletionDate} onChange={setField('actualCompletionDate')} disabled={!isAdmin} />
              <SelectField label="Extension granted" value={form.extensionGranted} onValueChange={setField('extensionGranted')} options={['No', 'Yes']} disabled={!isAdmin} />
              <FormField id="award-extension-days" label="Extension days" type="number" min="0" step="1" value={form.extensionDays} onChange={setField('extensionDays')} disabled={!isAdmin} />
              <TextAreaField label="Extension remarks" value={form.extensionRemarks} onChange={setField('extensionRemarks')} disabled={!isAdmin} className="sm:col-span-2" />
            </FormGroup>

            <FormGroup title="Securities / Deductions">
              <FormField id="award-performance-security-amount" label="Performance security amount" type="number" min="0" step="0.01" value={form.performanceSecurityAmount} onChange={setField('performanceSecurityAmount')} disabled={!isAdmin} />
              <FormField label="Performance security type" value={form.performanceSecurityType} onChange={setField('performanceSecurityType')} disabled={!isAdmin} />
              <FormField label="Performance security expiry date" type="date" value={form.performanceSecurityExpiryDate} onChange={setField('performanceSecurityExpiryDate')} disabled={!isAdmin} />
              <FormField id="award-retention-percentage" label="Retention percentage" type="number" min="0" max="100" step="0.01" value={form.retentionPercentage} onChange={setField('retentionPercentage')} disabled={!isAdmin} />
              <FormField id="award-retention-amount" label="Retention amount" type="number" min="0" step="0.01" value={form.retentionAmount} onChange={setField('retentionAmount')} disabled={!isAdmin} />
              <FormField id="award-mobilization-advance" label="Mobilization advance" type="number" min="0" step="0.01" value={form.mobilizationAdvance} onChange={setField('mobilizationAdvance')} disabled={!isAdmin} />
            </FormGroup>

            <FormGroup title="Execution Details">
              <FormField label="Site handover date" type="date" value={form.siteHandoverDate} onChange={setField('siteHandoverDate')} disabled={!isAdmin} />
              <FormField label="Engineer / department contact" value={form.engineerContact} onChange={setField('engineerContact')} disabled={!isAdmin} />
              <FormField label="Contractor representative" value={form.contractorRepresentative} onChange={setField('contractorRepresentative')} disabled={!isAdmin} />
              <FormField label="Current execution status" value={form.executionStatus} onChange={setField('executionStatus')} disabled={!isAdmin} />
              <TextAreaField label="Remarks / notes" value={form.remarks} onChange={setField('remarks')} disabled={!isAdmin} className="sm:col-span-2" />
            </FormGroup>
          </div>
        </div>
        <SheetFooter className="gap-2 border-t border-border bg-background px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-6 sm:pb-4">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={onSave} disabled={!isAdmin} className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto">
            <Save className="h-4 w-4" /> Save Award Details
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function FormGroup({ title, children }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{title}</h3>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">{children}</div>
    </section>
  )
}

function FormField({ id: providedId, label, className = '', ...props }) {
  const generatedId = useId()
  const id = providedId || generatedId
  const inputClassName = props.type === 'date' ? 'mobile-date-input' : ''
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} className={inputClassName} />
    </div>
  )
}

function TextAreaField({ label, className = '', ...props }) {
  const id = useId()
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={3} {...props} />
    </div>
  )
}

function SelectField({ label, value, onValueChange, options, disabled }) {
  const id = useId()
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || ''} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}
