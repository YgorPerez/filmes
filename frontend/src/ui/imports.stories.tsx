// The Imports frame: the way back and the screen in it.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ImportsFrame } from './imports'

const meta = {
  component: ImportsFrame,
  args: {
    back: 'Meu gosto',
    backTo: '/meu-gosto',
    children: <p>O conteúdo da tela.</p>,
  },
} satisfies Meta<typeof ImportsFrame>

export default meta

type Story = StoryObj<typeof meta>

/** The frame alone: the way back and whatever the screen puts in it. */
export const Frame: Story = {}
