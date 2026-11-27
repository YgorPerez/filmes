// The night's request on the shelf label, with the Dono's words on the
// yellow paper, and the compact one of Claude's inline card.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ShelfLabel } from './shelf-label'

const meta = {
  component: ShelfLabel,
  args: { items: ['Bruno e Vera', 'até 2h', 'leve'] },
} satisfies Meta<typeof ShelfLabel>

export default meta

type Story = StoryObj<typeof meta>

export const WithNote: Story = {
  args: { note: 'algo pra rir depois do jantar' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', {
        name: 'Bruno e Vera · até 2h · leve',
      }),
    ).toBeVisible()
  },
}

export const ItemsOnly: Story = {}

export const Compact: Story = {
  args: { compact: true, note: 'algo pra rir' },
}

/** The top of Claude's fullscreen on a phone: one line, the version beside
 * it. */
export const SingleLine: Story = {
  args: {
    compact: true,
    single: true,
    tag: 'v2',
    items: ['Vocês três', 'até 1h50', 'nota 7+ no IMDb', 'leve', 'pra rir'],
  },
}

/** A narrow label wraps: each dot goes with the item after it, so a line
 * never ends on a dot (the home's counter at 390px, #271). */
export const Wrapping: Story = {
  args: { items: ['Quem está', 'Quanto tempo', 'O que a noite pede'] },
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const dots = canvasElement.querySelectorAll('.rounded-round')
    await expect(dots).toHaveLength(2)
    for (const dot of dots)
      await expect(dot.nextElementSibling?.textContent).toMatch(/\S/)
  },
}
