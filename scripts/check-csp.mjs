import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const config = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8')
// Browsers hash the exact text node, including its leading/trailing whitespace,
// after HTML newline normalization. Match that behavior so this check cannot
// approve a hash the browser will reject.
const match = html.match(/<script>([\s\S]*?)<\/script>/)
if (!match) throw new Error('Inline theme script was not found in index.html')
const browserScript = match[1].replace(/\r\n?/g, '\n')
const hash = createHash('sha256').update(browserScript).digest('base64')
if (!config.includes(`'sha256-${hash}'`)) {
  throw new Error(`CSP is missing the inline script hash sha256-${hash}`)
}
console.log(`CSP inline-script hash verified: sha256-${hash}`)
