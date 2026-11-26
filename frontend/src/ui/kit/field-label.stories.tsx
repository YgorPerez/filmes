// A field's label over its input, with and without the hint.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { FIELD } from './field'
import { FieldLabel } from './field-label'

const meta = {
  component: FieldLabel,
  args: {
    label: 'Duração máxima',
    children: <input name="duration" className={FIELD} />,
  },
} satisfies Meta<typeof FieldLabel>

export default meta

type Story = StoryObj<typeof meta>

export const WithHint: Story = {
  args: { hint: 'em minutos' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('textbox', { name: /Duração máxima/ }),
    ).toBeVisible()
  },
}

export const WithoutHint: Story = {}
