// Who may log in: a Pessoa with `owner: true` and an `email:` in filmes-dados
// (map #72), as `people-directory.ts` reads her.

import { peopleFromDataRepo, type PersonIdentity } from './people-directory'

/** The Dono of the request: whoever is logged in. Server only: the email
 * never goes to the browser. */
export type Owner = PersonIdentity

export interface OwnerDirectory {
  /** The Dono whose `email:` is this one, or null: no Pessoa has it, the
   * Pessoa who has it is not Dono, or two Donos have it. */
  ownerByEmail(email: string): Owner | null
}

export function ownersFromDataRepo(root: string): OwnerDirectory {
  const people = peopleFromDataRepo(root)
  return { ownerByEmail: (email) => people.byEmail(email, true) }
}
