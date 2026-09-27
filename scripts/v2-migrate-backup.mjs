import { readFile, writeFile } from 'node:fs/promises'
import { applyV2Patches } from '../src/lib/migrationReview.js'

const [input, reportPath, output, direction = 'forward'] = process.argv.slice(2)
if (!input || !reportPath || !output) {
  process.stderr.write('Usage: node scripts/v2-migrate-backup.mjs input.json review.json output.json [forward|inverse]\n')
  process.exitCode = 1
} else {
  const backup = JSON.parse(await readFile(input, 'utf8'))
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  if (backup._meta?.format !== 'grett-firestore-export') throw new Error('Expected a Grett Settings export')
  const migrated = applyV2Patches(backup, report, direction)
  await writeFile(output, `${JSON.stringify(migrated, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`Wrote ${direction} output to ${output}. Firebase was not changed.\n`)
}
