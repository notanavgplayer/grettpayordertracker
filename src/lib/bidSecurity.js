import { nullableNumber } from './data.js'

export function calculatedBidSecurity(tender, config) {
  if (!config) return null
  if (config.basis === 'fixed') return nullableNumber(config.fixedAmount)
  const base = config.basis === 'estimated' ? nullableNumber(tender?.estimatedCost) : config.basis === 'quoted' ? nullableNumber(tender?.quotedAmount) : null
  const rate = nullableNumber(config.rate)
  return base === null || rate === null || rate < 0 ? null : Math.round((base * rate / 100 + Number.EPSILON) * 100) / 100
}
