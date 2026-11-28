// @vitest-environment jsdom
// The Compatibilidade on the Pessoa page (#403): each other Pessoa with
// enough films in common, her agreement and the films where the two agree
// and diverge most.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { CompatibilitySection } from './person-compatibility'
import { COMPATIBILITY } from './person-compatibility.copy'
import { BRUNO_COMPATIBILITY } from './person-compatibility.fixture'

afterEach(cleanup)

describe('CompatibilitySection', () => {
  it('lists each Pessoa with her agreement and the films', () => {
    render(
      <CompatibilitySection
        name="Bruno"
        viewer="iara"
        compatibility={BRUNO_COMPATIBILITY}
      />,
    )
    const section = screen.getByRole('region', { name: COMPATIBILITY.title })
    const row = (name: string) =>
      within(section).getByRole('link', { name }).closest('li')!
    const [iara, quim] = [row('Iara'), row('Quim')]
    // Iara is the Dono logged in: her link is Meu gosto.
    expect(
      within(iara!).getByRole('link', { name: 'Iara' }).getAttribute('href'),
    ).toBe('/meu-gosto')
    expect(
      within(iara!).getByText('61% de acordo · 2 filmes em comum'),
    ).toBeTruthy()
    const q = within(quim!)
    expect(q.getByRole('link', { name: 'Quim' }).getAttribute('href')).toBe(
      '/pessoas/quim',
    )
    expect(q.getByText('47% de acordo · 4 filmes em comum')).toBeTruthy()
    const agree = q.getByRole('heading', { name: COMPATIBILITY.agree })
      .nextElementSibling as HTMLElement
    expect(
      within(agree)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Ponte Aérea (2016)Bruno 9 · Quim 10',
      'Maré Baixa (2015)Bruno 9 · Quim 7',
    ])
    const diverge = q.getByRole('heading', { name: COMPATIBILITY.diverge })
      .nextElementSibling as HTMLElement
    expect(
      within(diverge)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Barulho (2013)Bruno 2 · Quim 9',
      'Fronteira (2008)Bruno 10 · Quim 4',
    ])
  })

  it('says from how many films in common it shows', () => {
    render(
      <CompatibilitySection
        name="Teo"
        viewer="bruno"
        compatibility={{ person: 'teo', minShared: 10, others: [] }}
      />,
    )
    expect(screen.getByText(COMPATIBILITY.none('Teo', 10))).toBeTruthy()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})
