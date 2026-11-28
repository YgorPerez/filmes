// The Perguntas par a par and the groups picked (#415) that wait for the
// Dono, by Presente.
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
        groups: [],
        answers: [
          { chosen: FAROL, other: PONTE },
          { chosen: MILAGRES, other: FAROL },
        ],
      },
      {
        person: 'iara',
        name: 'Iara',
        groups: [],
        answers: [{ chosen: PONTE, other: FAROL }],
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

/** A new Presente picked a group before the pairs (#415). */
export const WithGroups: Story = {
  args: {
    waiting: [
      {
        person: 'teo',
        name: 'Teo',
        groups: [
          {
            id: 'tides',
            name: 'Faróis e marés',
            labels: ['litorâneo', 'melancólico', 'contemplativo'],
            films: [FAROL, PONTE, MILAGRES],
          },
        ],
        answers: [{ chosen: FAROL, other: PONTE }],
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/^Escolheu o grupo Faróis e marés/u),
    ).toBeVisible()
  },
}

export const NoneWaiting: Story = { args: { waiting: [] } }
