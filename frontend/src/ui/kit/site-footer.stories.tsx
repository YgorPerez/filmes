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

/** Under the Session link's pages: the guest column's width. */
export const Narrow: Story = { args: { width: 'link' } }

/** Under `/entrar`: the sign-in card's width. */
export const Card: Story = { args: { width: 'card' } }
