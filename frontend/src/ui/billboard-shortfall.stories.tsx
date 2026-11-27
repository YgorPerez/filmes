// The Falta strip at the top of the Cartaz (#357): the similar films ran
// out, something was relaxed to fill the list (#358), and nothing with a
// full list.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ShortfallStrip } from './billboard-shortfall'
import { MODEL } from './billboard.fixture'

const meta = {
  component: ShortfallStrip,
  args: {
    billboard: {
      ...MODEL,
      shortfall:
        'Acabaram os parecidos com Esqueceram de Mim: vieram 5 dos 9 filmes pedidos.',
    },
  },
} satisfies Meta<typeof ShortfallStrip>

export default meta

type Story = StoryObj<typeof meta>

export const SimilarRanOut: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('note')).toHaveTextContent(
      'vieram 5 dos 9 filmes pedidos',
    )
  },
}

export const Relaxed: Story = {
  args: {
    billboard: {
      ...MODEL,
      shortfall:
        'Acabaram os parecidos com Esqueceram de Mim; entraram 3 de antes de 1990.',
    },
  },
}

export const FullList: Story = {
  args: { billboard: MODEL },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('note')).toBeNull()
  },
}
