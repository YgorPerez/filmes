// The shape of an MCP tool: each one is a file in `tools/` with
// `export default defineTool({...})`, listed in `tools/index.ts`. A tool is
// only data and an engine operation; the server (`server.ts`) runs it.

import type { Effect } from 'effect'
import type { EngineServices, Run } from '@filmes/engine'
import { z } from 'zod'

export interface Tool<Input extends z.ZodObject = z.ZodObject> {
  /** English, as key-migration's `output.COMMANDS` names the command. */
  readonly name: string
  /** PT-BR, with the GLOSSARY terms: the model reads it. */
  readonly description: string
  readonly input: Input
  /** The engine operation for the validated input. */
  readonly run: (
    input: z.infer<Input>,
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
