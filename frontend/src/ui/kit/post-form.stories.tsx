// A form that posts by `fetch` once the JavaScript is in: its button is
// disabled and says what it does while the post runs.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Button } from '../shadcn/button'
import { PostForm } from './post-form'

const meta = {
  component: PostForm,
  args: {
    action: '/fila/acao',
    label: 'Descartar',
    className: 'flex flex-col gap-xl',
    children: (busy: boolean) => (
      <Button type="submit" variant="option" disabled={busy}>
        {busy ? 'Descartando…' : 'Descartar'}
      </Button>
    ),
  },
} satisfies Meta<typeof PostForm>

export default meta

type Story = StoryObj<typeof meta>

export const Idle: Story = {
  play: async ({ canvasElement }) => {
    const form = within(canvasElement).getByRole('form', { name: 'Descartar' })
    await expect(
      within(form).getByRole('button', { name: 'Descartar' }),
    ).toBeEnabled()
  },
}
