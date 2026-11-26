// Every `src/ui/` piece opens in Storybook (ADR 0008, from
// pesquisa-relacionamentos' `lint/stories.ts` and its ADR 0036): each `.tsx`
// in `src/ui/` (the `ui/shadcn/` controls too) is imported by some story, and
// the piece no story imports fails `pnpm check`. A test, or another piece
// that uses it, does not count: the story is where it is seen and where
// `pnpm test:stories` opens it on phone and desktop.
//
// Reads the imports as text, with Vite's parser, without importing anything
// from the app. Runs in `pnpm check`:
//   node frontend/lint/stories.ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parseSync } from 'vite-plus'

const ROOT = resolve(import.meta.dirname, '..')

const PIECE = /\.tsx$/
const NOT_A_PIECE = /\.(stories|test)\.tsx$/

function files(folder: string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
}

const slashed = (path: string) => path.split(sep).join('/')

/** The path, relative to `frontend/`, with `/` and without `.tsx`, of each
 * value import of the file that points inside `src/`: the relative one and
 * the `#/` alias. */
function imported(root: string, file: string): string[] {
  const { program } = parseSync(file, readFileSync(file, 'utf8'))
  return program.body.flatMap((node) => {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type')
      return []
    const from = String(node.source.value)
    const target = from.startsWith('#/')
      ? join(root, 'src', from.slice(2))
      : from.startsWith('.')
        ? join(dirname(file), from)
        : null
    return target ? [slashed(relative(root, target)).replace(/\.tsx$/, '')] : []
  })
}

/** Each `src/ui/` piece no story imports, relative to `frontend/`. */
export function piecesWithoutStory(root = ROOT): string[] {
  const pieces = files(join(root, 'src', 'ui'))
    .filter((path) => PIECE.test(path) && !NOT_A_PIECE.test(path))
    .map((path) => slashed(relative(root, path)))
  const seen = new Set(
    files(join(root, 'src'))
      .filter((path) => path.endsWith('.stories.tsx'))
      .flatMap((path) => imported(root, path)),
  )
  return pieces.filter((piece) => !seen.has(piece.replace(/\.tsx$/, ''))).sort()
}

if (import.meta.main) {
  const missing = piecesWithoutStory()
  for (const piece of missing)
    console.error(
      `[stories] ${piece}: no story imports this piece. Write a \`<name>.stories.tsx\` next to it that shows it, or put it in an existing story.`,
    )
  if (missing.length > 0) process.exit(1)
}
