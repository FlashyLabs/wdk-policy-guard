#!/usr/bin/env node
// The reference adapter: this package, speaking the `conformance/1` protocol.
//
// Read one JSON object per line from stdin, write one per line to stdout. That
// is the entire interface — no bindings, no SDK, and nothing here that an
// implementation in another language could not do in twenty lines.
//
//   in   { "id": "...", "set": "...", "input": {...}, "context": {...}? }
//   out  { "id": "...", "verdict": "DENY", "codes": ["PER_TX_CAP"] }
//   out  { "id": "...", "valid": false }              ← for envelope-shape
//
// `context` carries what the grade is made AGAINST — the envelope, and what
// the day has already used. It is never the thing being judged.
import { createInterface } from 'node:readline'

import { grade, validateEnvelope, DailyLedger } from '../src/index.js'

/** A ledger pre-loaded with the day's usage, for the cases that need one. */
function ledgerWith(chain, used) {
  if (used === undefined || used === null) return undefined
  const l = new DailyLedger()
  l.reserve(chain, String(used))
  return l
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of lines) {
  if (!line.trim()) continue
  const c = JSON.parse(line)

  if (c.set === 'envelope-shape') {
    process.stdout.write(`${JSON.stringify({ id: c.id, valid: validateEnvelope(c.input).length === 0 })}\n`)
    continue
  }

  const ctx = c.context ?? {}
  const r = grade(ctx.envelope, c.input, ledgerWith(c.input?.chain ?? ctx.envelope?.chain, ctx.usedToday))
  process.stdout.write(
    `${JSON.stringify({ id: c.id, verdict: r.verdict, ...(r.code ? { codes: [r.code] } : {}) })}\n`,
  )
}
