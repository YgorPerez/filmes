// The argv adapter (#76 §4.1): reads a step in the Python CLI's vocabulary
// and says which engine operation answers it, or that the command is not
// ported yet. Oracle only; it goes away with the Python engine.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Effect } from 'effect'
import { engineError } from '../../src/runtime/EngineError.ts'
import { PYTHON_COMMANDS } from '../paths.ts'
import type { Command, CompareOptions, Operation, StepEnv } from './command.ts'

export type Adapted =
  | { readonly kind: 'not_ported'; readonly command: string }
  | ({
      readonly kind: 'ported'
      readonly command: string
      readonly operation: Operation
      readonly files: readonly string[]
    } & CompareOptions)

export interface Adapter {
  /** The Python commands the engine answers. */
  readonly ported: ReadonlySet<string>
  /** `env` is the step's `FILMES_*` as the Python side (seed 0) sees them,
   * with the step's files already in place. */
  readonly adapt: (
    argv: readonly string[],
    stdin: string | null,
    env?: StepEnv,
  ) => Adapted
}

/** Where each port ticket adds its commands. */
export const COMMANDS_DIR = join(import.meta.dirname, 'commands')

/** Python commands whose first positional is an action with its own
 * arguments (`pessoa ver`, `fila confirmar`). */
const WITH_ACTION = new Set(['pessoa', 'fila'])

/** The Python CLI's commands, found as it finds them: one module per file
 * in `filmes/comandos/`. */
function pythonCommands(): Set<string> {
  return new Set(
    readdirSync(PYTHON_COMMANDS)
      .filter((file) => file.endsWith('.py') && !file.startsWith('_'))
      .map((file) => file.slice(0, -3).replaceAll('_', '-')),
  )
}

/** The Python command a step runs, and the arguments left for it. */
export function commandOf(argv: readonly string[]): {
  readonly command: string
  readonly rest: readonly string[]
} {
  const [first = '', ...rest] = argv
  const [action] = rest
  if (WITH_ACTION.has(first) && action !== undefined && !action.startsWith('-'))
    return { command: `${first} ${action}`, rest: rest.slice(1) }
  const responder = rest.indexOf('responder')
  if (first === 'cartaz' && responder !== -1)
    return {
      command: 'cartaz responder',
      rest: rest.filter((_, i) => i !== responder),
    }
  return { command: first, rest }
}

/** An adapter over `commands`. A step whose command Python does not have is
 * an `invalid_usage`, as argparse makes it. */
export function makeAdapter(commands: readonly Command[]): Adapter {
  const known = pythonCommands()
  const byName = new Map<string, Command[]>()
  for (const command of commands) {
    const same = byName.get(command.command) ?? []
    if (same.length > 0 && !(command.partial && same.every((c) => c.partial)))
      throw new Error(`two adapters for '${command.command}'`)
    byName.set(command.command, [...same, command])
  }
  return {
    ported: new Set(byName.keys()),
    adapt: (argv, stdin, env = {}) => {
      // Every parser level has `--json`; the seam always passes it.
      const args = argv.filter((token) => token !== '--json')
      const { command, rest } = commandOf(args)
      const top = command.split(' ')[0] ?? ''
      if (!known.has(top))
        return {
          kind: 'ported',
          command,
          files: [],
          operation: Effect.fail(
            engineError(
              'invalid_usage',
              `argument comando: invalid choice: '${top}'`,
            ),
          ),
        }
      for (const found of byName.get(command) ?? []) {
        const prepared = found.prepare(rest, stdin, env)
        if (prepared === null) continue
        const { operation, files } = prepared
        return {
          kind: 'ported',
          command,
          operation,
          files,
          ...(found.unordered && { unordered: found.unordered }),
          ...(found.tolerance && { tolerance: found.tolerance }),
        }
      }
      return { kind: 'not_ported', command }
    },
  }
}

/** The adapter over every file in `adapter/commands/` (or `dir`). */
export async function loadAdapter(dir = COMMANDS_DIR): Promise<Adapter> {
  const files = existsSync(dir)
    ? readdirSync(dir)
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
        .sort()
    : []
  const commands: Command[] = []
  for (const file of files) {
    const module = (await import(pathToFileURL(join(dir, file)).href)) as {
      readonly default?: Command
    }
    if (!module.default)
      throw new Error(`${file} must default-export defineCommand(...)`)
    commands.push(module.default)
  }
  return makeAdapter(commands)
}

export type { Operation }
