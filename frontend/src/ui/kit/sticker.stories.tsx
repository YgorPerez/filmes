// The price sticker, full and compact, and the NOVO, TROCAR and JÁ VI
// stickers.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PriceSticker, Sticker } from './sticker'

const meta = {
  component: Sticker,
  args: { kind: 'new', children: 'Novo' },
} satisfies Meta<typeof Sticker>

export default meta

type Story = StoryObj<typeof meta>

export const New: Story = {
  // Not `toBeVisible`: the sticker comes in from transparent (`animate-stick`).
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Novo')).toBeInTheDocument()
  },
}

export const Swap: Story = { args: { kind: 'swap', children: 'Trocar' } }

export const Seen: Story = { args: { kind: 'seen', children: 'Já vi' } }

export const Price: Story = {
  render: () => (
    <div className="flex items-center gap-md">
      <PriceSticker>1</PriceSticker>
      <PriceSticker compact>2</PriceSticker>
    </div>
  ),
}
