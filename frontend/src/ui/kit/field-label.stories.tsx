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

/** A field the form would refuse: marked, with why under it (#268). */
export const WithError: Story = {
  args: {
    label: 'Alvo',
    hint: 'tt… de um filme ou Q… de uma entidade do Catálogo',
    error: {
      id: 'alvo-erro',
      text: 'Falta o alvo: um filme ou uma entidade pelo ID (tt… ou Q…), ou um grupo de tags.',
    },
    children: (
      <input
        name="alvo"
        aria-invalid
        aria-describedby="alvo-erro"
        className={FIELD}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('textbox', { name: /^Alvo/ }),
    ).toHaveAccessibleDescription(/Falta o alvo/)
  },
}
