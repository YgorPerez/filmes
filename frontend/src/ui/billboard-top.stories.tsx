// The top of the Cartaz: the three Forças, the key behind its "?" and the
// line of what changed, with what left the shelf behind "por quê".
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Dropped, Legend, Strength } from './billboard-top'
import { MODEL } from './billboard.fixture'

const meta = {
  component: Dropped,
  args: { billboard: MODEL },
} satisfies Meta<typeof Dropped>

export default meta

type Story = StoryObj<typeof meta>

/** "Refeito: 1 saiu, 1 novo.", and why behind "por quê". */
export const DroppedFilms: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(page.getByText(/^Refeito:/)).toBeVisible()
    await userEvent.click(page.getByText('por quê'))
    await expect(page.getByText(/Saiu da prateleira/)).toBeVisible()
  },
}

export const LegendBehindAsk: Story = {
  render: () => <Legend />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await userEvent.click(page.getByLabelText('O que querem dizer os pontos'))
    await expect(page.getByRole('img', { name: 'Força forte' })).toBeVisible()
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
