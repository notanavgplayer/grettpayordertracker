const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '')
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const SUPABASE_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'tender-documents'

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

export function hasSupabaseStorageConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_BUCKET)
}

export function getSupabaseStorageBucket() {
  return SUPABASE_BUCKET
}

export function getSupabasePublicUrl(path) {
  if (!SUPABASE_URL) return ''
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_BUCKET)}/${encodePath(path)}`
}

export function uploadTenderDocument({ tenderId, documentId, file, onProgress }) {
  if (!hasSupabaseStorageConfig()) {
    return Promise.reject(new Error('Supabase Storage is not configured. Add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_SUPABASE_STORAGE_BUCKET.'))
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return Promise.reject(new Error('File is too large. Maximum upload size is 25 MB.'))
  }

  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${tenderId}/${documentId}/${Date.now()}-${safeName}`
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodePath(path)}`

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl)
    xhr.timeout = 60000
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY)
    xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('Cache-Control', '3600')
    xhr.setRequestHeader('x-upsert', 'false')

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress?.(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve({
          path,
          url: getSupabasePublicUrl(path),
          bucket: SUPABASE_BUCKET,
        })
        return
      }

      let detail = xhr.responseText || xhr.statusText
      try {
        const parsed = JSON.parse(xhr.responseText)
        detail = parsed.message || parsed.error || detail
      } catch {
        // Keep the raw response text when Supabase does not return JSON.
      }
      reject(new Error(`Supabase upload failed (${xhr.status}): ${detail}`))
    }

    xhr.onerror = () => reject(new Error('Could not reach Supabase Storage. Check the project URL, bucket policies, and network connection.'))
    xhr.ontimeout = () => reject(new Error('Supabase upload timed out. Please check your connection and try again.'))
    xhr.send(file)
  })
}
