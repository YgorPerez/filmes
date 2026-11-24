// Who may log in: a Pessoa with `owner: true` and an `email:` in filmes-dados
// (map #72). The engine port does not read Pessoas yet, so this seam reads
// their frontmatter straight from the files; the ticket that ports Pessoas
// replaces `ownersFromDataRepo` with the engine's reader and keeps the
// `OwnerDirectory` interface.
//
// Until the cutover of ADR 0002 the files are Portuguese (`pessoas/`, `dono`,
// `nome`); after it, English (`people/`, `owner`, `name`). Both are read, the
// Portuguese keys renamed by the key migration's own table.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { data } from '@filmes/key-migration'
import { parse } from 'yaml'

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

/** Portuguese frontmatter key → English, from the key migration. */
const ENGLISH_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(data.person.fields ?? {}).map(([pt, field]) => [
    pt,
    field.name,
  ]),
)

/** The frontmatter between the first two `---` lines, as the Python engine
 * splits it (`filmes/dados/markdown.py`). */
function frontmatter(text: string): Record<string, unknown> {
  if (!text.startsWith('---\n')) return {}
  const end = text.indexOf('\n---', 4)
  if (end === -1) return {}
  const parsed: unknown = parse(text.slice(4, end))
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {}
}

function readPerson(path: string, portuguese: boolean): Owner | null {
  const fields = frontmatter(readFileSync(path, 'utf8'))
  const english = portuguese
    ? Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [
          ENGLISH_KEY[key] ?? key,
          value,
        ]),
      )
    : fields
  const { owner, email, name, admin } = english
  if (owner !== true || typeof email !== 'string' || !email.includes('@'))
    return null
  return {
    person: basename(path, '.md'),
    name: typeof name === 'string' ? name : basename(path, '.md'),
    email: normalizeEmail(email),
    admin: admin === true,
  }
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
        .map((file) => readPerson(join(folder, file), portuguese))
        .filter((owner) => owner?.email === wanted)
      return found.length === 1 ? found[0]! : null
    },
  }
}
