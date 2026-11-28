// The edit form of an open Session's request and Restrições (#372), and
// the pages with no form: a told Session, a Dono who was not there.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { SessionEditScreen } from './session-edit'

const meta = {
  component: SessionEditScreen,
  args: {
    id: '2026-11-20-iara',
    page: {
      id: '2026-11-20-iara',
      fields: {
        request: 'algo bom',
        moods: ['leve'],
        maxDuration: 120,
        noSlow: true,
        similar: ['tt9006701'],
      },
      moods: ['leve', 'tenso', 'terror', 'conhecido', 'desconhecido'],
      noMoods: ['leve', 'tenso', 'terror'],
    },
  },
} satisfies Meta<typeof SessionEditScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Filled: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(page.getByLabelText(/O pedido/)).toHaveValue('algo bom')
    await expect(
      page.getByRole('button', { name: 'Salvar e refazer' }),
    ).toBeVisible()
  },
}

export const Refused: Story = { args: { refusal: 'duracao' } }

export const Told: Story = {
  args: { page: 'closed' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/já foi contada/),
    ).toBeVisible()
  },
}

export const Absent: Story = { args: { page: 'absent' } }
