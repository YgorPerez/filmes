import { Effect } from 'effect'
import type { YamlValue } from '../data/yaml.ts'
import { ADDITION_FIELDS, withAddition } from '../reading/addition.ts'
import {
  readRequest,
  REQUEST_READING_MAX_LENGTH,
} from '../reading/read-request.ts'
import type { ReadFields } from '../reading/reader.ts'
import type { Constraint } from '../recommendation/constraints.ts'
import { readConstraints } from '../recommendation/constraints/index.ts'
import { isKept, type Regenerate } from '../recommendation/kept.ts'

const fields = ADDITION_FIELDS.filter((field) => field !== 'attendees')

/** Read each comment on its own, since a note about one film can end
 * with words that would change the reading of the next comment. */
export const readRefillComments = (saved: ReadonlyArray<YamlValue>) =>
  Effect.gen(function* () {
    let request: ReadFields = {}
    const comments = new Set(saved)
    for (const text of comments) {
      if (typeof text !== 'string' || text.length > REQUEST_READING_MAX_LENGTH)
        continue
      const read = yield* readRequest({ text, fields })
      request = withAddition(request, read.request)
    }
    return request
  })

/** The comment can narrow the refill pool. The request and Vetos still
 * apply to the whole Cartaz, including its kept films. */
export const refillConstraints = (
  request: ReadFields,
  regenerate: Regenerate,
) =>
  Effect.map(readConstraints(request), (constraints) =>
    constraints
      .filter((constraint) => constraint.name !== 'series_order')
      .map((constraint): Constraint => ({
        ...constraint,
        appliesTo: (filmId) => !isKept(regenerate, filmId),
      })),
  )
