export function tenderFeeExpenseNeedsSync(previous, next) {
  return ['tenderFee', 'name', 'nit', 'submissionDate'].some((key) => String(previous?.[key] ?? '') !== String(next?.[key] ?? ''))
}

export function tenderSaveErrorMessage(error) {
  if (error?.code === 'permission-denied') return 'Save was denied. Check your current admin access and the fields being saved; your entries are still here.'
  if (error?.code === 'not-found') return 'A linked record needed for this save is missing. Nothing was changed; retry or ask an administrator to review the link.'
  if (error?.code === 'unavailable' || error?.code === 'deadline-exceeded') return 'The connection to Firestore is unavailable. Your entries are still here; retry when connected.'
  if (error?.code === 'invalid-argument') return 'One or more entered fields could not be saved. Review the amounts and dates; your entries are still here.'
  return 'The tender could not be saved. Your entries are still here; retry or ask an administrator to check the save error.'
}
