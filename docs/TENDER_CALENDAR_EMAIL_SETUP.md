# Tender calendar and email reminder setup

The application keeps `tenders.submissionDate` as the authoritative deadline. Google OAuth tokens, calendar mappings, and email delivery records are stored in Firestore by Netlify Functions and are not readable by browser clients.

## Netlify environment variables

Configure these for the production site:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: one-line JSON for a dedicated Firebase service account with only the Firestore and Firebase Auth permissions needed by these functions.
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`: `https://grettpayordertracker.netlify.app/.netlify/functions/google-calendar-callback`
- `GOOGLE_OAUTH_STATE_SECRET`: a random secret of at least 32 characters.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: a base64-encoded random 32-byte key. Keep this value stable or stored refresh tokens cannot be decrypted.
- `PUBLIC_SITE_URL`: `https://grettpayordertracker.netlify.app`
- `RESEND_API_KEY`
- `TENDER_REMINDER_FROM_EMAIL`: a sender on a domain verified in Resend, for example `Tender Reminders <reminders@example.com>`.

Generate the two local random values in PowerShell (do not commit the output):

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use the first output for `GOOGLE_OAUTH_STATE_SECRET` and the second for `GOOGLE_TOKEN_ENCRYPTION_KEY`.

## Google Cloud

1. Enable Google Calendar API in the selected Google Cloud project.
2. Configure the OAuth consent screen.
3. Create a Web application OAuth client.
4. Add the production redirect URI shown above exactly.
5. For local Netlify development, optionally add `http://localhost:8888/.netlify/functions/google-calendar-callback` and temporarily use that same value for `GOOGLE_REDIRECT_URI`.
6. Add the client ID and client secret to Netlify. Never add them to a `VITE_` variable.

The integration requests only `https://www.googleapis.com/auth/calendar.events`. Calendar events are private, all-day events with popup overrides at 7 days, 3 days, 1 day, and the due date by default.

## Resend

1. Create a Resend account and verify the sending domain.
2. Create an API key with sending access.
3. Add the API key and verified sender to Netlify.
4. Deploy the site.
5. In **Settings → Email Reminders**, enter the recipient, enable reminders, and use **Process due reminders now** with a safe test tender at a configured threshold.

## Schedules

- Calendar reconciliation: `45 3 * * *` (03:45 UTC / 08:45 PKT).
- Email reminders: `0 4 * * *` (04:00 UTC / 09:00 PKT).

Netlify runs scheduled functions only on published production deploys. Email deliveries use a stable Resend idempotency key and a Firestore delivery record based on tender ID, due date, threshold, and recipient.

## Collections created automatically

- `calendarIntegrations`: encrypted connection credentials and per-user settings.
- `calendarMappings`: one Google event mapping per user and tender.
- `reminderDeliveries`: persistent email delivery and retry state.
- `oauthStates`: short-lived, one-time OAuth state records.

These collections are server-only. Existing tender records require no migration. Tenders without a valid `submissionDate`, or whose status is not Draft, Bidding, or Pending, are ignored.

## Deployment order

1. Configure all Netlify environment variables.
2. Configure the Google OAuth production redirect URI.
3. Push and allow Netlify to publish the new deployment.
4. Confirm both scheduled functions appear in Netlify.
5. Open Settings, connect Google Calendar, and run **Sync upcoming tenders**.
6. Enable email reminders and run the safe manual processor test.

Disconnecting revokes the stored Google credential and stops future synchronization. Existing Calendar events are deliberately retained to avoid unexpected deletion; they may be removed manually from Google Calendar.
