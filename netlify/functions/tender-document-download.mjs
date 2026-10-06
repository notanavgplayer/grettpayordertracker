import { json } from './_shared/http.mjs'
import { createDocumentDownloadHandler } from './_shared/document-download.mjs'
import { createPrivateStorageClient } from './_shared/private-storage.mjs'

export default async (request) => {
  const env = { ...process.env, SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL }
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ code: 'not-configured', error: 'Document download is not configured.' }, 503)
  }
  let admin
  try { admin = await import('./_shared/firebase-admin.mjs') } catch {
    return json({ code: 'not-configured', error: 'Document download is not configured.' }, 503)
  }
  return createDocumentDownloadHandler({
    adminDb: admin.adminDb,
    requireAdmin: admin.requireAdmin,
    createStorageClient: createPrivateStorageClient,
    env,
  })(request)
}
