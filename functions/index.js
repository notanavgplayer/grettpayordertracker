/**
 * Mirror the `role` field on /users/{uid} to a custom auth claim
 * (`admin: true|false`) so Firestore rules can authorize via
 * `request.auth.token.admin` without reading the user doc on every request.
 *
 * Triggers:
 *   - onDocumentCreated  → set claim if the new doc has role === 'admin'
 *   - onDocumentUpdated  → set/clear claim when role changes
 *
 * After the claim is set, the user must refresh their ID token
 * (the AuthContext fallback handles the propagation window).
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

initializeApp();

const supabaseUrl = defineSecret('SUPABASE_URL');
const supabaseServiceRoleKey = defineSecret('SUPABASE_SERVICE_ROLE_KEY');
const STORAGE_BUCKET = 'tender-documents';
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

async function assertCurrentAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const profile = await getFirestore().doc(`users/${request.auth.uid}`).get();
  if (!profile.exists || profile.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Administrator access is required.');
  }
}

function safeObjectSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 180);
}

async function supabaseStorageRequest(path, body) {
  const baseUrl = supabaseUrl.value().replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/storage/v1${path}`, {
    method: 'POST',
    headers: {
      apikey: supabaseServiceRoleKey.value(),
      Authorization: `Bearer ${supabaseServiceRoleKey.value()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
  if (!response.ok) {
    console.error('Supabase Storage request failed', response.status, await response.text());
    throw new HttpsError('internal', 'Document storage is unavailable.');
  }
  return response.json();
}

async function syncAdminClaimFromCurrentState(uid) {
  const snapshot = await getFirestore().doc(`users/${uid}`).get();
  const shouldBeAdmin = snapshot.exists && snapshot.data().role === 'admin';
  let user;
  try {
    user = await getAuth().getUser(uid);
  } catch (error) {
    // Deleting an Auth account and its profile can race. There is no claim to
    // clear after the Auth account is gone, so treat that final state as synced.
    if (!shouldBeAdmin && error?.code === 'auth/user-not-found') return;
    throw error;
  }
  const current = !!(user.customClaims && user.customClaims.admin);
  if (current === shouldBeAdmin) return;
  const nextClaims = { ...(user.customClaims || {}), admin: shouldBeAdmin };
  await getAuth().setCustomUserClaims(uid, nextClaims);
  console.log(`Set admin=${shouldBeAdmin} for uid=${uid}`);
}

exports.onUserRoleWrite = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid;
  // Always reconcile from the latest stored state. Firestore events are at
  // least once and can arrive out of order, so event.after is not authoritative.
  await syncAdminClaimFromCurrentState(uid);
});

exports.createTenderDocumentUpload = onCall(
  { secrets: [supabaseUrl, supabaseServiceRoleKey] },
  async (request) => {
    await assertCurrentAdmin(request);
    const { tenderId, documentId, fileName, contentType, size } = request.data || {};
    if (!tenderId || !documentId || !fileName) throw new HttpsError('invalid-argument', 'Document details are incomplete.');
    if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_SIZE) throw new HttpsError('invalid-argument', 'File size is invalid.');
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) throw new HttpsError('invalid-argument', 'This file type is not allowed.');

    const objectPath = `${safeObjectSegment(tenderId)}/${safeObjectSegment(documentId)}/${Date.now()}-${safeObjectSegment(fileName)}`;
    const signed = await supabaseStorageRequest(`/object/upload/sign/${STORAGE_BUCKET}/${objectPath}`, {});
    return { objectPath, token: signed.token || null };
  }
);

exports.createTenderDocumentDownload = onCall(
  { secrets: [supabaseUrl, supabaseServiceRoleKey] },
  async (request) => {
    await assertCurrentAdmin(request);
    const objectPath = String(request.data?.objectPath || '');
    if (!objectPath || objectPath.includes('..')) throw new HttpsError('invalid-argument', 'A valid document path is required.');
    const signed = await supabaseStorageRequest(`/object/sign/${STORAGE_BUCKET}/${objectPath}`, { expiresIn: 900 });
    const baseUrl = supabaseUrl.value().replace(/\/+$/, '');
    const path = signed.signedURL || signed.signedUrl || signed.url;
    return { url: path?.startsWith('http') ? path : `${baseUrl}/storage/v1${path}`, expiresIn: 900 };
  }
);
