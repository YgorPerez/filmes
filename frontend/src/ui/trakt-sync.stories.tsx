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
