// @vitest-environment jsdom
// The credits page (#292): each source named and linked, with the notice its
// terms ask for, and TMDB's logo, which its terms require.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { Credit } from '@filmes/engine'
import { Credits } from './credits'
import { CREDIT_USES, CREDITS_PAGE } from './credits.copy'

afterEach(cleanup)

const LIST: readonly Credit[] = [
  {
    source: 'TMDB',
    url: 'https://www.themoviedb.org',
    notice:
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
  },
  {
    source: 'Letterboxd',
    url: 'https://letterboxd.com',
    notice: null,
  },
]

describe('Credits', () => {
  it('links each source with what filmes takes from it and its notice', () => {
    render(<Credits credits={LIST} />)
    expect(
      screen.getByRole('heading', { level: 1, name: CREDITS_PAGE.title }),
    ).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)

    const tmdb = within(items[0]!)
    expect(tmdb.getByRole('link', { name: 'TMDB' })).toHaveProperty(
      'href',
      'https://www.themoviedb.org/',
    )
    expect(items[0]!.querySelector('img[data-logo="tmdb"]')).toBeTruthy()
    expect(tmdb.getByText(CREDIT_USES.TMDB)).toBeTruthy()
    expect(tmdb.getByText(LIST[0]!.notice!)).toBeTruthy()

    const letterboxd = within(items[1]!)
    expect(letterboxd.getByRole('link', { name: 'Letterboxd' })).toBeTruthy()
    expect(items[1]!.querySelector('img')).toBeNull()
    expect(letterboxd.getByText(CREDIT_USES.Letterboxd)).toBeTruthy()
  })

  it('leads back home from the bar', () => {
    render(<Credits credits={LIST} />)
    expect(
      screen.getByRole('link', { name: CREDITS_PAGE.home }),
    ).toHaveProperty('pathname', '/')
  })
})
