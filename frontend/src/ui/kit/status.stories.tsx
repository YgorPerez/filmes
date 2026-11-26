// The alert of a refusal, boxed and as the shell's strip, and the notice of
// what went through.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Alert, Notice } from './status'

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
