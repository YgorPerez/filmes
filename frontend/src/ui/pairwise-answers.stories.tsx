// The Perguntas par a par and the swipe's Vi e gostei / Vi e não gostei
// that wait for the Dono, by Presente.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PairwiseAnswers } from './pairwise-answers'

const FAROL = { id: 'tt9000101', title: 'O Farol de Areia', year: 2012 }
const PONTE = { id: 'tt9000201', title: 'Ponte Aérea', year: 2016 }
const MILAGRES = { id: 'tt9000601', title: 'Pequenos Milagres', year: null }

const meta = {
  component: PairwiseAnswers,
  args: {
    action: '/sessoes/2026-11-20-teo/perguntas',
    waiting: [
      {
        person: 'teo',
        name: 'Teo',
        answers: [
          { chosen: FAROL, other: PONTE },
          { chosen: MILAGRES, other: FAROL },
        ],
        seen: [],
      },
      {
        person: 'iara',
        name: 'Iara',
        answers: [{ chosen: PONTE, other: FAROL }],
        seen: [
          { film: MILAGRES, reaction: 'like' },
          { film: FAROL, reaction: 'dislike' },
        ],
      },
    ],
  },
} satisfies Meta<typeof PairwiseAnswers>

export default meta

type Story = StoryObj<typeof meta>

export const Waiting: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('form', { name: 'Teo' }),
    ).toBeVisible()
  },
}

export const NoneWaiting: Story = { args: { waiting: [] } }
