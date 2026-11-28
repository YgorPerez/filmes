// The Compatibilidade on the Pessoa page: Bruno with Iara and Quim, and a
// Pessoa no one shares enough films with yet.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { CompatibilitySection } from './person-compatibility'
import { BRUNO_COMPATIBILITY } from './person-compatibility.fixture'

const meta = {
  component: CompatibilitySection,
  parameters: { layout: 'padded' },
  args: { name: 'Bruno', viewer: 'bruno', compatibility: BRUNO_COMPATIBILITY },
} satisfies Meta<typeof CompatibilitySection>

export default meta

type Story = StoryObj<typeof meta>

export const WithOthers: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Quim' })).toBeVisible()
    await expect(canvas.getByText('Barulho (2013)')).toBeVisible()
  },
}

export const NoOneYet: Story = {
  args: {
    name: 'Teo',
    compatibility: { person: 'teo', minShared: 10, others: [] },
  },
}
