const fs = require('node:fs');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const backupPath = process.argv[2];
const apply = process.argv.includes('--apply');
if (!backupPath) throw new Error('Usage: node scripts/restore-backup.js <backup.json> [--apply]');

const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
if (backup?._meta?.format !== 'grett-firestore-export' || backup?._meta?.version !== 1) {
  throw new Error('Unsupported or invalid Grett backup format.');
}

const reserved = new Set(['_meta', 'storageManifest']);
const collections = Object.entries(backup).filter(([name, records]) => !reserved.has(name) && Array.isArray(records));
const problems = [];
for (const [collectionName, records] of collections) {
  for (const [index, record] of records.entries()) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id) {
      problems.push(`${collectionName}[${index}] has no valid id`);
    }
  }
}
if (problems.length) throw new Error(`Backup validation failed:\n${problems.join('\n')}`);

console.log(`Validated ${collections.reduce((sum, [, records]) => sum + records.length, 0)} documents across ${collections.length} collections.`);
console.log(`Storage manifest entries: ${backup.storageManifest?.length || 0}; file bytes must be restored separately.`);
if (!apply) {
  console.log('Dry run complete. No writes were made. Re-run with --apply only against the intended isolated/restoration project.');
  process.exit(0);
}

function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    if (value.__type === 'firestore-timestamp') return new Timestamp(value.seconds, value.nanoseconds || 0);
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry)]));
  }
  return value;
}

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
(async () => {
  for (const [collectionName, records] of collections) {
    for (let offset = 0; offset < records.length; offset += 400) {
      const batch = db.batch();
      for (const record of records.slice(offset, offset + 400)) {
        const { id, ...data } = record;
        batch.set(db.collection(collectionName).doc(id), decode(data), { merge: false });
      }
      await batch.commit();
    }
  }
  console.log('Restore completed. Verify counts, relationships, timestamps and storage objects before enabling access.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
