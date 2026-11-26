// The Aposta's stamp, as the card puts it on the cover.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { BetStamp } from './billboard-bet'

const meta = {
  component: BetStamp,
  args: { children: 'aposta' },
} satisfies Meta<typeof BetStamp>

export default meta

type Story = StoryObj<typeof meta>

export const Stamp: Story = {
  play: async ({ canvasElement }) => {
    // The stamp sticks on from opacity 0 (`animate-stick`), so the check is
    // its word, not its visibility.
    await expect(within(canvasElement).getByText('aposta')).toHaveTextContent(
      'aposta',
    )
  },
}
