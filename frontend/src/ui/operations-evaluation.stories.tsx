// The evaluation panel: ready to run, running, and without its folder.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { EvaluationSection } from './operations-evaluation'
import { IDLE, RUNNING, pending } from './operations.fixture'

const meta = {
  component: EvaluationSection,
  args: { initial: IDLE, read: pending },
} satisfies Meta<typeof EvaluationSection>

export default meta

type Story = StoryObj<typeof meta>

export const Ready: Story = {}

export const Running: Story = {
  args: { initial: RUNNING },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Medindo recall e cobertura/),
    ).toBeVisible()
  },
}

export const FolderUnset: Story = {
  args: { initial: { ...IDLE, folder: 'unset' } },
}

export const Unavailable: Story = {
  args: { initial: { ...IDLE, folder: 'unavailable' } },
}
