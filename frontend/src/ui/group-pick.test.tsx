// @vitest-environment jsdom
// The Escolha de grupo (#415): the groups a new Presente picks on the Link
// da Sessão before the pairs, and her line in the Dono's section.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vite-plus/test'
import { GroupPickQuestion } from './group-pick'
import { GROUP_PICK } from './group-pick.copy'
import { GROUPS } from './group-pick.fixture'
import { PairwiseAnswers } from './pairwise-answers'
import { PairwiseQuestion } from './pairwise'

afterEach(cleanup)

const LINK = { session: '2026-11-20-teo', token: 'k'.repeat(43), person: 'teo' }
const BACK = '/participar?sessao=2026-11-20-teo'

it('asks the groups first, as a plain form with the link and a checkbox per group', () => {
  render(
    <PairwiseQuestion
      page={{ answered: 0, total: 10, pair: null, groups: GROUPS }}
      link={LINK}
      back={BACK}
      owner="Bruno"
    />,
  )
  const form = screen.getByRole('form', { name: GROUP_PICK.title })
  expect(form.getAttribute('action')).toBe('/participar/perguntas/grupos')
  expect(
    form.querySelector<HTMLInputElement>('input[name="chave"]')?.value,
  ).toBe(LINK.token)
  const tides = within(form).getByRole('checkbox', { name: /Faróis e marés/u })
  expect(tides.getAttribute('name')).toBe('grupo')
  expect(tides.getAttribute('value')).toBe('tides')
  // The labels and the films are there in Portuguese, not the tags.
  expect(tides.closest('label')?.textContent).toContain(
    'litorâneo · melancólico · contemplativo',
  )
  expect(tides.closest('label')?.textContent).toContain('O Farol de Areia')
  for (const [name, value] of [
    [GROUP_PICK.send, 'escolher'],
    [GROUP_PICK.none, 'nenhum'],
  ])
    expect(
      within(form).getByRole('button', { name }).getAttribute('value'),
    ).toBe(value)
})

it('once 3 groups are marked, the others wait until one is unmarked', async () => {
  const user = userEvent.setup()
  render(<GroupPickQuestion groups={GROUPS} link={LINK} back={BACK} />)
  const boxes = screen.getAllByRole<HTMLInputElement>('checkbox')
  for (const box of boxes.slice(0, 3)) await user.click(box)
  expect(screen.getByText(GROUP_PICK.picked(3, 3))).toBeTruthy()
  expect(boxes[3]!.disabled).toBe(true)
  await user.click(boxes[0]!)
  expect(boxes[3]!.disabled).toBe(false)
  expect(screen.getByText(GROUP_PICK.picked(2, 3))).toBeTruthy()
})

it('says when the pick was not kept', () => {
  render(<GroupPickQuestion groups={GROUPS} link={LINK} back={BACK} failed />)
  expect(screen.getByText(GROUP_PICK.failed(3))).toBeTruthy()
})

it("lists her groups in the Dono's section, before her pairs", () => {
  const [tides] = GROUPS.choices
  render(
    <PairwiseAnswers
      action="/sessoes/s/perguntas"
      waiting={[{ person: 'teo', name: 'Teo', groups: [tides!], answers: [] }]}
    />,
  )
  expect(
    within(screen.getByRole('form', { name: 'Teo' })).getByRole('listitem')
      .textContent,
  ).toBe(
    'Escolheu o grupo Faróis e marés: O Farol de Areia, Cidade de Vidro, Maré Baixa',
  )
})
