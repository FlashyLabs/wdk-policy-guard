// This package answers its own corpus, and the corpus is current.
//
// ── Why the runner here is thirty lines and not a dependency ───────────────
//
// `npx @flashyos/conformance-kit` is what the README tells a reader to run,
// and it is what an implementation in another language is checked with. This
// package takes no runtime or dev dependency beyond typescript, and adding one
// so that it can check itself would make the corpus look like something only
// our tooling can read — which is the opposite of the claim it exists to make.
//
// So this spawns the adapter and compares what comes back against the `expect`
// the corpus already carries. It is not a reimplementation of the runner's
// judging rules: it is the narrower question of whether the reference
// implementation answers its own corpus, and the protocol compatibility is
// proven by the README's command rather than here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const corpus = JSON.parse(readFileSync(join(ROOT, 'conformance', 'policy-guard-1.json'), 'utf8'))

const cases = corpus.sets.flatMap((s) => s.cases.map((c) => ({ ...c, set: s.name, outcomes: s.outcomes })))

test('the corpus is not empty, and most of it is refusals', () => {
  // The vacuity guard. A corpus that lost its cases would make every
  // assertion below pass over an empty list, and report a conforming
  // implementation having asked it nothing.
  assert.ok(cases.length >= 40, `${cases.length} cases — the corpus has shrunk`)
  const refusals = cases.filter((c) => c.expect.verdict === 'DENY' || c.expect.valid === false).length
  assert.ok(refusals > cases.length / 2, `${refusals} of ${cases.length} are refusals — the substance has thinned`)
})

test('every case id is unique across the bundle', () => {
  // Answers come back keyed by id alone, so two cases under one id means the
  // second silently overwrites the first. This was a real defect here: a
  // `not-an-object` in `records` and another in `envelope-shape`, each a
  // reasonable name inside its own set.
  const seen = new Set()
  for (const c of cases) {
    assert.ok(!seen.has(c.id), `duplicate case id: ${c.id}`)
    seen.add(c.id)
  }
})

test('the committed corpus is what the cases render to', () => {
  // Generated, never hand-edited — the contract the package manifest already
  // lives under.
  execFileSync('node', [join(ROOT, 'conformance', 'build.mjs'), '--check'], { cwd: ROOT, stdio: 'pipe' })
})

test('this implementation answers all of it', () => {
  const input = cases.map((c) => JSON.stringify({ id: c.id, set: c.set, input: c.input, ...(c.context ? { context: c.context } : {}) })).join('\n')
  const out = execFileSync('node', [join(ROOT, 'examples', 'adapter.mjs')], { input, encoding: 'utf8' })

  const answers = new Map()
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const a = JSON.parse(line)
    answers.set(a.id, a)
  }

  const disagreed = []
  for (const c of cases) {
    const a = answers.get(c.id)
    if (!a) {
      disagreed.push(`${c.set}/${c.id}: unanswered`)
      continue
    }
    if (typeof c.expect.verdict === 'string') {
      // ALLOW and ESCALATE are different answers. Collapsing them is the
      // failure this whole profile is about.
      if (a.verdict !== c.expect.verdict) disagreed.push(`${c.set}/${c.id}: expected ${c.expect.verdict}, got ${a.verdict}`)
      else if (Array.isArray(c.expect.codes)) {
        const got = Array.isArray(a.codes) ? a.codes : []
        const missing = c.expect.codes.filter((x) => !got.includes(x))
        if (missing.length) disagreed.push(`${c.set}/${c.id}: missing code ${missing.join(', ')}`)
      }
      if (Array.isArray(c.outcomes) && !c.outcomes.includes(a.verdict)) disagreed.push(`${c.set}/${c.id}: ${a.verdict} is outside the declared vocabulary`)
    } else if (a.valid !== c.expect.valid) {
      disagreed.push(`${c.set}/${c.id}: expected valid=${c.expect.valid}, got ${a.valid}`)
    }
  }

  assert.deepEqual(disagreed, [], disagreed.join('\n'))
})
