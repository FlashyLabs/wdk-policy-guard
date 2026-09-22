---
name: Bug report
about: Something in wdk-policy-guard doesn't do what it says
title: ''
labels: bug
assignees: ''
---

**What happened**

A clear description of what you expected `grade()` (or `guardSend()`) to return, and what it actually returned.

**Minimal reproduction**

```js
import { grade, DailyLedger } from '@flashy/wdk-policy-guard'

const envelope = { /* ... */ }
const record = { /* ... */ }
const ledger = new DailyLedger()

const verdict = grade(envelope, record, ledger)
// expected: ...
// actual: ...
```

The smaller this is, the faster it gets fixed. If you can trim it to one `grade()` call, do.

**Package version**

Output of `npm ls @flashy/wdk-policy-guard`.

**Environment**

Node version (`node -v`), and whether you're calling `grade()` directly or through `./adapters/wdk`.
