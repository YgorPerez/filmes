// The MCP server on the engine, transport-free: stdio, `InMemoryTransport`
// in the tests and Streamable HTTP in the app (#120) all connect to what
// `createMcpServer` builds. One server per logged-in Pessoa: her slug is the
// `Owner` of every call (the commit author, "Você", the Dono of "dono").

import { Effect } from 'effect'
import type { Engine, EvaluationProgress } from '@filmes/engine'
import { McpServer, type ServerContext } from '@modelcontextprotocol/server'
import { INSTRUCTIONS } from './instructions.ts'
import { isAdmin, type Tool, type ToolContext } from './tool.ts'
import { TOOLS } from './tools/index.ts'

export interface McpServerOptions {
  /** The process's engine (`makeEngine`), shared by every server. */
  readonly engine: Engine
  /** The logged-in Pessoa's slug, or null to let the engine take the Dono
   * of the data (the first `owner: true`), as the stdio server does. */
  readonly owner: string | null
  /** The tools to serve; all of them by default. */
  readonly tools?: ReadonlyArray<Tool>
}

export const SERVER_INFO = { name: 'filmes', version: '0.2.0' }

/** The answer to a call of an admin tool by a Pessoa without `admin: true`:
 * coded as the engine's errors, though the engine never runs. */
export const ADMIN_ONLY = {
  error: {
    code: 'admin_only',
    message:
      'só uma Pessoa com admin: true no repo de dados usa esta ferramenta',
  },
} as const

/** Progress notifications for the call, if its client sent a token. */
const contextOf = (ctx: ServerContext): ToolContext => {
  const token = ctx.mcpReq._meta?.progressToken
  return {
    progress: (event: EvaluationProgress) =>
      token === undefined
        ? Effect.void
        : Effect.tryPromise(
            () =>
              ctx.mcpReq.notify({
                method: 'notifications/progress',
                params: { progressToken: token, ...event },
              }),
            // A client gone mid-run loses its progress, not the run.
          ).pipe(Effect.ignore),
  }
}

const answer = (output: unknown, isError: boolean) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  isError,
})

export function createMcpServer({
  engine,
  owner,
  tools = TOOLS,
}: McpServerOptions): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  for (const tool of tools)
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input },
      async (input: unknown, ctx: ServerContext) => {
        const options = owner === null ? {} : { owner }
        if (tool.admin) {
          const admin = await engine.run(isAdmin, options)
          if (admin.exitCode !== 0 || !admin.output)
            return answer(ADMIN_ONLY, true)
        }
        const outcome = await engine.run(
          tool.run(input as never, contextOf(ctx)),
          options,
        )
        return answer(outcome.output, outcome.exitCode !== 0)
      },
    )
  return server
}
