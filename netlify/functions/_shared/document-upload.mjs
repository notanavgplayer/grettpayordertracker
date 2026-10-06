import { randomUUID } from 'node:crypto'
import { json } from './http.mjs'

const BUCKET = 'tender-documents'
const MAX_UPLOAD_SIZE = 25 * 1024 * 1024
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,200}$/.test(value) && value !== '.' && value !== '..'
const failure = (status, code, error) => json({ code, error }, status)

function safeFileName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255 || /[\\/]/.test(value)) return null
  const name = value.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^\.+/, '').slice(0, 180)
  return name && name !== '.' && name !== '..' ? name : null
}

export function createDocumentUploadHandler({ requireAdmin, adminDb, createStorageClient, env, newId = randomUUID }) {
  return async (request) => {
    if (request.method !== 'POST') return failure(405, 'method-not-allowed', 'Method not allowed.')
    if (!env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return failure(503, 'not-configured', 'Document upload is not configured.')
    }
    try {
      await requireAdmin(request)
    } catch (error) {
      return error?.status === 403
        ? failure(403, 'permission-denied', 'Administrator access is required.')
        : failure(401, 'unauthenticated', 'Sign in is required.')
    }

    let input
    try { input = await request.json() } catch { return failure(400, 'invalid-argument', 'Invalid request.') }
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !['tenderId', 'documentId', 'fileName', 'contentType', 'size'].includes(key))
      || !validId(input.tenderId) || !validId(input.documentId) || !safeFileName(input.fileName)
      || !ALLOWED_CONTENT_TYPES.has(input.contentType)
      || !Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_UPLOAD_SIZE) {
      return failure(400, 'invalid-argument', 'A valid project, document and supported file (up to 25 MB) are required.')
    }

    let snapshot
    try { snapshot = await adminDb.doc(`tenders/${input.tenderId}`).get() } catch {
      return failure(503, 'unavailable', 'Project records are temporarily unavailable.')
    }
    if (!snapshot.exists) return failure(404, 'not-found', 'Project record was not found.')

    // A new document has no record yet. For an existing ID, this project must
    // already own the record; a fresh UUID keeps replacements non-destructive.
    const documents = snapshot.data()?.documents || []
    if (!Array.isArray(documents)) return failure(409, 'invalid-record', 'Project documents are unavailable.')
    const suffix = newId()
    if (!/^[0-9a-f-]{36}$/i.test(suffix)) return failure(503, 'unavailable', 'Upload authorization is temporarily unavailable.')
    const objectPath = `${input.tenderId}/${input.documentId}/${suffix}-${safeFileName(input.fileName)}`

    try {
      const storage = createStorageClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).storage.from(BUCKET)
      const signed = await storage.createSignedUploadUrl(objectPath)
      if (signed.error) {
        if ([401, 403].includes(Number(signed.error.status))) return failure(503, 'storage-credentials-rejected', 'Document storage credentials were rejected.')
        return failure(502, 'storage-sign-failed', 'Document storage is temporarily unavailable.')
      }
      if (!signed.data?.token) return failure(502, 'storage-sign-failed', 'Document storage is temporarily unavailable.')
      return json({ objectPath, token: signed.data.token, bucket: BUCKET })
    } catch {
      return failure(502, 'storage-sign-failed', 'Document storage is temporarily unavailable.')
    }
  }
}
