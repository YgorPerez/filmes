// The top of the Cartaz: the three Forças, the legend and what left the
// shelf.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Dropped, Legend, Strength } from './billboard-top'
import { MODEL } from './billboard.fixture'

const meta = {
  component: Legend,
  args: { billboard: MODEL },
} satisfies Meta<typeof Legend>

export default meta

type Story = StoryObj<typeof meta>

export const LegendOfTwo: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', { name: 'Força forte' }),
    ).toBeVisible()
  },
}

export const Strengths: Story = {
  render: () => (
    <p className="flex gap-xl">
      <Strength strength="strong" />
      <Strength strength="moderate" />
      <Strength strength="weak" />
    </p>
  ),
}

export const DroppedFilms: Story = {
  render: (args) => <Dropped {...args} />,
}
