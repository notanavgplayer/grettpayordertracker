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

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp();

async function syncAdminClaim(uid, role) {
  const shouldBeAdmin = role === 'admin';
  try {
    const user = await getAuth().getUser(uid);
    const current = !!(user.customClaims && user.customClaims.admin);
    if (current === shouldBeAdmin) return;
    const nextClaims = { ...(user.customClaims || {}), admin: shouldBeAdmin };
    await getAuth().setCustomUserClaims(uid, nextClaims);
    console.log(`Set admin=${shouldBeAdmin} for uid=${uid}`);
  } catch (err) {
    console.error(`Failed to sync admin claim for uid=${uid}:`, err);
  }
}

exports.onUserCreate = onDocumentCreated('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const data = event.data && event.data.data();
  if (!data) return;
  await syncAdminClaim(uid, data.role);
});

exports.onUserUpdate = onDocumentUpdated('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const before = event.data && event.data.before.data();
  const after = event.data && event.data.after.data();
  if (!after) return;
  if (before && before.role === after.role) return;
  await syncAdminClaim(uid, after.role);
});
