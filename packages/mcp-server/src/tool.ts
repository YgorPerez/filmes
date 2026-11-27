// The shape of an MCP tool: each one is a file in `tools/` with
// `export default defineTool({...})`, listed in `tools/index.ts`. A tool is
// only data and an engine operation; the server (`server.ts`) runs it.

import { join } from 'node:path'
import { Effect } from 'effect'
import {
  authorOf,
  ENGINE_AUTHOR,
  engineError,
  Owner,
  peopleFolder,
  readPerson,
  resolvePerson,
  type Author,
  type EngineServices,
  type EvaluationProgress,
  type Person,
  type Run,
} from '@filmes/engine'
import type { ToolAnnotations } from '@modelcontextprotocol/server'
import { z } from 'zod'

/** What the server gives a tool besides its input. */
export interface ToolContext {
  /** Sends a progress notification, when the client asked for them (a
   * `progressToken`); otherwise does nothing. */
  readonly progress: (event: EvaluationProgress) => Effect.Effect<void>
}

export interface Tool<Input extends z.ZodObject = z.ZodObject> {
  /** English: the Python command's name, translated (ADR 0001). */
  readonly name: string
  /** PT-BR, with the GLOSSARY terms: the model reads it. */
  readonly description: string
  readonly input: Input
  readonly annotations: Required<
    Pick<ToolAnnotations, 'readOnlyHint' | 'destructiveHint' | 'openWorldHint'>
  >
  /** Only for the Pessoa logged in with `admin: true`; anyone else gets the
   * error `admin_only`. */
  readonly admin?: boolean
  /** The engine operation for the validated input. */
  readonly run: (
    input: z.infer<Input>,
    context: ToolContext,
  ) => Effect.Effect<unknown, unknown, EngineServices | Run>
  /** The tool's `_meta`, e.g. the MCP Apps view its result shows. */
  readonly meta?: Record<string, unknown>
}

export const defineTool = <Input extends z.ZodObject>(
  tool: Tool<Input>,
): Tool<Input> => tool

/** A Session id: never a path nor an option. */
export const sessionId = (description: string) =>
  z
    .string()
    .regex(/^[^-\s]/, "o ID da Sessão não pode começar com '-' nem espaço")
    .describe(description)

/** An IMDb id. */
export const imdbId = z
  .string()
  .regex(/^tt\d+$/, 'ID do IMDb: tt seguido de dígitos')

/** A Pessoa: slug, name or alias, or "dono". */
export const personName = (description: string) =>
  z
    .string()
    .trim()
    .min(1)
    .regex(/^[^-]/, "nome de Pessoa não pode começar com '-'")
    .describe(description)

/** The request's Dono: the logged-in Pessoa, or else the first Pessoa
 * with `owner: true` (the stdio server, which has no login). The engine's
 * "dono" is she too. */
export const requestOwner: Effect.Effect<
  Person,
  unknown,
  EngineServices | Run
> = Effect.flatMap(Owner, (owner) =>
  owner === null
    ? resolvePerson('dono')
    : Effect.flatMap(peopleFolder, (folder) =>
        readPerson(join(folder, `${owner}.md`)),
      ),
)

/** Who signs a write to filmes-dados: the request's Dono, or the engine
 * itself when there is none. */
export const ownerAuthor: Effect.Effect<Author, never, EngineServices | Run> =
  requestOwner.pipe(
    Effect.map(authorOf),
    Effect.orElseSucceed(() => ENGINE_AUTHOR),
  )

/** Whether the request's Dono has `admin: true`. */
export const isAdmin: Effect.Effect<boolean, never, EngineServices | Run> =
  requestOwner.pipe(
    Effect.map((person) => person.admin),
    Effect.orElseSucceed(() => false),
  )

/** A request the tool cannot run as asked: the engine's `invalid_usage`. */
export const invalidUsage = (message: string) =>
  Effect.fail(engineError('invalid_usage', message))
