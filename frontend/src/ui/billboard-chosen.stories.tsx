// The chosen film's reactions on a closed Cartaz (#264): the stored Nota
// prevista beside a Nota or a Relato, either alone, and one Presente with
// neither, who is not there; and the block of a chosen film with no card.
import type { BillboardPerson } from '@filmes/engine'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ChosenFilm, ChosenReactions } from './billboard-chosen'

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
      { person: 'bruno', predicted: '8,3', rating: '6', reaction: null, comment: null },
      { person: 'iara', predicted: '7,1', rating: null, reaction: 'liked', comment: null },
      {
        person: 'teo',
        predicted: null,
        rating: null,
        reaction: 'neutral',
        comment: 'dormiu no meio',
      },
      { person: 'vera', predicted: '6,4', rating: null, reaction: 'disliked', comment: null },
      { person: 'quim', predicted: '9,0', rating: null, reaction: null, comment: null },
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
    // Each line opens with the Presente's avatar, then what she reacted.
    const lines = within(list).getAllByRole('listitem')
    const expected = [
      'Bruno: previsto 8,3 · deu 6 de 10',
      'Iara: previsto 7,1 · gostou',
      'Teo: neutro',
      'Vera: previsto 6,4 · não gostou',
      'Quim: previsto 9,0',
    ]
    await expect(lines).toHaveLength(expected.length)
    for (const [i, line] of expected.entries()) {
      await expect(lines[i]).toHaveTextContent(line)
    }
  },
}

export const UnderSection: Story = { args: { level: 3 } }

/** A chosen film with no card, outside the Recomendação: its own block. */
export const WithoutCard: Story = {
  render: (args) => (
    <ChosenFilm
      people={args.people}
      chosen={{
        id: 'tt9000106',
        title: 'Curta da Madrugada',
        year: 2010,
        reactions: args.reactions.slice(0, 2),
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const block = within(canvasElement).getByRole('region', {
      name: 'Filme escolhido',
    })
    await expect(block).toHaveTextContent('Curta da Madrugada (2010)')
    await expect(within(block).getAllByRole('listitem')).toHaveLength(2)
  },
}
