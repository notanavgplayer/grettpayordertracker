import { cn } from '@/lib/utils'

export default function PageHeader({ title, description, actions, className }) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  )
}
