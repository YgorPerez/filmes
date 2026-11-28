// @vitest-environment jsdom
// The taste analysis on the Pessoa page (#404): what she rates above her
// own median, and the films behind each item.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { TasteAnalysisSlip } from './person-taste-analysis'
import { TASTE_ANALYSIS } from './person-taste-analysis.copy'
import { ANALYSIS, NOTHING_ABOVE } from './person-taste-analysis.fixture'

afterEach(cleanup)

const slip = (name: string) => screen.getByRole('region', { name })

describe('the taste analysis', () => {
  it('names each group with what passes her median, and the films behind an item', async () => {
    render(<TasteAnalysisSlip analysis={ANALYSIS} own={false} name="Bruno" />)
    const region = slip('Do que Bruno mais gosta')
    expect(
      within(region).getByText(
        'Gêneros, diretores, atores e décadas a que Bruno dá nota acima da própria mediana (7 de 10), nas 120 Notas.',
      ),
    ).toBeTruthy()
    expect(
      within(region)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Gêneros', 'Diretores', 'Atores', 'Décadas'])

    const directors = within(region).getByRole('region', { name: 'Diretores' })
    await userEvent
      .setup()
      .click(within(directors).getByText('Helena Prado · média 9 em 3 filmes'))
    const films = within(directors)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(films.slice(0, 3)).toEqual([
      'O Farol de Areia (2012)nota 10',
      'Maré Baixa (2015)nota 9',
      'Cidade de Vidro (2018)nota 8',
    ])
  })

  it('says how many films an item has beyond the ten it shows, and names a decade', () => {
    render(<TasteAnalysisSlip analysis={ANALYSIS} own={false} name="Bruno" />)
    const genres = screen.getByRole('region', { name: 'Gêneros' })
    expect(
      within(genres).getByText('Drama · média 8,2 em 14 filmes'),
    ).toBeTruthy()
    expect(within(genres).getByText('e mais 4 filmes')).toBeTruthy()
    expect(screen.getByText('Anos 2010 · média 8,7 em 3 filmes')).toBeTruthy()
  })

  it('speaks to her on Meu gosto', () => {
    render(<TasteAnalysisSlip analysis={ANALYSIS} own name="Bruno" />)
    expect(
      within(slip('Do que você mais gosta')).getByText(/a que você dá nota/),
    ).toBeTruthy()
  })

  it('says so when nothing passes her median', () => {
    render(
      <TasteAnalysisSlip analysis={NOTHING_ABOVE} own={false} name="Bruno" />,
    )
    expect(
      within(slip('Do que Bruno mais gosta')).getByText(TASTE_ANALYSIS.empty),
    ).toBeTruthy()
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([])
  })
})
