// The docs quote two figures that silently rot: how many tests the suite has,
// and which version this package is. Both were wrong at once — the README said
// "43 tests" while the suite had grown to 54, and it called the package
// `0.1.0` while `package.json` (and the published npm release) had moved to
// `0.1.2`. Nothing failed, because a number in prose is not checked by anyone.
//
// This test is the check. It counts the real test cases and reads the real
// version, then holds the documented figures to them — so the next time either
// drifts, the suite goes red instead of the README going quietly wrong.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const README = readFileSync(join(ROOT, 'README.md'), 'utf8')
const CHANGELOG = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

// One test case is one top-level `test(...)`/`it(...)` declaration at the start
// of a line — the shape every file in this suite uses, and the shape node's
// runner counts one-for-one (there are no nested subtests here). The pattern is
// assembled from a string so this file does not itself start a line with the
// token it is counting.
const DECL = new RegExp('^\\s*(?:test|it)\\(', 'gm')

function countActualTests() {
  const files = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs'))
  assert.ok(files.length > 0, 'no test files found on disk — the count would be vacuous')
  let total = 0
  for (const f of files) {
    const src = readFileSync(join(ROOT, 'test', f), 'utf8')
    total += (src.match(DECL) ?? []).length
  }
  return total
}

test('the test count in the README matches the real number of test cases', () => {
  const actual = countActualTests()
  // Guard against a vacuous pass: this file alone contributes several cases, so
  // the true total is comfortably above any single file's.
  assert.ok(actual > 10, `implausibly low test count (${actual}) — the counter is probably broken`)

  const m = README.match(/npm test\s+#\s*(\d+)\s+tests/)
  assert.ok(m, 'could not find a "npm test # N tests" figure in the README to check against')
  const documented = Number(m[1])

  assert.equal(
    documented,
    actual,
    `README says ${documented} tests but the suite has ${actual}. ` +
      'Update the "Testing" section of README.md (and the CHANGELOG) to the real count.',
  )
})

test('the version the README calls current matches package.json', () => {
  // The "Status" section names the current release, e.g. Pre-1.0 (`0.1.2`).
  const m = README.match(/Pre-1\.0 \(`(\d+\.\d+\.\d+)`\)/)
  assert.ok(m, 'could not find the "Pre-1.0 (`x.y.z`)" version the README declares as current')
  assert.equal(
    m[1],
    PKG.version,
    `README's Status section says ${m[1]} but package.json is ${PKG.version}.`,
  )
})

test('the CHANGELOG records the version package.json ships', () => {
  // A published version with no changelog entry is exactly how 0.1.1 and 0.1.2
  // went undocumented. Require a heading for whatever package.json now claims.
  const heading = new RegExp('^##\\s+' + PKG.version.replace(/\./g, '\\.') + '\\b', 'm')
  assert.match(
    CHANGELOG,
    heading,
    `CHANGELOG.md has no "## ${PKG.version}" entry for the version package.json ships.`,
  )
})
