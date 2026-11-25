// The test seam: an SDK client over `InMemoryTransport`, talking to the real
// server on the real engine over a copy of the engine's fixture
// (`useFixture`, called by the test itself). Nothing touches the network: no API key reaches the
// engine, and `FILMES_GRAVACOES` stays off as in the engine's tests.

import assert from 'node:assert/strict'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { makeEngine, type Vars } from '@filmes/engine'
import { onTestFinished } from 'vite-plus/test'
import type { Fixture } from '../../engine/test/fixture.ts'
import { createMcpServer, type McpServerOptions } from '../src/index.ts'

export interface Connected {
  readonly fixture: Fixture
  readonly client: Client
  /** Calls a tool and returns its result as the SDK gives it. */
  readonly call: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<ToolResult>
  /** Calls a tool that must succeed and returns its JSON. */
  readonly ok: (name: string, args?: Record<string, unknown>) => Promise<any>
  /** Calls a tool that must fail and returns its JSON error. */
  readonly error: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ error: { code: string; message: string } }>
}

export interface ToolResult {
  readonly isError?: boolean
  readonly content: ReadonlyArray<{ type: string; text?: string }>
}

const text = (result: ToolResult): string => {
  const [block] = result.content
  assert.equal(block?.type, 'text')
  return block.text ?? ''
}

/** A client connected to a server over `fixture` (the test's
 * `useFixture()`), closed when the test ends. `owner` is the logged-in
 * Pessoa the server runs every call as; `vars` add to (or, `undefined`,
 * remove from) the fixture's; `edge` is what the HTTP edge adds: what it
 * says of her (`admin`) and the app's address (`appOrigin`). */
export async function connect(
  fixture: Fixture,
  owner: string | null = null,
  vars: Vars = {},
  edge: Pick<McpServerOptions, 'admin' | 'appOrigin'> = {},
): Promise<Connected> {
  const engine = makeEngine({ ...fixture.vars, ...vars })
  const server = createMcpServer({
    engine,
    owner,
    ...edge,
  })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(clientSide)
  onTestFinished(async () => {
    await client.close()
    await server.close()
    await engine.dispose()
  })
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as ToolResult
  return {
    fixture,
    client,
    call,
    ok: async (name, args) => {
      const result = await call(name, args)
      assert.ok(!result.isError, text(result))
      return JSON.parse(text(result))
    },
    error: async (name, args) => {
      const result = await call(name, args)
      assert.equal(result.isError, true, text(result))
      return JSON.parse(text(result)) as {
        error: { code: string; message: string }
      }
    },
  }
}

/** The text of a failed call that never reached the engine (bad input). */
export const failureText = (result: ToolResult): string => {
  assert.equal(result.isError, true)
  return text(result)
}
