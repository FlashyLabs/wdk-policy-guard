// The invariants in INVARIANTS.md, driven against the REAL guardSend and
// DailyLedger with the estate's invariants/1 harness (vendor-invariants.mjs):
//
//   interleave()      every ordered pair of send / failing send / escalate /
//                     deny through guardSend, and of reserve / release /
//                     over-release on the ledger, under every schedule —
//                     including two that cross UTC midnight;
//   property()        random command sequences with a day-long tick, a send
//                     that is still in flight when midnight passes, shrunk
//                     to the fewest commands on failure;
//   expectViolation() one deliberately broken variant per invariant, which
//                     the harness MUST refuse — a harness that has never
//                     failed has proved nothing.
//
// The wrapped send is a recording function and the clock is injectable (the
// `now` DailyLedger already takes). The harness keeps its own book of what
// was booked to which day and how each call ended, so no invariant trusts a
// figure the ledger wrote about itself.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { property, interleave, expectViolation, checkInvariantsDoc } from '../vendor-invariants.mjs'
import { grade, DailyLedger } from '../src/policy.js'
import { guardSend, PolicyDeniedError, PolicyEscalationRequiredError } from '../src/adapters/wdk.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DAY = 86_400_000
const LATE = Date.parse('2026-10-10T23:50:00.000Z') // ten minutes before midnight UTC
const CHAIN = 'evm:84532'
const ENVELOPE = Object.freeze({ chain: CHAIN, kinds: ['transfer'], assets: ['native'], destinations: ['0xVendor'], perTxMax: '80', dailyMax: '100', autoApproveMax: '60' })
const CAP = BigInt(ENVELOPE.dailyMax)

const spend = (amount, over = {}) => ({ kind: 'transfer', chain: CHAIN, asset: 'native', amount, destination: '0xVendor', ...over })
const dayOf = (sys) => DailyLedger.dayKey(sys.now())
const chainDays = (ledger) => [...ledger.days].filter(([k]) => k.endsWith(`|${CHAIN}`)).map(([k, v]) => [k.slice(0, 10), v])

// ── the system under test: the guard in front of a recording send ───────────
function build({ guard = guardSend, Ledger = DailyLedger } = {}) {
  const sys = { t: LATE, sent: [], log: [], seq: 0, gate: [], inflight: [] }
  sys.now = () => new Date(sys.t)
  sys.ledger = new Ledger(sys.now)
  // The wrapped send records every call it receives. A spend marked `fail` is
  // rejected by the chain — at once, or only once the clock has ticked, which
  // is a send still in flight when midnight passes.
  const send = async (s) => {
    sys.sent.push(s)
    if (s.fail === 'at-next-tick') await new Promise((res) => sys.gate.push(res))
    else if (s.fail) await new Promise((res) => setTimeout(res, 0))
    if (s.fail) throw new Error('rejected by the chain')
    return { txHash: `0x${s.id}` }
  }
  sys.guarded = guard(send, { getEnvelope: () => ENVELOPE, ledger: sys.ledger })
  return sys
}

// Every call through the guard is booked with the UTC day it was made on and
// how it ended: ok, refused by the policy, or failed at the chain.
function call(sys, s) {
  const id = ++sys.seq
  const entry = { id, day: dayOf(sys), amount: s.amount, outcome: 'inflight' }
  sys.log.push(entry)
  const p = sys.guarded({ ...s, id }).then(
    (v) => { entry.outcome = 'ok'; return v },
    (err) => {
      entry.outcome = err instanceof PolicyDeniedError || err instanceof PolicyEscalationRequiredError ? 'refused' : 'send-failed'
      entry.code = err.code ?? err.name
      throw err
    },
  )
  if (s.fail !== 'at-next-tick') return p
  sys.inflight.push(p.catch(() => {}))
  return 'in flight until the next tick'
}

const OPS = [
  { name: 'send', run: (sys) => call(sys, spend('60')) }, // ALLOW; two of them exceed the day
  { name: 'fail', run: (sys) => call(sys, spend('60', { fail: true })) }, // ALLOW, then the chain rejects — released
  { name: 'escalate', run: (sys) => call(sys, spend('70')) }, // over autoApproveMax, within perTxMax
  { name: 'deny', run: (sys) => call(sys, spend('90')) }, // over perTxMax
]
// Midnight passes; a send that was waiting on the chain now fails, and the
// harness waits for every such send to settle before anything is checked.
const tick = async (sys) => {
  sys.t += DAY
  for (const res of sys.gate.splice(0)) res()
  await Promise.allSettled(sys.inflight.splice(0))
}

// ── the invariants ──────────────────────────────────────────────────────────

/** I-1: no UTC day's usage exceeds the daily cap. */
function neverOverReserveDay(sys) {
  return chainDays(sys.ledger).filter(([, v]) => v > CAP).map(([d, v]) => `I-1: ${v} reserved on ${d} against a daily cap of ${CAP}`)
}

/** I-2: no day is negative, and every day holds exactly the sends booked to it that did not fail. */
function neverNegative(sys) {
  const out = []
  const expected = new Map()
  for (const e of sys.log) if (e.outcome === 'ok' || e.outcome === 'inflight') expected.set(e.day, (expected.get(e.day) ?? 0n) + BigInt(e.amount))
  const days = new Set([...expected.keys(), ...chainDays(sys.ledger).map(([d]) => d)])
  for (const d of [...days].sort()) {
    const have = sys.ledger.days.get(`${d}|${CHAIN}`) ?? 0n
    const want = expected.get(d) ?? 0n
    if (have < 0n) out.push(`I-2: ${d} is negative: ${have}`)
    else if (have !== want) out.push(`I-2: ${d} holds ${have}; the sends booked to it that did not fail total ${want}`)
  }
  return out
}

/** I-3: the wrapped send is called exactly once per call the policy did not refuse, and never for a spend that grades DENY or ESCALATE. */
function refusalsNeverSend(sys) {
  const out = []
  for (const e of sys.log) {
    const calls = sys.sent.filter((s) => s.id === e.id).length
    if (e.outcome === 'refused' && calls) out.push(`I-3: call ${e.id} (${e.amount}) was refused ${e.code} and the wrapped send was still called`)
    if (e.outcome !== 'refused' && calls !== 1) out.push(`I-3: call ${e.id} reached the wrapped send ${calls} times`)
  }
  for (const s of sys.sent) {
    const v = grade(ENVELOPE, s) // stateless: every rule but the daily cap
    if (v.verdict !== 'ALLOW') out.push(`I-3: the wrapped send was called for a spend of ${s.amount} that grades ${v.verdict}${v.code ? ` ${v.code}` : ''}`)
  }
  return out
}

const all = (sys) => [...neverOverReserveDay(sys), ...neverNegative(sys), ...refusalsNeverSend(sys)]

// ── the ledger on its own: reserve, release, release what was never reserved ─
function buildLedger(Ledger = DailyLedger) {
  const sys = { t: LATE, receipts: [], booked: new Map() }
  sys.now = () => new Date(sys.t)
  sys.ledger = new Ledger(sys.now)
  return sys
}
const LEDGER_OPS = [
  { name: 'reserve', run: async (sys) => { const r = sys.ledger.reserve(CHAIN, '40'); sys.receipts.push(r); sys.booked.set(r.day, (sys.booked.get(r.day) ?? 0n) + 40n); return r } },
  { name: 'release', run: async (sys) => { const r = sys.receipts.shift(); if (!r) return 'nothing to release'; sys.ledger.release(r); sys.booked.set(r.day, sys.booked.get(r.day) - 40n); return r } },
  { name: 'over-release', run: async (sys) => sys.ledger.release({ chain: CHAIN, amount: '999', day: dayOf(sys) }) }, // never reserved: must be refused
]
const ledgerTick = async (sys) => { sys.t += DAY }

/** I-2 at the ledger: every day holds exactly what the receipts still outstanding were booked to it, and nothing is negative. */
function ledgerMatchesBookings(sys) {
  const out = []
  const days = new Set([...sys.booked.keys(), ...chainDays(sys.ledger).map(([d]) => d)])
  for (const d of [...days].sort()) {
    const have = sys.ledger.days.get(`${d}|${CHAIN}`) ?? 0n
    const want = sys.booked.get(d) ?? 0n
    if (have < 0n) out.push(`I-2: ${d} is negative: ${have}`)
    else if (have !== want) out.push(`I-2: ${d} holds ${have}; outstanding receipts booked to it total ${want}`)
  }
  return out
}

// ── the real component, every pair, every schedule ──────────────────────────

test('interleave: every pair of send, failing send, escalate and deny through guardSend holds every invariant under every schedule, across midnight too', async () => {
  const r = await interleave({ setup: build, ops: OPS, invariants: all, tick })
  assert.equal(r.pairs, 16, 'four ops, every ordered pair, self-pairs included')
  assert.equal(r.schedules, 112, 'seven schedules per pair — five, plus two across midnight')
})

test('interleave: two allowed sends that together exceed the day admit exactly one in every schedule', async () => {
  await interleave({
    setup: build,
    ops: OPS,
    pairs: [['send', 'send']],
    invariants: (sys, { results }) => {
      const out = all(sys)
      const oks = results.filter((x) => x.ok).length
      const denied = results.filter((x) => !x.ok && /DAILY_CAP/.test(x.error)).length
      if (oks !== 1 || denied !== 1) out.push(`expected one ALLOW and one DAILY_CAP, got ${JSON.stringify(results)}`)
      return out
    },
  })
})

test('interleave: every pair of reserve, release and over-release on the ledger lands on the booked day and never below zero, across midnight too', async () => {
  const r = await interleave({ setup: () => buildLedger(), ops: LEDGER_OPS, invariants: ledgerMatchesBookings, tick: ledgerTick })
  assert.equal(r.schedules, 63, 'nine pairs, seven schedules each')
})

// ── the real component, random sequences across midnight ────────────────────

const COMMANDS = [
  { name: 'send', gen: (r) => ({ amount: r.pick(['60', '40', '70', '90']), destination: r.bool(0.15) ? '0xStranger' : '0xVendor' }), run: (sys, { amount, destination }) => call(sys, spend(amount, { destination })) },
  { name: 'fail', gen: () => ({}), run: (sys) => call(sys, spend('60', { fail: true })) },
  { name: 'fail-later', gen: () => ({}), run: (sys) => call(sys, spend('60', { fail: 'at-next-tick' })) },
]

test('property: random send / failing send / in-flight-at-midnight send / tick sequences hold every invariant (seeded, so a failure replays)', async () => {
  const r = await property({ setup: () => build(), commands: COMMANDS, invariants: all, tick, runs: 150, maxLen: 10, seed: 20261010 })
  assert.equal(r.runs, 150)
  assert.ok(r.commands > 500, `the runs were cut short: ${r.commands} commands`)
})

// ── the mutation checks: one broken variant per invariant ───────────────────
// Each variant is the component with one guard removed. The harness must
// refuse every one of them, or a green run above means nothing.

// The adapter re-typed with a fault: `gap` puts an await between the grade
// and the reservation — the shape of every defect the audits found, a check
// and a write either side of a yield; `fold` treats ESCALATE as allowed — the
// failure the conformance corpus names, signing what a person was meant to see.
function guardVariant({ gap = false, fold = false }) {
  return (send, { getEnvelope, ledger, toRecord = (s) => s }) => async (spendIn) => {
    const record = toRecord(spendIn)
    const verdict = grade(getEnvelope(), record, ledger)
    if (verdict.verdict === 'DENY') throw new PolicyDeniedError(verdict.code, verdict.reason)
    if (verdict.verdict === 'ESCALATE' && !fold) throw new PolicyEscalationRequiredError(verdict.impact)
    if (gap) await Promise.resolve()
    const reservation = ledger.reserve(record.chain, record.amount)
    try { return await send(spendIn) } catch (err) { ledger.release(reservation); throw err }
  }
}

// The 0.1.x release: by chain and amount, against whatever day it is now, with no floor.
class TodayKeyedLedger extends DailyLedger {
  release(r) {
    const k = `${DailyLedger.dayKey(this.now())}|${r.chain}`
    this.days.set(k, (this.days.get(k) ?? 0n) - BigInt(r.amount))
  }
}

test('mutation: a guard with an await between the grade and the reservation lets two sends over-reserve the day, and the harness sees it in exactly the started-together schedules', async () => {
  const err = await expectViolation(
    () => interleave({ setup: () => build({ guard: guardVariant({ gap: true }) }), ops: OPS, pairs: [['send', 'send']], invariants: neverOverReserveDay }),
    { match: /I-1: 120 reserved on 2026-10-10 against a daily cap of 100/ },
  )
  assert.deepEqual(err.failures.map((f) => f.pattern).sort(), ['a||b', 'b||a'], 'sequential and yielded schedules pass; both started-together schedules over-reserve')
})

test('mutation: a release keyed on today drives the new day negative, and the harness sees it in exactly the two schedules that cross midnight', async () => {
  const err = await expectViolation(
    () => interleave({ setup: () => buildLedger(TodayKeyedLedger), ops: LEDGER_OPS, pairs: [['reserve', 'release']], invariants: ledgerMatchesBookings, tick: ledgerTick }),
    { match: /I-2: 2026-10-11 is negative: -40/ },
  )
  assert.deepEqual(err.failures.map((f) => f.pattern).sort(), ['a;T;b', 'a||T||b'])
  assert.ok(err.failures.every((f) => /2026-10-10 holds 40; outstanding receipts booked to it total 0/.test(f.violations.join())), 'and the day it was booked to is never released')
})

test('mutation: property() finds the today-keyed release behind guardSend from random sequences and shrinks it to a send in flight at midnight, then the tick', async () => {
  const err = await expectViolation(
    () => property({ setup: () => build({ Ledger: TodayKeyedLedger }), commands: COMMANDS, invariants: neverNegative, tick, runs: 100, maxLen: 8, seed: 5 }),
    { match: /I-2: 2026-10-11 is negative: -60/ },
  )
  assert.deepEqual(err.sequence.map((s) => s.name), ['fail-later', 'tick'], 'the minimal failing sequence is the defect itself')
  assert.equal(err.seed, 5)
})

test('mutation: a guard that folds ESCALATE into allowed calls the wrapped send for a spend a person was meant to see, and the harness sees it in every schedule', async () => {
  const err = await expectViolation(
    () => interleave({ setup: () => build({ guard: guardVariant({ fold: true }) }), ops: OPS, pairs: [['escalate', 'escalate']], invariants: refusalsNeverSend }),
    { match: /I-3: the wrapped send was called for a spend of 70 that grades ESCALATE/ },
  )
  assert.equal(err.failures.length, 5, 'this is not a race: every schedule fails')
})

// ── the document ────────────────────────────────────────────────────────────

test('INVARIANTS.md holds: numbered from I-1 without a gap, four parts each, and every cited test exists verbatim in the suite', () => {
  const doc = readFileSync(join(ROOT, 'INVARIANTS.md'), 'utf8')
  const sources = readdirSync(join(ROOT, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => readFileSync(join(ROOT, 'test', f), 'utf8')).join('\n')
  const r = checkInvariantsDoc(doc, sources)
  assert.deepEqual(r.problems, [])
  assert.equal(r.valid, true)
  assert.deepEqual(r.invariants.map((i) => i.id), ['I-1', 'I-2', 'I-3'])
  assert.ok(r.citations.length >= 9, `${r.citations.length} citations`)
})
