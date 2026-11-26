// The group swipe: one film at a time, Não or Sim, and the page around it.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { VoteCards, VoteScreen } from './session-votes'
import { VOTES } from './session-votes.copy'

const DECK = {
  version: 2,
  films: [
    { position: 1, id: 'tt9000101', title: 'O Farol de Areia' },
    { position: 2, id: 'tt9000601', title: 'Pequenos Milagres' },
    { position: 3, id: 'tt9000701', title: 'Noite de Estreia' },
  ],
}

const LINK = { sessao: '2026-11-20-iara', chave: 'k', presente: 'iara' }

const meta = {
  component: VoteScreen,
  args: {
    deck: DECK,
    search: LINK,
    home: '/participar?sessao=2026-11-20-iara&chave=k&presente=iara',
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
    await userEvent.click(canvas.getByRole('button', { name: VOTES.yes }))
    await expect(
      canvas.getByRole('heading', { name: 'Pequenos Milagres' }),
    ).toBeVisible()
  },
}

export const Regenerated: Story = {
  args: { search: { ...LINK, feito: 'regerada' } },
}

export const AllVoted: Story = {
  args: {
    deck: { version: 2, films: [] },
    search: { ...LINK, erro: 'regerar' },
  },
}

export const WithoutLink: Story = {
  args: { deck: null, search: {}, home: null },
}

export const Cards: Story = {
  render: () => <VoteCards deck={DECK} action="/participar/votos?sessao=s" />,
}
