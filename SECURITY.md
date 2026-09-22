# Security

## Threat model

This package holds no key, signs nothing, and makes no network call. Its entire job is a pure decision function: given an envelope, a candidate spend, and a ledger, return `ALLOW`, `ESCALATE`, or `DENY`. Its security surface is therefore narrow and specific:

- **A `DENY` that should have been an `ALLOW`** is an availability bug — annoying, not dangerous.
- **An `ALLOW` that should have been a `DENY` or `ESCALATE`** is the failure that matters: it means a spend outside the intended limits reached a signer. This is the class of bug every test in `test/policy.test.mjs` and `test/adapters.wdk.test.mjs` exists to catch.

This package assumes the caller has already authenticated and authorized *who* is asking to spend, and that the envelope handed to `grade()` is the correct one for that caller. It does not perform authentication, and an envelope constructed by an untrusted party is not something `grade()` can protect against — validate the envelope's provenance upstream.

## Known, deliberate limitations

- **`DailyLedger`'s default is in-memory and single-process.** In a multi-process or multi-device deployment without a shared, atomic ledger implementation, two processes can each observe a daily budget as not-yet-exhausted and both allow a spend that together exceed it. See `ARCHITECTURE.md`'s ledger section for the three-method contract a shared implementation must satisfy.
- **No replay protection.** `grade()` does not track spend identifiers — grading the same spend twice produces the same verdict twice, and (if you reserve after each) reserves the ledger twice. If your integration must guarantee a spend is graded and executed at most once, that idempotency key belongs in your own send path, alongside (not inside) this package.
- **Amount precision is bounded by BigInt, not by any protocol-specific limit.** This package will grade an amount of any size a `BigInt` can represent; it does not know or enforce a chain's actual token supply or transfer limits.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than as a public GitHub issue: email **security@flashy.network** with a description and, if possible, a minimal reproduction. We aim to acknowledge within 3 business days.

Do not include real credentials, private keys, or production data in a report — this package never needs them to reproduce a grading bug, since `grade()` takes only an envelope and a spend record, both of which can be constructed with placeholder values.
