# Architecture

## The three-verdict model

Every graded spend resolves to exactly one of:

- **ALLOW** — inside the envelope, under the auto-approve ceiling. Execute.
- **ESCALATE** — inside the envelope, over the ceiling (or the envelope demands it always). A human confirms before anything signs.
- **DENY** — outside the envelope. Refused with a code, nothing signs.

There is no fourth state and no partial verdict. A caller that only handles `ALLOW`/`DENY` and forgets `ESCALATE` will hit a visible, typed error (`PolicyEscalationRequiredError` from the `adapters/wdk` entry point) rather than silently falling through to one of the other two — the adapter throws on every non-`ALLOW` verdict specifically so a missed case fails loudly.

## Why amounts are strings, never numbers

`1e21` in base units (roughly 1000 tokens at 18 decimals) exceeds `Number.MAX_SAFE_INTEGER`. A cap compared with `>` on two JS numbers at that scale can silently accept an amount larger than the cap, because both sides have already lost precision before the comparison runs. Every amount in this package's public API — `perTxMax`, `dailyMax`, `autoApproveMax`, a spend's `amount` — is a base-10 integer string, converted to `BigInt` exactly once, at the point of comparison, and never round-tripped through a `Number`.

`validateRecord()` enforces the string-of-digits shape (`/^\d+$/`) before `grade()` does any arithmetic, so a caller that accidentally passes a JS number gets `INVALID_AMOUNT` rather than a silently-wrong comparison.

## The daily ledger

`DailyLedger` tracks reservations per `(UTC day, chain)` pair. Two properties matter:

1. **Reservation happens on `ALLOW`, not on send success.** `grade()` itself never writes to the ledger — it only reads `used()`. The caller (or `guardSend()`, in the WDK adapter) reserves immediately after `ALLOW`, before calling the underlying send. This closes a race: two spends graded back-to-back, both `ALLOW` against the same remaining daily budget, cannot both succeed if their combined amount would exceed the cap — the second grade() call sees the first spend's reservation already counted.

2. **A failed send releases its reservation.** If the underlying send throws (network error, chain rejection, anything), the amount that was reserved must not count against the day's budget — `guardSend()` handles this automatically; if you are not using it, call `ledger.release(chain, amount)` yourself in your own catch block.

The shipped `DailyLedger` is in-memory and scoped to one process. For a multi-process or multi-device deployment, implement the same three methods (`used(chain)`, `reserve(chain, amount)`, `release(chain, amount)`) against a shared store (Redis, a database row with an atomic increment) — `grade()` and `guardSend()` only ever call those three methods, never anything else, so any object with that shape works.

## Why there is no WDK dependency

The core of this package (`grade`, `validateEnvelope`, `DailyLedger`, `validateRecord`) has zero dependencies of any kind — not on `@tetherto/wdk`, not on any chain library, not on anything beyond its own `codes.js`. This is deliberate:

- **WDK's own API surface moves.** As of this package's first release, WDK's wallet and protocol modules are in beta (`1.0.0-beta.*`). A policy layer that imports WDK types directly breaks every time WDK does, for reasons that have nothing to do with spending policy.
- **The problem is not WDK-specific.** Grading a transfer against a per-agent envelope is exactly as useful in front of a non-WDK wallet SDK, a custom signer, or a mock used in tests. Coupling the grading logic to one SDK would have made it useful to fewer people for no benefit to any of them.

The optional `./adapters/wdk` entry point exists to make wiring this in front of a real send function concrete and easy — but even that file imports nothing from `@tetherto/*`. It wraps *any* async function shaped `(spend) => Promise<result>`, and the two-line `toRecord` option is where you adapt your specific wallet's spend shape (WDK's or otherwise) to this package's record shape.

## Case-insensitive matching, and why

Asset and destination addresses are matched against the envelope's allowlists after lower-casing both sides. EVM addresses are checksummed by convention but not by requirement — `0xAbC...` and `0xabc...` refer to the same address — and an envelope allowlist that only matched one case would fail closed on a perfectly valid spend whose caller happened to checksum differently. Chain identifiers and kinds are matched exactly (case-sensitive), because those are this package's own closed vocabularies (`KINDS`), not addresses with an external casing convention.

## What this package does not do

- It does not sign anything, hold a key, or call a network. It is a pure function over data you provide.
- It does not decide *who* may set or revoke an envelope — that is an authorization question for your own application, upstream of this package.
- It does not persist anything on its own. `DailyLedger`'s default is in-memory; persistence is the integrator's choice, per the section above.
