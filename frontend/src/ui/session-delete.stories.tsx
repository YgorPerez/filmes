import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { SessionDelete } from './session-delete'

const meta = {
  title: 'Sessões/Excluir',
  component: SessionDelete,
  args: { session: '2026-11-20-iara', hasFacts: true },
} satisfies Meta<typeof SessionDelete>
export default meta

type Story = StoryObj<typeof meta>

export const WithFacts: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Excluir$/u }))
    const dialog = canvas.getByRole('dialog', { name: 'Excluir Sessão?' })
    await expect(dialog).toBeVisible()
    await expect(within(dialog).queryAllByRole('radio')).toHaveLength(
      args.hasFacts ? 2 : 0,
    )
  },
}

export const WithoutFacts: Story = {
  args: { hasFacts: false },
  play: WithFacts.play,
}
