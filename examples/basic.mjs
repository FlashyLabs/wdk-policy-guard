// A runnable, end-to-end example: grading three spends against one
// envelope, then wiring guardSend() in front of a fake "wallet" send
// function (stand-in for a real WDK wallet's transfer method).
//
//   node examples/basic.mjs
import { grade, DailyLedger } from '../src/index.js'
import { guardSend, PolicyDeniedError, PolicyEscalationRequiredError } from '../src/adapters/wdk.js'

const envelope = {
  chain: 'evm:84532',
  kinds: ['transfer'],
  assets: ['native'],
  destinations: ['0xKnownVendor'],
  perTxMax: '1000',
  dailyMax: '2500',
  autoApproveMax: '200',
}

const ledger = new DailyLedger()

console.log('--- grade() directly ---')
for (const amount of ['50', '500', '5000']) {
  const spend = { kind: 'transfer', chain: 'evm:84532', asset: 'native', amount, destination: '0xKnownVendor' }
  const verdict = grade(envelope, spend, ledger)
  console.log(`amount=${amount} ->`, verdict)
}

console.log('\n--- guardSend() in front of a fake wallet ---')

async function fakeWalletTransfer(spend) {
  console.log('  (fake wallet would now sign and broadcast)', spend)
  return { txHash: '0x' + 'a'.repeat(64) }
}

const guardedTransfer = guardSend(fakeWalletTransfer, {
  getEnvelope: () => envelope,
  ledger: new DailyLedger(),
})

try {
  const result = await guardedTransfer({ kind: 'transfer', chain: 'evm:84532', asset: 'native', amount: '50', destination: '0xKnownVendor' })
  console.log('ALLOW -> sent:', result)
} catch (err) {
  console.log('refused:', err.message)
}

try {
  await guardedTransfer({ kind: 'transfer', chain: 'evm:84532', asset: 'native', amount: '500', destination: '0xKnownVendor' })
} catch (err) {
  if (err instanceof PolicyEscalationRequiredError) console.log(`ESCALATE -> impact=${err.impact}, ask a human`)
  else throw err
}

try {
  await guardedTransfer({ kind: 'transfer', chain: 'evm:84532', asset: 'native', amount: '5000', destination: '0xKnownVendor' })
} catch (err) {
  if (err instanceof PolicyDeniedError) console.log(`DENY -> ${err.code}: ${err.message}`)
  else throw err
}
