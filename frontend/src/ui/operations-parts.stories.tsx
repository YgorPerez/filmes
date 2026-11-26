// Operações' small parts: an action's plain POST with its button, and the
// technical detail under a message.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ActionPost, Detail } from './operations-parts'

const meta = {
  component: ActionPost,
  args: {
    action: 'enviar',
  },
} satisfies Meta<typeof ActionPost>

export default meta

type Story = StoryObj<typeof meta>

export const Action: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Tentar enviar agora',
      }),
    ).toHaveProperty('type', 'submit')
  },
}

export const DetailUnderAMessage: Story = {
  render: () => (
    <p>
      O envio está desligado.
      <Detail>
        <code>DATA_REPO_REMOTE</code>
      </Detail>
    </p>
  ),
}
