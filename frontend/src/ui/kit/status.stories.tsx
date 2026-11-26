// The alert of a refusal, boxed and as the shell's strip, and the notice of
// what went through, and the alert of a post that got no answer.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Alert, Notice, POST_FAILED, PostFailed } from './status'

const meta = {
  component: Alert,
  args: { children: 'Não deu para salvar: tente de novo.' },
} satisfies Meta<typeof Alert>

export default meta

type Story = StoryObj<typeof meta>

export const Boxed: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toBeVisible()
  },
}

export const Strip: Story = { args: { strip: true } }

export const NoticeOfSuccess: Story = {
  render: () => <Notice>Nota salva.</Notice>,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toBeVisible()
  },
}

export const PostFailedToConfirm: Story = {
  render: () => <PostFailed failed />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
      POST_FAILED,
    )
  },
}
