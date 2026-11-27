// A Pessoa's page and Meu gosto: her Notas, her start, her taste and its forms.
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import type { SetupStep } from '@filmes/engine'
import { expect, within } from 'storybook/test'
import { PersonScreen } from './person'

// The screen's own props: the story leaves the server module alone.
type PersonPage = Exclude<
  ComponentProps<typeof PersonScreen>['page'],
  'unknown' | null
>
import { PERSON } from './person.copy'

const IARA: PersonPage = {
  person: 'iara',
  name: 'Iara',
  aliases: ['ia'],
  owner: false,
  viewer: { person: 'bruno', name: 'Bruno', admin: false },
  vetoes: [
    {
      text: 'nunca vê terror',
      target: 'Q9001801',
      label: 'Terror',
      date: '2026-11-19',
      factId: 'vetos:1',
    },
  ],
  adjustments: [
    { link: 'cast', level: 'none', date: '2026-11-18', factId: 'ajustes:1' },
  ],
  stated: [
    {
      text: 'adoro os filmes dela',
      source: 'questionário',
      date: '2026-11-17',
      specific: true,
      reaction: 'love',
      target: 'Q9000018',
      label: 'Sofia Rangel',
      kind: 'stated',
      strength: 'strong',
      rating: null,
      factId: 'declarados:1',
    },
    {
      text: 'Ótimo',
      source: 'Letterboxd da Iara',
      date: '2025-01-01',
      specific: true,
      reaction: null,
      target: 'tt9000101',
      label: 'O Farol de Areia',
      kind: 'stated',
      strength: 'moderate',
      rating: null,
      factId: 'letterboxd:1',
    },
  ],
  reports: [
    {
      text: 'odeia filme lento',
      source: 'descrição do Dono',
      date: '2026-11-16',
      specific: false,
      reaction: null,
      target: null,
      label: null,
      kind: 'report',
      strength: 'weak',
      rating: null,
      factId: 'relatos:1',
    },
  ],
  seen: [
    {
      film: 'tt9000602',
      title: 'Casa Cheia',
      rating: 4.5,
      date: '2026-11-15',
      source: 'conversa com o Dono',
      factId: 'vistos:1',
    },
  ],
  openQuestions: [
    {
      text: 'a Iara curte terror?',
      subject: 'Q9001801',
      label: 'Terror',
      date: '2026-11-14',
      skips: 1,
      factId: 'perguntas_abertas:1',
    },
    {
      text: 'curte comédia boba?',
      subject: 'silly_comedy',
      label: 'comédia boba',
      date: '2026-11-14',
      skips: 1,
      factId: 'perguntas_abertas:2',
    },
  ],
  ratings: [
    {
      filmId: 'tt9000401',
      title: 'Fronteira',
      rating: 4,
      date: '2025-08-30',
      source: 'Letterboxd da Iara',
      kind: 'rating',
      factId: 'notas:1',
    },
  ],
  tagGroups: [
    { key: 'silly_comedy', label: 'comédia boba' },
    { key: 'slow', label: 'lento' },
  ],
  sessions: { total: 0, recent: [], satisfaction: null },
  imported: false,
}

/** The setup guide's steps, in its order (`SETUP_STEPS`). */
const STEPS: readonly SetupStep[] = ['taste', 'import', 'connector']

const WITH_HISTORY: PersonPage = {
  ...IARA,
  predictionError: { meanAbsoluteError: 1.2, films: 30 },
  ratings: Array.from({ length: 30 }, (_, i) => ({
    filmId: `tt90004${String(i + 1).padStart(2, '0')}`,
    title: i === 0 ? 'Fronteira' : `Filme ${i + 1}`,
    rating: 3 + (i % 5) / 2,
    date: '2025-08-30',
    source: 'Letterboxd da Iara',
    kind: 'rating',
    factId: `notas:${i + 1}`,
  })),
}

const OWN: PersonPage = {
  ...WITH_HISTORY,
  person: 'bruno',
  name: 'Bruno',
  owner: true,
}

const PREDICTION_ERROR = 'a previsão erra 1,2 ponto em média, em 30 filmes'

const meta = {
  component: PersonScreen,
  args: { slug: 'iara', page: IARA },
} satisfies Meta<typeof PersonScreen>

export default meta

type Story = StoryObj<typeof meta>

export const AnotherPerson: Story = {
  args: { page: WITH_HISTORY },
  play: async ({ canvasElement }) => {
    const notes = within(canvasElement).getByRole('region', {
      name: PERSON.notes.title,
    })
    await expect(within(notes).getByText(PREDICTION_ERROR)).toBeVisible()
    await expect(
      within(notes).getByRole('link', {
        name: PERSON.notes.downloadLetterboxd,
      }),
    ).toHaveAttribute('href', '/exportar/letterboxd.csv?pessoa=iara')
  },
}

export const MyTaste: Story = {
  args: {
    slug: 'bruno',
    page: OWN,
    start: {
      setup: {
        ratings: 30,
        steps: STEPS.map((step) => ({
          step,
          done: step === 'taste',
          skipped: step === 'import',
        })),
      },
      mcpUrl: 'https://filmes.example/mcp',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(PREDICTION_ERROR),
    ).toBeVisible()
  },
}

/** Two films of her import wait in the queue: the Notas slip says so, and
 * the next step leads there. */
export const MyTasteWithQueue: Story = {
  args: {
    ...MyTaste.args,
    pending: 2,
    taste: {
      person: 'bruno',
      liked: 8,
      genres: ['Drama', 'Crime', 'Romance'],
      directors: ['Helena Prado', 'Rui Tavares'],
    },
  },
}

export const MyTasteWithTrakt: Story = {
  args: { ...MyTaste.args, showTrakt: true },
}

export const AdminGrantsAccess: Story = {
  args: {
    page: {
      ...IARA,
      viewer: { person: 'bruno', name: 'Bruno', admin: true },
      access: { email: null },
    },
  },
}

export const Empty: Story = {
  args: {
    page: {
      ...IARA,
      vetoes: [],
      stated: [],
      reports: [],
      seen: [],
      openQuestions: [],
      ratings: null,
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByText(/a previsão erra/),
    ).not.toBeInTheDocument()
  },
}

export const WithNotice: Story = { args: { notice: 'criada' } }

export const WithRefusal: Story = { args: { refusal: 'alvo' } }

/** A Declarado saved: the Afinar fold opens on the ficha that posted, which
 * says it (#273). */
export const SavedInPlace: Story = {
  args: { notice: 'gravado', spot: 'declarados' },
  play: async ({ canvasElement }) => {
    const stated = within(canvasElement).getByRole('region', {
      name: PERSON.stated.title,
    })
    await expect(within(stated).getByRole('status')).toBeVisible()
  },
}

/** A Veto refused without the JavaScript: its form open, the field marked. */
export const RefusedField: Story = {
  args: {
    refusal: 'pedido',
    spot: 'vetos',
    problem: { field: 'alvo', problem: 'target' },
  },
}

/** A Veto open for editing (#330): its form filled in its place. */
export const EditingVeto: Story = {
  args: { editing: 'vetos:1' },
  play: async ({ canvasElement }) => {
    const form = within(canvasElement).getByRole('form', {
      name: PERSON.edit.label('nunca vê terror'),
    })
    await expect(form).toBeVisible()
  },
}

/** A Já visto open for editing: the film fixed, its Nota and Fonte. */
export const EditingSeen: Story = {
  args: { editing: 'vistos:1' },
}

/** A Já visto just edited: marked in its place, its own date, then the
 * day of the edit. */
export const EditedItem: Story = {
  args: {
    notice: 'editado',
    spot: 'vistos',
    saved: 'vistos:1',
    page: {
      ...IARA,
      seen: IARA.seen.map((s) => ({ ...s, rating: 4, edited: '2026-11-27' })),
    },
  },
}

/** An Ajuste tapped: "gravado" beside it. */
export const AdjustmentSaved: Story = {
  args: { notice: 'ajustado', spot: 'ajuste-cast' },
}

/** A Pessoa who went to Sessões: the latest, and how she came out. */
export const WithSessions: Story = {
  args: {
    page: {
      ...IARA,
      sessions: {
        total: 5,
        recent: [
          {
            id: '2026-11-19-bruno-iara',
            date: '2026-11-19',
            chosen: { id: 'tt9000302', title: 'Noite de Estreia' },
            reaction: 1,
          },
          {
            id: '2026-11-12-bruno-iara',
            date: '2026-11-12',
            chosen: { id: 'tt9000401', title: 'Fronteira' },
            reaction: 0.3,
          },
          {
            id: '2026-11-05-bruno-iara',
            date: '2026-11-05',
            chosen: null,
            reaction: null,
          },
        ],
        satisfaction: { value: 0.65, sessions: 2 },
      },
    },
  },
}

export const Unknown: Story = { args: { slug: 'ninguem', page: 'unknown' } }

export const Unavailable: Story = { args: { page: null } }
