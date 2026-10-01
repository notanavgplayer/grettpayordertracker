# Version 2 release preparation

This is a preparation checklist, not authorization to publish production. On 1 October 2026, Netlify's published production deploy was `dcd0e60`. GitHub PR #41 had already merged the first two V2 commits into `main`, but that production build failed. Keep the known-good Netlify deploy pinned until an approved release window. The branch preview shares production Firebase and Supabase environment values; use `/v2-preview.html` or an isolated project for write tests.

## Verification gate

- `npm run check` must pass, and `npm run test:rules` must show all five Firestore role tests passing under Java 21. A skipped role test is not a pass.
- `cd functions && npm ci && npm run check` must pass.
- Verify payment, bill receipt, and partial-refund creation, limits, and persistence against an emulator or isolated Firebase project. Never use the Netlify branch preview for write tests while it shares production credentials.
- Resolve the historical-data questions in `V2_IMPLEMENTATION.md` from source documents. Do not change those records from inferred values.

## Backup before an approved release

1. From the signed-in production Settings page, export the application JSON and record its timestamp and document counts. Store an unchanged copy off the hosting account. This export omits Firebase Auth users, Firestore rules/index configuration, and Supabase file bytes.
2. Separately retain a Firebase-managed Firestore export where available, Firebase Auth user export, the *currently deployed* rules and Functions configuration, and all Supabase objects referenced by the JSON storage manifest. Record object counts and restore locations. Do not put credentials or backups in Git.
3. Validate the application JSON without writes: `node scripts/restore-backup.js path/to/backup.json` from `functions/` (pass a path accessible from that directory). Run `node scripts/v2-migration-dry-run.mjs path/to/backup.json > v2-review.json` from the repository root. Review the generated patch list and all unmatched links.
4. Rehearse any approved transformation and inverse on copies: `node scripts/v2-migrate-backup.mjs backup.json v2-review.json v2-forward.json forward`, then `node scripts/v2-migrate-backup.mjs v2-forward.json v2-review.json v2-restored.json inverse`. Compare the restored document contents and counts with the original. These commands create local files only.
5. Restore the backup to a verified **isolated** Firebase project first. `functions/scripts/restore-backup.js --apply` writes to the project selected by Application Default Credentials and does not delete extra documents; check the credential's project ID before using it. Never point this rehearsal at production.

## Release and rollback sequence for a later approved window

1. Record the exact known-good Netlify deploy URL/ID (`dcd0e60` at preparation time), current Firebase rules, Functions revisions, and Supabase bucket policy. Confirm the new build uses the intended production environment and that backups are complete.
2. Deploy compatible rules, Functions, storage policy, and app in the order in `DEPLOYMENT.md`; perform a small authorized production smoke check after each stage. Do not run a historical-data migration without a separately reviewed correction list.
3. If the app fails, stop writes, publish the recorded known-good Netlify deploy, and restore the saved rules/Functions/storage configuration as a coordinated set. Verify login, tender reads, and a controlled write before reopening access.
4. If business data was altered, retain post-incident evidence and restore only after comparing pre- and post-release records. The JSON restore script overwrites matching documents and does not remove extras, so it is **not** an automatic point-in-time rollback. Use the Firebase-managed export or a reviewed record-level recovery plan. Preserve any valid writes made after the backup.
