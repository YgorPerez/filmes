// Meu gosto's part of the guide: the connector's address, and the steps
// she skipped with their "Retomar".
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { MCP_URL, setupOf } from './home.fixture'
import { MyStartSections } from './my-start'

const meta = {
  component: MyStartSections,
  args: {
    person: 'bruno',
    start: {
      setup: setupOf({ taste: 'skipped' }, 3),
      mcpUrl: MCP_URL,
    },
  },
} satisfies Meta<typeof MyStartSections>

export default meta

type Story = StoryObj<typeof meta>

export const SkippedTaste: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(MCP_URL)).toBeVisible()
  },
}

export const ConnectorDone: Story = {
  args: {
    start: {
      setup: setupOf({ taste: 'done', import: 'done', connector: 'done' }, 30),
      mcpUrl: MCP_URL,
    },
  },
}

export const SkippedConnector: Story = {
  args: {
    start: {
      setup: setupOf({ taste: 'done', connector: 'skipped' }, 12),
      mcpUrl: MCP_URL,
    },
  },
}
