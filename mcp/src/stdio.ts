// Ponto de entrada: o servidor MCP falando por stdio.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { criarServidor } from './servidor.ts'

const servidor = await criarServidor()
await servidor.connect(new StdioServerTransport())
