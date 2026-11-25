// decisions.yaml: what explains a difference, and what is stale.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, onTestFinished, test } from 'vite-plus/test'
import { ABSENT, type Difference } from '../../oracle/compare.ts'
import {
  explain,
  loadDecisions,
  staleDecisions,
  type Decision,
} from '../../oracle/decisions.ts'

const MESSAGE: Decision = {
  id: 'message',
  commands: ['reconstruir'],
  path: 'error.message',
  python: '\\[caminhos\\]',
  ts: '\\[paths\\]',
  reason: 'r',
  link: 'l',
}

const difference = (extra: Partial<Difference> = {}): Difference => ({
  check: 'parity',
  path: 'error.message',
  python: 'defina FILMES_DADOS ou [caminhos] dados',
  ts: 'defina FILMES_DADOS ou [paths] data',
  ...extra,
})

const where = { scenario: 'tests/test_erros.py::x', command: 'reconstruir' }

describe('decisions', () => {
  test('the repo file loads', () => {
    expect(loadDecisions().map((d) => d.id)).toContain(
      'missing-config-names-the-english-local-toml-key',
    )
  })

  test('an entry explains a difference only when check, command, scenario, path and both values match', () => {
    expect(explain([MESSAGE], where, difference())).toBe(MESSAGE)
    expect(
      explain([MESSAGE], { ...where, command: 'consultar' }, difference()),
    ).toBeUndefined()
    expect(
      explain(
        [{ ...MESSAGE, scenarios: 'tests/test_pessoa.py::*' }],
        where,
        difference(),
      ),
    ).toBeUndefined()
    expect(
      explain([MESSAGE], where, difference({ path: 'error.code' })),
    ).toBeUndefined()
    expect(
      explain([MESSAGE], where, difference({ ts: ABSENT })),
    ).toBeUndefined()
    expect(
      explain([MESSAGE], where, difference({ check: 'self-check' })),
    ).toBeUndefined()
  })

  test('nothing explains a replay difference', () => {
    expect(
      explain(
        [{ ...MESSAGE, python: undefined, ts: undefined }],
        where,
        difference({ check: 'replay' }),
      ),
    ).toBeUndefined()
  })

  test('stale: unused with a ported command; dormant while none is', () => {
    const selfCheck: Decision = { ...MESSAGE, id: 'seeds', check: 'self-check' }

    expect(staleDecisions([MESSAGE], new Set(), new Set(), true)).toEqual([])
    expect(
      staleDecisions([MESSAGE], new Set(), new Set(['reconstruir']), true),
    ).toEqual([MESSAGE])
    expect(
      staleDecisions(
        [MESSAGE],
        new Set(['message']),
        new Set(['reconstruir']),
        true,
      ),
    ).toEqual([])
    expect(staleDecisions([selfCheck], new Set(), new Set(), true)).toEqual([
      selfCheck,
    ])
    expect(staleDecisions([selfCheck], new Set(), new Set(), false)).toEqual([])
  })

  test('an entry for the real-database run is never stale in a fixture run', () => {
    const real = { ...MESSAGE, id: 'real', scenarios: 'real/recomendar-*' }
    expect(
      staleDecisions([real], new Set(), new Set(['reconstruir']), true),
    ).toEqual([])
  })

  test('a file with a bad entry or a repeated id is refused', () => {
    const dir = mkdtempSync(join(tmpdir(), 'filmes-decisions-'))
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, 'decisions.yaml')

    writeFileSync(file, '- id: x\n  path: y\n')
    expect(() => loadDecisions(file)).toThrow(/commands/)
    writeFileSync(
      file,
      '- {id: x, commands: [a], path: p, reason: r, link: l}\n- {id: x, commands: [a], path: p, reason: r, link: l}\n',
    )
    expect(() => loadDecisions(file)).toThrow(/two entries/)
  })
})
