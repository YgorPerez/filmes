// Every drawn icon, beside its name, as the app always shows them.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Icon, type IconName } from './icon'

const NAMES: readonly IconName[] = [
  'home',
  'film',
  'people',
  'taste',
  'logout',
  'tools',
  'copy',
  'arrow',
  'plus',
  'upload',
  'check',
  'alert',
]

const meta = {
  component: Icon,
  args: { name: 'film' },
} satisfies Meta<typeof Icon>

export default meta

type Story = StoryObj<typeof meta>

export const One: Story = {}

export const All: Story = {
  render: () => (
    <ul className="flex flex-col gap-sm">
      {NAMES.map((name) => (
        <li key={name} className="flex items-center gap-sm">
          <Icon name={name} />
          {name}
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByRole('listitem')).toHaveLength(
      NAMES.length,
    )
  },
}
