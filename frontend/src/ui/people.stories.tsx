// The Pessoas list, the logged-in Dono first, and the form that adds one.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PeopleList } from './people'
import { PEOPLE } from './people.copy'

const PEOPLE_LIST = [
  { person: 'bruno', name: 'Bruno', aliases: ['eu'], owner: true },
  { person: 'iara', name: 'Iara', aliases: [], owner: false },
  { person: 'vera', name: 'Vera', aliases: [], owner: true },
]

const meta = {
  component: PeopleList,
  args: { people: PEOPLE_LIST, self: 'vera' },
} satisfies Meta<typeof PeopleList>

export default meta

type Story = StoryObj<typeof meta>

export const List: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('list', { name: PEOPLE.title }),
    ).toBeVisible()
  },
}

export const CreateRefused: Story = {
  args: {
    create: {
      refusal: 'email-usado',
      typed: {
        name: 'Farias',
        aliases: 'Fa',
        owner: true,
        email: 'bruno@example.org',
      },
    },
  },
}

export const NoOne: Story = { args: { people: [], self: undefined } }

export const Gone: Story = { args: { people: PEOPLE_LIST, gone: true } }

export const Unavailable: Story = { args: { people: null } }
