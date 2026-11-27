// `/entrar`: the sign-in card, and each refusal the server sends back.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Login } from './login'
import { LOGIN } from './login.copy'

const meta = {
  component: Login,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Login>

export default meta

type Story = StoryObj<typeof meta>

export const SignIn: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: LOGIN.google }),
    ).toHaveAttribute('href', '/auth/google')
  },
}

export const NotAnOwner: Story = { args: { refusal: 'nao-dono' } }

export const Expired: Story = { args: { refusal: 'expirou' } }

export const GoogleRefused: Story = { args: { refusal: 'google' } }

export const Unavailable: Story = {
  args: { refusal: 'indisponivel' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('link', { name: LOGIN.google }),
    ).toBeNull()
    await expect(
      within(canvasElement).getByRole('link', { name: LOGIN.retry }),
    ).toHaveAttribute('href', '/auth/google')
  },
}
