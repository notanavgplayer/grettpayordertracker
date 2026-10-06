import { createClient } from '@supabase/supabase-js'
import { auth } from './firebase'

const SUPABASE_BUCKET = 'tender-documents'
const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const SUPABASE_PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
const supabase = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

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
  if (!file || !Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_UPLOAD_SIZE) throw new Error('File size must be between 1 byte and 25 MB.')
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) throw new Error('This file type is not supported.')

  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in is required.')
  const response = await fetch('/.netlify/functions/tender-document-upload', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tenderId, documentId, fileName: file.name, contentType: file.type, size: file.size }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'Could not authorize document upload. Please retry.')
  const { objectPath: path, token: uploadToken, bucket } = result
  if (!path || !uploadToken || bucket !== SUPABASE_BUCKET) throw new Error('Document upload authorization was incomplete.')
  onProgress?.(10)
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).uploadToSignedUrl(path, uploadToken, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw new Error('Document upload failed. Please retry; your form values are unchanged.')
  onProgress?.(100)
  // The record is not saved yet, so the record-bound download route cannot sign it here.
  return { path, objectPath: path, url: '', bucket: SUPABASE_BUCKET, urlExpiresAt: null }
}
