#!/usr/bin/env node
// Render the `conformance/1` bundle from the cases beside this file.
//
// Generated, never hand-edited: `npm run conformance` writes it and
// `npm run conformance:check` fails if the committed copy has drifted, the
// same contract the package manifest already lives under.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { records, envelopes, caps, ceiling, envelopeShape } from './cases.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(HERE)
const OUT = join(HERE, 'policy-guard-1.json')

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** A decide set: one of a closed, declared vocabulary of outcomes. */
const decide = (name, about, cases) => ({
  name,
  kind: 'decide',
  outcomes: ['ALLOW', 'ESCALATE', 'DENY'],
  about,
  allow: cases.filter((c) => c.verdict === 'ALLOW').length,
  escalate: cases.filter((c) => c.verdict === 'ESCALATE').length,
  deny: cases.filter((c) => c.verdict === 'DENY').length,
  cases: cases.map((c) => ({
    id: c.id,
    why: c.why ?? null,
    input: c.input,
    ...(c.context ? { context: c.context } : {}),
    expect: { verdict: c.verdict, ...(c.codes ? { codes: c.codes } : {}) },
  })),
})

/** A validate set: acceptable, or not. */
const validate = (name, about, cases) => ({
  name,
  kind: 'validate',
  about,
  accept: cases.filter((c) => c.valid).length,
  refuse: cases.filter((c) => !c.valid).length,
  cases: cases.map((c) => ({
    id: c.id,
    why: c.why ?? null,
    input: c.input,
    expect: { valid: c.valid },
  })),
})

export function build() {
  return {
    contract: 'conformance/1',
    profile: 'policy-guard/1',
    version: pkg.version,
    license: 'Apache-2.0',
    source: 'https://github.com/flashylabs/wdk-policy-guard',
    about:
      'A conformance corpus for an agent spending policy, in one shape, for an implementation in any language. Any two policy engines agree that a small transfer inside an envelope is allowed; they disagree at the edges, and the edges are where money moves by accident. Most of this corpus is refusals, and the refusals are the substance. Generated from conformance/cases.mjs — regenerated, never hand-edited.',
    protocol: {
      about: 'One JSON object per line in, one per line out — so a runner needs no bindings and works with any executable.',
      stdin: {
        id: 'string',
        set: 'string',
        input: 'the spend being graded, or for an accept/refuse set, the document',
        context: 'optional — what the judgement is made AGAINST: { envelope, usedToday }',
      },
      stdout: {
        id: 'string',
        verdict: "one of the set's declared `outcomes` — for a `decide` set",
        valid: 'boolean — for a `validate` set',
        codes: 'string[] — optional; compared only where the case expects them, and extra codes are allowed',
      },
    },
    notes: [
      'A `decide` set names its `outcomes` in the bundle. ALLOW and ESCALATE are different answers: ESCALATE means a human is asked before anything is signed, and an implementation folding it into "allowed" signs what a person was meant to see.',
      'Amounts are base-unit integer strings and are compared as arbitrary-precision integers. One case exceeds a cap by one at a magnitude a double cannot represent; an implementation using floating point allows it.',
      'A cap is a ceiling, not a bound. An amount exactly equal to a cap is inside it.',
      'Asset and destination allowlists are compared case-insensitively. The same contract, checksummed and not, is the same contract.',
    ],
    sets: [
      decide('records', 'A spend this profile cannot describe is refused, never guessed at.', records),
      decide('envelopes', 'The envelope, and the four ways out of it.', envelopes),
      decide('caps', 'Per-transaction and daily caps, and what happens exactly on them.', caps),
      decide('ceiling', 'The ceiling under which nobody is asked.', ceiling),
      validate('envelope-shape', 'The envelope document itself: acceptable, or not.', envelopeShape),
    ],
  }
}

const text = `${JSON.stringify(build(), null, 2)}\n`

if (process.argv.includes('--check')) {
  const ok = readFileSync(OUT, 'utf8') === text
  console.log(ok ? 'ok — corpus current' : 'STALE — run npm run conformance')
  process.exit(ok ? 0 : 1)
} else {
  writeFileSync(OUT, text)
  const b = build()
  const total = b.sets.reduce((n, s) => n + s.cases.length, 0)
  const refusals = b.sets.reduce((n, s) => n + (s.deny ?? 0) + (s.refuse ?? 0), 0)
  console.log(`wrote ${OUT}`)
  console.log(`  ${b.sets.length} sets, ${total} cases, ${refusals} of them refusals`)
}
