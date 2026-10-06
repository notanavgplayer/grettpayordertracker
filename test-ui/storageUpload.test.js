import { beforeEach, describe, expect, it, vi } from 'vitest'

const { uploadToSignedUrl, getIdToken } = vi.hoisted(() => ({
  uploadToSignedUrl: vi.fn(), getIdToken: vi.fn(),
}))
vi.mock('@/lib/firebase', () => ({ auth: { currentUser: { getIdToken } } }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }) }))

describe('private document upload client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://storage.example.test')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-only')
    getIdToken.mockReset().mockResolvedValue('firebase-id-token')
    uploadToSignedUrl.mockReset().mockResolvedValue({ error: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      objectPath: 'tender-1/doc-1/unique-file.webp', bucket: 'tender-documents', token: 'upload-only',
    }), { status: 200 })))
  })

  it('authorizes first, uploads insert-only, and returns metadata only after success', async () => {
    const { uploadTenderDocument } = await import('@/lib/supabaseStorage')
    const progress = vi.fn()
    const file = new File(['test'], 'file.webp', { type: 'image/webp' })
    const result = await uploadTenderDocument({ tenderId: 'tender-1', documentId: 'doc-1', file, onProgress: progress })
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][0]).toBe('/.netlify/functions/tender-document-upload')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ tenderId: 'tender-1', documentId: 'doc-1', fileName: 'file.webp', contentType: 'image/webp', size: 4 })
    expect(uploadToSignedUrl).toHaveBeenCalledWith(result.path, 'upload-only', file, {
      contentType: 'image/webp', cacheControl: '3600', upsert: false,
    })
    expect(progress).toHaveBeenLastCalledWith(100)
    expect(result).toMatchObject({ path: 'tender-1/doc-1/unique-file.webp', bucket: 'tender-documents', url: '' })
  })

  it('rejects invalid files before signing and does not return metadata when upload fails', async () => {
    const { uploadTenderDocument } = await import('@/lib/supabaseStorage')
    await expect(uploadTenderDocument({ tenderId: 'tender-1', documentId: 'doc-1', file: new File(['x'], 'bad.html', { type: 'text/html' }) })).rejects.toThrow('not supported')
    expect(fetch).not.toHaveBeenCalled()
    uploadToSignedUrl.mockResolvedValueOnce({ error: { message: 'private upstream detail' } })
    await expect(uploadTenderDocument({ tenderId: 'tender-1', documentId: 'doc-1', file: new File(['x'], 'ok.webp', { type: 'image/webp' }) })).rejects.toThrow('Please retry')
  })
})
