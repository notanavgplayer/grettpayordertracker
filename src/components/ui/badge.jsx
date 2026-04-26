/* eslint-disable react-refresh/only-export-components */
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
        success: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        warning: 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300',
        info: 'border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300',
        neutral: 'border-transparent bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
        pending: 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300',
        submitted: 'border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300',
        returned: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        encashed: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        forfeited: 'border-transparent bg-violet-500/10 text-violet-700 dark:text-violet-300',
        won: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        lost: 'border-transparent bg-rose-500/10 text-rose-700 dark:text-rose-300',
        awaiting: 'border-transparent bg-blue-500/10 text-blue-700 dark:text-blue-300',
        cancelled: 'border-transparent bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
        bidding: 'border-transparent bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
        awarded: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
