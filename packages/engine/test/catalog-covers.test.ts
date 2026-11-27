// The covers a screen shows small (the home's latest Sessão): the TMDB
// poster at w185 by IMDb id, and null, never an error, when there is none.

import { describe, expect, test } from 'vite-plus/test'
import { filmCovers } from '../src/index.ts'
import { useFixture } from './fixture.ts'
import { RECORDINGS } from './sources/support.ts'

const TMDB = { FILMES_TMDB_CHAVE: 'x', FILMES_GRAVACOES: RECORDINGS }

describe('filmCovers', () => {
  test("gives the TMDB's poster, and null for a film it does not find", async () => {
    const covers = await useFixture().ok(
      filmCovers({ films: ['tt9000104', 'tt0000000'] }),
      TMDB,
    )

    expect(covers).toEqual({
      tt9000104: 'https://image.tmdb.org/t/p/w185/hOrAsLeNtAs9104.jpg',
      tt0000000: null,
    })
  })

  test('without the TMDB key every film has no cover, and nothing fails', async () => {
    const covers = await useFixture().ok(filmCovers({ films: ['tt9000104'] }), {
      FILMES_GRAVACOES: RECORDINGS,
    })

    expect(covers).toEqual({ tt9000104: null })
  })
})
