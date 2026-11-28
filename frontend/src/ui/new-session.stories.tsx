// The "Nova Sessão" form: empty, with a Catálogo search, with a sentence
// "Ler" read, refused, and without the engine.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { NewSession } from './new-session'
import { SESSIONS } from './sessions.copy'

const meta = {
  component: NewSession,
  args: {
    options: {
      people: [
        { person: 'bruno', name: 'Bruno', owner: true },
        { person: 'iara', name: 'Iara', owner: false },
        { person: 'quim', name: 'Quim', owner: false },
      ],
      moods: ['leve', 'pra rir', 'tenso', 'conhecido', 'desconhecido'],
      noMoods: ['leve', 'pra rir', 'tenso'],
    },
  },
} satisfies Meta<typeof NewSession>

export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('form', { name: SESSIONS.form.label }),
    ).toBeVisible()
    await expect(canvas.getByRole('checkbox', { name: 'Iara' })).toBeEnabled()
  },
}

export const WithSearch: Story = {
  args: {
    similar: 'tt9000101',
    search: {
      query: 'mare',
      found: {
        query: 'mare',
        films: [
          {
            id: 'tt9000102',
            title: 'Maré Baixa',
            year: 2015,
            votes: 32000,
            rating: null,
            directors: ['Helena Prado'],
          },
        ],
        people: [],
        genres: [],
        series: [],
      },
    },
  },
}

export const ReadDraft: Story = {
  args: {
    note: '6f1c2a90-0000-4000-8000-000000000001',
    draft: {
      fields: {
        request:
          'a Iara, pelo gosto dela, leve, 3 filmes, até 2h, dos anos 90, nacional',
        attendees: ['iara'],
        rule: 'by',
        by: 'iara',
        moods: ['leve'],
        count: 3,
        maxDuration: 120,
        since: 1990,
        until: 1999,
        language: 'pt',
        child: 7,
        triggers: ['aranha'],
        similar: ['tt9001904'],
        unseen: true,
        noSlow: true,
        noSad: true,
      },
      reading: {
        understood: ['Presente: Iara', 'Clima: leve'],
        notUnderstood: ['pipoca', 'traz o vinho'],
        ambiguities: [
          {
            field: 'attendees',
            words: 'Teo',
            candidates: [
              { id: 'rosa', label: 'Rosa' },
              { id: 'teo', label: 'Teo' },
            ],
          },
          { field: 'similar', words: 'Amélie', candidates: [] },
        ],
      },
    },
  },
}

export const Refused: Story = { args: { refusal: 'presentes' } }

export const Unavailable: Story = { args: { options: null } }
