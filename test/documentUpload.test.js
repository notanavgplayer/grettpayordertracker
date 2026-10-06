import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentUploadHandler } from '../netlify/functions/_shared/document-upload.mjs'
import { createDocumentDownloadHandler } from '../netlify/functions/_shared/document-download.mjs'
import { createPrivateStorageClient } from '../netlify/functions/_shared/private-storage.mjs'

const env = {
  FIREBASE_SERVICE_ACCOUNT_JSON: 'configured',
  SUPABASE_URL: 'https://storage.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only',
}
const input = { tenderId: 'tender-1', documentId: 'doc-1', fileName: 'work order.webp', contentType: 'image/webp', size: 4 }
const uuid = '11111111-2222-4333-8444-555555555555'
const post = (body = input, bearer = 'valid') => new Request('https://app.example.test/.netlify/functions/tender-document-upload', {
  method: 'POST', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
})

function setup({ role = 'admin', exists = true, signError = null } = {}) {
  const calls = { record: 0, sign: 0, path: '' }
  const handler = createDocumentUploadHandler({
    env, newId: () => uuid,
    requireAdmin: async (request) => {
      if (request.headers.get('authorization') !== 'Bearer valid') throw Object.assign(new Error('invalid'), { status: 401 })
      if (role !== 'admin') throw Object.assign(new Error('forbidden'), { status: 403 })
    },
    adminDb: { doc: (path) => {
      calls.record += 1
      assert.equal(path, 'tenders/tender-1')
      return { get: async () => ({ exists, data: () => ({ documents: [] }) }) }
    } },
    createStorageClient: () => ({ storage: { from: (bucket) => {
      assert.equal(bucket, 'tender-documents')
      return { createSignedUploadUrl: async (path) => {
        calls.sign += 1
        calls.path = path
        return signError ? { error: { status: signError } } : { data: { token: 'private-upload-token' }, error: null }
      } }
    } } }),
  })
  return { handler, calls }
}

test('invalid token and non-admin role cannot access project or Storage', async () => {
  for (const [role, bearer, status] of [['admin', 'invalid', 401], ['viewer', 'valid', 403]]) {
    const { handler, calls } = setup({ role })
    const response = await handler(post(input, bearer))
    assert.equal(response.status, status)
    assert.equal(calls.record, 0)
    assert.equal(calls.sign, 0)
  }
})

test('invalid files and arbitrary bucket/path are rejected before Storage access', async () => {
  const invalid = [
    { ...input, size: 0 }, { ...input, size: 25 * 1024 * 1024 + 1 },
    { ...input, contentType: 'text/html' }, { ...input, fileName: '../bad.pdf' },
    { ...input, bucket: 'public' }, { ...input, objectPath: 'existing/file.pdf' },
  ]
  for (const payload of invalid) {
    const { handler, calls } = setup()
    const response = await handler(post(payload))
    assert.equal(response.status, 400)
    assert.equal(calls.sign, 0)
  }
})

test('missing project and rejected Storage credentials have distinct safe errors', async () => {
  const absent = setup({ exists: false })
  assert.equal((await absent.handler(post())).status, 404)
  assert.equal(absent.calls.sign, 0)
  const rejected = setup({ signError: 403 })
  const response = await rejected.handler(post())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'storage-credentials-rejected')
})

test('signing uses a unique server path and never requests overwrite', async () => {
  const calls = []
  const adapter = createPrivateStorageClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, async (url, options) => {
    calls.push({ url, options })
    return new Response(JSON.stringify({ url: '/object/upload/sign/tender-documents/tender-1/doc-1/11111111-2222-4333-8444-555555555555-work_order.webp?token=private-upload-token' }))
  })
  const { handler } = setup()
  const response = await handler(post())
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.objectPath, `tender-1/doc-1/${uuid}-work_order.webp`)
  assert.equal(result.bucket, 'tender-documents')
  assert.equal(result.token, 'private-upload-token')
  const storageResult = await adapter.storage.from(result.bucket).createSignedUploadUrl(result.objectPath)
  assert.equal(storageResult.error, null)
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(calls[0].options.headers['x-upsert'], undefined)
  assert.equal(calls[0].options.body, '{}')
})

test('isolated upload, metadata save, preview and download work; failed save keeps the draft', async () => {
  const objects = new Map()
  const record = { documents: [] }
  const storageFetch = async (url, options) => {
    const parsed = new URL(url)
    if (parsed.pathname.includes('/object/upload/sign/')) {
      return new Response(JSON.stringify({ url: parsed.pathname.replace('/storage/v1', '') + '?token=upload-only' }))
    }
    if (parsed.pathname.includes('/object/info/')) {
      const path = decodeURIComponent(parsed.pathname.split('/object/info/tender-documents/')[1])
      return new Response(objects.has(path) ? '{}' : '', { status: objects.has(path) ? 200 : 404 })
    }
    if (parsed.pathname.includes('/object/sign/')) {
      return new Response(JSON.stringify({ signedURL: parsed.pathname.replace('/storage/v1', '') + '?token=read-only' }))
    }
    return new Response('', { status: 404 })
  }
  const storage = (url, key) => createPrivateStorageClient(url, key, storageFetch)
  const db = { doc: () => ({ get: async () => ({ exists: true, data: () => record }) }) }
  const admin = async () => {}
  const authorize = createDocumentUploadHandler({ requireAdmin: admin, adminDb: db, createStorageClient: storage, env, newId: () => uuid })
  const signed = await (await authorize(post())).json()
  assert.equal(signed.objectPath, `tender-1/doc-1/${uuid}-work_order.webp`)
  // A signed upload is insert-only; repeating it cannot replace the object.
  const upload = (path, body) => objects.has(path) ? false : (objects.set(path, body), true)
  assert.equal(upload(signed.objectPath, 'test-file'), true)
  assert.equal(upload(signed.objectPath, 'overwrite'), false)
  assert.equal(objects.get(signed.objectPath), 'test-file')
  const draft = { id: input.documentId, storageBucket: signed.bucket, storagePath: signed.objectPath }
  const save = async (fail) => { if (fail) throw new Error('offline'); record.documents.push(draft) }
  await assert.rejects(save(true), /offline/)
  assert.equal(record.documents.length, 0)
  assert.equal(draft.storagePath, signed.objectPath)
  await save(false)
  const download = createDocumentDownloadHandler({ requireAdmin: admin, adminDb: db, createStorageClient: storage, env })
  const response = await download(new Request('https://app.example.test/.netlify/functions/tender-document-download', {
    method: 'POST', body: JSON.stringify({ tenderId: input.tenderId, documentId: input.documentId }),
  }))
  assert.equal(response.status, 200)
  const links = await response.json()
  assert.equal(new URL(links.url).pathname.endsWith(signed.objectPath), true)
  assert.equal(new URL(links.downloadUrl).searchParams.has('download'), true)
})
