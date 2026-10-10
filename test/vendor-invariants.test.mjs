// `vendor-invariants.mjs` is the estate's invariants/1 harness, vendored
// byte-for-byte from spec-kit. Re-vendor, never edit: the drift test compares
// the copy against a checkout beside this repository and reports UNKNOWN,
// never a pass, when there is nothing to compare against — the same rule the
// conformance corpus and the manifest here already live under (generated or
// copied, never hand-edited).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KIT } from '../vendor-invariants.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const VENDORED = 'vendor-invariants.mjs'

// Two layouts, one question: spec-kit sits beside this repository
// (/home/user/spec-kit next to /home/user/wdk-policy-guard), or — in a nested
// layout — one further up.
const SOURCE = [
  join(ROOT, '..', 'spec-kit', VENDORED),
  join(ROOT, '..', '..', 'spec-kit', VENDORED),
].find((p) => existsSync(p))

test('the vendored harness is invariants/1', () => {
  assert.equal(KIT, 'invariants/1')
})

test('the vendored harness imports nothing but node: builtins, and those lazily', () => {
  const src = readFileSync(join(ROOT, VENDORED), 'utf8')
  const imports = [...src.matchAll(/import\((['"])([^'"]+)\1\)|^import .* from (['"])([^'"]+)\3/gm)].map((m) => m[2] ?? m[4])
  assert.deepEqual(imports.sort(), ['node:fs', 'node:path'])
  for (const spec of imports) assert.ok(spec.startsWith('node:'), `${VENDORED} imports "${spec}"`)
})

test('the vendored harness matches spec-kit byte for byte, when spec-kit is beside us', (t) => {
  if (!SOURCE) {
    t.skip('UNKNOWN: spec-kit is not checked out beside this repository')
    return
  }
  assert.ok(readFileSync(join(ROOT, VENDORED)).equals(readFileSync(SOURCE)),
    `${VENDORED} has drifted from spec-kit's ${VENDORED} — re-vendor, never edit`)
})
