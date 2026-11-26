// The arrow at the end of a row that leads to another page.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { RowArrow } from './row-arrow'

const meta = { component: RowArrow } satisfies Meta<typeof RowArrow>

export default meta

type Story = StoryObj<typeof meta>

export const InARow: Story = {
  render: () => (
    <a href="#pessoas" className="flex items-center justify-between gap-sm">
      Pessoas
      <RowArrow />
    </a>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Pessoas' }),
    ).toBeVisible()
  },
}
