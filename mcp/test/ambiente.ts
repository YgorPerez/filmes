// Ambiente dos testes: repo de dados copiado da fixture, banco num diretório
// temporário e o banco já reconstruído pela CLI de verdade. Como em
// tests/conftest.py, nenhuma FILMES_* do shell passa (uma chave de API levaria
// os testes à rede); só FILMES_PYTHON, que diz qual Python roda a CLI.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { comandoPython, RAIZ } from '../src/cli.ts'

const FIXTURE = join(RAIZ, 'tests', 'fixture')

export function prepararAmbiente(): () => void {
  const original = { ...process.env }
  for (const nome of Object.keys(process.env)) {
    if (nome.startsWith('FILMES_') && nome !== 'FILMES_PYTHON')
      delete process.env[nome]
  }
  const pasta = mkdtempSync(join(tmpdir(), 'filmes-mcp-'))
  cpSync(join(FIXTURE, 'dados'), join(pasta, 'dados'), { recursive: true })
  Object.assign(process.env, {
    FILMES_DADOS: join(pasta, 'dados'),
    FILMES_CATALOGO: join(FIXTURE, 'catalogo'),
    FILMES_BANCO: join(pasta, 'filmes.sqlite'),
    FILMES_HOJE: '2026-11-20',
    FILMES_LOCAL: join(pasta, 'sem-config-local.toml'),
  })
  execFileSync(comandoPython(), ['-m', 'filmes', 'reconstruir', '--json'], {
    cwd: RAIZ,
    env: process.env,
  })
  return () => {
    rmSync(pasta, { recursive: true, force: true })
    for (const nome of Object.keys(process.env)) delete process.env[nome]
    Object.assign(process.env, original)
  }
}
