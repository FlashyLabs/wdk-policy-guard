import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateRecord } from '../src/record.js'

const base = { kind: 'transfer', chain: 'evm:84532', asset: 'native', amount: '1000', destination: '0xabc' }

test('accepts a well-formed transfer', () => {
  const r = validateRecord(base)
  assert.equal(r.ok, true)
  assert.deepEqual(r.record, base)
})

test('accepts a swap with no destination', () => {
  const r = validateRecord({ ...base, kind: 'swap', destination: undefined })
  assert.equal(r.ok, true)
  assert.equal(r.record.destination, null)
})

test('refuses a swap that names a destination', () => {
  const r = validateRecord({ ...base, kind: 'swap' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'INVALID_RECORD')
})

test('refuses an unknown kind', () => {
  const r = validateRecord({ ...base, kind: 'mint' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'INVALID_RECORD')
})

test('refuses a malformed chain', () => {
  for (const chain of ['evm', 'EVM:84532', '', 84532, null]) {
    const r = validateRecord({ ...base, chain })
    assert.equal(r.ok, false, `expected ${JSON.stringify(chain)} to be refused`)
    assert.equal(r.code, 'INVALID_RECORD')
  }
})

test('refuses a non-string, empty, or non-integer amount', () => {
  for (const amount of ['1.5', '-1', '', 1000, null, '0x10']) {
    const r = validateRecord({ ...base, amount })
    assert.equal(r.ok, false, `expected ${JSON.stringify(amount)} to be refused`)
    assert.equal(r.code, 'INVALID_AMOUNT')
  }
})

test('accepts a zero amount — zero is a valid non-negative integer', () => {
  const r = validateRecord({ ...base, amount: '0' })
  assert.equal(r.ok, true)
})

test('refuses a transfer missing its destination', () => {
  const r = validateRecord({ ...base, destination: undefined })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'INVALID_RECORD')
})

test('refuses a missing or non-string asset', () => {
  for (const asset of [undefined, '', 5]) {
    const r = validateRecord({ ...base, asset })
    assert.equal(r.ok, false)
    assert.equal(r.code, 'INVALID_RECORD')
  }
})

test('refuses a non-object input', () => {
  for (const input of [null, undefined, 'x', 5, []]) {
    const r = validateRecord(input)
    assert.equal(r.ok, false)
    assert.equal(r.code, 'INVALID_RECORD')
  }
})
