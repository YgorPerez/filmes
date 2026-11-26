// Each Presente's colour, as an avatar and as the dot on the case, filled
// and hollow (without a Fato), and the dot with a Nota prevista beside it.
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  expect,
  isInaccessible,
  spyOn,
  userEvent,
  within,
} from 'storybook/test'
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
 * leaving closes it. A screen reader hears the hint once, as the dot's
 * name, and not the open popover again. */
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
    await expect(isInaccessible(canvas.getByText(hint))).toBe(true)
    await userEvent.unhover(canvas.getByRole('button', { name: hint }))
    await expect(canvas.getByText(hint)).not.toBeVisible()
  },
}

/** In a browser without CSS anchor positioning (Firefox, Safari before
 * 26), the hint still opens under its dot, not at the page's top left. */
export const DotWithoutAnchorPositioning: Story = {
  render: () => (
    <div className="mt-2xl ml-2xl flex gap-xs rounded-case bg-case p-sm">
      <PersonDot
        person={PEOPLE[0]!}
        rating={{ text: '8,3', hint: 'Bruno: 8,3 de 10 · 12 vizinhos' }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Chrome has anchor positioning: say it has not, and turn it off.
    const supports = spyOn(CSS, 'supports').mockReturnValue(false)
    const off = document.createElement('style')
    off.textContent =
      '[popover] { position-anchor: none !important; position-area: none !important }'
    document.head.append(off)
    try {
      const canvas = within(canvasElement)
      const hint = 'Bruno: 8,3 de 10 · 12 vizinhos'
      const dot = canvas.getByRole('button', { name: hint })
      await userEvent.hover(dot)
      const below = dot.getBoundingClientRect()
      const popover = canvas.getByText(hint).getBoundingClientRect()
      await expect(popover.left).toBeCloseTo(below.left, 0)
      await expect(popover.top).toBeGreaterThanOrEqual(below.bottom)
      await expect(popover.top).toBeLessThan(below.bottom + 8)
      await userEvent.unhover(dot)
    } finally {
      off.remove()
      supports.mockRestore()
    }
  },
}
