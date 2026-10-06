import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'
import { createDocumentDownloadHandler } from '../netlify/functions/_shared/document-download.mjs'
import { createPrivateStorageClient } from '../netlify/functions/_shared/private-storage.mjs'

test('Firebase Admin auth loads in the Netlify Node runtime', () => {
  const require = createRequire(import.meta.url)
  assert.equal(typeof require('firebase-admin/auth').getAuth, 'function')
})

test('Supabase storage client initializes in the Netlify Node runtime', () => {
  const storage = createClient('https://storage.example.test', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from('tender-documents')
  assert.equal(typeof storage.info, 'function')
  assert.equal(typeof storage.createSignedUrl, 'function')
})

test('server Storage adapter checks the object and signs preview/download for 15 minutes', async () => {
  const calls = []
  const adapter = createPrivateStorageClient('https://storage.example.test', ' server-key ', async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers, body: options.body })
    if (options.method === 'GET') return new Response('{}', { status: 200 })
    return new Response(JSON.stringify({ signedURL: '/object/sign/tender-documents/tender-1/work%20order.webp?token=test-only' }), { status: 200 })
  }).storage.from('tender-documents')
  assert.equal((await adapter.info('tender-1/work order.webp')).error, null)
  const preview = await adapter.createSignedUrl('tender-1/work order.webp', 900)
  const download = await adapter.createSignedUrl('tender-1/work order.webp', 900, { download: true })
  assert.equal(preview.error, null)
  assert.equal(download.error, null)
  assert.equal(new URL(preview.data.signedUrl).searchParams.has('download'), false)
  assert.equal(new URL(download.data.signedUrl).searchParams.has('download'), true)
  assert.equal(calls.length, 3)
  assert.equal(calls[0].url.endsWith('/object/info/tender-documents/tender-1/work%20order.webp'), true)
  assert.equal(calls[1].url.endsWith('/object/sign/tender-documents/tender-1/work%20order.webp'), true)
  assert.deepEqual(JSON.parse(calls[1].body), { expiresIn: 900 })
  assert.equal(calls.every((call) => call.headers.apikey === 'server-key' && call.headers.authorization === 'Bearer server-key'), true)
})

test('server Storage adapter returns only safe status for absent objects and rejected keys', async () => {
  for (const status of [404, 403]) {
    const adapter = createPrivateStorageClient('https://storage.example.test', 'server-key', async () => new Response('private upstream detail', { status })).storage.from('tender-documents')
    const result = await adapter.info('tender-1/doc-1/work-order.webp')
    assert.deepEqual(result.error, { status })
    assert.equal(JSON.stringify(result).includes('private upstream detail'), false)
  }
})

test('server Storage adapter rejects malformed signed-link responses', async () => {
  const adapter = createPrivateStorageClient('https://storage.example.test', 'server-key', async () =>
    new Response(JSON.stringify({ signedURL: 'https://other.example.test/object/sign/tender-documents/file?token=bad' }), { status: 200 })).storage.from('tender-documents')
  const result = await adapter.createSignedUrl('file', 900)
  assert.deepEqual(result.error, { status: 502 })
})

const env = {
  FIREBASE_SERVICE_ACCOUNT_JSON: 'configured',
  SUPABASE_URL: 'https://storage.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'configured',
}
const asset = { id: 'doc-1', storageBucket: 'tender-documents', storagePath: 'tender-1/doc-1/work-order.webp' }

function setup({ role = 'admin', exists = true, documents = [asset], objectError = null, infoThrows = false, config = env } = {}) {
  const calls = { record: 0, info: 0, sign: 0, path: null, expiresIn: null, download: null }
  const handler = createDocumentDownloadHandler({
    env: config,
    requireAdmin: async (request) => {
      if (request.headers.get('authorization') !== 'Bearer valid') throw Object.assign(new Error('Invalid token'), { status: 401 })
      if (role !== 'admin') throw Object.assign(new Error('Forbidden'), { status: 403 })
    },
    adminDb: { doc: (path) => {
      calls.record += 1
      assert.equal(path, 'tenders/tender-1')
      return { get: async () => ({ exists, data: () => ({ documents }) }) }
    } },
    createStorageClient: () => ({ storage: { from: (bucket) => {
      assert.equal(bucket, 'tender-documents')
      return {
        info: async (path) => { calls.info += 1; calls.path = path; if (infoThrows) throw new Error('private upstream detail'); return { error: objectError } },
        createSignedUrl: async (path, expiresIn, options) => {
          calls.sign += 1
          calls.path = path
          calls.expiresIn = expiresIn
          if (options?.download) calls.download = true
          return { data: { signedUrl: `https://storage.example.test/storage/v1/object/sign/tender-documents/${path}?token=private${options?.download ? '&download=' : ''}` }, error: null }
        },
      }
    } } }),
  })
  const request = (payload = { tenderId: 'tender-1', documentId: 'doc-1' }, token = 'valid') => new Request('https://app.example.test/.netlify/functions/tender-document-download', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })
  return { handler, request, calls }
}

test('invalid token is rejected before record or storage access', async () => {
  const { handler, request, calls } = setup()
  const response = await handler(request(undefined, 'invalid'))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).code, 'unauthenticated')
  assert.equal(calls.record, 0)
  assert.equal(calls.sign, 0)
})

test('current non-admin role is rejected before record access', async () => {
  const { handler, request, calls } = setup({ role: 'viewer' })
  const response = await handler(request())
  assert.equal(response.status, 403)
  assert.equal((await response.json()).code, 'permission-denied')
  assert.equal(calls.record, 0)
})

test('client-supplied storage paths and unknown fields are rejected', async () => {
  const { handler, request, calls } = setup()
  const response = await handler(request({ tenderId: 'tender-1', documentId: 'doc-1', objectPath: 'other/private.webp' }))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).code, 'invalid-argument')
  assert.equal(calls.record, 0)
})

test('missing record and missing object are distinct', async () => {
  const missingRecord = setup({ exists: false })
  const recordResponse = await missingRecord.handler(missingRecord.request())
  assert.equal(recordResponse.status, 404)
  assert.equal((await recordResponse.json()).code, 'not-found')
  assert.equal(missingRecord.calls.info, 0)

  const missingObject = setup({ objectError: { status: 404, code: 'ObjectNotFound' } })
  const objectResponse = await missingObject.handler(missingObject.request())
  assert.equal(objectResponse.status, 404)
  assert.equal((await objectResponse.json()).code, 'object-not-found')
  assert.equal(missingObject.calls.sign, 0)
})

test('rejected storage credentials and storage API failures have safe distinct codes', async () => {
  const denied = setup({ objectError: { status: 403 } })
  const deniedResponse = await denied.handler(denied.request())
  assert.equal(deniedResponse.status, 503)
  assert.equal((await deniedResponse.json()).code, 'storage-credentials-rejected')
  assert.equal(denied.calls.sign, 0)

  const failed = setup({ objectError: { status: 500 } })
  const failedResponse = await failed.handler(failed.request())
  assert.equal(failedResponse.status, 502)
  assert.equal((await failedResponse.json()).code, 'storage-info-failed')
})

test('unexpected storage exceptions identify the stage without exposing error details', async () => {
  const thrown = setup({ infoThrows: true })
  const response = await thrown.handler(thrown.request())
  assert.equal(response.status, 502)
  const body = await response.json()
  assert.equal(body.code, 'storage-info-exception')
  assert.equal(JSON.stringify(body).includes('private upstream detail'), false)
})

test('signs only the path from the authorized Firestore record', async () => {
  const { handler, request, calls } = setup()
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const result = await response.json()
  assert.equal(result.expiresIn, 900)
  assert.equal(calls.path, asset.storagePath)
  assert.equal(calls.expiresIn, 900)
  assert.equal(calls.info, 1)
  assert.equal(calls.sign, 2)
  assert.equal(calls.download, true)
  assert.notEqual(result.url, result.downloadUrl)
})

test('missing server secrets return a configuration error without accessing records', async () => {
  const { handler, request, calls } = setup({ config: { FIREBASE_SERVICE_ACCOUNT_JSON: 'configured' } })
  const response = await handler(request())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'not-configured')
  assert.equal(calls.record, 0)
})
