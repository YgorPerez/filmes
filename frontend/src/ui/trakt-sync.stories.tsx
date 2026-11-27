// The Trakt section of the import page (#269): her own page, connected or
// not, and another Pessoa's, before and after a public profile was read.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { TraktSync } from './trakt-sync'
import { TRAKT_SYNC } from './trakt-sync.copy'

const meta = {
  component: TraktSync,
  args: {
    slug: 'bruno',
    name: 'Bruno',
    own: true,
    link: { available: true, connected: true, user: null },
  },
} satisfies Meta<typeof TraktSync>

export default meta

type Story = StoryObj<typeof meta>

export const Connected: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: TRAKT_SYNC.sync }),
    ).toBeVisible()
  },
}

export const NotConnected: Story = {
  args: { link: { available: true, connected: false, user: null } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: TRAKT_SYNC.connectLink }),
    ).toBeVisible()
  },
}

export const OtherPessoa: Story = {
  args: {
    slug: 'iara',
    name: 'Iara',
    own: false,
    link: { available: true, connected: false, user: null },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('checkbox', {
        name: TRAKT_SYNC.consent('Iara'),
      }),
    ).toBeVisible()
    // Only Iara can connect hers: no way to /trakt here (#274).
    await expect(within(canvasElement).queryByRole('link')).toBeNull()
  },
}

export const OtherPessoaLinked: Story = {
  args: {
    slug: 'iara',
    name: 'Iara',
    own: false,
    link: { available: true, connected: false, user: '@iara_ve' },
  },
}

/** Her own page, not connected: the account recommended, the profile and
 * the ZIP folded under it (#274). */
export const NotConnectedWithZip: Story = {
  args: {
    link: { available: true, connected: false, user: null },
    zip: <p>Os passos e o envio do ZIP do Trakt.</p>,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(TRAKT_SYNC.zip)).toBeVisible()
    await expect(
      canvas.queryByText('Os passos e o envio do ZIP do Trakt.'),
    ).not.toBeVisible()
  },
}

/** A server with no Trakt client id: only the ZIP, unfolded. */
export const NoClientId: Story = {
  args: {
    link: { available: false, connected: false, user: null },
    zip: <p>Os passos e o envio do ZIP do Trakt.</p>,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Os passos e o envio do ZIP do Trakt.'),
    ).toBeVisible()
  },
}
