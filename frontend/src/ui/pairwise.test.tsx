// @vitest-environment jsdom
// The Perguntas par a par (#181): the Presente's page on the Link da Sessão
// and the Dono's section on the Session's page.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { PairwiseAnswers } from './pairwise-answers'
import { PairwiseQuestion } from './pairwise'
import { pairwiseSearch } from '#/content/pairwise-address'
import { PAIRWISE } from './pairwise.copy'

afterEach(cleanup)

const LINK = { session: '2026-11-20-teo', token: 'k'.repeat(43), person: 'teo' }
const FAROL = {
  id: 'tt9000101',
  title: 'O Farol de Areia',
  year: 2012,
  poster: null,
}
const PONTE = {
  id: 'tt9000201',
  title: 'Ponte Aérea',
  year: 2016,
  poster: null,
}
const BACK = '/participar?sessao=2026-11-20-teo'

const form = () => screen.getByRole('form', { name: PAIRWISE.title })
const hidden = (name: string) =>
  form().querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value

describe('PairwiseQuestion', () => {
  it('asks one pair, with the link and the pair in the form', () => {
    render(
      <PairwiseQuestion
        page={{ answered: 2, total: 10, pair: [PONTE, FAROL] }}
        link={LINK}
        back={BACK}
      />,
    )
    expect(form().getAttribute('action')).toBe('/participar/perguntas/enviar')
    expect(screen.getByText('Pergunta 3 de 10')).toBeTruthy()
    expect(
      ['sessao', 'chave', 'presente', 'a', 'b'].map((name) => hidden(name)),
    ).toEqual([LINK.session, LINK.token, 'teo', PONTE.id, FAROL.id])
    const choices = within(form()).getAllByRole('button')
    expect(
      // The title under each tape; the tape without a poster repeats it.
      choices.map((b) => [
        (b.lastElementChild ?? b).textContent,
        b.getAttribute('value'),
      ]),
    ).toEqual([
      ['Ponte Aérea (2016)', PONTE.id],
      ['O Farol de Areia (2012)', FAROL.id],
      [PAIRWISE.skip, ''],
    ])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(
      screen.getByRole('link', { name: PAIRWISE.back }).getAttribute('href'),
    ).toBe(BACK)
  })

  it('says when the last answer was not kept', () => {
    render(
      <PairwiseQuestion
        page={{ answered: 0, total: 10, pair: [PONTE, FAROL] }}
        link={LINK}
        back={BACK}
        failed
      />,
    )
    expect(screen.getByRole('alert').textContent).toBe(PAIRWISE.failed)
  })

  it('thanks once every pair is answered, and says when none is asked', () => {
    const { rerender } = render(
      <PairwiseQuestion
        page={{ answered: 10, total: 10, pair: null }}
        link={LINK}
        back={BACK}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(PAIRWISE.done(null))
    expect(screen.queryByRole('form')).toBeNull()
    rerender(
      <PairwiseQuestion
        page={{ answered: 0, total: 0, pair: null }}
        link={LINK}
        back={BACK}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(PAIRWISE.none)
    rerender(<PairwiseQuestion page={null} link={LINK} back={BACK} />)
    expect(screen.getByRole('alert').textContent).toBe(PAIRWISE.unavailable)
  })
})

it('after an answer, the focus goes to the count; once done, to the thanks', () => {
  const { rerender } = render(
    <PairwiseQuestion
      page={{ answered: 0, total: 10, pair: [PONTE, FAROL] }}
      link={LINK}
      back={BACK}
    />,
  )
  expect(document.activeElement).toBe(document.body)
  rerender(
    <PairwiseQuestion
      page={{ answered: 1, total: 10, pair: [FAROL, PONTE] }}
      link={LINK}
      back={BACK}
    />,
  )
  expect(document.activeElement?.textContent).toBe(PAIRWISE.progress(2, 10))
  rerender(
    <PairwiseQuestion
      page={{ answered: 2, total: 2, pair: null }}
      link={LINK}
      back={BACK}
      owner="Bruno"
    />,
  )
  expect(document.activeElement?.textContent).toBe(PAIRWISE.doneTitle)
  expect(screen.getByRole('status').textContent).toBe(PAIRWISE.done('Bruno'))
})

describe('PairwiseAnswers', () => {
  it('lists what waits by Presente, each with gravar and descartar', () => {
    render(
      <PairwiseAnswers
        action="/sessoes/s/perguntas"
        waiting={[
          {
            person: 'teo',
            name: 'Teo',
            answers: [{ chosen: FAROL, other: PONTE }],
          },
        ]}
      />,
    )
    const teo = screen.getByRole('form', { name: 'Teo' })
    expect(teo.getAttribute('action')).toBe('/sessoes/s/perguntas')
    expect(within(teo).getByRole('listitem').textContent).toBe(
      'Preferiu O Farol de Areia (2012) a Ponte Aérea (2016)',
    )
    expect(
      teo.querySelector<HTMLInputElement>('input[name="presente"]')?.value,
    ).toBe('teo')
    expect(
      within(teo)
        .getAllByRole('button')
        .map((b) => [b.textContent, b.getAttribute('value')]),
    ).toEqual([
      [PAIRWISE.owner.record('Teo'), 'gravar'],
      [PAIRWISE.owner.discard, 'descartar'],
    ])
  })

  it('shows nothing when no answer waits', () => {
    const { container } = render(
      <PairwiseAnswers action="/sessoes/s/perguntas" waiting={[]} />,
    )
    expect(container.innerHTML).toBe('')
  })
})

it('reads the page search: the link, and erro only when it is 1', () => {
  const link = { sessao: 's', chave: 'k', presente: 'teo' }
  expect(pairwiseSearch({ ...link, erro: '1' })).toEqual({ ...link, erro: 1 })
  expect(pairwiseSearch({ ...link, erro: 1 }).erro).toBe(1)
  expect(pairwiseSearch({ ...link, erro: 'x' }).erro).toBeUndefined()
})

it('names a film with no year by its title alone', () => {
  expect(PAIRWISE.film('Sem Ano', null)).toBe('Sem Ano')
})
