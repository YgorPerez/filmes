// The home's parts on their own: the counter, the latest Sessão, the guide
// and its steps, and the connector's address with its copy button.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { LATEST, MCP_URL, setupOf } from './home.fixture'
import {
  Ask,
  ConnectorBody,
  CopyAddress,
  Guide,
  Latest,
  StepList,
} from './home-parts'

const meta = { component: Ask } satisfies Meta<typeof Ask>

export default meta

type Story = StoryObj<typeof meta>

export const Counter: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: /Pedir filme/i }),
    ).toBeVisible()
  },
}

export const LatestSession: Story = {
  render: () => <Latest session={LATEST} person="bruno" />,
}

export const LatestSessionClosed: Story = {
  render: () => (
    <Latest
      session={{
        ...LATEST,
        open: false,
        chosen: { id: 'tt2', title: 'Maré Baixa' },
      }}
      person="vera"
    />
  ),
}

export const SetupGuide: Story = {
  render: () => (
    <Guide
      setup={setupOf({ taste: 'done' }, 10)}
      person="bruno"
      mcpUrl={MCP_URL}
    />
  ),
}

export const GuideFromZero: Story = {
  render: () => (
    <Guide setup={setupOf({}, 0)} person="bruno" mcpUrl={MCP_URL} />
  ),
  play: async ({ canvasElement }) => {
    const guide = within(canvasElement)
    await expect(guide.getByText('Leva uns 2 minutos.')).toBeVisible()
    await expect(
      guide.getByRole('button', { name: 'Copiar endereço' }),
    ).not.toBeVisible()
  },
}

export const SkippedSteps: Story = {
  render: () => (
    <StepList
      setup={setupOf({ taste: 'skipped', connector: 'skipped' })}
      person="bruno"
      mcpUrl={MCP_URL}
      skippedOnly
    />
  ),
}

export const Connector: Story = {
  render: () => (
    <div className="flex flex-col gap-md">
      <ConnectorBody url={MCP_URL} />
      <div className="flex flex-wrap items-center gap-xs">
        <CopyAddress url={MCP_URL} label="Copiar endereço" />
      </div>
    </div>
  ),
}
