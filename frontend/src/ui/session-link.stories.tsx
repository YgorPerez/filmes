// The Presente's side of the Link da Sessão: the names, the night's list,
// the header once she chose, and the link that no longer opens.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import {
  FilmCover,
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
    // The Dono who opened the Session votes on her Cartaz, not here.
    await expect(canvas.queryByRole('link', { name: /Bruno/u })).toBeNull()
    await expect(canvas.getByRole('link', { name: 'Iara' })).toBeVisible()
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
  render: () => <LinkUnavailable closed={null} />,
}

export const Closed: Story = {
  render: () => <LinkUnavailable closed={{ chosen: 'Dia de Feira' }} />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Vocês viram Dia de Feira/u),
    ).toBeVisible()
  },
}

export const ClosedWithoutFilm: Story = {
  render: () => <LinkUnavailable closed={{ chosen: null }} />,
}

/** A poster that does not load: the tape falls back to the title, and the
 * small one to its initial. */
export const PosterFails: Story = {
  render: () => (
    <div className="flex items-start gap-lg">
      <FilmCover
        poster="/nao-existe.jpg"
        title="As Horas Lentas"
        className="w-[160px]"
      />
      <FilmCover
        poster="/nao-existe.jpg"
        title="As Horas Lentas"
        small
        className="w-[64px]"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('As Horas Lentas')).toBeVisible()
    await expect(await canvas.findByText('A')).toBeVisible()
  },
}
