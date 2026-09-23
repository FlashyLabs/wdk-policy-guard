// The `policy-guard/1` conformance corpus, as data.
//
// ── What this is for ───────────────────────────────────────────────────────
//
// Any two policy engines agree that a small transfer inside an envelope is
// allowed. They disagree about the edges, and the edges are where money moves
// by accident: an amount exactly equal to a cap, an asset address in the wrong
// case, a swap that has no destination, an amount larger than a double can
// represent. This corpus is those edges, written down so an implementation in
// any language can be checked against them without reading ours.
//
// ── How it was written ─────────────────────────────────────────────────────
//
// From the rules, not from the engine. Generating expectations by running
// `grade()` would produce a corpus that agrees with this implementation
// including wherever it is wrong, which is a corpus that can never find
// anything. Each case below states what the documented rule requires; the
// suite then runs the reference adapter against them, and a disagreement is
// investigated rather than reconciled.
//
// ── The shape ──────────────────────────────────────────────────────────────
//
// `input` is the spend being graded. `context` is everything the grade is made
// AGAINST — the envelope, and what the day has already used. That split is the
// `conformance/1` rule: context is input to the judgement without being the
// thing judged.

/** A permissive envelope most cases vary one field of. */
const ENV = Object.freeze({
  chain: 'evm:84532',
  kinds: ['transfer', 'swap', 'bridge'],
  assets: ['native', '0xabc0000000000000000000000000000000000001'],
  destinations: ['0xdest000000000000000000000000000000000001'],
  perTxMax: '1000',
  dailyMax: '5000',
  autoApproveMax: '100',
})

const env = (over = {}) => ({ ...ENV, ...over })

/** A well-formed transfer most cases vary one field of. */
const SPEND = Object.freeze({
  kind: 'transfer',
  chain: 'evm:84532',
  asset: 'native',
  amount: '50',
  destination: '0xdest000000000000000000000000000000000001',
})

const spend = (over = {}) => ({ ...SPEND, ...over })

/** A spend the engine will not describe is refused, never guessed at. */
export const records = [
  { id: 'not-an-object', why: 'a record is an object', input: 'transfer', context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_RECORD'] },
  { id: 'null-record', why: 'null is not a record', input: null, context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_RECORD'] },
  { id: 'unknown-kind', why: 'kind is one of transfer, swap, bridge', input: spend({ kind: 'mint' }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_RECORD'] },
  { id: 'chain-without-family', why: 'chain is <family>:<id>', input: spend({ chain: '84532' }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_RECORD'] },
  { id: 'chain-family-uppercase', why: 'the family is lower case', input: spend({ chain: 'EVM:84532' }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_RECORD'] },
  { id: 'empty-asset', why: 'asset is an exact address or "native"', input: spend({ asset: '' }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_RECORD'] },
  { id: 'amount-not-a-string', why: 'a number is not a base-unit string — this is where a float cap stops being a cap', input: spend({ amount: 50 }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_AMOUNT'] },
  { id: 'amount-decimal', why: 'base units are integers', input: spend({ amount: '1.5' }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_AMOUNT'] },
  { id: 'amount-negative', why: 'a negative amount is not a spend', input: spend({ amount: '-1' }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_AMOUNT'] },
  { id: 'amount-hex', why: 'base units are decimal', input: spend({ amount: '0x32' }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_AMOUNT'] },
  { id: 'amount-empty', why: 'an empty string is not an amount', input: spend({ amount: '' }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_AMOUNT'] },
  { id: 'transfer-without-destination', why: 'only a swap may omit one', input: spend({ destination: null }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_RECORD'] },
  { id: 'bridge-without-destination', why: 'a bridge has a destination', input: spend({ kind: 'bridge', destination: null }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_RECORD'] },
  { id: 'swap-with-destination', why: 'a swap has none, and a record carrying one is not the record this grades', input: spend({ kind: 'swap' }), context: { envelope: env() }, verdict: 'DENY', codes: ['INVALID_RECORD'] },
  { id: 'amount-leading-zeros', why: '007 is seven; a string comparison would disagree', input: spend({ amount: '0050' }), context: { envelope: env() }, verdict: 'ALLOW' },
  { id: 'amount-zero', why: 'zero is a well-formed amount and under every cap', input: spend({ amount: '0' }), context: { envelope: env() }, verdict: 'ALLOW' },
]

/** The envelope, and the four ways out of it. */
export const envelopes = [
  { id: 'no-envelope', why: 'nothing is permitted before a limit is set', input: spend(), context: { envelope: null }, verdict: 'DENY', codes: ['NO_ENVELOPE'] },
  { id: 'envelope-for-another-chain', why: 'an envelope is per chain', input: spend({ chain: 'tron:nile' }), context: { envelope: env() }, verdict: 'DENY', codes: ['NO_ENVELOPE'] },
  { id: 'envelope-inactive', why: 'a revoked envelope permits nothing, whatever it still says', input: spend(), context: { envelope: env({ active: false }) }, verdict: 'DENY', codes: ['ENVELOPE_INACTIVE'] },
  { id: 'kind-not-permitted', why: 'the kinds list is an allowlist', input: spend({ kind: 'bridge' }), context: { envelope: env({ kinds: ['transfer'] }) }, verdict: 'DENY', codes: ['KIND_NOT_PERMITTED'] },
  { id: 'asset-not-permitted', why: 'the assets list is an allowlist', input: spend({ asset: '0xfff0000000000000000000000000000000000009' }), context: { envelope: env() }, verdict: 'DENY', codes: ['ASSET_NOT_PERMITTED'] },
  {
    id: 'asset-matches-case-insensitively',
    why: 'the same contract, checksummed and not, is the same contract — an implementation comparing raw strings refuses a permitted asset',
    input: spend({ asset: '0xABC0000000000000000000000000000000000001' }),
    context: { envelope: env() },
    verdict: 'ALLOW',
  },
  { id: 'destination-not-permitted', why: 'the destinations list is an allowlist', input: spend({ destination: '0xbad0000000000000000000000000000000000009' }), context: { envelope: env() }, verdict: 'DENY', codes: ['DESTINATION_NOT_PERMITTED'] },
  {
    id: 'destination-matches-case-insensitively',
    why: 'the same address, checksummed and not',
    input: spend({ destination: '0xDEST000000000000000000000000000000000001' }),
    context: { envelope: env() },
    verdict: 'ALLOW',
  },
  {
    id: 'swap-skips-the-destination-allowlist',
    why: 'a swap has no destination to check, so the allowlist does not apply to it — an implementation applying it uniformly denies every swap',
    input: { kind: 'swap', chain: 'evm:84532', asset: 'native', amount: '50', destination: null },
    context: { envelope: env({ destinations: [] }) },
    verdict: 'ALLOW',
  },
]

/** Caps, and what happens exactly on them. */
export const caps = [
  { id: 'per-tx-cap-exceeded', why: 'over the per-transaction cap', input: spend({ amount: '1001' }), context: { envelope: env() }, verdict: 'DENY', codes: ['PER_TX_CAP'] },
  {
    id: 'per-tx-cap-exact',
    why: 'the cap is a ceiling, not a bound: an amount EQUAL to it is inside. Off-by-one here is the difference between a cap that works and one that refuses a legitimate spend',
    input: spend({ amount: '1000' }),
    context: { envelope: env() },
    verdict: 'ESCALATE',
  },
  {
    id: 'per-tx-cap-beyond-double-precision',
    why: 'the amount exceeds the cap by one at a magnitude where a double cannot tell them apart. An implementation using floating point ALLOWS this; base-unit integers deny it',
    input: spend({ amount: '9007199254740993' }),
    context: { envelope: env({ perTxMax: '9007199254740992', dailyMax: '99999999999999999999', autoApproveMax: '1' }) },
    verdict: 'DENY',
    codes: ['PER_TX_CAP'],
  },
  { id: 'daily-cap-exceeded', why: 'what the day already used counts toward it', input: spend({ amount: '600' }), context: { envelope: env({ dailyMax: '1000' }), usedToday: '500' }, verdict: 'DENY', codes: ['DAILY_CAP'] },
  {
    id: 'daily-cap-exact',
    why: 'used + amount EQUAL to the daily cap is inside it',
    input: spend({ amount: '500' }),
    context: { envelope: env({ dailyMax: '1000' }), usedToday: '500' },
    verdict: 'ESCALATE',
  },
  {
    id: 'per-tx-checked-before-daily',
    why: 'both caps are broken; the code reported is the per-transaction one. An implementation checking them in the other order reports DAILY_CAP and a reader learns the wrong thing about why they were refused',
    input: spend({ amount: '5000' }),
    context: { envelope: env({ perTxMax: '1000', dailyMax: '2000' }), usedToday: '1900' },
    verdict: 'DENY',
    codes: ['PER_TX_CAP'],
  },
]

/** The ceiling under which nobody is asked, and the three impact tiers. */
export const ceiling = [
  { id: 'under-the-ceiling-allows', why: 'below autoApproveMax, nobody is asked', input: spend({ amount: '99' }), context: { envelope: env() }, verdict: 'ALLOW' },
  {
    id: 'ceiling-exact-allows',
    why: 'the ceiling is a ceiling: an amount EQUAL to autoApproveMax still auto-approves',
    input: spend({ amount: '100' }),
    context: { envelope: env() },
    verdict: 'ALLOW',
  },
  {
    id: 'over-the-ceiling-escalates',
    why: 'the case a boolean corpus cannot express: inside the envelope, over the ceiling, so a HUMAN is asked before anything is signed. An implementation folding this into "allowed" signs it',
    input: spend({ amount: '101' }),
    context: { envelope: env() },
    verdict: 'ESCALATE',
  },
  {
    id: 'always-escalate-overrides-the-ceiling',
    why: 'an envelope may ask every time, however small the spend',
    input: spend({ amount: '1' }),
    context: { envelope: env({ alwaysEscalate: true }) },
    verdict: 'ESCALATE',
  },
]

/**
 * The envelope's own shape — an accept/refuse set, not a verdict one.
 *
 * Carried in the same bundle on purpose. A profile is rarely all one question:
 * `grade` decides between three outcomes, `validateEnvelope` accepts or
 * refuses, and a corpus that could only express one of those would have to
 * leave the other unchecked or lie about its shape.
 */
export const envelopeShape = [
  { id: 'well-formed', why: 'the baseline', input: { ...ENV }, valid: true },
  { id: 'envelope-not-an-object', why: 'an envelope is an object', input: 'evm:84532', valid: false },
  { id: 'chain-missing', why: 'an envelope is per chain', input: { ...ENV, chain: undefined }, valid: false },
  { id: 'kinds-not-an-array', why: 'the allowlists are arrays', input: { ...ENV, kinds: 'transfer' }, valid: false },
  { id: 'cap-is-a-number', why: 'caps are base-unit strings; a number is where precision goes', input: { ...ENV, perTxMax: 1000 }, valid: false },
  { id: 'cap-is-decimal', why: 'base units are integers', input: { ...ENV, dailyMax: '5000.5' }, valid: false },
  {
    id: 'per-tx-above-daily',
    why: 'a per-transaction cap above the daily cap can never be reached, so the envelope does not mean what it says',
    input: { ...ENV, perTxMax: '9000', dailyMax: '5000' },
    valid: false,
  },
  {
    id: 'ceiling-above-per-tx',
    why: 'an auto-approve ceiling above the per-transaction cap would auto-approve everything the cap permits — the envelope would ask nobody, ever',
    input: { ...ENV, autoApproveMax: '2000' },
    valid: false,
  },
  { id: 'ceiling-equals-per-tx', why: 'equal is inside: every permitted spend auto-approves, which is a choice and not a malformed envelope', input: { ...ENV, autoApproveMax: '1000' }, valid: true },
]
