// The Button in each DESIGN.md variant, and disabled.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Button } from './button'

const meta = {
  component: Button,
  args: { children: 'Pedir filme' },
} satisfies Meta<typeof Button>

export default meta

type Story = StoryObj<typeof meta>

export const Primary: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: 'Pedir filme' }),
    ).toBeVisible()
  },
}

export const Big: Story = { args: { variant: 'big' } }

export const Option: Story = { args: { variant: 'option', children: 'Trocar' } }

export const Pressed: Story = {
  args: { variant: 'option', children: 'Já vi', 'aria-pressed': true },
}

/** The decisive step of a form (#330, #273): "Gravar" an edit, "Tirar de vez". */
export const Commit: Story = {
  args: { variant: 'commit', children: 'Gravar' },
}

export const Link: Story = { args: { variant: 'link', children: 'Pular' } }

export const Disabled: Story = { args: { disabled: true } }
