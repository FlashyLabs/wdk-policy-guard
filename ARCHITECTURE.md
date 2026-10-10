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

2. **A failed send releases its reservation — against the day it was booked to.** `reserve()` returns a receipt naming the UTC day; `release(receipt)` subtracts from that day and refuses to take any day below zero. Releasing by `(chain, amount)` alone keyed on the current day, so a send reserved at 23:50 and failed at 00:10 left the new day negative and its cap widened (external audit, reproduced and fixed 2026-10-10). If the underlying send throws (network error, chain rejection, anything), the amount that was reserved must not count against the day's budget — `guardSend()` handles this automatically; if you are not using it, call `ledger.release(chain, amount)` yourself in your own catch block.

### The single-process boundary — read this before you rely on the daily cap

The shipped `DailyLedger` is **in-memory and scoped to one process**, and the
race the design closes above is closed **only within that one process**. Its
state is a plain object on the heap: two Node processes, two workers, two pods,
or two devices each hold their own independent `DailyLedger`, and neither can
see the other's reservations. Grade the same agent's spends through two of them
concurrently and both read a daily budget that ignores the other — so the daily
cap can be exceeded by up to one process's worth of spend per process. The
per-transaction cap, the allowlists, and every other rule are stateless and
hold regardless; it is the `DAILY_CAP` rule alone, because it is the only rule
that reads accumulated state, whose guarantee is bounded by the ledger's reach.

The seam is deliberately three methods wide. `grade()` and `guardSend()` call
only `used(chain)`, `reserve(chain, amount)` and `release(chain, amount)` and
never anything else, so any object with that shape is a drop-in. For a
multi-process or multi-device deployment, back those three methods with a shared
store whose increment is atomic (a Redis `INCRBY`, a database row updated under
a transaction or a conditional write) — the atomicity of `reserve` is what
actually closes the cross-process race that the in-memory default cannot.

**Roadmap — Next: a persistent `DailyLedger`.** A shared, atomically-incremented
`DailyLedger` (Redis and a SQL-row reference implementation) that closes the
race across processes is the intended next addition. It is not shipped yet: the
interface for it — those three methods, with the same per-`(UTC day, chain)`
keying — is stable and documented above, but the persistent implementation is
the integrator's own until then. Until it ships, treat the built-in ledger's
daily cap as a **single-process** guarantee, and do not deploy the in-memory
default across replicas expecting the daily cap to hold between them.

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
