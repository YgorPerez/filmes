// The Restrição no_sad: "nada triste".

import { flagReader, restrictionLabel } from '../reader.ts'

export const noSadReader = flagReader(
  'noSad',
  'no_sad',
  { noSad: true },
  restrictionLabel({ name: 'no_sad' }),
)
