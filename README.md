# Grett Pay Order Tracker

Private React application for managing tenders, pay orders, expenses, contacts, tasks, documents, and operational reports.

## Technology

- React 18 and React Router
- Vite and Tailwind CSS
- Firebase Authentication, Firestore, and Cloud Functions
- Private Supabase Storage objects accessed through short-lived signed URLs
- Netlify hosting

## Local setup

Requirements: Node.js 20 and npm. Java 21 is also required for Firestore emulator tests.

1. Copy `.env.example` to `.env.local` and replace every placeholder.
2. Install application dependencies with `npm ci`.
3. Install function dependencies with `npm --prefix functions ci`.
4. Start the application with `npm run dev`.

Firebase web configuration identifies the Firebase project and is safe to send to the browser. Authorization is enforced by Authentication, Firestore rules, and callable functions. Never put Firebase Admin credentials or the Supabase service-role key in a `VITE_` variable.

## Checks

```text
npm run lint
npm test
npm run test:rules
npm run check:csp
npm run build
npm audit
npm --prefix functions run check
npm --prefix functions audit
```

`npm run test:rules` starts the Firestore emulator and requires Java. The combined `npm run check` command runs linting, unit tests, CSP verification, and the production build.

## Authorization

The current `users/{uid}.role` value is authoritative. Firestore rules and callable storage functions read that document for each protected operation. A Cloud Function mirrors the role to a custom Auth claim for trusted integrations, but a cached claim alone cannot authorize Firestore access after demotion.

New user profiles may create themselves only as `viewer`. An existing administrator must promote a user by changing their profile role. Do not manually grant claims as a substitute for the profile role.

## Document storage

The `tender-documents` Supabase bucket must be private. The browser asks Firebase callable functions for signed upload or download credentials. Configure the function secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

Configure the browser with the public Supabase URL and anon/publishable key from `.env.example`. Apply `supabase-storage-policies.sql`; do not add anonymous object-read policies.

## Deployment

The coordinated deployment order, migration dry runs, backup prerequisites, environment variables, and rollback notes are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Deploy rules, functions, indexes/storage policy, and the frontend in the documented order because older frontend document URLs must remain readable during the transition.

The site is a private business application and ships with `noindex`. `netlify.toml` is the only hosting-header source and includes the CSP hash verified from the final build.

## Backup and recovery

The Settings export is a versioned business-data export with a storage manifest. It does not contain Firebase Auth credentials, Firebase project configuration, or document file bytes. Use the Admin SDK restore script in dry-run mode first:

```text
node functions/scripts/restore-backup.js path/to/export.json
node functions/scripts/restore-backup.js path/to/export.json --apply
```

Keep independent provider-level backups for Auth configuration and private storage files. Full recovery requires both the versioned Firestore export and those provider backups.

## Repository layout

```text
src/                    React pages, components, hooks, and domain helpers
functions/              Firebase callable functions and admin scripts
test/                   Unit and Firestore-rules regression tests
scripts/                Build and security-header verification
docs/DEPLOYMENT.md      Deployment, migration, and recovery runbook
firestore.rules         Current-role authorization and write validation
netlify.toml            Hosting redirects and security headers
```
