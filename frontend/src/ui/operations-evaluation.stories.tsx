// The evaluation panel: ready to run, running, finished with the grid and
// its report, and without its folder.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { EvaluationSection } from './operations-evaluation'
import { DONE, IDLE, RUNNING, pending } from './operations.fixture'

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
      within(canvasElement).getByText(/Medindo o quanto a lista acerta/),
    ).toBeVisible()
  },
}

export const Done: Story = {
  args: { initial: DONE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/A lista acerta 80%/)).toBeVisible()
    await expect(canvas.getByText('elenco 0,5 → 0,625')).toBeVisible()
    // Today's weights come first: nothing to copy, and the line says so.
    await expect(
      canvas.getByText(
        'Nenhuma das 411 combinações testadas supera os pesos de hoje.',
      ),
    ).toBeVisible()
    await expect(canvas.getAllByText('sem ganho')).toHaveLength(2)
    await expect(
      canvas.queryByRole('button', { name: /Copiar os pesos/ }),
    ).toBeNull()
  },
}

export const FolderUnset: Story = {
  args: { initial: { ...IDLE, folder: 'unset' } },
}

export const Unavailable: Story = {
  args: { initial: { ...IDLE, folder: 'unavailable' } },
}
