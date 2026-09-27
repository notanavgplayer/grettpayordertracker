import { requireAdmin } from './_shared/firebase-admin.mjs'
import { errorResponse, json, requireMethod } from './_shared/http.mjs'
import { processTenderReminders } from './_shared/reminders.mjs'

export default async (request) => {
  try {
    requireMethod(request, ['POST'])
    await requireAdmin(request)
    return json(await processTenderReminders())
  } catch (error) { return errorResponse(error) }
}
