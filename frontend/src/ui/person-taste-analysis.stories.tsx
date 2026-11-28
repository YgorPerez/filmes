// The taste analysis on the Pessoa page (#404): what she rates above her
// own median, each item a fold with its films.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { TasteAnalysisSlip } from './person-taste-analysis'
import { TASTE_ANALYSIS } from './person-taste-analysis.copy'
import { ANALYSIS, NOTHING_ABOVE } from './person-taste-analysis.fixture'

const meta = {
  component: TasteAnalysisSlip,
  parameters: { layout: 'padded' },
  args: { analysis: ANALYSIS, own: false, name: 'Bruno' },
} satisfies Meta<typeof TasteAnalysisSlip>

export default meta

type Story = StoryObj<typeof meta>

export const AnotherPessoa: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const item = canvas.getByText(TASTE_ANALYSIS.item('Helena Prado', 4.5, 3))
    await userEvent.click(item)
    // The same film can sit under several items: look inside this one.
    const fold = item.closest('details')
    if (fold === null) throw new Error('the item is not a fold')
    await expect(
      within(fold).getByText('O Farol de Areia (2012)'),
    ).toBeVisible()
  },
}

export const MyTaste: Story = { args: { own: true } }

export const NothingAbove: Story = { args: { analysis: NOTHING_ABOVE } }
