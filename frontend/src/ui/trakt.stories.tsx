import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { TraktScreen } from './trakt'

const meta = {
  title: 'Trakt/Conexão',
  component: TraktScreen,
} satisfies Meta<typeof TraktScreen>
export default meta
type Story = StoryObj<typeof meta>

export const SignIn: Story = { args: { page: { status: 'login' } } }

export const Consent: Story = {
  args: { page: { status: 'disconnected', name: 'Iara' } },
  play: async ({ canvasElement }) => {
    const checkbox = within(canvasElement).getByRole('checkbox')
    await expect(checkbox).toBeRequired()
    await expect(checkbox).not.toBeChecked()
  },
}

export const Connected: Story = {
  args: { page: { status: 'connected', name: 'Iara' } },
}
