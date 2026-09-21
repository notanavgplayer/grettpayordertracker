import { cn } from '@/lib/utils'

export default function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center sm:px-6', className)}>
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm leading-5 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4 flex w-full justify-center sm:w-auto">{action}</div>}
    </div>
  )
}
