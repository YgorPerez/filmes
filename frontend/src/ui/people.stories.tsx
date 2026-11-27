// The Pessoas list, the logged-in Dono first, and the form that adds one.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PeopleList } from './people'
import { PEOPLE } from './people.copy'

const PEOPLE_LIST = [
  {
    person: 'bruno',
    name: 'Bruno',
    aliases: ['eu'],
    owner: true,
    ratings: 11,
    vetoes: 1,
  },
  {
    person: 'iara',
    name: 'Iara',
    aliases: [],
    owner: false,
    ratings: 2,
    vetoes: 0,
  },
  {
    person: 'teo',
    name: 'Teo',
    aliases: [],
    owner: false,
    ratings: 0,
    vetoes: 0,
  },
  {
    person: 'vera',
    name: 'Vera',
    aliases: [],
    owner: true,
    ratings: 0,
    vetoes: 0,
  },
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

export const Removed: Story = { args: { people: PEOPLE_LIST, removed: true } }

/** An admin adding a Dono: the e-mail and the Test users line show once
 * "É Dono" is marked. */
export const CreateOwner: Story = {
  args: { admin: true },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText(PEOPLE.create.title))
    await expect(
      canvas.queryByLabelText(PEOPLE.create.email, { exact: false }),
    ).not.toBeVisible()
    await userEvent.click(canvas.getByText(PEOPLE.create.owner))
    await expect(
      canvas.getByLabelText(PEOPLE.create.email, { exact: false }),
    ).toBeVisible()
  },
}

export const Unavailable: Story = { args: { people: null } }
