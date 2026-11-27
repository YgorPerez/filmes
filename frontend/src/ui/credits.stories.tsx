// `/creditos`: every source, with the notice its terms ask for and TMDB's
// logo. The list is the engine's `CREDITS`, copied here as props.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Credits } from './credits'
import { CREDITS_PAGE } from './credits.copy'

const meta = {
  component: Credits,
  parameters: { layout: 'fullscreen' },
  args: {
    credits: [
      {
        source: 'IMDb',
        url: 'https://www.imdb.com',
        use: 'Os filmes, o elenco, a nota e os votos.',
        notice:
          'Information courtesy of IMDb (https://www.imdb.com). Used with permission.',
      },
      {
        source: 'TMDB',
        url: 'https://www.themoviedb.org',
        use: 'As capas, os títulos em português e as sinopses.',
        notice:
          'This product uses the TMDB API but is not endorsed or certified by TMDB.',
      },
      {
        source: 'Tag Genome',
        url: 'https://grouplens.org/datasets/movielens/tag-genome-2021/',
        use: 'As tags dos filmes, que movem o Clima e o Parecido.',
        notice:
          'Tag Genome 2021, de Kotkov, Maslov e Neovius (https://grouplens.org/datasets/movielens/tag-genome-2021/), sob licença CC BY-NC 3.0 (https://creativecommons.org/licenses/by-nc/3.0/)',
      },
      {
        source: 'Does the Dog Die',
        url: 'https://www.doesthedogdie.com',
        use: 'Os avisos de conteúdo ("um cachorro morre").',
        notice: 'Powered by DoesTheDogDie.com',
      },
      {
        source: 'Letterboxd',
        url: 'https://letterboxd.com',
        use: 'O histórico e as notas do export que cada Pessoa baixa.',
        notice: null,
      },
    ],
  },
} satisfies Meta<typeof Credits>

export default meta

type Story = StoryObj<typeof meta>

export const Sources: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(
      page.getByRole('heading', { level: 1, name: CREDITS_PAGE.title }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'TMDB' })).toHaveAttribute(
      'href',
      'https://www.themoviedb.org',
    )
  },
}
