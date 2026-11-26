// The Dono's tag beside a name in a list of Pessoas.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PERSON } from '../person.copy'
import { OwnerTag } from './owner-tag'

const meta = { component: OwnerTag } satisfies Meta<typeof OwnerTag>

export default meta

type Story = StoryObj<typeof meta>

export const BesideAName: Story = {
  render: () => (
    <p className="flex items-center gap-sm">
      Bruno <OwnerTag />
    </p>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(PERSON.owner)).toBeVisible()
  },
}
