// Each Presente's colour, as an avatar, filled and hollow (without a Fato).
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Avatar } from './person'

const PEOPLE = ['Bruno', 'Vera', 'Iara', 'Quim', 'Lia', 'Teo'].map(
  (name, index) => ({ color: index + 1, initial: name[0] ?? '', name }),
)

const meta = {
  component: Avatar,
  args: { person: PEOPLE[0]! },
} satisfies Meta<typeof Avatar>

export default meta

type Story = StoryObj<typeof meta>

export const One: Story = {}

export const Colors: Story = {
  render: () => (
    <div className="flex flex-col gap-md">
      {[false, true].map((hollow) => (
        <div key={String(hollow)} className="flex items-center gap-sm">
          {PEOPLE.map((person) => (
            <Avatar key={person.name} person={person} hollow={hollow} />
          ))}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Filled and hollow, each shows the initial.
    await expect(within(canvasElement).getAllByText('B')).toHaveLength(2)
  },
}
