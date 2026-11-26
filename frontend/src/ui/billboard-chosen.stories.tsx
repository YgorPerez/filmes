// The chosen film's reactions on a closed Cartaz (#264): the stored Nota
// prevista beside a Nota or a Relato, either alone, and one Presente with
// neither, who is not there.
import type { BillboardPerson } from '@filmes/engine'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ChosenReactions } from './billboard-chosen'

const person = (slug: string, name: string, color: number) =>
  ({
    slug,
    name,
    label: name,
    initial: name.slice(0, 1),
    color,
    owner: false,
  }) satisfies BillboardPerson

const PEOPLE = [
  person('bruno', 'Bruno', 1),
  person('iara', 'Iara', 2),
  person('teo', 'Teo', 3),
  person('vera', 'Vera', 4),
  person('quim', 'Quim', 5),
]

const meta = {
  component: ChosenReactions,
  args: {
    people: PEOPLE,
    reactions: [
      { person: 'bruno', predicted: '8,3', rating: '6', reaction: null },
      { person: 'iara', predicted: '7,1', rating: null, reaction: 'liked' },
      { person: 'teo', predicted: null, rating: null, reaction: 'neutral' },
      { person: 'vera', predicted: '6,4', rating: null, reaction: 'disliked' },
      { person: 'quim', predicted: '9,0', rating: null, reaction: null },
    ],
  },
} satisfies Meta<typeof ChosenReactions>

export default meta

type Story = StoryObj<typeof meta>

export const EachCase: Story = {
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole('list', {
      name: 'Filme escolhido',
    })
    const lines = within(list)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    await expect(lines).toEqual([
      'Bruno: previsto 8,3 · achou 6',
      'Iara: previsto 7,1 · gostou',
      'Teo: neutro',
      'Vera: previsto 6,4 · não gostou',
      'Quim: previsto 9,0',
    ])
  },
}

export const UnderSection: Story = { args: { level: 3 } }
