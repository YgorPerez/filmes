// Any Pessoa with an `email:` in filmes-dados, Dono or not: who may sign in
// to connect her Trakt (#295). Each file (`people/<slug>.md`, English keys,
// ADR 0002) is read by the engine's Pessoa reader (`decodePersonSync`), the
// same one every engine operation uses. `owners.ts` narrows it to the Donos.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePersonSync, type Person } from '@filmes/engine'

/** A Pessoa found by her email. Server only: the email never goes to the
 * browser. */
export type PersonIdentity = {
  /** The Pessoa's slug, the file name without `.md`. */
  person: string
  name: string
  email: string
  admin: boolean
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** The Pessoa in the file, or null. A file the engine cannot read (no
 * name, a broken frontmatter) lets no one in, as the engine would refuse
 * it too. */
function readIdentity(
  path: string,
): (PersonIdentity & { owner: boolean }) | null {
  let person: Person
  try {
    person = decodePersonSync(path, readFileSync(path, 'utf8'))
  } catch {
    return null
  }
  const { owner, email, slug, name, admin } = person
  if (email === null || !email.includes('@')) return null
  return { person: slug, name, email: normalizeEmail(email), admin, owner }
}

/** Reads the files on every call: a Pessoa who stops being Dono, or whose
 * email changes, is out on her next request. The folder is small. */
export function peopleFromDataRepo(root: string) {
  const folder = join(root, 'people')
  function byEmail(email: string, ownersOnly = false): PersonIdentity | null {
    if (!existsSync(folder)) return null
    const wanted = normalizeEmail(email)
    const found = readdirSync(folder)
      .filter((file) => file.endsWith('.md'))
      .map((file) => readIdentity(join(folder, file)))
      .filter(
        (person) => person?.email === wanted && (!ownersOnly || person.owner),
      )
    if (found.length !== 1 || !found[0]) return null
    const { person, name, admin } = found[0]
    return { person, name, email: wanted, admin }
  }
  return {
    byEmail,
    /** The Pessoa of this slug, only while her email is hers alone. */
    bySlug(slug: string) {
      if (!/^[\w-]+$/.test(slug)) return null
      const person = readIdentity(join(folder, `${slug}.md`))
      return person && byEmail(person.email)?.person === slug ? person : null
    },
  }
}
