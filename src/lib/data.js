export function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// Remove undefined values before Firestore writes without converting SDK
// values (Timestamp, GeoPoint, DocumentReference, FieldValue) into plain maps.
export function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (!isPlainObject(value)) return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefined(entry)])
  )
}

export function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function documentData(snapshot) {
  return { ...snapshot.data(), id: snapshot.id }
}

export function safeHttpUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(String(value), typeof window === 'undefined' ? 'https://local.invalid' : window.location.origin)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return url.href
  } catch {
    return ''
  }
}

export function serializeBackupValue(value) {
  if (value === null || value === undefined) return value ?? null
  if (typeof value?.toDate === 'function' && Number.isFinite(value?.seconds)) {
    return { __type: 'firestore-timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds || 0 }
  }
  if (Array.isArray(value)) return value.map(serializeBackupValue)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeBackupValue(entry)]))
  }
  return value
}
