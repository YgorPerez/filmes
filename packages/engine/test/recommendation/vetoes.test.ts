// `tests/test_veto_por_tag_e_nota_imdb.py` and `tests/test_veto_subgeneros.py`:
// a Veto to a tag group, the IMDb rating bonus (#56), and a Veto to a genre
// taking its Wikidata subgenres and the equivalent IMDb genre (#48).
//
// The films `tt90056NN` have no director and no Nota: Turma do Recreio
// (Comedy, "teen" 0.9 in the genome), Piada Pronta (Comedy, "silly" by 12
// users), Riso Contido (Comedy, below both minimums), Drama Juvenil (Drama,
// "teen" 0.95) and Obra-Prima (8.5 on the IMDb, 1,000 votes). Comédia
// romântica (Q9004801) is a subclass of romance (Q1054574) and comedy;
// comédia de recasamento (Q9004802) is a subclass of comédia romântica.

import { describe, expect, test } from 'vite-plus/test'
import { useFixture, type Fixture } from '../fixture.ts'
import {
  engineRecommendation,
  film,
  pythonOk,
  titles,
  PYTHON_TIMEOUT,
} from './support.ts'

const all = (fixture: Fixture) =>
  engineRecommendation(fixture, { attendees: ['dono'], count: 100 })

// `pessoa vetar` is not ported yet: the Python records the Vetos.
describe('a Veto to a tag group', { timeout: PYTHON_TIMEOUT }, () => {
  test('removes the comedy with the tag above the minimum', async () => {
    const fixture = useFixture()
    const before = new Set(titles(await all(fixture)))
    for (const t of [
      'Turma do Recreio',
      'Piada Pronta',
      'Riso Contido',
      'Drama Juvenil',
    ])
      expect(before.has(t)).toBe(true)

    pythonOk(fixture, [
      'pessoa',
      'vetar',
      'bruno',
      'não quer comédia boba',
      '--grupo',
      'comedia_boba',
    ])
    const out = await all(fixture)

    const after = new Set(titles(out))
    expect(after.has('Turma do Recreio')).toBe(false) // genome 0.9
    expect(after.has('Piada Pronta')).toBe(false) // 12 users
    expect(after.has('Riso Contido')).toBe(true) // below both minimums
    expect(after.has('Drama Juvenil')).toBe(true) // not a comedy
    expect(out.vetoes).toEqual([
      {
        person: 'bruno',
        text: 'não quer comédia boba',
        target: 'silly_comedy',
        label: 'comédia boba',
        filmsRemoved: 2,
        byPath: { tags: 2 },
      },
    ])
  })

  test('removed, it removes nothing', async () => {
    const fixture = useFixture()
    pythonOk(fixture, [
      'pessoa',
      'vetar',
      'bruno',
      'não quer comédia boba',
      '--grupo',
      'comedia_boba',
    ])
    pythonOk(fixture, ['pessoa', 'remover', 'bruno', '--veto', 'comedia_boba'])

    expect(titles(await all(fixture))).toContain('Turma do Recreio')
  })
})

describe('the IMDb rating bonus', { timeout: PYTHON_TIMEOUT }, () => {
  test('gives the film a bonus and the film line', async () => {
    const obra = film(await all(useFixture()), 'Obra-Prima')

    // 0.3 × (8.5 − 7) / 3
    expect(
      obra.filmLines
        .filter((l) => l.text.endsWith(' no IMDb'))
        .map((l) => [l.text, l.source, l.strength, l.kind, l.contribution]),
    ).toEqual([['nota 8,5 no IMDb', 'IMDb', 'strong', 'metadata', 0.15]])
  })

  test('is no Fact but pulls the order among the guesses', async () => {
    const guesses = (await all(useFixture())).films
      .filter((f) => f.onlyGuesses)
      .map((f) => f.title)

    // Obra-Prima has only 1,000 votes, but the rating puts it first.
    expect(guesses[0]).toBe('Obra-Prima')
  })

  test('a film with no rating or at the limit gets no line', async () => {
    const drama = film(await all(useFixture()), 'Drama Juvenil')

    expect(drama.filmLines.filter((l) => l.text.endsWith(' no IMDb'))).toEqual(
      [],
    )
  })
})

describe('a Veto to a genre', { timeout: PYTHON_TIMEOUT }, () => {
  const vetoRomance = async (fixture: Fixture, count?: number) => {
    pythonOk(fixture, ['pessoa', 'criar', 'Lorenzo', '--slug', 'lorenzo'])
    pythonOk(fixture, [
      'pessoa',
      'vetar',
      'lorenzo',
      'não vê romance',
      '--entidade',
      'Q1054574',
    ])
    return engineRecommendation(fixture, {
      attendees: ['dono', 'lorenzo'],
      count,
    })
  }

  test("removes the Wikidata subgenres and the IMDb's equivalent genre", async () => {
    const out = titles(await vetoRomance(useFixture(), 80))

    expect(out).not.toContain('Carta de Amor') // romance
    expect(out).not.toContain('Amor em Paris') // comédia romântica
    expect(out).not.toContain('Casar de Novo') // a subclass of the subclass
    expect(out).toContain('Dia de Feira') // comedy, a supergenre: stays
    expect(out).not.toContain('Baile de Formatura') // Romance on the IMDb only
    expect(out).not.toContain('Maré Baixa') // Drama and Romance on the IMDb
  })

  test('the result says how many films each path removed', async () => {
    const out = await vetoRomance(useFixture())

    expect(out.vetoes).toEqual([
      {
        person: 'lorenzo',
        text: 'não vê romance',
        target: 'Q1054574',
        label: 'romance',
        filmsRemoved: 5,
        byPath: { direct: 1, subgenres: 2, imdbGenre: 2 },
      },
    ])
  })
})
