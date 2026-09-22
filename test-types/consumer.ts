// Not run by `npm test` — this is a type-level smoke test, checked by
// `npm run test:types`. It imports the package exactly as a real TypeScript
// consumer would (through the package name, resolved to the built dist/
// declarations via this directory's tsconfig `paths`), so a change that
// breaks the published types breaks this file, not just the JS behaviour.
import { grade, validateEnvelope, DailyLedger, type Envelope } from '@flashylabs/wdk-policy-guard'
import { guardSend, PolicyDeniedError, PolicyEscalationRequiredError } from '@flashylabs/wdk-policy-guard/adapters/wdk'

const envelope: Envelope = {
  chain: 'evm:84532',
  kinds: ['transfer'],
  assets: ['native'],
  destinations: ['0xabc'],
  perTxMax: '1000',
  dailyMax: '5000',
  autoApproveMax: '100',
}

const problems: string[] = validateEnvelope(envelope)
void problems

const ledger = new DailyLedger()

const verdict = grade(envelope, {
  kind: 'transfer',
  chain: 'evm:84532',
  asset: 'native',
  amount: '50',
  destination: '0xabc',
}, ledger)

if (verdict.verdict === 'ALLOW') {
  ledger.reserve(envelope.chain, '50')
} else if (verdict.verdict === 'ESCALATE') {
  const impact: 'MEDIUM' | 'HIGH' | 'CRITICAL' = verdict.impact
  void impact
} else {
  const code: string = verdict.code
  const reason: string = verdict.reason
  void code
  void reason
}

// @ts-expect-error — perTxMax must be a string, not a number
const badEnvelope: Envelope = { ...envelope, perTxMax: 1000 }
void badEnvelope

// @ts-expect-error — envelope must be an Envelope, null, or undefined — never a number
grade(123, {})

const guarded = guardSend(
  async (spend: unknown) => ({ ok: true, spend }),
  { getEnvelope: () => envelope, ledger },
)
void guarded

const denied: PolicyDeniedError = new PolicyDeniedError('DENY', 'no')
const escalation: PolicyEscalationRequiredError = new PolicyEscalationRequiredError('MEDIUM')
void denied
void escalation
