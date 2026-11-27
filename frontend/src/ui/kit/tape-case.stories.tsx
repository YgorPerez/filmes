// The tape's case: a cover without a poster.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { TapeCase } from './tape-case'

const meta = {
  component: TapeCase,
  args: { cover: 'Um Sonho de Liberdade', className: 'w-[120px]' },
} satisfies Meta<typeof TapeCase>

export default meta

type Story = StoryObj<typeof meta>

export const WithTitle: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Um Sonho de Liberdade'),
    ).toBeVisible()
  },
}

export const Empty: Story = {}
