// A screen's title, with and without the lead.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PageHead } from './page-head'

const meta = {
  component: PageHead,
  args: { title: 'Pessoas' },
} satisfies Meta<typeof PageHead>

export default meta

type Story = StoryObj<typeof meta>

export const WithLead: Story = {
  args: { lead: 'Quem assiste com você: o gosto de cada um entra na conta.' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { name: 'Pessoas' }),
    ).toBeVisible()
  },
}

export const TitleOnly: Story = {}
