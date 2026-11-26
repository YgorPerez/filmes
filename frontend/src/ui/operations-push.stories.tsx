// The push of filmes-dados: up to date, failing, off, and without the engine.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PUSH_FAILING, PUSH_OK } from './operations.fixture'
import { PushSection } from './operations-push'

const meta = {
  component: PushSection,
  args: { status: PUSH_OK, retried: false },
} satisfies Meta<typeof PushSection>

export default meta

type Story = StoryObj<typeof meta>

export const UpToDate: Story = {}

export const Failing: Story = {
  args: { status: PUSH_FAILING },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button')).toBeVisible()
  },
}

export const Retried: Story = { args: { status: PUSH_FAILING, retried: true } }

export const Off: Story = { args: { status: { ...PUSH_OK, enabled: false } } }

export const WithoutEngine: Story = { args: { status: null } }
