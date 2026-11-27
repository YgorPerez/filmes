// The Sessions list and a Session's page with its Cartaz.
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { expect, within } from 'storybook/test'
import { CLOSED as TOLD, MODEL } from './billboard.fixture'
import { SessionList, SessionScreen } from './sessions'

// The screens' own props: the story leaves the server modules alone.
type SessionItem = NonNullable<
  ComponentProps<typeof SessionList>['sessions']
>[number]
type CartazPage = Exclude<
  ComponentProps<typeof SessionScreen>['page'],
  'unknown' | null
>

const OPEN: SessionItem = {
  id: '2026-11-20-iara',
  date: '2026-11-20',
  request: 'eu e a Iara',
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'iara', name: 'Iara', owner: false },
  ],
  recommendation: [
    { position: 1, id: 'tt9000101', title: 'O Farol de Areia' },
    { position: 2, id: 'tt9000601', title: 'Pequenos Milagres' },
  ],
  open: true,
  chosen: null,
  moods: ['leve'],
  constraints: ['até 2h', 'com criança de 7 anos'],
  version: 1,
  additions: [],
}

const CLOSED: SessionItem = {
  ...OPEN,
  id: '2026-11-19-quim',
  date: '2026-11-19',
  request: null,
  attendees: [{ person: 'quim', name: 'Quim', owner: false }],
  open: false,
  chosen: { id: 'tt9000601', title: 'Pequenos Milagres' },
  moods: [],
  constraints: [],
}

const PAGE: CartazPage = {
  session: OPEN,
  billboard: MODEL,
  warnings: [],
  addition: null,
}

const meta = {
  component: SessionList,
  args: {
    sessions: [
      CLOSED,
      { ...OPEN, version: 2, additions: ['chegou a Rosa'] },
      { ...CLOSED, id: 'nada', chosen: null },
    ],
  },
} satisfies Meta<typeof SessionList>

export default meta

type Story = StoryObj<typeof meta>

export const List: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('link', { name: 'Nova Sessão' }),
    ).toBeVisible()
    const rows = canvas.getAllByRole('listitem')
    await expect(rows).toHaveLength(3)
    // The open Session comes first, with its state and version (#272).
    await expect(rows[0]).toHaveTextContent('para contar')
    await expect(rows[0]).toHaveTextContent('versão 2')
    await expect(rows[1]).toHaveTextContent('contada')
  },
}

export const PendingEmpty: Story = {
  args: { sessions: [], pendingOnly: true },
}

/** One orange button: the empty state's (#272). */
export const Empty: Story = {
  args: { sessions: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('link', { name: 'Nova Sessão' })).toBeNull()
    await expect(
      canvas.getByRole('link', { name: 'Pedir filme' }),
    ).toBeVisible()
  },
}

export const ListUnavailable: Story = { args: { sessions: null } }

export const Session: Story = {
  render: () => <SessionScreen page={PAGE} notice="aberta" />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { level: 1 }),
    ).toHaveTextContent('Sex, 20 nov')
  },
}

export const SessionWithLink: Story = {
  render: () => (
    <SessionScreen
      page={{
        ...PAGE,
        sessionLink: 'https://cinema.example/participar?sessao=x&chave=y',
      }}
    />
  ),
}

export const SessionAfterReply: Story = {
  render: () => (
    <SessionScreen
      page={{
        ...PAGE,
        warnings: ['só 2 passaram nas Restrições'],
        addition: 'chegou a Iara e o Zeca, parecido com Reprise e Amélie',
        reading: {
          understood: ['Presente: Iara', 'até 1h50'],
          notUnderstood: ['Zeca'],
          ambiguities: [
            {
              field: 'similar',
              words: 'Reprise',
              candidates: [
                { id: 'tt9012601', label: 'Reprise (2011)' },
                { id: 'tt9012602', label: 'Reprise (2004)' },
              ],
            },
            { field: 'similar', words: 'Amélie', candidates: [] },
          ],
        },
      }}
      notice="regerada"
      refusal="regerar"
    />
  ),
}

export const SessionClosed: Story = {
  render: () => (
    <SessionScreen
      page={{
        ...PAGE,
        session: CLOSED,
        billboard: { ...MODEL, open: false },
      }}
    />
  ),
}

/** The tape given back with each comment and what the Cartaz kept of the
 * film (#272). */
export const SessionToldWithComments: Story = {
  render: () => {
    const [seen, ...rest] = TOLD.films
    return (
      <SessionScreen
        page={{
          ...PAGE,
          session: {
            ...CLOSED,
            attendees: OPEN.attendees,
            chosen: { id: seen!.id, title: seen!.title },
          },
          billboard: {
            ...TOLD,
            films: [
              {
                ...seen!,
                reactions: seen!.reactions!.map((r) =>
                  r.person === 'iara' ? { ...r, comment: 'dormiu no meio' } : r,
                ),
                notes: { stars: 4, comments: ['a Iara riu do trailer'] },
              },
              ...rest,
            ],
          },
        }}
      />
    )
  },
  play: async ({ canvasElement }) => {
    const tape = within(canvasElement).getByRole('region', {
      name: 'Fita devolvida',
    })
    await expect(tape).toHaveTextContent('“dormiu no meio”')
    await expect(tape).toHaveTextContent('4 de 5 ★')
  },
}

export const SessionClosedWithTraktWarning: Story = {
  render: () => (
    <SessionScreen
      page={{
        ...PAGE,
        session: CLOSED,
        billboard: { ...MODEL, open: false },
        warnings: ['O Feedback foi salvo. O envio ao Trakt falhou.'],
      }}
    />
  ),
}

export const SessionUnknown: Story = {
  render: () => <SessionScreen page="unknown" />,
}

export const SessionUnavailable: Story = {
  render: () => <SessionScreen page={null} />,
}
