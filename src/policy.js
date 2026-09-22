// The envelope, graded before a signature ever happens.
//
// Kinds, assets, destinations, a cap per transaction and per day, a ceiling
// under which nobody is asked. Three verdicts and nothing else:
//
//   ALLOW     inside the envelope and under the ceiling: execute
//   ESCALATE  inside the envelope, over the ceiling (or always-ask): a
//             human confirms before anything is signed
//   DENY      outside the envelope: refused with a code, nothing signed
//
// The daily ledger is reservations per UTC day per chain, so a send that is
// allowed reserves before it executes, and a failed send releases. Amounts
// are BigInt from base-unit strings throughout — a comparison on floats is
// how a cap stops being a cap.
import { DENIAL_CODES } from './codes.js'
import { validateRecord } from './record.js'

/**
 * @typedef {object} Envelope
 * @property {string} chain
 * @property {string[]} kinds
 * @property {string[]} assets
 * @property {string[]} destinations
 * @property {string} perTxMax        base units, as a string
 * @property {string} dailyMax        base units, as a string
 * @property {string} autoApproveMax  base units, as a string
 * @property {boolean} [alwaysEscalate]
 * @property {boolean} [active]
 */

/**
 * @param {unknown} e
 * @returns {string[]} problems found; empty means valid
 */
export function validateEnvelope(e) {
  const problems = []
  if (!e || typeof e !== 'object') return ['an envelope is an object']
  const env = /** @type {Record<string, unknown>} */ (e)
  if (typeof env.chain !== 'string') problems.push('chain')
  for (const k of ['kinds', 'assets', 'destinations']) if (!Array.isArray(env[k])) problems.push(`${k} must be an array`)
  for (const k of ['perTxMax', 'dailyMax', 'autoApproveMax']) {
    if (typeof env[k] !== 'string' || !/^\d+$/.test(/** @type {string} */ (env[k]))) problems.push(`${k} must be an integer string in base units`)
  }
  if (problems.length === 0) {
    const perTxMax = BigInt(/** @type {string} */ (env.perTxMax))
    const dailyMax = BigInt(/** @type {string} */ (env.dailyMax))
    const autoApproveMax = BigInt(/** @type {string} */ (env.autoApproveMax))
    if (perTxMax > dailyMax) problems.push('ENVELOPE_INVALID_CAPS: perTxMax cannot exceed dailyMax')
    if (autoApproveMax > perTxMax) problems.push('ENVELOPE_INVALID_CAPS: autoApproveMax cannot exceed perTxMax')
  }
  return problems
}

/**
 * What today has already committed or reserved, per chain. Injectable so a
 * device or a service can persist it across restarts — this in-memory
 * version is the default and is enough for a single-process caller.
 */
export class DailyLedger {
  /** @param {() => Date} [now] */
  constructor(now = () => new Date()) {
    this.now = now
    /** @type {Map<string, bigint>} */
    this.days = new Map()
  }
  static dayKey(d) { return d.toISOString().slice(0, 10) }
  /** @param {string} chain */
  used(chain) { return this.days.get(`${DailyLedger.dayKey(this.now())}|${chain}`) ?? 0n }
  /** @param {string} chain @param {string|bigint} amount */
  reserve(chain, amount) {
    const k = `${DailyLedger.dayKey(this.now())}|${chain}`
    this.days.set(k, (this.days.get(k) ?? 0n) + BigInt(amount))
  }
  /** @param {string} chain @param {string|bigint} amount */
  release(chain, amount) {
    const k = `${DailyLedger.dayKey(this.now())}|${chain}`
    this.days.set(k, (this.days.get(k) ?? 0n) - BigInt(amount))
  }
}

const lower = (/** @type {string} */ s) => (typeof s === 'string' ? s.toLowerCase() : s)

/**
 * Grade a spend against an envelope and today's ledger. Pure apart from
 * reading the ledger — reserving is the caller's job, after ALLOW, and
 * releasing is the caller's job if the send then fails.
 * @param {Envelope|null|undefined} envelope
 * @param {unknown} input  a candidate spend, in the shape {@link validateRecord} accepts
 * @param {DailyLedger} [ledger]
 * @returns {{verdict:'ALLOW'}|{verdict:'ESCALATE', impact:'MEDIUM'|'HIGH'|'CRITICAL'}|{verdict:'DENY', code:string, reason:string}}
 */
export function grade(envelope, input, ledger) {
  const v = validateRecord(input)
  if (!v.ok) return deny(v.code, v.reason)
  const r = v.record
  if (!envelope) return deny('NO_ENVELOPE', `no envelope for ${r.chain}; set a limit before spending`)
  if (envelope.active === false) return deny('ENVELOPE_INACTIVE', 'the envelope for this chain is revoked')
  if (envelope.chain !== r.chain) return deny('NO_ENVELOPE', `the envelope is for ${envelope.chain}, not ${r.chain}`)
  if (!envelope.kinds.includes(r.kind)) return deny('KIND_NOT_PERMITTED', `${r.kind} is not permitted; permitted: ${envelope.kinds.join(', ')}`)
  if (!envelope.assets.map(lower).includes(lower(r.asset))) return deny('ASSET_NOT_PERMITTED', `${r.asset} is not a permitted asset`)
  if (r.kind !== 'swap' && !envelope.destinations.map(lower).includes(lower(/** @type {string} */ (r.destination)))) {
    return deny('DESTINATION_NOT_PERMITTED', `${r.destination} is not on the allowlist`)
  }
  const amount = BigInt(r.amount)
  if (amount > BigInt(envelope.perTxMax)) return deny('PER_TX_CAP', `${r.amount} exceeds the per-transaction cap ${envelope.perTxMax}`)
  const used = ledger ? ledger.used(r.chain) : 0n
  if (used + amount > BigInt(envelope.dailyMax)) return deny('DAILY_CAP', `${used} used today + ${r.amount} exceeds the daily cap ${envelope.dailyMax}`)
  if (envelope.alwaysEscalate || amount > BigInt(envelope.autoApproveMax)) {
    const ratio = Number((amount * 100n) / (BigInt(envelope.perTxMax) || 1n))
    return { verdict: 'ESCALATE', impact: ratio >= 75 ? 'CRITICAL' : ratio >= 40 ? 'HIGH' : 'MEDIUM' }
  }
  return { verdict: 'ALLOW' }
}

function deny(code, reason) {
  if (!DENIAL_CODES.includes(code)) throw new Error(`not a denial code: ${code}`)
  return { verdict: 'DENY', code, reason }
}
