// The tape's case: a cover without a poster.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PosterCover, TapeCase } from './tape-case'

const meta = {
  component: TapeCase,
  args: { cover: 'Um Sonho de Liberdade', className: 'w-[120px]' },
} satisfies Meta<typeof TapeCase>

export default meta

type Story = StoryObj<typeof meta>

export const WithTitle: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Um Sonho de Liberdade'),
    ).toBeVisible()
  },
}

export const Empty: Story = {}

/** A poster that does not load: the title on the cover, never the
 * broken-image glyph (#274). */
export const BrokenPoster: Story = {
  args: {
    cover: (
      <PosterCover
        src="/nao-existe.jpg"
        title="Vento Norte"
        alt="Cartaz de Vento Norte"
      />
    ),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Vento Norte'),
    ).toBeVisible()
    await expect(canvasElement.querySelector('img')).toBeNull()
  },
}
