# V2 financial-write rollback guard

If any V2 payment, bill receipt, or refund has been saved, freeze financial writes **before** republishing the pre-V2 Netlify deploy. From the repository root, run:

```powershell
npx --yes firebase-tools@15.30.2 deploy --only firestore:rules --config firebase.rollback.json --project pay-order-tracker
```

This checked-in rule set retains admin reads but rejects client creates, updates, and deletes for `payOrders`, `tenders`, `expenses`, and legacy `tenderFees`. Verify the rules deploy completed before switching the Netlify production deploy. The old UI can then be used for read-only access; it does not show V2 transaction ledgers correctly. Keep financial writes frozen until V2 is restored or a reviewed, ledger-preserving recovery is ready. Do not import a pre-release JSON backup over valid post-release entries.

To resume V2 after resolving the incident, republish the V2 app and deploy its normal `firestore.rules` with `npx --yes firebase-tools@15.30.2 deploy --only firestore:rules --project pay-order-tracker`. Record both rule release times and the selected Netlify deploy ID. Firebase Admin SDK writes bypass Firestore client rules; keep calendar/email schedules disabled and check for other privileged writers during an incident.
