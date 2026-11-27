// The group swipe: one film at a time, Não or Sim, the recap, and the
// night's list after the Votos went.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { VoteCards, VoteScreen } from './session-votes'
import { VOTES } from './session-votes.copy'
import { VIEW, VOTED } from './session-link.fixture'

const DECK = { version: VIEW.version, films: VIEW.films, left: [] }
const AFTER = { version: VOTED.version, films: VOTED.films, left: VOTED.left }

const LINK = { sessao: '2026-11-20-iara', chave: 'k', presente: 'iara' }

const meta = {
  component: VoteScreen,
  args: {
    deck: DECK,
    search: LINK,
    home: '/participar?sessao=2026-11-20-iara&chave=k&presente=iara',
    owner: 'Bruno',
    questions: '/participar/perguntas?sessao=2026-11-20-iara&chave=k',
  },
} satisfies Meta<typeof VoteScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Deck: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'O Farol de Areia' }),
    ).toBeVisible()
    await expect(canvas.getByText(VOTES.rule)).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: VOTES.yes }))
    await expect(
      canvas.getByRole('heading', { name: 'Pequenos Milagres' }),
    ).toBeVisible()
  },
}

export const Recap: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const name of [VOTES.yes, VOTES.no, VOTES.yes])
      await userEvent.click(canvas.getByRole('button', { name }))
    await expect(
      canvas.getByRole('heading', { name: VOTES.summary(2, 1) }),
    ).toBeVisible()
    await expect(
      canvas.getByText(VOTES.leaving(['Pequenos Milagres'])),
    ).toBeVisible()
  },
}

export const Sent: Story = {
  args: { deck: AFTER, search: { ...LINK, feito: 'regerada' } },
}

export const AllVoted: Story = {
  args: {
    deck: {
      ...AFTER,
      films: AFTER.films.map((f) => ({ ...f, mine: 'yes' as const })),
    },
  },
}

export const Revote: Story = {
  args: { deck: AFTER, search: { ...LINK, mudar: true } },
}

export const Failure: Story = {
  args: { search: { ...LINK, erro: 'falha' } },
}

export const RedoFailed: Story = {
  args: { deck: AFTER, search: { ...LINK, erro: 'regerar' } },
}

export const WithoutLink: Story = {
  args: { deck: null, search: {}, home: null },
}

export const Cards: Story = {
  render: () => <VoteCards deck={DECK} action="/participar/votos?sessao=s" />,
}
