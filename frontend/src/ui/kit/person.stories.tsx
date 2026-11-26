// Each Presente's colour, as an avatar and as the dot on the case, filled
// and hollow (without a Fato), and the dot with a Nota prevista beside it.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Avatar, PersonDot } from './person'

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
      {[false, true].map((hollow) => (
        <div key={String(hollow)} className="flex items-center gap-xs">
          {PEOPLE.map((person) => (
            <PersonDot key={person.name} person={person} hollow={hollow} />
          ))}
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    // The avatars show the initial; the dots are only a picture.
    await expect(within(canvasElement).getAllByText('B')).toHaveLength(2)
  },
}

/** On the case, with the number: a mouse over the dot opens its hint and
 * leaving closes it. */
export const DotWithRating: Story = {
  render: () => (
    <div className="flex gap-xs rounded-case bg-case p-sm">
      <PersonDot
        person={PEOPLE[0]!}
        rating={{ text: '8,3', hint: 'Bruno: 8,3 de 10 · 12 vizinhos' }}
      />
      <PersonDot
        person={PEOPLE[1]!}
        hollow
        rating={{ text: '6,9', hint: 'Vera: 6,9 de 10 · 1 vizinho' }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const hint = 'Bruno: 8,3 de 10 · 12 vizinhos'
    await userEvent.hover(canvas.getByRole('button', { name: hint }))
    await expect(canvas.getByText(hint)).toBeVisible()
    await userEvent.unhover(canvas.getByRole('button', { name: hint }))
    await expect(canvas.getByText(hint)).not.toBeVisible()
  },
}
