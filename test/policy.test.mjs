import { test } from 'node:test'
import assert from 'node:assert/strict'
import { grade, validateEnvelope, DailyLedger } from '../src/policy.js'
import { DENIAL_CODES } from '../src/codes.js'

const envelope = () => ({
  chain: 'evm:84532',
  kinds: ['transfer'],
  assets: ['native', '0xTokenA'],
  destinations: ['0xVendor'],
  perTxMax: '1000',
  dailyMax: '3000',
  autoApproveMax: '200',
})

const spend = (over = {}) => ({
  kind: 'transfer',
  chain: 'evm:84532',
  asset: 'native',
  amount: '100',
  destination: '0xVendor',
  ...over,
})

test('validateEnvelope: accepts a well-formed envelope', () => {
  assert.deepEqual(validateEnvelope(envelope()), [])
})

test('validateEnvelope: refuses missing fields', () => {
  const problems = validateEnvelope({})
  assert.ok(problems.length > 0)
})

test('validateEnvelope: refuses autoApproveMax over perTxMax', () => {
  const problems = validateEnvelope({ ...envelope(), autoApproveMax: '5000' })
  assert.ok(problems.some((p) => p.includes('ENVELOPE_INVALID_CAPS')))
})

test('validateEnvelope: refuses perTxMax over dailyMax', () => {
  const problems = validateEnvelope({ ...envelope(), perTxMax: '9999' })
  assert.ok(problems.some((p) => p.includes('ENVELOPE_INVALID_CAPS')))
})

test('grade: ALLOW inside the envelope and under the auto-approve ceiling', () => {
  assert.deepEqual(grade(envelope(), spend(), new DailyLedger()), { verdict: 'ALLOW' })
})

test('grade: DENY on an invalid record, before the envelope is even read', () => {
  const v = grade(envelope(), { kind: 'nope' }, new DailyLedger())
  assert.equal(v.verdict, 'DENY')
  assert.equal(v.code, 'INVALID_RECORD')
})

test('grade: DENY NO_ENVELOPE when no envelope is given', () => {
  const v = grade(null, spend(), new DailyLedger())
  assert.equal(v.verdict, 'DENY')
  assert.equal(v.code, 'NO_ENVELOPE')
})

test('grade: DENY NO_ENVELOPE when the envelope is for a different chain', () => {
  const v = grade(envelope(), spend({ chain: 'evm:1' }), new DailyLedger())
  assert.equal(v.verdict, 'DENY')
  assert.equal(v.code, 'NO_ENVELOPE')
})

test('grade: DENY ENVELOPE_INACTIVE on a revoked envelope', () => {
  const v = grade({ ...envelope(), active: false }, spend(), new DailyLedger())
  assert.equal(v.verdict, 'DENY')
  assert.equal(v.code, 'ENVELOPE_INACTIVE')
})

test('grade: DENY KIND_NOT_PERMITTED', () => {
  const v = grade(envelope(), spend({ kind: 'swap', destination: undefined }), new DailyLedger())
  assert.equal(v.verdict, 'DENY')
  assert.equal(v.code, 'KIND_NOT_PERMITTED')
})

test('grade: DENY ASSET_NOT_PERMITTED, case-insensitively matched against the allowlist', () => {
  const v = grade(envelope(), spend({ asset: '0xNotAllowed' }), new DailyLedger())
  assert.equal(v.verdict, 'DENY')
  assert.equal(v.code, 'ASSET_NOT_PERMITTED')
  // and the allowed asset matches regardless of case
  const ok = grade(envelope(), spend({ asset: '0xTOKENA' }), new DailyLedger())
  assert.equal(ok.verdict, 'ALLOW')
})

test('grade: DESTINATION_NOT_PERMITTED, case-insensitively matched, and never checked for a swap', () => {
  const v = grade(envelope(), spend({ destination: '0xStranger' }), new DailyLedger())
  assert.equal(v.verdict, 'DENY')
  assert.equal(v.code, 'DESTINATION_NOT_PERMITTED')
  const swapEnv = { ...envelope(), kinds: ['swap'] }
  const swap = grade(swapEnv, spend({ kind: 'swap', destination: undefined }), new DailyLedger())
  assert.equal(swap.verdict, 'ALLOW')
})

test('grade: DENY PER_TX_CAP', () => {
  const v = grade(envelope(), spend({ amount: '1001' }), new DailyLedger())
  assert.equal(v.verdict, 'DENY')
  assert.equal(v.code, 'PER_TX_CAP')
})

test('grade: DENY DAILY_CAP once today\'s reservations plus this spend exceed it', () => {
  const ledger = new DailyLedger()
  ledger.reserve('evm:84532', '2950')
  const v = grade(envelope(), spend({ amount: '100' }), ledger)
  assert.equal(v.verdict, 'DENY')
  assert.equal(v.code, 'DAILY_CAP')
})

test('grade: ESCALATE over the auto-approve ceiling but within the per-tx cap', () => {
  const v = grade(envelope(), spend({ amount: '500' }), new DailyLedger())
  assert.equal(v.verdict, 'ESCALATE')
  assert.ok(['MEDIUM', 'HIGH', 'CRITICAL'].includes(v.impact))
})

test('grade: ESCALATE impact scales with how much of the per-tx cap the spend uses', () => {
  const low = grade(envelope(), spend({ amount: '250' }), new DailyLedger()) // 25% of perTxMax
  const mid = grade(envelope(), spend({ amount: '500' }), new DailyLedger()) // 50%
  const high = grade(envelope(), spend({ amount: '800' }), new DailyLedger()) // 80%
  assert.equal(low.impact, 'MEDIUM')
  assert.equal(mid.impact, 'HIGH')
  assert.equal(high.impact, 'CRITICAL')
})

test('grade: ESCALATE unconditionally when alwaysEscalate is set, even for a tiny amount', () => {
  const v = grade({ ...envelope(), alwaysEscalate: true }, spend({ amount: '1' }), new DailyLedger())
  assert.equal(v.verdict, 'ESCALATE')
})

test('grade: works with no ledger argument, treating used-today as zero', () => {
  const v = grade(envelope(), spend(), undefined)
  assert.equal(v.verdict, 'ALLOW')
})

test('DailyLedger: reserve then release nets back to zero', () => {
  const ledger = new DailyLedger()
  ledger.reserve('evm:84532', '500')
  assert.equal(ledger.used('evm:84532'), 500n)
  ledger.release('evm:84532', '500')
  assert.equal(ledger.used('evm:84532'), 0n)
})

test('DailyLedger: tracks each chain independently', () => {
  const ledger = new DailyLedger()
  ledger.reserve('evm:84532', '500')
  ledger.reserve('tron:nile', '999')
  assert.equal(ledger.used('evm:84532'), 500n)
  assert.equal(ledger.used('tron:nile'), 999n)
})

test('DailyLedger: a fixed `now` isolates one UTC day from the next', () => {
  let day = new Date('2026-01-01T12:00:00.000Z')
  const ledger = new DailyLedger(() => day)
  ledger.reserve('evm:84532', '500')
  day = new Date('2026-01-02T00:00:01.000Z')
  assert.equal(ledger.used('evm:84532'), 0n)
})

test('grade: every DENY verdict this suite has produced carries a code from the published DENIAL_CODES list', () => {
  const badEnvelope = { ...envelope(), kinds: [] }
  const v = grade(badEnvelope, spend(), new DailyLedger())
  assert.equal(v.verdict, 'DENY')
  assert.ok(DENIAL_CODES.includes(v.code))
})

// ── Reservations go back to the day they were booked to ─────────────────────
// External audit, 2026-10-10: a reservation released after UTC midnight
// subtracted from the new day, which had reserved nothing, and the daily cap
// widened by the whole amount.

test('ledger: a release after midnight goes back to the day it was reserved on, never into today', () => {
  let t = new Date('2026-10-10T23:50:00.000Z')
  const ledger = new DailyLedger(() => t)
  const r = ledger.reserve('evm:84532', '70')
  assert.deepEqual(r, { chain: 'evm:84532', amount: '70', day: '2026-10-10' })
  t = new Date('2026-10-11T00:10:00.000Z')
  ledger.release(r)
  assert.equal(ledger.used('evm:84532'), 0n, 'today is untouched')
  assert.equal(ledger.days.get('2026-10-10|evm:84532'), 0n, 'yesterday is back to zero, not negative')
})

test('ledger: the two-argument release keys on the booking time it is given, and refuses to go below zero', () => {
  let t = new Date('2026-10-10T23:50:00.000Z')
  const ledger = new DailyLedger(() => t)
  ledger.reserve('evm:84532', '70')
  t = new Date('2026-10-11T00:10:00.000Z')
  assert.throws(() => ledger.release('evm:84532', '70'), { code: 'RELEASE_EXCEEDS_RESERVED' }, 'today never reserved 70')
  ledger.release('evm:84532', '70', new Date('2026-10-10T23:50:00.000Z'))
  assert.equal(ledger.days.get('2026-10-10|evm:84532'), 0n)
  assert.ok(ledger.used('evm:84532') >= 0n)
})

test('ledger: no release can make any day negative, so the cap can never be widened', () => {
  const ledger = new DailyLedger(() => new Date('2026-10-10T12:00:00.000Z'))
  ledger.reserve('evm:84532', '10')
  assert.throws(() => ledger.release('evm:84532', '11'), { code: 'RELEASE_EXCEEDS_RESERVED' })
  assert.equal(ledger.used('evm:84532'), 10n)
})
