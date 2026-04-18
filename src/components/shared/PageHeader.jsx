import { cn } from '@/lib/utils'

export default function PageHeader({ title, description, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl sm:text-[28px] font-semibold text-foreground tracking-tight leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
