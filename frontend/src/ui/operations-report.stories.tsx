// The evaluation's report: each section in a fold, Offline open, and the
// weights to copy as TOML; and before any report.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { REPORT_TEXT } from './operations.fixture'
import { CopyButton, Report } from './operations-report'

const meta = {
  component: Report,
  args: { report: { date: '2026-11-20', text: REPORT_TEXT } },
} satisfies Meta<typeof Report>

export default meta

type Story = StoryObj<typeof meta>

export const Sections: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Relatório de 20 nov 2026' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('columnheader', { name: 'Recall@50' }),
    ).toBeVisible()
    await expect(canvas.getByText(/Pessoas 0\.28,/)).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'Baixar relatório (.md)' }),
    ).toHaveAttribute('href', '/operacoes/relatorio.md?data=2026-11-20')
  },
}

export const NoReport: Story = { args: { report: null } }

export const Copy: Story = {
  render: () => (
    <CopyButton text="[path.weight]\ncast = 0.625" label="Copiar pesos" />
  ),
}
