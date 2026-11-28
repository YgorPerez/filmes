// The readers of the Leitura do pedido, one per kind of field. A new kind
// is a new file here and its line below; its phrases go in its section of
// `config/request_reading.toml`. The order only breaks a tie between two
// readers that claim the same words.

import type { Reader } from '../reader.ts'
import { attendeesReader } from './attendees.ts'
import { byReader } from './by.ts'
import { childReader } from './child.ts'
import { countReader } from './count.ts'
import { durationReader } from './duration.ts'
import { languageReader } from './language.ts'
import { moodsReader } from './moods.ts'
import { noMoodsReader } from './no-moods.ts'
import { noSadReader } from './no-sad.ts'
import { noSlowReader } from './no-slow.ts'
import { presetReader } from './preset.ts'
import { similarReader } from './similar.ts'
import { unseenReader } from './unseen.ts'
import { yearReader } from './year.ts'

export const READERS: ReadonlyArray<Reader> = [
  attendeesReader,
  byReader,
  moodsReader,
  durationReader,
  childReader,
  yearReader,
  languageReader,
  unseenReader,
  noSlowReader,
  noSadReader,
  noMoodsReader,
  countReader,
  similarReader,
  presetReader,
]
