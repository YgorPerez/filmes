// The footer under every page: the one link to the sources' credits.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { SiteFooter } from './site-footer'
import { SITE_FOOTER } from './site-footer.copy'

const meta = {
  component: SiteFooter,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SiteFooter>

export default meta

type Story = StoryObj<typeof meta>

export const Credits: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: SITE_FOOTER.credits }),
    ).toHaveAttribute('href', '/creditos')
  },
}
