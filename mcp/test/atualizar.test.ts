import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vite-plus/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { RAIZ } from '../src/cli.ts'
import { criarServidor } from '../src/servidor.ts'
import { prepararAmbiente } from './ambiente.ts'

it('atualizar entrega progresso e as versões fixadas pela CLI', async () => {
  const limpar = prepararAmbiente()
  const pasta = mkdtempSync(join(tmpdir(), 'filmes-atualizar-'))
  const cliente = new Client({ name: 'teste', version: '0' })
  try {
    Object.assign(process.env, {
      FILMES_CATALOGO: join(pasta, 'dumps'),
      FILMES_VERSOES: join(pasta, 'versoes.json'),
      FILMES_GRAVACOES: join(RAIZ, 'tests', 'fixture', 'gravacoes'),
      FILMES_LOCAL: join(pasta, 'sem-config-local.toml'),
    })
    const [transporteCliente, transporteServidor] =
      InMemoryTransport.createLinkedPair()
    await (await criarServidor()).connect(transporteServidor)
    await cliente.connect(transporteCliente)

    const etapas: number[] = []
    const resultado = await cliente.callTool(
      { name: 'atualizar', arguments: {} },
      undefined,
      {
        onprogress: ({ progress }) => etapas.push(progress),
      },
    )

    assert.equal(resultado.isError, false)
    assert.deepEqual(etapas, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const [saida] = resultado.content as Array<{ text: string }>
    const fixadas = JSON.parse(saida.text)
    assert.equal(fixadas.versoes, process.env.FILMES_VERSOES)
    assert.equal(fixadas.dumps['ml-32m.zip'].data, '2023-10-13')
    assert.equal(fixadas.dumps['genome_2021.zip'].data, '2021-12-30')
  } finally {
    await cliente.close()
    rmSync(pasta, { recursive: true, force: true })
    limpar()
  }
})
