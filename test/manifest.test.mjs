import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from '../src/manifest.js'
import { DENIAL_CODES, KINDS, VERDICTS } from '../src/codes.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

test('build(): matches the committed wdk-policy-guard.manifest.json — run `npm run manifest` if this fails', () => {
  const committed = readFileSync(join(ROOT, 'wdk-policy-guard.manifest.json'), 'utf8')
  const fresh = JSON.stringify(build(), null, 2) + '\n'
  assert.equal(committed, fresh)
})

test('build(): denialCodes, kinds and verdicts match src/codes.js exactly — never a second, hand-kept copy', () => {
  const doc = build()
  assert.deepEqual(doc.denialCodes, DENIAL_CODES)
  assert.deepEqual(doc.kinds, KINDS)
  assert.deepEqual(doc.verdicts, VERDICTS)
})

test('build(): contract id and module name', () => {
  const doc = build()
  assert.equal(doc.contract, 'wdk-policy-guard-manifest/1')
  assert.equal(doc.module.package, '@flashylabs/wdk-policy-guard')
})
