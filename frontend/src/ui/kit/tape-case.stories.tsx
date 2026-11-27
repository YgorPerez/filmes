// The tape's case: a cover without a poster and the Presentes' dots under it.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PersonDot } from './person'
import { PosterCover, TapeCase } from './tape-case'

const meta = {
  component: TapeCase,
  args: { cover: 'Um Sonho de Liberdade', className: 'w-[120px]' },
} satisfies Meta<typeof TapeCase>

export default meta

type Story = StoryObj<typeof meta>

export const WithDots: Story = {
  args: {
    children: (
      <>
        <PersonDot person={{ color: 1, initial: 'B', name: 'Bruno' }} />
        <PersonDot person={{ color: 2, initial: 'V', name: 'Vera' }} hollow />
      </>
    ),
  },
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
