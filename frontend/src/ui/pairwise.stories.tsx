// A Presente's Pergunta par a par on the Link da Sessão, and the invite to it.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PairwiseQuestion } from './pairwise'

const LINK = { session: '2026-11-20-teo', token: 'k'.repeat(43), person: 'teo' }
const FAROL = {
  id: 'tt9000101',
  title: 'O Farol de Areia',
  year: 2012,
  poster: null,
}
const PONTE = {
  id: 'tt9000201',
  title: 'Ponte Aérea',
  year: 2016,
  poster: null,
}

const meta = {
  component: PairwiseQuestion,
  args: {
    page: { answered: 2, total: 10, pair: [PONTE, FAROL] },
    link: LINK,
    back: '/participar?sessao=2026-11-20-teo',
    owner: 'Bruno',
  },
} satisfies Meta<typeof PairwiseQuestion>

export default meta

type Story = StoryObj<typeof meta>

export const Question: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Pergunta 3 de 10')).toBeVisible()
    await expect(
      canvas.getByRole('button', { name: 'Ponte Aérea (2016)' }),
    ).toBeVisible()
  },
}

export const Failed: Story = { args: { failed: true } }

export const Done: Story = {
  args: { page: { answered: 10, total: 10, pair: null } },
}

export const NoneAsked: Story = {
  args: { page: { answered: 0, total: 0, pair: null } },
}

export const Unavailable: Story = { args: { page: null } }
