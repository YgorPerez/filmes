import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { rebuild } from '../../../src/index.ts'
import { defineCommand } from '../command.ts'

export default defineCommand({
  command: 'reconstruir',
  args: { positionals: [], options: {} },
  // A catalog of dumps (no `filmes.csv`) is #106's.
  ported: (_argv, env) => {
    const catalog = env['FILMES_CATALOGO']
    return catalog === undefined || existsSync(join(catalog, 'filmes.csv'))
  },
  run: () => rebuild,
})
