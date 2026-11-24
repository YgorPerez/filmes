import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, it } from 'vite-plus/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { comandoPython, RAIZ } from '../src/cli.ts'
import { criarServidor } from '../src/servidor.ts'
import { prepararAmbiente } from './ambiente.ts'

type Resultado = {
  isError?: boolean
  content: Array<{ type: string; text?: string }>
}

describe('remover pelo MCP', () => {
  let limpar: () => void
  let cliente: Client

  async function chamar(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Resultado> {
    return (await cliente.callTool({ name, arguments: args })) as Resultado
  }

  async function ok(name: string, args: Record<string, unknown>): Promise<any> {
    const resultado = await chamar(name, args)
    assert.ok(!resultado.isError, resultado.content[0].text ?? '')
    return JSON.parse(resultado.content[0].text!)
  }

  beforeAll(async () => {
    limpar = prepararAmbiente()
    const servidor = await criarServidor()
    const [doCliente, doServidor] = InMemoryTransport.createLinkedPair()
    await servidor.connect(doServidor)
    cliente = new Client({ name: 'teste', version: '0' })
    await cliente.connect(doCliente)
  })

  afterAll(async () => {
    await cliente?.close()
    limpar?.()
  })

  it('tira um Veto pelo fato_id e um Já visto pelo filme', async () => {
    const veto = (
      await ok('pessoa', {
        acao: 'vetar',
        pessoa: 'teo',
        texto: 'nunca vê terror',
        entidade: 'Q9001801',
      })
    ).veto
    await ok('pessoa', { acao: 'visto', pessoa: 'teo', filme: 'tt9000601' })

    assert.equal(
      (
        await ok('pessoa', {
          acao: 'remover',
          pessoa: 'teo',
          veto: veto.fato_id,
        })
      ).removido.alvo,
      'Q9001801',
    )
    await ok('pessoa', { acao: 'remover', pessoa: 'teo', visto: 'tt9000601' })

    const ver = await ok('pessoa', { acao: 'ver', pessoa: 'teo' })
    assert.deepEqual([ver.vetos, ver.vistos], [[], []])
  })

  it('remover precisa de um item só', async () => {
    assert.equal(
      (await chamar('pessoa', { acao: 'remover', pessoa: 'teo' })).isError,
      true,
    )
    assert.equal(
      (
        await chamar('pessoa', {
          acao: 'remover',
          pessoa: 'teo',
          veto: 'x',
          relato: 'y',
        })
      ).isError,
      true,
    )
  })

  it('tira um import do Trakt', async () => {
    const zip = join(process.env.FILMES_DADOS!, 'trakt.zip')
    execFileSync(
      comandoPython(),
      [
        '-m',
        'zipfile',
        '-c',
        zip,
        'ratings-movies.json',
        'watched-history-1.json',
      ],
      { cwd: join(RAIZ, 'tests', 'fixture', 'trakt') },
    )
    const { arquivo } = await ok('importar', { pessoa: 'teo', trakt: zip })

    const saida = await ok('importar', { remover: arquivo })

    assert.deepEqual(saida.fatos_removidos, {
      notas: 2,
      ja_visto: 1,
      declarados: 0,
      watchlist: 0,
    })
    assert.equal((await chamar('importar', { trakt: zip })).isError, true)
  })
})
