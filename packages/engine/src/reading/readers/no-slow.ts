// The Restrição no_slow: "nada lento".

import { flagReader, restrictionLabel } from '../reader.ts'

export const noSlowReader = flagReader(
  'noSlow',
  'no_slow',
  { noSlow: true },
  restrictionLabel({ name: 'no_slow' }),
)
