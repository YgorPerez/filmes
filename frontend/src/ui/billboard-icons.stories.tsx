// The Cartaz's four icons.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Icon } from './billboard-icons'

const meta = {
  component: Icon,
  args: { name: 'check', className: 'size-8' },
} satisfies Meta<typeof Icon>

export default meta

type Story = StoryObj<typeof meta>

export const Check: Story = {}

export const Star: Story = { args: { name: 'star' } }

export const Expand: Story = { args: { name: 'expand' } }

export const Chevron: Story = { args: { name: 'chevron' } }
