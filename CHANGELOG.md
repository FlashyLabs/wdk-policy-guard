# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

**Added:** `INVARIANTS.md` — the three guarantees this layer makes about a spend it stands in front of (never over-reserve a day, never negative, deny and escalate never send), each citing the code that enforces it and the tests that prove it — and `vendor-invariants.mjs`, the estate's `invariants/1` harness vendored byte-for-byte from spec-kit (`test/vendor-invariants.test.mjs` reports drift, and UNKNOWN rather than a pass when spec-kit is not checked out beside this repository). `test/invariants.test.mjs` drives the real `guardSend` and `DailyLedger` through every ordered pair of send / failing send / escalate / deny, and of reserve / release / over-release, under seven schedules including two that cross UTC midnight; through seeded random command sequences with a send still in flight when the day changes; and through one deliberately broken variant per invariant that the harness must refuse — a guard with an `await` between its grade and its reservation, the 0.1.x release keyed on today, a guard that folds `ESCALATE` into allowed. The real component holds every one. `npm run invariants` checks the document against the suite and CI runs it. No behavioural change.

## 0.2.0 — 2026-10-10

**Fixed:** a reservation released after UTC midnight was subtracted from the new day, which had reserved nothing, leaving that day's usage negative and the daily cap widened by the whole amount (external audit finding, reproduced here: used = −70 after a 70 reserved at 23:50 and released at 00:10). `DailyLedger.reserve()` now returns a receipt `{ chain, amount, day }`; `release(receipt)` subtracts from the day it was booked to, and any release that would take a day below zero throws `ReleaseExceedsReservedError` (`RELEASE_EXCEEDS_RESERVED`). The two-argument `release(chain, amount)` is kept for same-day callers and takes an optional third `at` date. The WDK adapter's `guardSend` releases by receipt.

## 0.1.2 — 2026-09-23

Maintenance release. The git history available in this working tree is squashed
and does not record a distinct diff for either 0.1.1 or 0.1.2, so this entry
describes what the package contains as of 0.1.2 rather than inventing a
per-patch change; the date is the commit date of that content.

- The policy rules the README documents are also published as a **conformance
  corpus** — `conformance/policy-guard-1.json`, contract `policy-guard/1`: 44
  cases across five sets, 31 of them refusals, runnable against any executable
  in any language over one JSON object per line. Written from the documented
  rules rather than by running `grade()`, so it can surface a disagreement
  instead of agreeing with this implementation wherever it happens to be wrong.
  `npm run conformance` regenerates the bundle and `npm run conformance:check`
  fails if the committed copy has drifted.
- The suite stands at **57 tests** as of this release (measured, not
  remembered). `test/docs-figures.test.mjs` pins that figure and the documented
  package version to reality, so neither can silently drift again.

## 0.1.1 — release date not recorded

Maintenance release. No distinct changes are recorded for this version in the
available (squashed) history — see the note under 0.1.2. It is documented here
so the changelog carries no gap between 0.1.0 and 0.1.2.

## 0.1.0 — 2026-09-22

Initial public release.

- `grade()`, `validateEnvelope()`, `validateRecord()`, `DailyLedger` — the core policy engine, extracted from the envelope-grading layer built for Flashy Wallet's engine (`@flashy/wallet-engine`, internal), generalized to remove any Flashy- or WDK-specific coupling.
- `./adapters/wdk` entry point — `guardSend()`, `PolicyDeniedError`, `PolicyEscalationRequiredError`: a thin, dependency-free seam for wiring the policy engine in front of any async send function, WDK's included.
- A test suite covering every reachable `DENY` code, every `ESCALATE` impact tier, `DailyLedger` isolation across chains and UTC-day boundaries, and `guardSend`'s reserve/release-on-failure behaviour.
- `wdk-policy-guard.manifest.json` — a generated, machine-readable statement of the verdicts, kinds, and denial codes this package emits.
