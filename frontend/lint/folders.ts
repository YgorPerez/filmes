// Where a file may live, from pesquisa-relacionamentos'
// `frontend/lint/folders.ts`. Each folder has a role (AGENTS.md, "Onde um
// arquivo mora"), and no linter looks at the tree, so this script does: it
// lists what is out of place and exits with an error.
//
// Runs in `pnpm check`, right after `vp check`:
//   node frontend/lint/folders.ts
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')

type Rule = {
  /** The folder the rule looks at, relative to the repository root. */
  folder: string
  /** The file, relative to the folder, that is out of place. */
  outside: (file: string) => boolean
  reason: string
}

/** The `frontend/src/` folders, each with its role. */
const APP_FOLDERS = ['content', 'fonts', 'mcp-view', 'platform', 'routes', 'ui']

/** The loose files at the root of `frontend/src/`: the ones TanStack Start
 * and Vite look for there, and the one TanStack Router generates. */
const APP_LOOSE_FILES = [
  'router.tsx',
  'server.ts',
  'styles.css',
  'reset.d.ts',
  'routeTree.gen.ts',
]

/** The engine's areas (AGENTS.md): `src/<area>/`, one folder each. */
const ENGINE_AREAS = [
  'billboard',
  'catalog',
  'compat',
  'consult',
  'data',
  'evaluation',
  'evidence',
  'export',
  'imports',
  'people',
  'reading',
  'rebuild',
  'recommendation',
  'runtime',
  'sessions',
  'sources',
  'sqlite',
  'verify',
]

/** The engine's loose files: its one entry and the ts-reset. */
const ENGINE_LOOSE_FILES = ['index.ts', 'reset.d.ts']

const NEW_FOLDER =
  'a new folder needs a line in `frontend/lint/folders.ts` and in "Onde um arquivo mora" of AGENTS.md.'

const RULES: Rule[] = [
  {
    folder: 'frontend/src/routes',
    outside: (a) =>
      !/\.tsx?$/.test(a) ||
      /\.test\.tsx?$/.test(a) ||
      a.split('/').some((part) => part.startsWith('-')),
    reason:
      'routes/ holds only route files. The page piece goes to `ui/`, what the server reads and writes to `platform/`, the address and the form to `content/`.',
  },
  {
    folder: 'frontend/src',
    outside: (a) =>
      a.includes('/')
        ? !APP_FOLDERS.includes(a.split('/')[0] ?? '')
        : !APP_LOOSE_FILES.includes(a),
    reason: `frontend/src/ holds only ${APP_FOLDERS.map((p) => `${p}/`).join(', ')} and the files Start looks for at the root. A new piece goes into one of them; ${NEW_FOLDER}`,
  },
  {
    folder: 'frontend/src',
    outside: (a) => /(^|\/)(__tests__|tests?)\//.test(a),
    reason:
      'A test lives next to what it tests, as `<name>.test.ts`, and not in a tests folder.',
  },
  {
    folder: 'packages/engine/src',
    outside: (a) =>
      a.includes('/')
        ? !ENGINE_AREAS.includes(a.split('/')[0] ?? '')
        : !ENGINE_LOOSE_FILES.includes(a),
    reason: `The engine's code lives in its areas (\`src/<area>/\`), and only \`index.ts\` sits at the root of src/; ${NEW_FOLDER}`,
  },
  {
    folder: 'packages/mcp-server/src',
    outside: (a) => a.includes('/') && !/^tools\/[^/]+$/.test(a),
    reason:
      'The MCP server is flat, with one file per tool in `tools/`, listed in `tools/index.ts`.',
  },
]

function files(folder: string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(folder, join(e.parentPath, e.name)))
}

/** Each file out of place, relative to the root, with the reason. */
export function outOfPlace(root = ROOT) {
  const found: { file: string; reason: string }[] = []
  for (const rule of RULES)
    for (const native of files(join(root, rule.folder))) {
      const a = native.split(sep).join('/')
      if (rule.outside(a))
        found.push({ file: `${rule.folder}/${a}`, reason: rule.reason })
    }
  return found
}

if (import.meta.main) {
  const found = outOfPlace()
  for (const { file, reason } of found)
    console.error(`[folders] ${file}: ${reason}`)
  if (found.length > 0) process.exit(1)
}
