import { nonNegativeNumber } from './data.js'

const NUMBER_FIELDS = [
  ['contractValue', 'Contract value', 'award-contract-value'],
  ['completionPeriod', 'Completion period', 'award-completion-period'],
  ['extensionDays', 'Extension days', 'award-extension-days'],
  ['performanceSecurityAmount', 'Performance security amount', 'award-performance-security-amount'],
  ['retentionPercentage', 'Retention percentage', 'award-retention-percentage'],
  ['retentionAmount', 'Retention amount', 'award-retention-amount'],
  ['mobilizationAdvance', 'Mobilization advance', 'award-mobilization-advance'],
]

export function getInvalidAwardField(form = {}) {
  for (const [key, label, id] of NUMBER_FIELDS) {
    const value = form[key]
    if (value === '' || value === null || value === undefined) continue
    const number = nonNegativeNumber(value)
    if (number === null) return { key, id, message: `${label} must be a valid non-negative number.` }
    if (['completionPeriod', 'extensionDays'].includes(key) && !Number.isInteger(number)) {
      return { key, id, message: `${label} must be a whole number of days.` }
    }
    if (key === 'retentionPercentage' && number > 100) {
      return { key, id, message: 'Retention percentage cannot exceed 100.' }
    }
  }
  return null
}
