import { json } from './http.mjs'

const BUCKET = 'tender-documents'
const EXPIRES_IN = 900
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,200}$/.test(value) && value !== '.' && value !== '..'
const failure = (status, code, message) => json({ code, error: message }, status)

function findAsset(tender, { tenderId, documentId, assetType, siteVisitId }) {
  if (assetType === 'site-visit-photo') {
    const visit = (tender.siteVisits || []).find((item, index) => (item.id || `${tenderId}-visit-${index}`) === siteVisitId)
    return (visit?.photos || []).find((item, index) => (item.id || `${siteVisitId}-photo-${index}`) === documentId)
  }
  return (tender.documents || []).find((item, index) => (item.id || `${tenderId}-${index}`) === documentId)
}

function storageIsMissing(error) {
  return Number(error?.status) === 404 || String(error?.statusCode || error?.code || '') === '404'
    || error?.code === 'NoSuchKey' || error?.code === 'ObjectNotFound'
}
const storageRejectsCredentials = (error) => [401, 403].includes(Number(error?.status || error?.statusCode))
const storageFailure = (error, stage) => {
  if (storageIsMissing(error)) return failure(404, 'object-not-found', 'Stored file was not found.')
  if (storageRejectsCredentials(error)) return failure(503, 'storage-credentials-rejected', 'Document storage credentials were rejected.')
  return failure(502, `storage-${stage}-failed`, 'Document storage is temporarily unavailable.')
}

export function createDocumentDownloadHandler({ requireAdmin, adminDb, createStorageClient, env }) {
  return async (request) => {
    if (request.method !== 'POST') return failure(405, 'method-not-allowed', 'Method not allowed.')
    if (!env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return failure(503, 'not-configured', 'Document download is not configured.')
    }

    try {
      await requireAdmin(request)
    } catch (error) {
      if (error?.status === 403) return failure(403, 'permission-denied', 'Administrator access is required.')
      return failure(401, 'unauthenticated', 'Sign in is required.')
    }

    let input
    try { input = await request.json() } catch { return failure(400, 'invalid-argument', 'Invalid request.') }
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !['tenderId', 'documentId', 'assetType', 'siteVisitId'].includes(key))
      || !validId(input.tenderId) || !validId(input.documentId)
      || (input.assetType !== undefined && input.assetType !== 'document' && input.assetType !== 'site-visit-photo')
      || (input.assetType === 'site-visit-photo' ? !validId(input.siteVisitId) : input.siteVisitId !== undefined)) {
      return failure(400, 'invalid-argument', 'A valid record identifier is required.')
    }

    let snapshot
    try { snapshot = await adminDb.doc(`tenders/${input.tenderId}`).get() } catch {
      return failure(503, 'unavailable', 'Document records are temporarily unavailable.')
    }
    if (!snapshot.exists) return failure(404, 'not-found', 'Document record was not found.')
    const asset = findAsset(snapshot.data() || {}, input)
    if (!asset || !asset.storagePath) return failure(404, 'not-found', 'Stored document record was not found.')
    if (asset.storageBucket && asset.storageBucket !== BUCKET) {
      return failure(409, 'invalid-record', 'Stored document bucket is unsupported.')
    }

    let storageStage = 'client'
    try {
      const storage = createStorageClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).storage.from(BUCKET)
      storageStage = 'info'
      const info = await storage.info(asset.storagePath)
      if (info.error) return storageFailure(info.error, 'info')
      storageStage = 'sign'
      const [preview, download] = await Promise.all([
        storage.createSignedUrl(asset.storagePath, EXPIRES_IN),
        storage.createSignedUrl(asset.storagePath, EXPIRES_IN, { download: true }),
      ])
      if (preview.error || download.error || !preview.data?.signedUrl || !download.data?.signedUrl) {
        return storageFailure(preview.error || download.error, 'sign')
      }
      storageStage = 'validate'
      const base = new URL(env.SUPABASE_URL)
      const signedUrl = new URL(preview.data.signedUrl)
      const downloadUrl = new URL(download.data.signedUrl)
      if ([signedUrl, downloadUrl].some((url) => url.origin !== base.origin || !url.pathname.startsWith(`/storage/v1/object/sign/${BUCKET}/`))) {
        return failure(502, 'invalid-signed-link', 'Document storage returned an invalid link.')
      }
      return json({ url: signedUrl.href, downloadUrl: downloadUrl.href, expiresIn: EXPIRES_IN })
    } catch (error) {
      if (storageRejectsCredentials(error)) return failure(503, 'storage-credentials-rejected', 'Document storage credentials were rejected.')
      return failure(502, `storage-${storageStage}-exception`, 'Document storage is temporarily unavailable.')
    }
  }
}
