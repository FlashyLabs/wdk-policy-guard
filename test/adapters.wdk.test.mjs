import { test } from 'node:test'
import assert from 'node:assert/strict'
import { guardSend, PolicyDeniedError, PolicyEscalationRequiredError, DailyLedger } from '../src/adapters/wdk.js'

const envelope = () => ({
  chain: 'evm:84532',
  kinds: ['transfer'],
  assets: ['native'],
  destinations: ['0xVendor'],
  perTxMax: '1000',
  dailyMax: '2000',
  autoApproveMax: '500',
})

const spend = (over = {}) => ({ kind: 'transfer', chain: 'evm:84532', asset: 'native', amount: '100', destination: '0xVendor', ...over })

test('guardSend: calls through on ALLOW and returns the underlying result', async () => {
  const ledger = new DailyLedger()
  const calls = []
  const send = async (s) => { calls.push(s); return { txHash: '0xabc' } }
  const guarded = guardSend(send, { getEnvelope: envelope, ledger })
  const result = await guarded(spend())
  assert.deepEqual(result, { txHash: '0xabc' })
  assert.equal(calls.length, 1)
})

test('guardSend: reserves the daily ledger on ALLOW before calling send', async () => {
  const ledger = new DailyLedger()
  let usedDuringSend = null
  const send = async () => { usedDuringSend = ledger.used('evm:84532'); return {} }
  const guarded = guardSend(send, { getEnvelope: envelope, ledger })
  await guarded(spend({ amount: '100' }))
  assert.equal(usedDuringSend, 100n)
})

test('guardSend: releases the reservation if send throws', async () => {
  const ledger = new DailyLedger()
  const send = async () => { throw new Error('network down') }
  const guarded = guardSend(send, { getEnvelope: envelope, ledger })
  await assert.rejects(() => guarded(spend({ amount: '100' })), /network down/)
  assert.equal(ledger.used('evm:84532'), 0n)
})

test('guardSend: throws PolicyDeniedError on DENY and never calls send', async () => {
  const ledger = new DailyLedger()
  let called = false
  const send = async () => { called = true; return {} }
  const guarded = guardSend(send, { getEnvelope: envelope, ledger })
  await assert.rejects(() => guarded(spend({ amount: '99999' })), PolicyDeniedError)
  assert.equal(called, false)
  assert.equal(ledger.used('evm:84532'), 0n)
})

test('guardSend: throws PolicyEscalationRequiredError on ESCALATE and never calls send', async () => {
  const ledger = new DailyLedger()
  let called = false
  const send = async () => { called = true; return {} }
  const guarded = guardSend(send, { getEnvelope: envelope, ledger })
  await assert.rejects(() => guarded(spend({ amount: '900' })), PolicyEscalationRequiredError)
  assert.equal(called, false)
})

test('guardSend: getEnvelope is called fresh on every send, so a revoke takes effect immediately', async () => {
  const ledger = new DailyLedger()
  let active = true
  const getEnvelope = () => ({ ...envelope(), active })
  const send = async () => ({})
  const guarded = guardSend(send, { getEnvelope, ledger })
  await guarded(spend()) // ALLOW while active
  active = false
  await assert.rejects(() => guarded(spend()), PolicyDeniedError)
})

test('guardSend: toRecord adapts a caller-shaped spend into the policy record shape', async () => {
  const ledger = new DailyLedger()
  const send = async () => ({})
  const guarded = guardSend(send, {
    getEnvelope: envelope,
    ledger,
    toRecord: (callerSpend) => ({
      kind: 'transfer',
      chain: callerSpend.network,
      asset: 'native',
      amount: callerSpend.value,
      destination: callerSpend.to,
    }),
  })
  await assert.doesNotReject(() => guarded({ network: 'evm:84532', value: '100', to: '0xVendor' }))
})

test('PolicyEscalationRequiredError carries the impact tier', async () => {
  const ledger = new DailyLedger()
  const guarded = guardSend(async () => ({}), { getEnvelope: envelope, ledger })
  try {
    await guarded(spend({ amount: '900' }))
    assert.fail('expected an escalation')
  } catch (err) {
    assert.ok(err instanceof PolicyEscalationRequiredError)
    assert.equal(err.impact, 'CRITICAL')
  }
})
