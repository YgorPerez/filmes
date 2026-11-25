// The pytest trace hook (`tests/conftest.py`) and the harvest over it.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, onTestFinished, test } from 'vite-plus/test'
import { defineCommand } from '../../oracle/adapter/command.ts'
import {
  commandOf,
  loadAdapter,
  makeAdapter,
} from '../../oracle/adapter/index.ts'
import { harvest } from '../../oracle/harvest.ts'
import { handWritten } from '../../oracle/scenario.ts'
import { resolvePython } from '../../oracle/python.ts'

describe('harvest', () => {
  test("each test is a scenario with its CLI steps, paths as placeholders and the test's own edits", async () => {
    const scenarios = await harvest({
      python: resolvePython(),
      jobs: 2,
      testFiles: ['tests/test_erros.py', 'tests/test_perguntas_abertas.py'],
    })

    const missingData = scenarios.find((s) =>
      s.id.endsWith('reconstruir_explica_o_que_falta'),
    )
    expect(missingData?.steps).toEqual([
      expect.objectContaining({
        argv: ['reconstruir'],
        env: expect.not.objectContaining({
          FILMES_DADOS: expect.anything(),
        }) as unknown,
        exitCode: 1,
        output: {
          erro: {
            codigo: 'config_ausente',
            mensagem: expect.stringContaining('[caminhos] dados') as unknown,
          },
        },
      }),
    ])
    // The test drops a table by hand between two steps: the database it left
    // is in the step.
    const dropped = scenarios.find((s) =>
      s.id.endsWith('aceita_escrita_na_pessoa'),
    )
    expect(Object.keys(dropped?.steps[1]?.files ?? {})).toEqual([
      'filmes.sqlite',
    ])
    expect(dropped?.steps[0]?.env['FILMES_BANCO']).toBe('{work}/filmes.sqlite')
  }, 120_000)
})

describe('the argv adapter', () => {
  test('names the Python command, with its action', () => {
    expect(commandOf(['pessoa', 'ver', 'bruno'])).toEqual({
      command: 'pessoa ver',
      rest: ['bruno'],
    })
    expect(commandOf(['cartaz', '--sessao', 's', 'responder'])).toEqual({
      command: 'cartaz responder',
      rest: ['--sessao', 's'],
    })
    expect(commandOf(['pessoa', '--x'])).toEqual({
      command: 'pessoa',
      rest: ['--x'],
    })
    expect(commandOf([])).toEqual({ command: '', rest: [] })
  })

  test('a command Python has but nobody ported is not ported; one it lacks is invalid usage', () => {
    const adapter = makeAdapter([])

    expect(adapter.adapt(['pessoa', 'ver', 'bruno', '--json'], null)).toEqual({
      kind: 'not_ported',
      command: 'pessoa ver',
    })
    expect(adapter.adapt(['nao-existe'], null)).toMatchObject({
      kind: 'ported',
      command: 'nao-existe',
    })
  })

  test('two adapters for one command are refused', () => {
    const command = {
      command: 'consultar',
      prepare: () => {
        throw new Error('unused')
      },
    }

    expect(() => makeAdapter([command, command])).toThrow(/two adapters/)
  })
})

describe('partial adapters', () => {
  const importar = (origin: string) =>
    defineCommand({
      command: 'importar',
      args: {
        positionals: [],
        options: {
          letterboxd: { kind: 'value' },
          trakt: { kind: 'value' },
          remover: { kind: 'value' },
        },
        exclusive: [
          { options: ['letterboxd', 'trakt', 'remover'], required: true },
        ],
      },
      ported: (argv) => argv.includes(`--${origin}`),
      run: () => Effect.succeed(origin),
    })

  test('each answers its calls; a call none takes is not ported', () => {
    const adapter = makeAdapter([importar('letterboxd'), importar('trakt')])

    expect(adapter.adapt(['importar', '--trakt', 'x.zip'], null)).toMatchObject(
      { kind: 'ported' },
    )
    expect(
      adapter.adapt(['importar', '--letterboxd', 'x.zip'], null),
    ).toMatchObject({ kind: 'ported' })
    expect(adapter.adapt(['importar', '--remover', 'x.zip'], null)).toEqual({
      kind: 'not_ported',
      command: 'importar',
    })
    expect([...adapter.ported]).toEqual(['importar'])
  })

  test('a whole adapter cannot share its command with a partial one', () => {
    const whole = { command: 'importar', prepare: () => null }

    expect(() => makeAdapter([importar('letterboxd'), whole])).toThrow(
      /two adapters/,
    )
  })
})

describe('loadAdapter', () => {
  test('finds each command file and its default export; none when the folder is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'filmes-adapter-'))
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
    writeFileSync(
      join(dir, 'consultar.ts'),
      "export default { command: 'consultar', prepare: () => ({ operation: null, files: [] }) }\n",
    )

    expect([...(await loadAdapter(dir)).ported]).toEqual(['consultar'])
    expect([...(await loadAdapter(join(dir, 'nothing'))).ported]).toEqual([])

    writeFileSync(join(dir, 'broken.ts'), 'export const x = 1\n')
    await expect(loadAdapter(dir)).rejects.toThrow(/default-export/)
  })
})

describe('handWritten', () => {
  test('reads every jsonl file of the folder, sorted by id; nothing without the folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filmes-scenarios-'))
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
    const line = (id: string) =>
      `${JSON.stringify({ id, steps: [{ argv: ['sessoes-abertas'], stdin: null, env: {}, files: {} }] })}\n`
    writeFileSync(join(dir, 'b.jsonl'), line('b') + line('a'))
    writeFileSync(join(dir, 'notes.md'), 'not a scenario')

    expect(handWritten(dir).map((s) => s.id)).toEqual(['a', 'b'])
    expect(handWritten(join(dir, 'nothing'))).toEqual([])
  })
})
