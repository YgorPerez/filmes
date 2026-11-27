// Each Presente's colour, as an avatar and as a dot, filled and hollow
// (without a Fato), and the dot with her name and Nota prevista beside it.
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

const BRUNO = {
  text: '8,3',
  name: 'Bruno',
  hint: 'pela nota de 12 pessoas de gosto parecido',
  label:
    'Nota prevista de Bruno: 8,3 de 10, pela nota de 12 pessoas de gosto parecido',
}

/** On the line under "Por que" (#326), with the name and the number: a
 * mouse over it opens its hint and leaving closes it. A screen reader
 * hears the label once, and not the open popover again. */
export const DotWithRating: Story = {
  render: () => (
    <p className="mt-2xl flex gap-sm text-meta text-ink-2">
      <PersonDot person={PEOPLE[0]!} rating={BRUNO} />
      <PersonDot
        person={PEOPLE[1]!}
        hollow
        rating={{
          text: '6,9',
          name: 'Vera',
          hint: 'pela nota de 1 pessoa de gosto parecido',
          label:
            'Nota prevista de Vera: 6,9 de 10, pela nota de 1 pessoa de gosto parecido',
        }}
      />
    </p>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const dot = canvas.getByRole('button', { name: BRUNO.label })
    await expect(dot).toHaveTextContent('Bruno 8,3')
    await userEvent.hover(dot)
    await expect(canvas.getByText(BRUNO.hint)).toBeVisible()
    await expect(isInaccessible(canvas.getByText(BRUNO.hint))).toBe(true)
    await userEvent.unhover(dot)
    await expect(canvas.getByText(BRUNO.hint)).not.toBeVisible()
    // The text is small; its tap target is 44px tall (#268).
    const box = dot.getBoundingClientRect()
    const centre = box.left + box.width / 2
    const middle = box.top + box.height / 2
    for (const y of [middle - 21, middle + 21])
      await expect(dot.contains(document.elementFromPoint(centre, y))).toBe(
        true,
      )
  },
}

/** In a browser without CSS anchor positioning (Firefox, Safari before
 * 26), the hint still opens under its dot, not at the page's top left. */
export const DotWithoutAnchorPositioning: Story = {
  render: () => (
    <p className="mt-2xl ml-2xl flex gap-sm text-meta text-ink-2">
      <PersonDot person={PEOPLE[0]!} rating={BRUNO} />
    </p>
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
      const dot = canvas.getByRole('button', { name: BRUNO.label })
      await userEvent.hover(dot)
      const below = dot.getBoundingClientRect()
      const popover = canvas.getByText(BRUNO.hint).getBoundingClientRect()
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
