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
