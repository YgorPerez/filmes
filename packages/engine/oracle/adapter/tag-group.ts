// A tag group's key on the command line: Python's Portuguese key
// (`comedia_boba`) is the English one (`silly_comedy`) the TypeScript
// engine's config and data use. Any other value passes as it is.

import { config } from '@filmes/key-migration'

const TAG_GROUPS: Readonly<Record<string, string>> = config.TAG_GROUPS

export const tagGroup = (value: string): string =>
  Object.hasOwn(TAG_GROUPS, value) ? (TAG_GROUPS[value] ?? value) : value
