// The Força in three dots, at each level, and a Nota on the orange disc.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { RatingDisc, StrengthDots } from './person-marks'

const meta = {
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Strengths: Story = {
  render: () => (
    <div className="flex flex-col gap-sm">
      <StrengthDots strength="strong" word="forte" />
      <StrengthDots strength="moderate" word="moderada" />
      <StrengthDots strength="weak" word="fraca" />
      <StrengthDots strength="guess" word="palpite" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('img', { name: 'Força forte' }),
    ).toBeVisible()
  },
}

export const Ratings: Story = {
  render: () => (
    <div className="flex gap-sm">
      <RatingDisc>{3}</RatingDisc>
      <RatingDisc>{8}</RatingDisc>
      <RatingDisc>{10}</RatingDisc>
    </div>
  ),
}
