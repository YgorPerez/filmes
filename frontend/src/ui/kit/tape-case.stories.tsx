// The tape's case: a cover without a poster and the Presentes' dots under it.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PersonDot } from './person'
import { TapeCase } from './tape-case'

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
        <PersonDot
          person={{ color: 1, initial: 'B', name: 'Bruno' }}
          title="Bruno"
        />
        <PersonDot
          person={{ color: 2, initial: 'V', name: 'Vera' }}
          hollow
          title="Vera, sem fato"
        />
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
