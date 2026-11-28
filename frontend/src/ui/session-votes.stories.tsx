// The group swipe: one film at a time, Não or Sim, the recap, and the
// night's list after the Votos went.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { VoteCards, VoteScreen } from './session-votes'
import { VOTES } from './session-votes.copy'
import { NEW_STICKER } from './kit/sticker'
import {
  GUEST_AFTER as AFTER,
  GUEST_DECK as DECK,
  OWNER_DECK,
} from './session-votes.fixture'

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
    await expect(
      canvas.getByText(
        (_, el) => el?.tagName === 'P' && el.textContent === VOTES.ruleText,
      ),
    ).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: VOTES.yes }))
    await expect(
      canvas.getByRole('heading', { name: 'Pequenos Milagres' }),
    ).toBeVisible()
  },
}

/** The Dono's deck: her own Nota prevista on the card, and everyone's
 * lines on the sheet (#377). */
export const OwnerSheet: Story = {
  args: { deck: OWNER_DECK },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: VOTES.more }))
    const page = within(canvasElement.ownerDocument.body)
    await expect(page.getByRole('dialog')).toBeVisible()
  },
}

/** Back after her Votos: the film that came in since has NOVO (#380). */
export const NewFilm: Story = {
  args: { deck: AFTER },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Ponte Aérea' }),
    ).toBeVisible()
    // Not `toBeVisible`: the sticker comes in from transparent.
    await expect(canvas.getByText(NEW_STICKER)).toBeInTheDocument()
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
      canvas.getByRole('heading', { level: 1, name: VOTES.review }),
    ).toBeVisible()
    await expect(
      canvas.getByText(VOTES.leaving(['Pequenos Milagres'])),
    ).toBeVisible()
    // Each row shows her Voto as the filled side of Não / Sim.
    const row = within(
      canvas.getByRole('group', { name: VOTES.voteOn('Pequenos Milagres') }),
    )
    await expect(row.getByRole('button', { name: VOTES.no })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(row.getByRole('button', { name: VOTES.yes }))
    await expect(
      canvas.getByRole('heading', { name: VOTES.summary(3, 0) }),
    ).toBeVisible()
  },
}

export const Sent: Story = {
  args: { deck: AFTER, search: { ...LINK, feito: 'regerada' } },
}

/** Sent from a deck that went stale: another Presente's não had taken a
 * film out before her sim on it arrived. */
export const SentLate: Story = {
  args: {
    deck: { ...AFTER, stale: ['Quermesse'] },
    search: { ...LINK, feito: 'regerada' },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(VOTES.stale(['Quermesse'])),
    ).toBeVisible()
  },
}

export const AllVoted: Story = {
  args: {
    deck: {
      ...AFTER,
      films: AFTER.films.map((f) => ({ ...f, mine: 'yes' as const })),
    },
  },
}

/** Mudar votos: her Votos come back chosen, on the recap (#340). */
export const Revote: Story = {
  args: {
    deck: {
      ...AFTER,
      films: AFTER.films.map((f, i) => ({
        ...f,
        mine: i === 0 ? ('no' as const) : ('yes' as const),
      })),
    },
    search: { ...LINK, mudar: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { level: 1, name: VOTES.review }),
    ).toBeVisible()
    await expect(canvas.getByText(VOTES.kept)).toBeVisible()
  },
}

export const Failure: Story = {
  args: { search: { ...LINK, erro: 'falha' } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', {
        level: 1,
        name: VOTES.stuck.falha,
      }),
    ).toBeVisible()
  },
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
