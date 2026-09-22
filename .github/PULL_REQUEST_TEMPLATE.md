## What this changes

<!-- One or two sentences. If this touches grade()'s verdict logic, say exactly which case. -->

## Why

<!-- The real scenario this was written against, not just "improves X." -->

## Checklist

- [ ] `npm test` passes (`node --test`, no external services)
- [ ] `npm run check` passes (generated manifest is current — run `node src/manifest.js --write` if not)
- [ ] Every new `DENY` code or `ESCALATE` path has a direct test
- [ ] Amounts touched are strings end to end, never a JS `Number` (see `ARCHITECTURE.md`)
- [ ] README / `ARCHITECTURE.md` updated if this changes documented behaviour
