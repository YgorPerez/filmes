// The Link da Sessão the Dono shares with the Presentes.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ShareSessionLink } from './session-link-share'

const meta = {
  component: ShareSessionLink,
  args: { url: 'https://cinema.example/participar?sessao=x&chave=y' },
} satisfies Meta<typeof ShareSessionLink>

export default meta

type Story = StoryObj<typeof meta>

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Copiar link' }),
    ).toBeVisible()
  },
}
