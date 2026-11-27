// A word with a hint under it: the Presente's name in the Nota prevista
// line of "Por que cada um vai gostar" (#326).
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  expect,
  isInaccessible,
  spyOn,
  userEvent,
  within,
} from 'storybook/test'
import { Hint } from './hint'

const HINT = 'pela nota de 4 pessoas de gosto parecido'
const LABEL = `Bruno: ${HINT}`

const meta = {
  component: Hint,
  args: { label: LABEL, hint: HINT, children: 'Bruno' },
  decorators: [
    (Story) => (
      <p className="mt-2xl text-meta text-ink-2">
        previsto · <Story /> 8,3
      </p>
    ),
  ],
} satisfies Meta<typeof Hint>

export default meta

type Story = StoryObj<typeof meta>

/** A mouse over the name opens its hint and leaving closes it. A screen
 * reader hears the hint once, as the name's, and not the open popover
 * again. */
export const OnHover: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const word = canvas.getByRole('button', { name: LABEL })
    await userEvent.hover(word)
    await expect(canvas.getByText(HINT)).toBeVisible()
    await expect(isInaccessible(canvas.getByText(HINT))).toBe(true)
    await userEvent.unhover(word)
    await expect(canvas.getByText(HINT)).not.toBeVisible()
    // The word is small; its tap target is 44px tall (#268).
    const box = word.getBoundingClientRect()
    const centre = box.left + box.width / 2
    const middle = box.top + box.height / 2
    for (const y of [middle - 21, middle + 21])
      await expect(word.contains(document.elementFromPoint(centre, y))).toBe(
        true,
      )
  },
}

/** In a browser without CSS anchor positioning (Firefox, Safari before
 * 26), the hint still opens under its word, not at the page's top left. */
export const WithoutAnchorPositioning: Story = {
  play: async ({ canvasElement }) => {
    // Chrome has anchor positioning: say it has not, and turn it off.
    const supports = spyOn(CSS, 'supports').mockReturnValue(false)
    const off = document.createElement('style')
    off.textContent =
      '[popover] { position-anchor: none !important; position-area: none !important }'
    document.head.append(off)
    try {
      const canvas = within(canvasElement)
      const word = canvas.getByRole('button', { name: LABEL })
      await userEvent.hover(word)
      const below = word.getBoundingClientRect()
      const popover = canvas.getByText(HINT).getBoundingClientRect()
      await expect(popover.left).toBeCloseTo(below.left, 0)
      await expect(popover.top).toBeGreaterThanOrEqual(below.bottom)
      await expect(popover.top).toBeLessThan(below.bottom + 8)
      await userEvent.unhover(word)
    } finally {
      off.remove()
      supports.mockRestore()
    }
  },
}
