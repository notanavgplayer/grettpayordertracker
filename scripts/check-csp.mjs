import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const config = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8')
const match = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/)
if (!match) throw new Error('Inline theme script was not found in index.html')
const hash = createHash('sha256').update(match[1]).digest('base64')
if (!config.includes(`'sha256-${hash}'`)) {
  throw new Error(`CSP is missing the inline script hash sha256-${hash}`)
}
console.log(`CSP inline-script hash verified: sha256-${hash}`)
