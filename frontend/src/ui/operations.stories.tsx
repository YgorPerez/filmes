// `/operacoes` for an admin: the console, the push and the evaluation, with
// an answer, a refusal and a failing push.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Operations } from './operations'
import { OPERATIONS } from './operations.copy'
import { CONSULT, PAGE, PUSH_FAILING, pending } from './operations.fixture'

const meta = {
  component: Operations,
  parameters: { layout: 'fullscreen' },
  args: { page: PAGE, readEvaluation: pending },
} satisfies Meta<typeof Operations>

export default meta

type Story = StoryObj<typeof meta>

export const Idle: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', { name: OPERATIONS.title }),
    ).toBeVisible()
  },
}

export const ConsultAnswered: Story = {
  args: { page: { ...PAGE, consult: CONSULT } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('table')).toBeVisible()
  },
}

export const ConsultRefused: Story = {
  args: {
    page: {
      ...PAGE,
      consult: {
        sql: 'DROP TABLE x',
        error: { code: 'read_only', message: 'near "x"' },
      },
    },
  },
}

export const PushFailing: Story = {
  args: { page: { ...PAGE, push: PUSH_FAILING }, notice: 'enviado' },
}
