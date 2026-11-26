// The Restrição unseen: "que ninguém viu".

import { unseenModule } from '../../recommendation/constraints/unseen.ts'
import { flagReader } from '../reader.ts'

export const unseenReader = flagReader(
  'unseen',
  'unseen',
  { unseen: true },
  unseenModule.label({ name: 'unseen' }),
)
