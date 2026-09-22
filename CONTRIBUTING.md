# Contributing

Thank you for looking. This package is small on purpose — most of what you need to know is enforced by tests rather than described here.

## Getting set up

```bash
npm install
npm test          # 43 tests, node's built-in test runner
npm run check     # confirms the generated manifest is current
```

No build step, no external services, no network access needed to develop or test this package.

## Before you open a pull request

- **`npm test` must pass.** Every exported function needs direct coverage — see `test/policy.test.mjs` for the shape the existing suite takes.
- **Amounts stay strings.** Never introduce a `Number` for an amount, cap, or anything compared against one — see `ARCHITECTURE.md`'s note on why. `INVALID_AMOUNT` exists to catch this at the boundary; a fix that works around it rather than through it will be asked to change.
- **A new `DENY` code updates three places together:** `src/codes.js`'s `DENIAL_CODES`, the table in `README.md`, and a test in `test/policy.test.mjs` that reaches it. `wdk-policy-guard.manifest.json` is generated from `src/codes.js` — run `npm run manifest` after changing it, never hand-edit the manifest.
- **No dependency on any wallet SDK in `src/` (excluding `src/adapters/`).** See `ARCHITECTURE.md#why-there-is-no-wdk-dependency` for why this boundary exists and stays enforced by review rather than by a test — a `package.json` `dependencies` field with zero entries is the actual guarantee.

## Reporting a bug

Open an issue with: the envelope, the spend record, and the verdict you got versus the verdict you expected. Because `grade()` is a pure function, every bug report should be reproducible as a single test case — include one if you can; it becomes the regression test.

## Security issues

Not here. See [`SECURITY.md`](SECURITY.md) — **security@flashy.network**, never a public issue.

## License

By contributing, you agree your contribution is licensed under this project's [Apache-2.0 license](LICENSE).
