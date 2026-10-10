# Invariants — `@flashylabs/wdk-policy-guard`

What this component guarantees about a spend it stands in front of, each
enforced by a named piece of code and proved by a named test. The document is
itself checked: `node vendor-invariants.mjs check .` (the estate's
`invariants/1` harness, vendored byte-for-byte from spec-kit) fails when a
heading, a part or a citation below is missing, or when a citation names a
test that does not exist in `test/`. `test/invariants.test.mjs` drives the real
`guardSend` and `DailyLedger` through every ordered pair of operations under
every schedule — two of them across UTC midnight — through random command
sequences with a send still in flight when the day changes, and, for each
invariant, through a deliberately broken variant the harness must refuse. A
harness that has never failed has proved nothing.

The daily cap is the one rule here that reads accumulated state, and it is the
one that broke for a pair: a reservation booked at 23:50 and released at 00:10
came off a day that had reserved nothing (external audit, fixed at 0.2.0). The
guarantees below are scoped the way `ARCHITECTURE.md` scopes the ledger — to
one process, the reach of the in-memory `DailyLedger`.

## I-1 · Never over-reserve a day

**Claim.** The amount reserved against any one UTC day, per chain, never exceeds
the envelope's `dailyMax`, under any interleaving of sends through `guardSend`
(or of `grade`-then-`reserve` through a caller that follows the same rule).

**Why.** A daily cap that two concurrent sends can both pass is a cap on
nothing. Two sends of 60 against a cap of 100 must admit exactly one, whichever
started first and however the two are interleaved.

**Enforced by.** `guardSend` (`src/adapters/wdk.js`) grades and reserves in one
synchronous step: `grade()` reads `ledger.used(chain)` and `ledger.reserve()`
writes it with no `await` between them, so the second send's grade sees the
first's reservation. `grade()` refuses `DAILY_CAP` when
`used + amount > dailyMax`, comparing `BigInt`s, never floats.

**Proved by.** `test/adapters.wdk.test.mjs` › *guardSend: reserves the daily ledger on ALLOW before calling send*;
`test/invariants.test.mjs` › *interleave: every pair of send, failing send, escalate and deny through guardSend holds every invariant under every schedule, across midnight too*,
› *interleave: two allowed sends that together exceed the day admit exactly one in every schedule*,
› *property: random send / failing send / in-flight-at-midnight send / tick sequences hold every invariant (seeded, so a failure replays)*,
and the mutation check › *mutation: a guard with an await between the grade and the reservation lets two sends over-reserve the day, and the harness sees it in exactly the started-together schedules*.

## I-2 · Never negative

**Claim.** A release lands on the day its reservation was booked to — never on
the day the release happens — and no day's usage is ever below zero. Releasing
more than a day has reserved is refused with `ReleaseExceedsReservedError`
(`RELEASE_EXCEEDS_RESERVED`) and changes nothing. Every day holds exactly the
sum of the reservations booked to it that have not been released.

**Why.** Before 0.2.0 `release(chain, amount)` subtracted from today. A send
reserved at 23:50 that failed at 00:10 left the new day at −70, and its cap
widened by the whole amount — a negative figure is a cap nobody set.

**Enforced by.** `DailyLedger.reserve()` (`src/policy.js`) returns a receipt
`{ chain, amount, day }`; `release(receipt)` subtracts from `receipt.day` and
throws `ReleaseExceedsReservedError` when the amount exceeds what that day
holds, before writing. `guardSend` keeps the receipt and releases by it when
the wrapped send throws.

**Proved by.** `test/policy.test.mjs` › *ledger: a release after midnight goes back to the day it was reserved on, never into today*,
› *ledger: the two-argument release keys on the booking time it is given, and refuses to go below zero*
and › *ledger: no release can make any day negative, so the cap can never be widened*;
`test/adapters.wdk.test.mjs` › *guardSend: releases the reservation if send throws*;
`test/invariants.test.mjs` › *interleave: every pair of reserve, release and over-release on the ledger lands on the booked day and never below zero, across midnight too*,
the mutation check › *mutation: a release keyed on today drives the new day negative, and the harness sees it in exactly the two schedules that cross midnight*,
and › *mutation: property() finds the today-keyed release behind guardSend from random sequences and shrinks it to a send in flight at midnight, then the tick*.

## I-3 · Deny and escalate never send

**Claim.** The wrapped send is called only on `ALLOW` — exactly once per call
the policy did not refuse, and never for a spend that grades `DENY` or
`ESCALATE`. A refused call reserves nothing.

**Why.** `ESCALATE` means a human is asked before anything is signed; an
implementation that folds it into "allowed" signs what a person was meant to
see. A `DENY` that still reached the chain would make the envelope decorative.

**Enforced by.** `guardSend` throws `PolicyDeniedError` on `DENY` and
`PolicyEscalationRequiredError` on `ESCALATE` before it reserves and before it
calls `send`; only the `ALLOW` branch reaches either. `grade()` returns exactly
one of the three verdicts (`VERDICTS`), so there is no fourth path.

**Proved by.** `test/adapters.wdk.test.mjs` › *guardSend: throws PolicyDeniedError on DENY and never calls send*,
› *guardSend: throws PolicyEscalationRequiredError on ESCALATE and never calls send*
and › *guardSend: calls through on ALLOW and returns the underlying result*;
`test/invariants.test.mjs` › *interleave: every pair of send, failing send, escalate and deny through guardSend holds every invariant under every schedule, across midnight too*
and the mutation check › *mutation: a guard that folds ESCALATE into allowed calls the wrapped send for a spend a person was meant to see, and the harness sees it in every schedule*.
