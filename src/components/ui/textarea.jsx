import * as React from 'react'
import { cn } from '@/lib/utils'

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-[80px] w-full min-w-0 max-w-full rounded-lg border border-input bg-popover px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Textarea }
