import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        pending: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
        submitted: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        returned: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        encashed: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
        forfeited: 'border-transparent bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
        won: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        lost: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        awaiting: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        cancelled: 'border-transparent bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
        bidding: 'border-transparent bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
        awarded: 'border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
