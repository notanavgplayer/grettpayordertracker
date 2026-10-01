import { auth } from './firebase'

// Calendar/email integration ships dormant; a separate release must explicitly activate it.
export const tenderIntegrationsEnabled = false

async function api(path, options = {}) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in is required.')
  const response = await fetch(`/.netlify/functions/${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(options.headers || {}) },
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Integration request failed.')
  return result
}

export const getTenderIntegrationSettings = () => api('tender-integrations')
export const updateTenderIntegrationSettings = (patch) => api('tender-integrations', { method: 'PATCH', body: JSON.stringify(patch) })
export const beginGoogleCalendarConnection = () => api('google-calendar-start', { method: 'POST' })
export const disconnectGoogleCalendar = () => api('google-calendar-disconnect', { method: 'POST' })
export const syncGoogleCalendar = (tenderId) => api('google-calendar-sync', { method: 'POST', body: JSON.stringify(tenderId ? { tenderId } : {}) })
export const testTenderEmailReminders = () => api('test-tender-email', { method: 'POST' })

export function queueTenderIntegrationSync(tenderId) {
  if (!tenderIntegrationsEnabled || !tenderId || !auth.currentUser) return
  syncGoogleCalendar(tenderId).catch((error) => console.warn('Calendar sync queued for reconciliation:', error.message))
}
