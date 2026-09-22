// The denial-code vocabulary, and nothing else. A DENY carries one of these
// codes and no other string, so a refusal a person reads on a phone and a
// refusal a log line carries always mean the same thing.
export const DENIAL_CODES = Object.freeze([
  'NO_ENVELOPE',
  'ENVELOPE_INACTIVE',
  'KIND_NOT_PERMITTED',
  'ASSET_NOT_PERMITTED',
  'DESTINATION_NOT_PERMITTED',
  'PER_TX_CAP',
  'DAILY_CAP',
  'INVALID_AMOUNT',
  'INVALID_RECORD',
])

export const KINDS = Object.freeze(['transfer', 'swap', 'bridge'])

export const VERDICTS = Object.freeze(['ALLOW', 'ESCALATE', 'DENY'])
