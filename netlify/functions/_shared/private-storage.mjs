// Server-only adapter for the two private Storage operations used by document downloads.
// Paths are supplied by the authorized Firestore record, never by the HTTP caller.
export function createPrivateStorageClient(url, key, fetchImpl = fetch) {
  const base = new URL(String(url).trim())
  if (base.protocol !== 'https:') throw new Error('Supabase Storage requires HTTPS.')
  const storageRoot = new URL('/storage/v1', base).href
  const credential = String(key).trim()
  const headers = { apikey: credential, authorization: `Bearer ${credential}` }

  const objectKey = (bucket, path) => [bucket, ...String(path).replace(/^\/+/, '').split('/')]
    .map(encodeURIComponent).join('/')
  const request = async (endpoint, options = {}) => {
    const response = await fetchImpl(`${storageRoot}${endpoint}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    })
    if (!response.ok) return { data: null, error: { status: response.status } }
    return { data: response, error: null }
  }

  return {
    storage: {
      from(bucket) {
        return {
          async createSignedUploadUrl(path) {
            const result = await request(`/object/upload/sign/${objectKey(bucket, path)}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
            })
            if (result.error) return result
            const payload = await result.data.json()
            const relative = payload?.url
            const expectedPath = `/object/upload/sign/${objectKey(bucket, path)}`
            if (typeof relative !== 'string' || !relative.startsWith(`${expectedPath}?`)) {
              return { data: null, error: { status: 502 } }
            }
            const signed = new URL(`${storageRoot}${relative}`)
            if (signed.origin !== base.origin || !signed.searchParams.has('token')) {
              return { data: null, error: { status: 502 } }
            }
            return { data: { token: signed.searchParams.get('token') }, error: null }
          },
          async info(path) {
            const result = await request(`/object/info/${objectKey(bucket, path)}`, { method: 'GET' })
            return result.error ? result : { data: true, error: null }
          },
          async createSignedUrl(path, expiresIn, options = {}) {
            const result = await request(`/object/sign/${objectKey(bucket, path)}`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ expiresIn }),
            })
            if (result.error) return result
            const payload = await result.data.json()
            const relative = payload?.signedURL
            if (typeof relative !== 'string' || !relative.startsWith(`/object/sign/${bucket}/`)) {
              return { data: null, error: { status: 502 } }
            }
            const signed = new URL(`${storageRoot}${relative}`)
            if (signed.origin !== base.origin || !signed.searchParams.has('token')) {
              return { data: null, error: { status: 502 } }
            }
            if (options.download) signed.searchParams.set('download', options.download === true ? '' : String(options.download))
            return { data: { signedUrl: signed.href }, error: null }
          },
        }
      },
    },
  }
}
