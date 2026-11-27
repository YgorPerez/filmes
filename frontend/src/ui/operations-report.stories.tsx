// The evaluation's report: each section in a closed fold, the numbers in
// pt-BR, and the weights shown and copied as TOML; and before any report.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { REPORT_NAMES, REPORT_TEXT } from './operations.fixture'
import { CopyButton, Report } from './operations-report'

const meta = {
  component: Report,
  args: {
    report: { date: '2026-11-20', text: REPORT_TEXT, names: REPORT_NAMES },
  },
} satisfies Meta<typeof Report>

export default meta

type Story = StoryObj<typeof meta>

export const Sections: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: 'Relatório de 20 nov 2026' }),
    ).toBeVisible()
    await userEvent.click(canvas.getByText('Offline'))
    await expect(canvas.getByText(/Pessoas 0,28,/)).toBeVisible()
    await expect(canvas.getAllByText('80% (4/5)')[0]).toBeVisible()
    // The MovieLens cause is in its row, so no fold of warnings is left.
    await expect(
      canvas.getAllByText('sem dados: falta o ml-32m no Catálogo')[0],
    ).toBeVisible()
    await expect(canvas.queryByText('Avisos')).toBeNull()
    await userEvent.click(canvas.getByText('Calibração da Força'))
    await expect(canvas.getByRole('rowheader', { name: 'Bruno' })).toBeVisible()
    await userEvent.click(canvas.getByText('Versões dos dados'))
    await expect(canvas.getByText(/adultos\.csv: cd83a7697b1e…/)).toBeVisible()
    await userEvent.click(canvas.getByText('Pesos'))
    await expect(canvas.getByText(/max_evidence = 5/)).toBeVisible()
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
