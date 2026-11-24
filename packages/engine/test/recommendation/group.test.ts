// `tests/test_grupo.py`: a recommendation for several Presentes and the
// Regra de escolha. Besides Bruno: Iara gave 3 to O Farol de Areia (Helena
// Prado) and 4 to Fronteira (Rui Tavares); Teo has no Nota.

import { describe, expect, test } from 'vite-plus/test'
import { recommend, type RecommendRequest } from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { engineRecommendation, film, titles } from './support.ts'

const ask = (fixture: Fixture, request: RecommendRequest) =>
  engineRecommendation(fixture, request)

const order = async (fixture: Fixture, request: RecommendRequest) =>
  titles(await ask(fixture, request))

const before = (list: string[], ...names: string[]) => {
  for (const [i, name] of names.slice(1).entries())
    expect(list.indexOf(names[i] ?? '')).toBeLessThan(list.indexOf(name))
}

const WITHOUT_FACT = {
  text: 'sem fato',
  source: null,
  date: null,
  strength: 'weak',
  kind: 'guess',
  factId: null,
  contribution: 0,
}

describe('several Presentes', () => {
  test("the Evidence comes grouped by Pessoa, in the Presentes' order", async () => {
    const out = await ask(useFixture(), {
      attendees: ['dono', 'Iara'],
      count: 50,
    })

    expect(out.attendees).toEqual(['bruno', 'iara'])
    const f = film(out, 'As Horas Lentas')
    expect(Object.keys(f.evidence)).toEqual(['bruno', 'iara'])
    expect(new Set(f.evidence['bruno']?.map((e) => e.person))).toEqual(
      new Set(['bruno']),
    )
    expect(f.evidence['iara']).toHaveLength(1)
    const [hers] = f.evidence['iara'] ?? []
    expect(hers?.text).toBe(
      'deu 3 a O Farol de Areia (2012), também de Helena Prado',
    )
    expect(hers?.source).toBe('Letterboxd da Iara')
    expect([hers?.strength, hers?.kind, hers?.contribution]).toEqual([
      'weak',
      'rating',
      0.3,
    ])
  })

  test('a Presente with no Fact on the film has an unknown utility and the "sem fato" line', async () => {
    const f = film(
      await ask(useFixture(), { attendees: ['dono', 'iara'], count: 50 }),
      'Noite de Estreia',
    )

    expect(f.utility['iara']).toBeNull()
    expect(f.evidence['iara']).toEqual([{ person: 'iara', ...WITHOUT_FACT }])
  })

  test('someone with no Nota counts as neutral and does not change the order', async () => {
    const fixture = useFixture()
    const alone = await ask(fixture, { attendees: ['dono'], count: 50 })
    const withTeo = await ask(fixture, {
      attendees: ['dono', 'teo'],
      count: 50,
    })

    // With Teo the Session is a group, and the group-or-alone bonus moves to
    // other films; besides those, the order is the same.
    const withBonus = new Set(
      [alone, withTeo].flatMap((o) =>
        o.films.filter((f) => f.filmLines.length > 0).map((f) => f.title),
      ),
    )
    expect(titles(withTeo).filter((t) => !withBonus.has(t))).toEqual(
      titles(alone).filter((t) => !withBonus.has(t)),
    )
    const bruno = (o: typeof alone) =>
      Object.fromEntries(o.films.map((f) => [f.title, f.utility['bruno']]))
    expect(bruno(withTeo)).toEqual(bruno(alone))
    for (const f of withTeo.films) {
      expect(f.utility['teo']).toBeNull()
      expect(f.evidence['teo']).toEqual([{ person: 'teo', ...WITHOUT_FACT }])
    }
  })
})

// Bruno and Quim: Voo Noturno has a strong Nota of both (0.657 each); Maré
// Cheia is strong for Bruno only (0.739), and Quim has no Fact on it.
describe('the Regra de escolha', () => {
  test('the default rule counts whoever has no Fact as neutral', async () => {
    const out = await ask(useFixture(), {
      attendees: ['dono', 'quim'],
      count: 50,
    })

    before(titles(out), 'Voo Noturno', 'Maré Cheia')
    expect(film(out, 'Maré Cheia').utility['quim']).toBeNull()
  })

  test('the average rule counts whoever has no Fact as neutral', async () => {
    // Maré Cheia: (0.739 + 0.5) / 2 = 0.619, below Voo Noturno's 0.657.
    before(
      await order(useFixture(), {
        attendees: ['dono', 'quim'],
        rule: 'average',
        count: 50,
      }),
      'Voo Noturno',
      'Maré Cheia',
    )
  })

  test("in someone's rule, no Fact of theirs is neutral", async () => {
    // By Quim, Maré Cheia is 0.5 and A Volta do Mar, a moderate Nota against, 0.354.
    before(
      await order(useFixture(), {
        attendees: ['dono', 'quim'],
        by: 'quim',
        count: 50,
      }),
      'Maré Cheia',
      'A Volta do Mar',
    )
  })

  // Bruno loves As Horas Lentas (strong) and Iara likes it little (a 3 on
  // the same director). A Volta do Mar pleases both about equally.
  test('the default rule puts first the film where nobody is badly off', async () => {
    before(
      await order(useFixture(), { attendees: ['dono', 'iara'], count: 50 }),
      'A Volta do Mar',
      'As Horas Lentas',
    )
  })

  test('the average rule puts first the film with the higher mean', async () => {
    const out = await ask(useFixture(), {
      attendees: ['dono', 'iara'],
      rule: 'average',
      count: 50,
    })

    expect(out.rule).toEqual({ name: 'average' })
    before(titles(out), 'As Horas Lentas', 'A Volta do Mar')
  })

  test("someone's rule orders by that Pessoa's taste only", async () => {
    const fixture = useFixture()
    const byDefault = await order(fixture, {
      attendees: ['dono', 'iara'],
      count: 50,
    })
    const byBruno = await ask(fixture, {
      attendees: ['dono', 'iara'],
      rule: 'by',
      by: 'Bruno',
      count: 50,
    })

    expect(byBruno.rule).toEqual({ name: 'by', person: 'bruno' })
    before(byDefault, 'A Volta do Mar', 'As Horas Lentas')
    before(titles(byBruno), 'As Horas Lentas', 'A Volta do Mar')
  })

  test("in someone's rule, a film with no Fact of theirs comes after the ones they like", async () => {
    // Noite de Estreia pleases Bruno, but Iara has no Fact on it: 0.5 for
    // her, below her Notas for.
    before(
      await order(useFixture(), {
        attendees: ['dono', 'iara'],
        rule: 'by',
        by: 'iara',
        count: 50,
      }),
      'A Volta do Mar',
      'As Horas Lentas',
      'Noite de Estreia',
    )
  })

  test.each([
    {
      name: 'the rule of someone not among the Presentes',
      request: { attendees: ['dono'], rule: 'by', by: 'iara' },
      message: '--de iara: iara não está entre os Presentes',
    },
    {
      name: 'the "by" rule without saying whose',
      request: { attendees: ['dono', 'iara'], rule: 'by' },
      message: '--regra de precisa de --de com a Pessoa cujo gosto ordena',
    },
    {
      name: 'a Pessoa with another rule',
      request: { attendees: ['dono', 'iara'], rule: 'average', by: 'iara' },
      message: '--de só vale com --regra de, não com --regra average',
    },
  ] as const)('$name is invalid usage', async ({ request, message }) => {
    const outcome = await useFixture().run(recommend(request))

    expect(outcome).toEqual({
      exitCode: 2,
      output: { error: { code: 'invalid_usage', message } },
    })
  })
})

// Lia Moura, Tomás Reis, Beatriz Sá and Jorge Amaral link to no Nota of the
// fixture: their films are Candidates with guesses only. Mar Aberto too.
const ONLY_GUESSES = new Set([
  'Pequenos Milagres',
  'Casa Cheia',
  'Deserto Branco',
  'A Última Estação',
  'Café Amargo',
  'Linha Cruzada',
  'Os Inquilinos',
  'Fim de Tarde',
  'Porão Escuro',
  'A Casa do Fim',
  'Risos de Domingo',
  'Carta de Amor',
  'Amor em Paris',
  'Casar de Novo',
  'Baile de Formatura',
  'Mar Aberto',
  'Turma do Recreio',
  'Piada Pronta',
  'Riso Contido',
  'Drama Juvenil',
  'Obra-Prima',
  'Ensaio Geral',
  'Bastidores',
  'Ato Final',
  'Coxia',
  'Casa Vazia',
  'Último Verão',
  'Aliança Partida',
  'Escrever Cartas',
  'Estrada Afora',
  'Mesa de Domingo',
  'Rascunho',
  'Pé na Estrada',
  'Tinta e Papel',
  'Ponto de Partida',
  'Mesmo Elenco',
  'Mesma Diretora',
])

describe('films with guesses only', () => {
  test('stay out while there are Candidates with Facts', async () => {
    const out = await ask(useFixture(), { attendees: ['dono', 'iara'] })

    expect(titles(out).filter((t) => ONLY_GUESSES.has(t))).toEqual([])
    expect(out.films.some((f) => f.onlyGuesses)).toBe(false)
  })

  test('fill the list at the end, marked', async () => {
    const out = await ask(useFixture(), {
      attendees: ['dono', 'iara'],
      count: 100,
    })

    const marked = out.films.filter((f) => f.onlyGuesses)
    expect(new Set(marked.map((f) => f.title))).toEqual(ONLY_GUESSES)
    expect(out.films.slice(-marked.length)).toEqual(marked)
    // Among them, the one rated above 7 on the IMDb first (#56), then the
    // most voted.
    expect(marked.slice(0, 3).map((f) => f.title)).toEqual([
      'Obra-Prima',
      'Pequenos Milagres',
      'Deserto Branco',
    ])
    for (const f of marked) {
      expect(f.utility).toEqual({ bruno: null, iara: null })
      expect(f.evidence).toEqual({
        bruno: [{ person: 'bruno', ...WITHOUT_FACT }],
        iara: [{ person: 'iara', ...WITHOUT_FACT }],
      })
    }
  })
})
