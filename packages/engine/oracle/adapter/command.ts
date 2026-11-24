// One Python command the TypeScript engine answers. Each port ticket adds a
// file to `adapter/commands/` that default-exports `defineCommand({...})`:
// the argv adapter finds it there, no list to edit (AGENTS.md, "Onde um
// arquivo mora").

import { Effect } from 'effect'
import type { EngineServices } from '../../src/runtime/Engine.ts'
import { engineError, type EngineError } from '../../src/runtime/EngineError.ts'
import type { Run } from '../../src/runtime/Run.ts'
import type { SqliteError } from '../../src/sqlite/Sqlite.ts'
import { ArgvError, parseArgv, type ArgSpec, type Parsed } from './argv.ts'

/** An engine operation, as `makeEngine(...).run` takes it. A port whose
 * operation fails with another error adds it here. */
export type Operation = Effect.Effect<
  unknown,
  EngineError | SqliteError,
  EngineServices | Run
>

/** How a command's output is compared, besides the defaults (§4.3 of #76):
 * arrays in order, numbers exact, strings exact. */
export interface CompareOptions {
  /** Globs over output paths (`output.tables`, `output.films[*].genres`)
   * whose arrays are compared as multisets. Say why next to each. */
  readonly unordered?: readonly string[]
  /** Absolute tolerance by output path glob, for numbers the output does
   * not round. */
  readonly tolerance?: Readonly<Record<string, number>>
}

export interface CommandDefinition<S extends ArgSpec> extends CompareOptions {
  /** The Python command, with its action after a space: `consultar`,
   * `pessoa ver`, `fila confirmar`, `cartaz responder`. It names the output
   * table of the key migration too. */
  readonly command: string
  /** The command's arguments, as its `configurar` declares them. */
  readonly args: S
  /** Whether the engine answers this step yet, from its raw arguments
   * (after the command and action words). A command ported in parts says
   * `false` for the arguments a later ticket ports, and the step stays
   * `not_ported`. Absent: every step. */
  readonly ported?: (argv: readonly string[]) => boolean
  /** The engine operation for one call. `stdin` is what the step sent. */
  readonly run: (
    args: Parsed<S>,
    input: { readonly stdin: string | null },
  ) => Operation
  /** Files the command writes outside filmes-dados and the database (an
   * export, a Cartaz), relative to the step's `{work}`: compared byte for
   * byte, with the work folders written `{work}`. */
  readonly files?: (args: Parsed<S>) => readonly string[]
}

/** A command, with its argument types erased: what the adapter holds. */
export interface Command extends CompareOptions {
  readonly command: string
  /** `null` when the command does not answer these arguments yet. */
  readonly prepare: (
    argv: readonly string[],
    stdin: string | null,
  ) => {
    readonly operation: Operation
    readonly files: readonly string[]
  } | null
}

/** Declares the adapter of one Python command. Arguments argparse would
 * refuse become an `invalid_usage`, as in Python. */
export function defineCommand<const S extends ArgSpec>(
  definition: CommandDefinition<S>,
): Command {
  const { command, unordered, tolerance } = definition
  return {
    command,
    ...(unordered && { unordered }),
    ...(tolerance && { tolerance }),
    prepare: (argv, stdin) => {
      if (definition.ported && !definition.ported(argv)) return null
      let args: Parsed<S>
      try {
        args = parseArgv(argv, definition.args)
      } catch (error) {
        if (!(error instanceof ArgvError)) throw error
        return {
          operation: Effect.fail(engineError('invalid_usage', error.message)),
          files: [],
        }
      }
      return {
        operation: definition.run(args, { stdin }),
        files: definition.files?.(args) ?? [],
      }
    },
  }
}
