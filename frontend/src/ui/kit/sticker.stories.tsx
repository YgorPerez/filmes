// The price sticker, full and compact, and the TROCAR, SIM and JÁ VI
// stickers.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PriceSticker, Sticker } from './sticker'

const meta = {
  component: Sticker,
  args: { kind: 'swap', children: 'Trocar' },
} satisfies Meta<typeof Sticker>

export default meta

type Story = StoryObj<typeof meta>

export const Swap: Story = {
  // Not `toBeVisible`: the sticker comes in from transparent (`animate-stick`).
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Trocar')).toBeInTheDocument()
  },
}

export const Yes: Story = { args: { kind: 'yes', children: 'Sim' } }

export const Seen: Story = { args: { kind: 'seen', children: 'Já vi' } }

export const Price: Story = {
  render: () => (
    <div className="flex items-center gap-md">
      <PriceSticker>1</PriceSticker>
      <PriceSticker compact>2</PriceSticker>
    </div>
  ),
}
