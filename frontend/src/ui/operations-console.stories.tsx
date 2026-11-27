// The SQL console: empty with the ready queries and the tables, with an
// answer cut at the limit, with an answer of no row, and refused.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CONSULT, SCHEMA } from './operations.fixture'
import { ConsultSection } from './operations-console'

const meta = {
  component: ConsultSection,
  args: { answer: null, schema: SCHEMA },
} satisfies Meta<typeof ConsultSection>

export default meta

type Story = StoryObj<typeof meta>

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('Tabelas e visões (2)'))
    await expect(canvas.getByRole('link', { name: 'filmes' })).toHaveAttribute(
      'href',
      `/operacoes?sql=${encodeURIComponent('SELECT * FROM filmes LIMIT 20')}#consultar`,
    )
  },
}

export const Answered: Story = {
  args: {
    answer: {
      ...CONSULT,
      rows: [
        ...CONSULT.rows,
        {
          key: 'r2',
          cells: [
            { key: 'c0', value: 'tt9000101' },
            {
              key: 'c1',
              value:
                'Um apelido muito comprido que não cabe na coluna e vem cortado',
            },
          ],
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Mostrando as primeiras 3 de 250/),
    ).toBeVisible()
  },
}

export const NoRow: Story = {
  args: { answer: { ...CONSULT, rows: [], total: 0 } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['slug', 'apelido'])
  },
}

export const Refused: Story = {
  args: {
    answer: {
      sql: 'SELEC 1',
      error: { code: 'invalid_sql', message: 'near "SELEC": syntax error' },
    },
  },
}
