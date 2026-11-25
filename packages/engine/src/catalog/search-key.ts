// The text a name is matched by in the Catálogo search (`search.ts`), apart
// so the SQL function `search_key` (`sqlite/functions.ts`) can use it too.

import { casefold } from '../compat/text.ts'

/** NFKD without the marks, casefolded, each run of anything but letters and
 * digits one space, trimmed: "Almodóvar" and "almodovar" are the same,
 * "Occupe-toi d'Amélie" is "occupe toi d amelie". */
export const searchKey = (name: string): string =>
  casefold(name.normalize('NFKD').replace(/\p{M}/gu, ''))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
