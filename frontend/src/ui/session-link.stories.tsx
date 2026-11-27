// The Presente's side of the Link da Sessão: the names, the night's list,
// the header once she chose, and the link that no longer opens.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import {
  LinkFilms,
  LinkHeader,
  LinkPicker,
  LinkUnavailable,
} from './session-link'
import { PEOPLE, VIEW, VOTED } from './session-link.fixture'
import { PARTICIPATION } from './session-link.copy'

const VOTE = {
  deck: '/participar/votar?sessao=s&chave=k&presente=iara',
  revote: '/participar/votar?sessao=s&chave=k&presente=iara&mudar=1',
}
const QUESTIONS = '/participar/perguntas?sessao=s&chave=k&presente=iara'

const meta = {
  component: LinkFilms,
  args: { view: VIEW, vote: VOTE, questions: QUESTIONS },
} satisfies Meta<typeof LinkFilms>

export default meta

type Story = StoryObj<typeof meta>

export const Films: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('list', { name: PARTICIPATION.films }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: PARTICIPATION.vote }),
    ).toBeVisible()
  },
}

export const AfterVoting: Story = { args: { view: VOTED } }

export const AllVoted: Story = {
  args: {
    view: {
      ...VOTED,
      films: VOTED.films.map((f) => ({ ...f, mine: 'yes' as const })),
      questions: 0,
    },
  },
}

export const Picker: Story = {
  render: () => (
    <LinkPicker
      view={{ ...VIEW, selected: null, films: [] }}
      hrefFor={(person) => `/participar?presente=${person}`}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: PARTICIPATION.pick }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: /Bruno/u }),
    ).toHaveTextContent(PARTICIPATION.opened)
  },
}

export const UnknownName: Story = {
  render: () => (
    <LinkPicker
      view={{ ...VIEW, selected: null, films: [] }}
      hrefFor={(person) => `/participar?presente=${person}`}
      unknown
    />
  ),
}

export const Header: Story = {
  render: () => (
    <LinkHeader person={PEOPLE[1]!} notYou="/participar?sessao=s&chave=k" />
  ),
}

export const Broken: Story = {
  render: () => <LinkUnavailable closed={false} />,
}

export const Closed: Story = { render: () => <LinkUnavailable closed /> }
