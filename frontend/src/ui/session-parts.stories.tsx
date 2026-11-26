// The Session's small parts: the Presentes' avatars, a date, "Nova Sessão"
// and the night's request.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import {
  Avatars,
  NewSessionLink,
  NightRequest,
  PersonAvatar,
  SessionDate,
} from './session-parts'

const PEOPLE = [{ name: 'Bruno' }, { name: 'Iara' }, { name: 'Quim' }]

function Parts({
  items,
  note,
}: {
  items: readonly string[]
  note: string | null
}) {
  return (
    <div className="flex flex-col items-start gap-lg">
      <Avatars people={PEOPLE} />
      <PersonAvatar person={{ name: 'Iara' }} index={1} />
      <SessionDate date="2026-11-20" />
      <NewSessionLink>Nova Sessão</NewSessionLink>
      <NightRequest items={items} note={note} />
    </div>
  )
}

const meta = {
  component: Parts,
  args: { items: ['leve', 'até 2h'], note: 'eu e a Iara' },
} satisfies Meta<typeof Parts>

export default meta

type Story = StoryObj<typeof meta>

export const WithItems: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('20 de novembro de 2026')).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'Nova Sessão' }),
    ).toBeVisible()
  },
}

export const NoteOnly: Story = { args: { items: [] } }

export const NothingAsked: Story = { args: { items: [], note: null } }
