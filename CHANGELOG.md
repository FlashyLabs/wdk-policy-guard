# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 0.1.0 — 2026-09-22

Initial public release.

- `grade()`, `validateEnvelope()`, `validateRecord()`, `DailyLedger` — the core policy engine, extracted from the envelope-grading layer built for Flashy Wallet's engine (`@flashy/wallet-engine`, internal), generalized to remove any Flashy- or WDK-specific coupling.
- `./adapters/wdk` entry point — `guardSend()`, `PolicyDeniedError`, `PolicyEscalationRequiredError`: a thin, dependency-free seam for wiring the policy engine in front of any async send function, WDK's included.
- 43 tests covering every reachable `DENY` code, every `ESCALATE` impact tier, `DailyLedger` isolation across chains and UTC-day boundaries, and `guardSend`'s reserve/release-on-failure behaviour.
- `wdk-policy-guard.manifest.json` — a generated, machine-readable statement of the verdicts, kinds, and denial codes this package emits.
