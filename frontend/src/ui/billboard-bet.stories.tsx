// The Aposta's stamp, as the card puts it on the cover.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { BetStamp } from './billboard-bet'

const BET_HINT =
  'Aposta: pouca Evidência, mas quem tem gosto parecido deu nota alta'

const meta = {
  component: BetStamp,
  args: { hint: BET_HINT, children: 'aposta' },
} satisfies Meta<typeof BetStamp>

export default meta

type Story = StoryObj<typeof meta>

export const Stamp: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTitle(BET_HINT)).toHaveTextContent(
      'aposta',
    )
  },
}
