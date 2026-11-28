// Who may change a Session (map #369): a Dono who is among its Presentes.
// Deleting it and editing its Presentes or its request all ask this, with
// the same words. A request with no Dono logged in (`Owner` null) is
// refused too: the app and the MCP always say who it is.

import { Effect } from 'effect'
import { isSequence, pyStrValue, type YamlMapping } from '../data/yaml.ts'
import { readPeople } from '../people/people.ts'
import { engineError } from '../runtime/EngineError.ts'
import { Owner } from '../runtime/Owner.ts'

/** The logged-in Dono, when they are among the Presentes of the Session
 * whose frontmatter is `front`; `invalid_usage` otherwise. `action` is the
 * verb the refusal names: "excluir", "editar". The refusal's reason is
 * `not_attending`. */
export const attendingOwner = (front: YamlMapping, action: string) =>
  Effect.gen(function* () {
    const slug = yield* Owner
    const attendees = front.get('attendees')
    const person =
      slug === null
        ? undefined
        : (yield* readPeople).find((p) => p.slug === slug && p.owner)
    if (
      person === undefined ||
      !isSequence(attendees) ||
      !attendees.some((attendee) => pyStrValue(attendee) === slug)
    )
      return yield* engineError(
        'invalid_usage',
        `Só um Dono entre os Presentes pode ${action} a Sessão.`,
        'not_attending',
      )
    return person
  })
