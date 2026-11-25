// A Pessoa's access (#166, map #140): the Google e-mail that makes her a
// Dono, who logs in to the app and the MCP with it. An admin gives it to a
// Pessoa that exists and takes it away; her taste stays either way. The app
// looks the Dono up on every request (`owners.ts`), so the write itself is
// what lets her in or keeps her out. One commit each, through `DataWriter`,
// as every other Pessoa write (ADR 0005).

import { Effect } from 'effect'
import { engineError } from '../runtime/EngineError.ts'
import { Owner } from '../runtime/Owner.ts'
import {
  savePersonAndSync,
  writePerson,
  type PersonServices,
  type PersonWriteError,
  type WrittenBy,
} from './actions.ts'
import { ownerEmail, resolvePerson } from './people.ts'

export interface GrantAccessInput extends WrittenBy {
  /** Slug, name or alias. */
  readonly person: string
  /** Her Google e-mail; stored in lower case. */
  readonly email: string
}

export interface RevokeAccessInput extends WrittenBy {
  /** Slug, name or alias. */
  readonly person: string
}

export interface AccessResult {
  readonly person: string
  /** The file changed: she was not a Dono yet (grant), or still was
   * (revoke). */
  readonly new: boolean
}

/** Makes the Pessoa a Dono with that e-mail: not admin, as every Dono
 * that is not the first. A Dono already has access: taking it away comes
 * first, so an address never changes behind her back. */
export const grantAccess = (
  input: GrantAccessInput,
): Effect.Effect<AccessResult, PersonWriteError, PersonServices> =>
  writePerson(input, `pessoa dar acesso ${input.person}`, (db) =>
    Effect.gen(function* () {
      const person = yield* resolvePerson(input.person)
      if (person.owner)
        return yield* engineError(
          'invalid_usage',
          `${person.slug} já é Dono`,
          'already_owner',
        )
      const email = yield* ownerEmail(input.email, person.slug)
      yield* savePersonAndSync(db, {
        ...person,
        owner: true,
        email,
        admin: false,
      })
      return { person: person.slug, new: true }
    }),
  )

/** Takes the e-mail and the Dono mark away; her next request is refused.
 * The logged-in Dono never takes her own: she would lock herself out. */
export const revokeAccess = (
  input: RevokeAccessInput,
): Effect.Effect<AccessResult, PersonWriteError, PersonServices> =>
  writePerson(input, `pessoa tirar acesso ${input.person}`, (db) =>
    Effect.gen(function* () {
      const person = yield* resolvePerson(input.person)
      if (person.slug === (yield* Owner))
        return yield* engineError(
          'invalid_usage',
          'um Dono não tira o próprio acesso',
          'own_access',
        )
      if (!person.owner && person.email === null && !person.admin)
        return { person: person.slug, new: false }
      yield* savePersonAndSync(db, {
        ...person,
        owner: false,
        email: null,
        admin: false,
      })
      return { person: person.slug, new: true }
    }),
  )
