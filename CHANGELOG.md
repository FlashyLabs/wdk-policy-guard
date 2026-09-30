# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
