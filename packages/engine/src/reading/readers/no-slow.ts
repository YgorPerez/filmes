// The Restrição no_slow: "nada lento".

import { noSlowModule } from '../../recommendation/constraints/no-slow.ts'
import { flagReader } from '../reader.ts'

export const noSlowReader = flagReader(
  'noSlow',
  'no_slow',
  { noSlow: true },
  noSlowModule.label({ name: 'no_slow' }),
)
