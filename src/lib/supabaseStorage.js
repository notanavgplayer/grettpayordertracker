import { httpsCallable } from 'firebase/functions'
import { createClient } from '@supabase/supabase-js'
import { auth, functions } from './firebase'

const SUPABASE_BUCKET = 'tender-documents'
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const SUPABASE_PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
const supabase = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024

export function hasSupabaseStorageConfig() {
  return Boolean(supabase)
}

export function getSupabaseStorageBucket() {
  return SUPABASE_BUCKET
}

export async function getTenderDocumentLinks({ tenderId, documentId, assetType, siteVisitId }) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw Object.assign(new Error('Sign in is required.'), { code: 'unauthenticated' })
  const response = await fetch('/.netlify/functions/tender-document-download', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tenderId, documentId, ...(assetType ? { assetType } : {}), ...(siteVisitId ? { siteVisitId } : {}) }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(result.error || 'Secure link request failed.'), { code: result.code || 'unavailable' })
  if (!result.url || !result.downloadUrl) throw Object.assign(new Error('Secure link was not returned.'), { code: 'unavailable' })
  return { url: result.url, downloadUrl: result.downloadUrl }
}

export async function uploadTenderDocument({ tenderId, documentId, file, onProgress }) {
  if (!supabase) throw new Error('Document storage is not configured.')
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error('File is too large. Maximum upload size is 25 MB.')
  }

  const createUpload = httpsCallable(functions, 'createTenderDocumentUpload')
  const authorization = await createUpload({
    tenderId,
    documentId,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
  })
  const { objectPath: path, token } = authorization.data
  if (!path || !token) throw new Error('Document upload authorization was incomplete.')
  onProgress?.(10)
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).uploadToSignedUrl(path, token, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
  })
  if (error) throw new Error(`Document upload failed: ${error.message}`)
  onProgress?.(100)
  // The record is not saved yet, so the record-bound download route cannot sign it here.
  return { path, objectPath: path, url: '', bucket: SUPABASE_BUCKET, urlExpiresAt: null }
}
