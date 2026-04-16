import { Badge } from '@/components/ui/badge'

const STATUS_VARIANT_MAP = {
  // PO statuses
  Pending: 'pending',
  Submitted: 'submitted',
  Returned: 'returned',
  Encashed: 'encashed',
  Forfeited: 'forfeited',
  // Bid results
  'N/A': 'secondary',
  Awaiting: 'awaiting',
  Won: 'won',
  Lost: 'lost',
  Cancelled: 'cancelled',
  // Tender statuses
  Bidding: 'bidding',
  Awarded: 'awarded',
  // Bill statuses
  Paid: 'returned',
  'Under Review': 'awaiting',
  Rejected: 'lost',
}

export default function StatusBadge({ status, className }) {
  if (!status) return null
  const variant = STATUS_VARIANT_MAP[status] ?? 'outline'
  return <Badge variant={variant} className={className}>{status}</Badge>
}
