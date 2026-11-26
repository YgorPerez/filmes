// The chips of a film's card: a year, a duration, a coloured genre and an
// uncoloured one.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Chip } from './chip'

const meta = {
  component: Chip,
  args: { children: 'Comédia' },
} satisfies Meta<typeof Chip>

export default meta

type Story = StoryObj<typeof meta>

export const Genre: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Comédia')).toBeVisible()
  },
}

export const UncoloredGenre: Story = { args: { children: 'Documentário' } }

export const Year: Story = { args: { children: '1994' } }

export const Duration: Story = { args: { children: '1h 42min' } }
