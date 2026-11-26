// The Restrição no_sad: "nada triste".

import { noSadModule } from '../../recommendation/constraints/no-sad.ts'
import { flagReader } from '../reader.ts'

export const noSadReader = flagReader(
  'noSad',
  'no_sad',
  { noSad: true },
  noSadModule.label({ name: 'no_sad' }),
)
