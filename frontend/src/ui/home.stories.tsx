// The home: the counter, the latest Sessão and, while a step is pending,
// the setup guide.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Home } from './home'
import { HOME_DATA, setupOf } from './home.fixture'

const meta = {
  component: Home,
  parameters: { layout: 'fullscreen' },
  args: { home: HOME_DATA },
} satisfies Meta<typeof Home>

export default meta

type Story = StoryObj<typeof meta>

export const SetUp: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('region', { name: 'Para começar' }),
    ).toBeNull()
  },
}

export const Guiding: Story = {
  args: { home: { ...HOME_DATA, latest: null, setup: setupOf({}, 0) } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('region', { name: 'Para começar' }),
    ).toBeVisible()
  },
}

export const HalfwayThroughTheGuide: Story = {
  args: { home: { ...HOME_DATA, setup: setupOf({ taste: 'done' }, 10) } },
}
