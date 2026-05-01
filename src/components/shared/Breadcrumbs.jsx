import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Breadcrumbs({ items = [], className }) {
  const crumbs = items.filter(Boolean)

  if (!crumbs.length) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('mb-4 text-sm', className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        {crumbs.map((item, index) => {
          const isLast = index === crumbs.length - 1
          const hideFirstOnMobile = index === 0 && crumbs.length > 2
          const title = typeof item.label === 'string' ? item.label : undefined

          return (
            <li
              key={`${item.href || item.label}-${index}`}
              className={cn(
                'flex min-w-0 items-center gap-1.5',
                hideFirstOnMobile && 'hidden sm:flex'
              )}
            >
              {index > 0 && (
                <ChevronRight
                  className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/60"
                  aria-hidden="true"
                />
              )}

              {item.href && !isLast ? (
                <Link
                  to={item.href}
                  className="max-w-[8rem] truncate font-medium text-muted-foreground transition-colors hover:text-emerald-700 sm:max-w-none"
                  title={title}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="max-w-[12rem] truncate font-medium text-foreground/80 sm:max-w-[24rem]"
                  title={title}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
