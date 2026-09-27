export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

export async function body(request) {
  try { return await request.json() } catch { return {} }
}

export function errorResponse(error) {
  console.error(error?.message || error)
  return json({ error: error?.status && error.status < 500 ? error.message : 'The integration service is temporarily unavailable.' }, error?.status || 500)
}

export function requireMethod(request, allowed) {
  if (!allowed.includes(request.method)) throw Object.assign(new Error('Method not allowed.'), { status: 405 })
}
