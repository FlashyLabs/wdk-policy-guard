// A spend, in the one shape this package will grade. Kind, a chain as
// <family>:<id> (e.g. evm:84532, tron:nile), an exact asset address or
// "native", an amount as a non-negative base-unit integer string, and an
// exact destination (null only for a swap, which has none).
//
// A record this package cannot describe is refused with INVALID_RECORD,
// never guessed at — the same discipline a chain extractor applies to a raw
// transaction: unclear input is a refusal, not a best effort.
import { KINDS } from './codes.js'

export const NATIVE = 'native'

const CHAIN = /^[a-z]+:[A-Za-z0-9-]+$/
const AMOUNT = /^\d+$/

/**
 * @typedef {object} SpendRecord
 * @property {'transfer'|'swap'|'bridge'} kind
 * @property {string} chain      "<family>:<id>", e.g. "evm:84532"
 * @property {string} asset      an exact token address, or "native"
 * @property {string} amount     a non-negative integer in base units, as a string
 * @property {string|null} destination  an exact address; null only for a swap
 */

/**
 * @param {unknown} input
 * @returns {{ok: true, record: SpendRecord} | {ok: false, code: 'INVALID_RECORD'|'INVALID_AMOUNT', reason: string}}
 */
export function validateRecord(input) {
  if (!input || typeof input !== 'object') return refuse('INVALID_RECORD', 'a record is an object')
  const { kind, chain, asset, amount, destination } = /** @type {Record<string, unknown>} */ (input)
  if (!KINDS.includes(/** @type {string} */ (kind))) return refuse('INVALID_RECORD', `kind must be one of ${KINDS.join(', ')}`)
  if (typeof chain !== 'string' || !CHAIN.test(chain)) return refuse('INVALID_RECORD', 'chain is <family>:<id>, e.g. evm:84532')
  if (typeof asset !== 'string' || asset.length === 0) return refuse('INVALID_RECORD', 'asset is an exact address or "native"')
  if (typeof amount !== 'string' || !AMOUNT.test(amount)) return refuse('INVALID_AMOUNT', 'amount is a non-negative integer in base units, as a string')
  if (kind === 'swap') {
    if (destination !== null && destination !== undefined) return refuse('INVALID_RECORD', 'a swap has no destination')
  } else if (typeof destination !== 'string' || destination.length === 0) {
    return refuse('INVALID_RECORD', 'destination is an exact address')
  }
  return {
    ok: true,
    record: {
      kind: /** @type {SpendRecord['kind']} */ (kind),
      chain,
      asset,
      amount,
      destination: kind === 'swap' ? null : /** @type {string} */ (destination),
    },
  }
}

function refuse(code, reason) {
  return { ok: false, code, reason }
}
