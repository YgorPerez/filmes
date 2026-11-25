// Who may log in: a Pessoa with `owner: true` and an `email:` in filmes-dados
// (map #72). Each file is read by the engine's Pessoa reader
// (`decodePersonSync`), the same one every engine operation uses.
//
// Until the cutover of ADR 0002 the files are Portuguese (`pessoas/`, `dono`,
// `nome`); after it, English (`people/`, `owner`, `name`). A Portuguese file
// is migrated in memory by the key migration first.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodePersonSync, type Person } from '@filmes/engine'
import { migrateDataFile } from '@filmes/key-migration'

/** The Dono of the request: whoever is logged in. Server only: the email
 * never goes to the browser. */
export type Owner = {
  /** The Pessoa's slug, the file name without `.md`. */
  person: string
  name: string
  email: string
  admin: boolean
}

export interface OwnerDirectory {
  /** The Dono whose `email:` is this one, or null: no Pessoa has it, the
   * Pessoa who has it is not Dono, or two Donos have it. */
  ownerByEmail(email: string): Owner | null
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** The Dono in the file, or null. A file the engine cannot read (no
 * name, a broken frontmatter) lets no one in, as the engine would refuse
 * it too. */
function readOwner(path: string, portuguese: boolean): Owner | null {
  let person: Person
  try {
    const text = readFileSync(path, 'utf8')
    person = decodePersonSync(
      path,
      portuguese ? migrateDataFile('person', text, 'to-en') : text,
    )
  } catch {
    return null
  }
  const { owner, email, slug, name, admin } = person
  if (!owner || email === null || !email.includes('@')) return null
  return { person: slug, name, email: normalizeEmail(email), admin }
}

/** Reads the files on every call: a Pessoa who stops being Dono, or whose
 * email changes, is out on her next request. The folder is small. */
export function ownersFromDataRepo(root: string): OwnerDirectory {
  return {
    ownerByEmail(email) {
      const portuguese = !existsSync(join(root, 'people'))
      const folder = join(root, portuguese ? 'pessoas' : 'people')
      if (!existsSync(folder)) return null
      const wanted = normalizeEmail(email)
      const found = readdirSync(folder)
        .filter((file) => file.endsWith('.md'))
        .map((file) => readOwner(join(folder, file), portuguese))
        .filter((owner) => owner?.email === wanted)
      return found.length === 1 ? found[0]! : null
    },
  }
}
