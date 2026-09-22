// A thin seam in front of any wallet's send path — WDK's included.
//
// This package has no dependency on @tetherto/wdk and never will: WDK's own
// API surface moves (it is in beta as of this package's first release), and
// coupling a policy layer to one SDK's method names is how the policy layer
// breaks on somebody else's upgrade. Instead, guardWdkSend() wraps whatever
// async function actually sends — a WDK wallet's method, a different SDK's,
// your own — and the only contract is: it takes a spend-shaped argument and
// returns a promise.
//
// Adjust the two names in `unwrap`/`toSpend` below to match the exact shape
// your WDK wallet instance's send method takes; the grading logic itself
// (policy.js) never changes.
import { grade } from '../policy.js'

/**
 * @typedef {import('../policy.js').Envelope} Envelope
 */

export class PolicyDeniedError extends Error {
  /** @param {string} code @param {string} reason */
  constructor(code, reason) {
    super(`${code}: ${reason}`)
    this.name = 'PolicyDeniedError'
    this.code = code
  }
}

export class PolicyEscalationRequiredError extends Error {
  /** @param {'MEDIUM'|'HIGH'|'CRITICAL'} impact */
  constructor(impact) {
    super(`spend requires confirmation (impact: ${impact})`)
    this.name = 'PolicyEscalationRequiredError'
    this.impact = impact
  }
}

/**
 * Wraps an async send function with a grade() check. The wrapped function is
 * called only on ALLOW; ESCALATE and DENY both throw before it runs, so a
 * caller that forgets to check a return value still cannot double-spend past
 * the policy by accident.
 *
 * @param {(spend: unknown) => Promise<unknown>} send  the underlying wallet call — e.g. a WDK wallet's transfer/send method, already bound to its account
 * @param {object} opts
 * @param {() => Envelope|null|undefined} opts.getEnvelope  read the current envelope for this caller/chain; called fresh on every send so a revoked or edited envelope takes effect immediately
 * @param {import('../policy.js').DailyLedger} opts.ledger
 * @param {(spend: unknown) => unknown} [opts.toRecord]  adapt the caller's spend shape to policy.js's record shape, if they differ. Identity by default.
 * @returns {(spend: unknown) => Promise<unknown>}
 */
export function guardSend(send, { getEnvelope, ledger, toRecord = (s) => s }) {
  return async (spend) => {
    const record = toRecord(spend)
    const verdict = grade(getEnvelope(), record, ledger)
    if (verdict.verdict === 'DENY') throw new PolicyDeniedError(verdict.code, verdict.reason)
    if (verdict.verdict === 'ESCALATE') throw new PolicyEscalationRequiredError(verdict.impact)
    // ALLOW: reserve before sending, release on failure — a send that
    // throws must not have spent the daily cap it never used.
    const r = /** @type {{chain: string, amount: string}} */ (record)
    ledger.reserve(r.chain, r.amount)
    try {
      return await send(spend)
    } catch (err) {
      ledger.release(r.chain, r.amount)
      throw err
    }
  }
}

/**
 * The escalation path: call this from wherever your app shows a
 * confirmation UI once a human has approved it, then retry the original
 * send outside guardSend() (or through a second guard whose envelope's
 * `autoApproveMax` you temporarily treat as satisfied) — this package does
 * not prescribe a UI, only the verdict that tells you one is needed.
 */
export { grade, DailyLedger, validateEnvelope } from '../policy.js'
