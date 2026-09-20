# Deployment and migration runbook

This change spans Firestore rules, Cloud Functions, the browser application, and Supabase Storage. Do not deploy only the storage policy or only the browser application.

## Required configuration

The browser build requires these variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Cloud Functions require Firebase secret parameters named `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key belongs only in the Functions secret store. The browser retains `VITE_SUPABASE_URL` and the publishable `VITE_SUPABASE_ANON_KEY` solely to send files with server-issued, short-lived upload tokens; anonymous storage policies remain disabled.

## Pre-deployment checks

1. Export a version-1 application backup and retain a separate copy of every Supabase object. The JSON export contains a storage manifest, not file bytes or Firebase Auth accounts.
2. Restore the JSON into an isolated Firebase project using `node functions/scripts/restore-backup.js backup.json` first, then the same command with `--apply` and credentials for the isolated project.
3. Run `node functions/scripts/migrate-references.js` with read-only credentials. Review all ambiguous links and timestamp findings. The script writes nothing unless both `--apply` and `--backup-confirmed` are supplied.
4. Run `npm ci`, `npm run check`, and `npm run test:rules`.
5. In `functions`, run `npm ci`, `npm run check`, and `npm audit --omit=dev`.

## Safe deployment order

1. Deploy `onUserRoleWrite`, `createTenderDocumentUpload`, and `createTenderDocumentDownload` with both Supabase secrets configured.
2. Verify callable authorization in a non-production project with a current administrator, viewer, stale administrator claim plus viewer document, unsupported MIME type, oversized upload, and expired download URL.
3. Create a **private** `tender-documents` bucket, or migrate existing objects into a new private bucket. Configure bucket-level MIME and size limits. Do not apply the old anonymous policies.
4. Copy existing files, retain their original object paths, and update document records in reviewed batches. Keep the old bucket available for rollback until every migrated file is verified.
5. Deploy the browser application. Verify upload, reload, preview, and download before changing the old bucket.
6. Deploy Firestore rules. Test tender/contact/activity writes and verify that a demoted administrator is denied despite an old token claim.
7. Remove public/anonymous storage policies only after every document record uses the private path flow. Keep only the browser publishable key; never expose the service-role key.
8. Monitor Functions errors and storage failures. Roll back the browser and rules together if core writes fail; preserve the private-bucket copy.

## Known deployment decisions

- The application currently adds receipts from `bills` and `raBills`. Confirm whether those are separate ledgers before changing this rule.
- Awarding a tender still moves active linked guarantees to `Held`. Lost or cancelled tenders no longer mark funds as `Returned` automatically because an outcome does not prove a refund occurred. Confirm the final business rule before adding any further automatic financial transition.
- Storage callables verify current Firestore administrator status. App Check can be added after a site key and enforcement rollout are available; authentication and authorization do not depend on App Check.
- Existing public URLs cannot become private by code deployment alone. They require object migration and record updates.
