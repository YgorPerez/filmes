// The Restrição unseen: "que ninguém viu".

import { flagReader, restrictionLabel } from '../reader.ts'

export const unseenReader = flagReader(
  'unseen',
  'unseen',
  { unseen: true },
  restrictionLabel({ name: 'unseen' }),
)
