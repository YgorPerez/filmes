// @vitest-environment jsdom
// The evaluation's report on Operações: each block of a section, the
// weights that copy back as TOML, and the copy the browser refuses.
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { OPERATIONS } from './operations.copy'
import { CopyButton, Report } from './operations-report'

afterEach(cleanup)

const REPORT = [
  '# Avaliação',
  '## Offline',
  'O teste esconde as Notas altas.',
  '| Medida | Valor | Nota |',
  '| --- | :---: |',
  '| Recall | 0.4 | boa | extra |',
  '## Pesos',
  '```yaml',
  'path:',
  '  weight:',
  '    cast: 0.5',
  '```',
  '## Lista',
  '```',
  '- a',
  '- b',
  '```',
  '- um aviso',
].join('\n')

it('shows each block, and only the weights copy back as TOML', async () => {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
  render(<Report report={{ date: '2026-11-20', text: REPORT, names: {} }} />)
  expect(screen.getByText('O teste esconde as Notas altas.')).toBeTruthy()
  expect(screen.getByRole('rowheader', { name: 'Recall' })).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'extra' })).toBeTruthy()
  expect(screen.getByText('um aviso')).toBeTruthy()
  const copy = screen.getAllByRole('button', {
    name: OPERATIONS.evaluation.copyToml,
  })
  expect(copy).toHaveLength(1)
  await userEvent.click(copy[0]!)
  expect(writeText).toHaveBeenCalledWith('[path.weight]\ncast = 0.5')
})

const CALIBRATION = [
  '## Calibração da Força',
  '| Quem | Fraca | Forte | Sobe? |',
  '| --- | ---: | ---: | :---: |',
  '| bruno | — (0/0) | 100.0% (2/2) | — |',
  '| iara | — (0/0) | — (0/0) | — |',
  '| MovieLens | — (0/0) | — (0/0) | — |',
  '## Online',
  '- Satisfação de iara: 0.500 em 2 Sessões',
  '## Versões dos dados',
  '```yaml',
  `filmes.csv: ${'a'.repeat(64)}`,
  '```',
  '## Avisos',
  '- Sem a chave do OMDb.',
].join('\n')

it('names each Pessoa, and says in one line that a row has no Notas', () => {
  render(
    <Report
      report={{
        date: '2026-11-20',
        text: CALIBRATION,
        names: { bruno: 'Bruno', iara: 'Iara' },
      }}
    />,
  )
  expect(screen.getByRole('rowheader', { name: 'Bruno' })).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'sem Notas' })).toBeTruthy()
  // Without the warning about the dump, MovieLens has no Notas either.
  const empty = screen.getAllByRole('cell', { name: 'sem Notas nesse corte' })
  expect(empty).toHaveLength(2)
  expect(empty[0]!.getAttribute('colspan')).toBe('3')
  expect(screen.getByText('Satisfação de Iara: 0,5 em 2 Sessões')).toBeTruthy()
  expect(screen.getByText(`filmes.csv: ${'a'.repeat(12)}…`)).toBeTruthy()
  expect(screen.getByText(OPERATIONS.evaluation.shortHashes)).toBeTruthy()
  expect(screen.getByText('Sem a chave do OMDb.')).toBeTruthy()
})

it('says there is no report yet', () => {
  render(<Report report={null} />)
  expect(screen.getByText(OPERATIONS.evaluation.noReport)).toBeTruthy()
})

it('where the browser refuses the clipboard, says to copy by hand', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async () => Promise.reject(new Error('denied')) },
    configurable: true,
  })
  render(<CopyButton text="x" label="Copiar" name="Copiar x" />)
  await userEvent.click(screen.getByRole('button', { name: 'Copiar x' }))
  expect(await screen.findByText(OPERATIONS.copyManual)).toBeTruthy()
})
