const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

const apply = process.argv.includes('--apply');
const backupConfirmed = process.argv.includes('--backup-confirmed');
if (apply && !backupConfirmed) {
  throw new Error('Refusing to write without --backup-confirmed. Create and validate a backup first.');
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

function isTimestamp(value) {
  return value instanceof Timestamp || typeof value?.toDate === 'function';
}

(async () => {
  const [tenderSnapshot, expenseSnapshot] = await Promise.all([
    db.collection('tenders').get(),
    db.collection('expenses').get(),
  ]);
  const tenders = tenderSnapshot.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }));
  const byNit = new Map();
  for (const tender of tenders) {
    const nit = String(tender.nit || '').trim();
    if (!nit) continue;
    if (!byNit.has(nit)) byNit.set(nit, []);
    byNit.get(nit).push(tender.id);
  }

  const changes = [];
  const ambiguous = [];
  for (const snapshot of expenseSnapshot.docs) {
    const expense = snapshot.data();
    if (expense.tenderRef) continue;
    const legacy = String(expense.tenderId || '').trim();
    if (!legacy) continue;
    if (tenders.some((tender) => tender.id === legacy)) {
      changes.push({ collection: 'expenses', id: snapshot.id, tenderRef: legacy });
      continue;
    }
    const matches = byNit.get(legacy) || [];
    if (matches.length === 1) changes.push({ collection: 'expenses', id: snapshot.id, tenderRef: matches[0] });
    else ambiguous.push({ collection: 'expenses', id: snapshot.id, legacyTenderId: legacy, candidates: matches });
  }

  const invalidTimestamps = tenders.flatMap((tender) => (
    ['createdAt', 'updatedAt'].filter((field) => tender[field] && !isTimestamp(tender[field]))
      .map((field) => ({ collection: 'tenders', id: tender.id, field, value: tender[field] }))
  ));

  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', safeChanges: changes, ambiguous, invalidTimestamps }, null, 2));
  if (!apply) {
    console.log('Dry run complete. No writes were made. Resolve ambiguous links and timestamp provenance before applying.');
    return;
  }

  for (let offset = 0; offset < changes.length; offset += 400) {
    const batch = db.batch();
    for (const change of changes.slice(offset, offset + 400)) {
      batch.update(db.collection(change.collection).doc(change.id), {
        tenderRef: change.tenderRef,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  console.log(`Applied ${changes.length} unambiguous relationship updates. Ambiguous records and timestamps were not changed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
