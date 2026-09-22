# @flashylabs/wdk-policy-guard

```
        ██
       ██
      ██████
        ██
       ██
      ██
```

A spending-policy layer for wallets built on [Tether's WDK](https://github.com/tetherto/wdk) — or any wallet SDK. It grades a proposed spend against a per-agent envelope *before* anything signs, and returns one of three verdicts: **ALLOW**, **ESCALATE**, or **DENY**, always with a reason.

[![tests](https://github.com/FlashyLabs/wdk-policy-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/FlashyLabs/wdk-policy-guard/actions/workflows/ci.yml)
[![CodeQL](https://github.com/FlashyLabs/wdk-policy-guard/actions/workflows/codeql.yml/badge.svg)](https://github.com/FlashyLabs/wdk-policy-guard/actions/workflows/codeql.yml)
[![Scorecard](https://github.com/FlashyLabs/wdk-policy-guard/actions/workflows/scorecard.yml/badge.svg)](https://github.com/FlashyLabs/wdk-policy-guard/security/code-scanning)
[![npm version](https://img.shields.io/npm/v/@flashylabs/wdk-policy-guard.svg)](https://www.npmjs.com/package/@flashylabs/wdk-policy-guard)
[![npm downloads](https://img.shields.io/npm/dm/@flashylabs/wdk-policy-guard.svg)](https://www.npmjs.com/package/@flashylabs/wdk-policy-guard)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

Built by [Flashy Labs](https://flashyos.com) — part of the open-source toolkit we ship for teams building on Tether's WDK. Its sibling package is [`@flashylabs/wdk-staking-kit`](https://github.com/FlashyLabs/wdk-staking-kit).

## Why this exists

WDK ships a policy engine with denial codes, but nothing that grades a transfer against **per-agent** limits before it reaches a chain — daily caps, an allowlist of destinations, an amount under which nobody has to be asked. Any team giving an AI agent a wallet needs exactly this, and building it from scratch is the same twenty lines of careful BigInt arithmetic every time, usually written once, under deadline, and never given the test coverage the money it protects deserves.

This package is that twenty lines, done once, tested from every angle we could find, and released so nobody else has to write it a second time.

## Install

```bash
npm install @flashylabs/wdk-policy-guard
```

## Quickstart

```js
import { grade, DailyLedger } from '@flashylabs/wdk-policy-guard'

const envelope = {
  chain: 'evm:84532',
  kinds: ['transfer'],
  assets: ['native', '0xTokenAddress...'],
  destinations: ['0xKnownVendor...'],
  perTxMax: '1000000000000000000',   // 1.0 in 18-decimal base units
  dailyMax: '5000000000000000000',   // 5.0/day
  autoApproveMax: '100000000000000000', // 0.1 auto-approves; above it, a human confirms
}

const ledger = new DailyLedger()

const verdict = grade(envelope, {
  kind: 'transfer',
  chain: 'evm:84532',
  asset: 'native',
  amount: '50000000000000000', // 0.05
  destination: '0xKnownVendor...',
}, ledger)

if (verdict.verdict === 'ALLOW') {
  ledger.reserve('evm:84532', '50000000000000000')
  // now, and only now, call your wallet's send/transfer method
} else if (verdict.verdict === 'ESCALATE') {
  // show a human the spend and its verdict.impact ('MEDIUM' | 'HIGH' | 'CRITICAL')
} else {
  // verdict.code is one of the published DENIAL_CODES; verdict.reason is for a log or a UI
}
```

### Wiring it in front of a real send

```js
import { guardSend, DailyLedger } from '@flashylabs/wdk-policy-guard/adapters/wdk'

const ledger = new DailyLedger()
const guardedTransfer = guardSend(
  (spend) => myWdkWallet.transfer(spend), // whatever your WDK wallet instance's send method is
  { getEnvelope: () => currentEnvelopeFor(agentId), ledger },
)

// Only ever runs myWdkWallet.transfer(...) on ALLOW. Throws PolicyDeniedError
// or PolicyEscalationRequiredError otherwise — before anything is signed.
await guardedTransfer({ kind: 'transfer', chain: 'evm:84532', asset: 'native', amount: '50000000000000000', destination: '0xKnownVendor...' })
```

See [`examples/basic.mjs`](examples/basic.mjs) for a runnable end-to-end example, and [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full design rationale.

## API

| Export | From | What it does |
|---|---|---|
| `grade(envelope, record, ledger?)` | `.` | The core function. Returns `{verdict:'ALLOW'}`, `{verdict:'ESCALATE', impact}`, or `{verdict:'DENY', code, reason}`. |
| `validateEnvelope(envelope)` | `.` | Returns an array of problem strings; empty means valid. Catches malformed caps before `grade()` ever sees them. |
| `validateRecord(input)` | `.` | The record-shape check `grade()` runs first. Exported so you can validate a spend independently. |
| `DailyLedger` | `.` | An in-memory per-chain, per-UTC-day reservation tracker. `reserve()`, `release()`, `used()`. Swap in your own persistent implementation with the same three methods for a multi-process deployment. |
| `DENIAL_CODES`, `KINDS`, `VERDICTS` | `.` | The closed vocabularies every `DENY`, spend `kind`, and verdict is drawn from. |
| `guardSend(send, opts)` | `./adapters/wdk` | Wraps any async send function with a `grade()` check — call-through only on `ALLOW`. |
| `PolicyDeniedError`, `PolicyEscalationRequiredError` | `./adapters/wdk` | Thrown by `guardSend()`'s wrapped function on `DENY` / `ESCALATE`. |

Full TypeScript declarations ship with the package — `Envelope` and `SpendRecord` import directly from the package root (`import type { Envelope } from '@flashylabs/wdk-policy-guard'`), generated from the source's own JSDoc so the types can never drift from the implementation. `test-types/consumer.ts` is the type-level test that would fail if they ever did.

## What it refuses

Every one of these is a real test in [`test/policy.test.mjs`](test/policy.test.mjs), not a claim:

| Code | When |
|---|---|
| `INVALID_RECORD` | The spend is missing a required field, or shaped wrong. Never guessed at. |
| `INVALID_AMOUNT` | The amount isn't a non-negative integer string in base units. |
| `NO_ENVELOPE` | No envelope exists for this chain, or the envelope is for a different chain. |
| `ENVELOPE_INACTIVE` | The envelope has been explicitly revoked (`active: false`). |
| `KIND_NOT_PERMITTED` | The spend's kind (`transfer` / `swap` / `bridge`) isn't in the envelope's allowlist. |
| `ASSET_NOT_PERMITTED` | The asset isn't in the envelope's allowlist (matched case-insensitively). |
| `DESTINATION_NOT_PERMITTED` | The destination isn't in the envelope's allowlist. Never checked for a swap, which has no destination. |
| `PER_TX_CAP` | The amount exceeds the envelope's per-transaction cap. |
| `DAILY_CAP` | Today's reservations plus this spend would exceed the daily cap. |

`validateEnvelope()` also refuses an envelope whose `autoApproveMax` exceeds its `perTxMax`, or whose `perTxMax` exceeds its `dailyMax` — a self-contradictory envelope is caught before it can silently allow more than it claims to.

## Design principles

- **Amounts are always strings, in base units.** Never a JS number. A comparison on floats is how a cap stops being a cap — see `ARCHITECTURE.md` for the specific failure this avoids.
- **`grade()` is pure.** It reads the ledger's `used()` but never writes it. Reserving happens after `ALLOW`, and is the caller's responsibility — this keeps grading safe to call speculatively (to preview a verdict in a UI) without side effects.
- **A refusal always carries a reason.** `DENY` codes are drawn from a closed, published list (`DENIAL_CODES`) — never an ad-hoc string — so a refusal read by a person and a refusal read by a log line always mean the same thing.
- **No dependency on any wallet SDK.** The core (`grade`, `validateEnvelope`, `DailyLedger`) imports nothing beyond its own `codes.js`. WDK integration lives entirely in the optional `./adapters/wdk` entry point, which itself has zero `@tetherto/*` imports — see [`ARCHITECTURE.md`](ARCHITECTURE.md#why-there-is-no-wdk-dependency).
- **Nothing here is clever.** Every rule is one comparison a reviewer can check in thirty seconds — the security property is the absence of anything to be clever about.

## What this package does not do

- It does not sign anything, hold a key, or call a network. It is a pure function over data you provide.
- It does not decide *who* may set or revoke an envelope — that's an authorization question for your own application, upstream of this package.
- It does not persist anything on its own. `DailyLedger`'s default is in-memory; persistence is your integration's choice — see `ARCHITECTURE.md`.

## Status

Pre-1.0 (`0.1.0`). The `Envelope` and `SpendRecord` shapes are not yet frozen — a field added later ships as a minor version, but a field renamed or a verdict's meaning changed would not. Watch [`CHANGELOG.md`](CHANGELOG.md) across a version bump before pinning a wider range than `^0.1.0`.

## Testing

```bash
npm test        # 43 tests, node's built-in test runner, no external services
npm run check    # confirms the generated manifest is current
```

Every exported function has direct test coverage, including every reachable `DENY` code, every `ESCALATE` impact tier, ledger isolation across chains and UTC-day boundaries, and the `guardSend` adapter's reserve/release-on-failure behaviour.

## Security

See [`SECURITY.md`](SECURITY.md) for the threat model and how to report a vulnerability. In short: this package never holds a key, never signs, and never calls a network — it is a pure decision function over data you already have. Its entire security surface is "does `grade()` return the right verdict," which is exactly what the test suite checks.

## Provenance

Extracted from the policy engine built for [Flashy Wallet](https://github.com/FlashyLabs/flashy-wallet)'s own agent-facing envelope grading, and open-sourced because the problem it solves — spending limits for an automated caller with a wallet — belongs to every team building on WDK, not just to us. See [`CHANGELOG.md`](CHANGELOG.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## ⚡ The Strike

This README commits to a secret, the way `grade()` commits to a verdict — before anything is revealed, and checkable by anyone after:

```
sha256: 6124a73d8fb7b9825992bebeb99e1ff98ce07a202a53be51e4ccd7964e48d509
```

The preimage is already on this page — one exact sentence from "Design principles," above. Recover it, hash it yourself (never trust, verify — that includes us), and open an issue titled `⚡ STRIKE` containing the sentence. First verified striker per release gets their name in [`STRIKERS.md`](STRIKERS.md) — the only file in this repository that's append-only by tradition rather than by code.

No prize, no token. A spending-policy layer has enough of those jokes already.

## License

[Apache-2.0](./LICENSE) © 2026 Flashy Labs

---

Built by [Flashy Labs](https://flashyos.com), the mesh platform for organisations' agents. If something here is broken, unclear, or just interesting, [open an issue](https://github.com/FlashyLabs/wdk-policy-guard/issues) — we read them.
