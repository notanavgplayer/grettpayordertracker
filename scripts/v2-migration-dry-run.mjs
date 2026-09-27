import { readFile } from 'node:fs/promises'
import { reviewV2Backup } from '../src/lib/migrationReview.js'

const file = process.argv[2]
if (!file) {
  process.stderr.write('Usage: node scripts/v2-migration-dry-run.mjs path/to/grett-backup.json\n')
  process.exitCode = 1
} else {
  const backup = JSON.parse(await readFile(file, 'utf8'))
  if (backup._meta?.format !== 'grett-firestore-export') throw new Error('Expected a Grett Settings export')
  process.stdout.write(`${JSON.stringify(reviewV2Backup(backup), null, 2)}\n`)
}
