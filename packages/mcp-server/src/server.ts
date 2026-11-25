// The MCP server on the engine, transport-free: stdio, `InMemoryTransport`
// in the tests and Streamable HTTP in the app (#120) all connect to what
// `createMcpServer` builds. One server per logged-in Pessoa: her slug is the
// `Owner` of every call (the commit author, "Você", the Dono of "dono").

import type { Engine } from '@filmes/engine'
import { McpServer } from '@modelcontextprotocol/server'
import { registerBillboardView } from './billboard-view.ts'
import { INSTRUCTIONS } from './instructions.ts'
import type { Tool } from './tool.ts'
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

export function createMcpServer({
  engine,
  owner,
  tools = TOOLS,
}: McpServerOptions): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  for (const tool of tools)
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        ...(tool.meta && { _meta: tool.meta }),
      },
      async (input: unknown) => {
        const outcome = await engine.run(
          tool.run(input as never),
          owner === null ? {} : { owner },
        )
        return {
          content: [{ type: 'text', text: JSON.stringify(outcome.output) }],
          isError: outcome.exitCode !== 0,
        }
      },
    )
  registerBillboardView(server)
  return server
}
