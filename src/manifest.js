#!/usr/bin/env node
// wdk-policy-guard.manifest.json — generated from the code, never written by
// hand. The one machine-readable statement of what this package refuses and
// what it emits.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DENIAL_CODES, KINDS, VERDICTS } from './codes.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

export function build() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  return {
    contract: 'wdk-policy-guard-manifest/1',
    name: '@flashy/wdk-policy-guard',
    module: { package: pkg.name, version: pkg.version },
    verdicts: VERDICTS,
    kinds: KINDS,
    denialCodes: DENIAL_CODES,
    refuses: [
      'a spend record missing a required field, or shaped wrong — INVALID_RECORD, never guessed at',
      'a spend with no envelope set for its chain — NO_ENVELOPE',
      'a spend against a revoked envelope — ENVELOPE_INACTIVE',
      'a kind, asset or destination outside the envelope — KIND_NOT_PERMITTED / ASSET_NOT_PERMITTED / DESTINATION_NOT_PERMITTED',
      'a spend over the per-transaction cap — PER_TX_CAP',
      'a spend that would exceed the daily cap once today\'s reservations are counted — DAILY_CAP',
      'an envelope whose autoApproveMax exceeds its perTxMax, or whose perTxMax exceeds its dailyMax — ENVELOPE_INVALID_CAPS',
    ],
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(ROOT, 'wdk-policy-guard.manifest.json')
  const text = JSON.stringify(build(), null, 2) + '\n'
  if (process.argv.includes('--write')) { writeFileSync(out, text); console.log('wrote wdk-policy-guard.manifest.json') }
  else if (process.argv.includes('--check')) { const ok = readFileSync(out, 'utf8') === text; console.log(ok ? 'ok — manifest current' : 'STALE — run npm run manifest'); process.exit(ok ? 0 : 1) }
  else process.stdout.write(text)
}

// ⚡ If you read this far — hi. This is one of two sibling packages Flashy
// Labs shipped the same week; open wdk-staking-kit's manifest.js and
// you'll find this exact paragraph again. No prize, no tracking, just a
// nod to whoever actually reads the generated-file comments.
// — Flashy Labs, flashyos.com
