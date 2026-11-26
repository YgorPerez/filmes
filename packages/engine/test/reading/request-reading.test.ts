// Leitura do pedido (#198): a sentence read into the fields of a
// recommendation request, on the fixture's Pessoas and Catálogo, with no
// network and nothing written.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  ADDITION_FIELDS,
  readRequest,
  Sqlite,
  withAddition,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const change = (sql: string) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    yield* sqlite.write((db) => db.run(sql))
  })

const read = (fixture: Fixture, text: string, owner?: string) =>
  fixture.ok(
    readRequest({ text }),
    {},
    owner === undefined ? undefined : { owner },
  )

/** The fixture's vocabulary with `pattern` replaced. */
const breakVocabulary = (fixture: Fixture, pattern: RegExp, by: string) => {
  const file = join(fixture.config, 'request_reading.toml')
  writeFileSync(file, readFileSync(file, 'utf8').replace(pattern, by))
}

/** Only the request fields, for the cases about one field. */
const fields = async (fixture: Fixture, text: string) =>
  (await read(fixture, text)).request

describe('each kind of field alone', () => {
  test('Presentes by name, in the order named', async () => {
    const fixture = useFixture()

    const reading = await read(fixture, 'a Iara e o Quim')

    expect(reading.request).toEqual({ attendees: ['iara', 'quim'] })
    expect(reading.understood).toEqual([
      {
        field: 'attendees',
        words: 'Iara',
        label: 'Presente: Iara',
        request: { attendees: ['iara'] },
      },
      {
        field: 'attendees',
        words: 'Quim',
        label: 'Presente: Quim',
        request: { attendees: ['quim'] },
      },
    ])
    expect(reading.notUnderstood).toEqual([])
    expect(reading.ambiguities).toEqual([])
  })

  test('Clima by its name and by a synonym', async () => {
    const fixture = useFixture()

    const reading = await read(fixture, 'algo leve e engraçado')

    expect(reading.request).toEqual({ moods: ['leve', 'pra rir'] })
    expect(reading.understood.map((i) => [i.words, i.label])).toEqual([
      ['leve', 'Clima: leve'],
      ['engraçado', 'Clima: pra rir'],
    ])
  })

  test.each([
    ['até 2h', 120],
    ['até 90 minutos', 90],
    ['no máximo 1h30', 90],
    ['até uma hora e meia', 90],
    ['curto', 100],
  ])('duration: "%s" is %i minutes', async (text, minutes) => {
    expect(await fields(useFixture(), text)).toEqual({ maxDuration: minutes })
  })

  test.each([
    ['tem criança de 7', 7],
    ['com uma criança de 7 anos', 7],
    ['criança de sete anos', 7],
    ['com criança', 0],
  ])('child: "%s" is %i', async (text, age) => {
    expect(await fields(useFixture(), text)).toEqual({ child: age })
  })

  test('a child older than 17 is not read', async () => {
    const reading = await read(useFixture(), 'criança de 30 anos')

    expect(reading.request).toEqual({})
    expect(reading.notUnderstood).toEqual(['criança de 30 anos'])
  })

  test.each([
    ['dos anos 90', { since: 1990, until: 1999 }],
    ['anos 2000', { since: 2000, until: 2009 }],
    ['depois de 2010', { since: 2011 }],
    ['a partir de 2010', { since: 2010 }],
    ['antes de 1980', { until: 1979 }],
    ['até 2015', { until: 2015 }],
    ['depois de 2000 e antes de 2015', { since: 2001, until: 2014 }],
    ['entre 1990 e 2000', { since: 1990, until: 2000 }],
  ])('year: "%s"', async (text, range) => {
    expect(await fields(useFixture(), text)).toEqual(range)
  })

  test('the year item reads as the Restrição does', async () => {
    const reading = await read(useFixture(), 'dos anos 90')

    expect(reading.understood).toEqual([
      {
        field: 'year',
        words: 'anos 90',
        label: 'entre 1990 e 1999',
        request: { since: 1990, until: 1999 },
      },
    ])
  })

  test.each([
    ['filme nacional', 'pt'],
    ['em português', 'pt'],
    ['francês', 'fr'],
  ])('language: "%s" is %s', async (text, language) => {
    expect(await fields(useFixture(), text)).toEqual({ language })
  })

  test('"dublado" is not the original language', async () => {
    const reading = await read(useFixture(), 'dublado')

    expect(reading.request).toEqual({})
    expect(reading.notUnderstood).toEqual(['dublado'])
  })

  test.each(['que ninguém viu', 'nada repetido'])(
    'unseen: "%s"',
    async (text) => {
      expect(await fields(useFixture(), text)).toEqual({ unseen: true })
    },
  )

  test('nada lento and nada triste', async () => {
    const reading = await read(useFixture(), 'nada lento, nada triste')

    expect(reading.request).toEqual({ noSlow: true, noSad: true })
    expect(reading.understood.map((i) => i.label)).toEqual([
      'nada lento',
      'nada triste',
    ])
  })

  test.each([
    ['5 filmes', 5],
    ['só 3', 3],
    ['três filmes', 3],
  ])('count: "%s" is %i', async (text, count) => {
    expect(await fields(useFixture(), text)).toEqual({ count })
  })

  test('"um filme" is an article, not a count', async () => {
    expect(await fields(useFixture(), 'um filme leve')).toEqual({
      moods: ['leve'],
    })
  })

  test('"pelo gosto da Iara" is the Regra de with her among the Presentes', async () => {
    const reading = await read(useFixture(), 'pelo gosto da Iara')

    expect(reading.request).toEqual({
      rule: 'by',
      by: 'iara',
      attendees: ['iara'],
    })
    expect(reading.understood).toEqual([
      {
        field: 'by',
        words: 'pelo gosto da Iara',
        label: 'pelo gosto de Iara',
        request: { rule: 'by', by: 'iara', attendees: ['iara'] },
      },
    ])
  })
})

describe('Presentes', () => {
  test('"eu" is the logged-in Dono', async () => {
    const fixture = useFixture()

    expect((await read(fixture, 'eu e a Iara')).request).toEqual({
      attendees: ['bruno', 'iara'],
    })
    expect((await read(fixture, 'eu e a Iara', 'vera')).request).toEqual({
      attendees: ['vera', 'iara'],
    })
  })

  test('a nickname, even of several words and with accents', async () => {
    const fixture = useFixture()
    await fixture.ok(
      change("INSERT INTO apelidos VALUES ('quim', 'Joaquim Zé')"),
    )

    const reading = await read(fixture, 'chegou o joaquim ze')

    expect(reading.request).toEqual({ attendees: ['quim'] })
    expect(reading.understood[0]).toMatchObject({
      words: 'joaquim ze',
      label: 'Presente: Quim',
    })
    expect(reading.notUnderstood).toEqual([])
  })

  test('a name that matches no Pessoa is not understood, never guessed', async () => {
    const reading = await read(useFixture(), 'eu e a Ana')

    expect(reading.request).toEqual({ attendees: ['bruno'] })
    expect(reading.notUnderstood).toEqual(['Ana'])
  })

  test('a name of more than one Pessoa is ambiguous, with each of them', async () => {
    const fixture = useFixture()
    await fixture.ok(change("INSERT INTO apelidos VALUES ('rosa', 'Teo')"))

    const reading = await read(fixture, 'eu e o Teo')

    expect(reading.request).toEqual({ attendees: ['bruno'] })
    expect(reading.ambiguities).toEqual([
      {
        field: 'attendees',
        words: 'Teo',
        candidates: [
          { id: 'rosa', label: 'Rosa' },
          { id: 'teo', label: 'Teo' },
        ],
      },
    ])
    expect(reading.notUnderstood).toEqual([])
  })

  test('an ambiguous name in "pelo gosto de" is ambiguous for the Regra', async () => {
    const fixture = useFixture()
    await fixture.ok(change("INSERT INTO apelidos VALUES ('rosa', 'Teo')"))

    const reading = await read(fixture, 'pelo gosto do Teo')

    expect(reading.request).toEqual({})
    expect(reading.ambiguities).toMatchObject([
      { field: 'by', words: 'pelo gosto do Teo' },
    ])
  })
})

describe('Parecido', () => {
  test('a title with one match', async () => {
    const reading = await read(useFixture(), 'parecido com Poeira')

    expect(reading.request).toEqual({ similar: ['tt9001904'] })
    expect(reading.understood).toEqual([
      {
        field: 'similar',
        words: 'Poeira',
        label: 'parecidos com Poeira',
        request: { similar: ['tt9001904'] },
      },
    ])
  })

  test('the whole title wins over one that starts with it', async () => {
    expect(await fields(useFixture(), 'igual Fronteira')).toEqual({
      similar: ['tt9000401'],
    })
  })

  test('a leading article the title does not have is left out', async () => {
    expect(await fields(useFixture(), 'igual ao Poeira')).toEqual({
      similar: ['tt9001904'],
    })
  })

  test('a title of several films is ambiguous, with its candidates', async () => {
    const reading = await read(useFixture(), 'parecido com Reprise')

    expect(reading.request).toEqual({})
    expect(reading.ambiguities).toEqual([
      {
        field: 'similar',
        words: 'Reprise',
        candidates: [
          { id: 'tt9012601', label: 'Reprise (2011)' },
          { id: 'tt9012602', label: 'Reprise (2004)' },
        ],
      },
    ])
  })

  test('"Título (ano)" picks the film of that year', async () => {
    const reading = await read(useFixture(), 'parecido com Reprise (2004)')

    expect(reading.request).toEqual({ similar: ['tt9012602'] })
    expect(reading.understood[0]?.words).toBe('Reprise (2004)')
  })

  test('a title with no film is ambiguous with no candidate', async () => {
    const reading = await read(useFixture(), 'tipo Amélie')

    expect(reading.request).toEqual({})
    expect(reading.ambiguities).toEqual([
      { field: 'similar', words: 'Amélie', candidates: [] },
    ])
    expect(reading.notUnderstood).toEqual([])
  })

  test('"entre X e Y" is Parecido with both, even when a title has "e"', async () => {
    const fixture = useFixture()

    expect((await read(fixture, 'entre Poeira e Coxia')).request).toEqual({
      similar: ['tt9001904', 'tt9005504'],
    })
    expect(
      (await read(fixture, 'entre Sal e Ferrugem e Poeira')).request,
    ).toEqual({ similar: ['tt9000105', 'tt9001904'] })
  })

  test('"entre X e Y" with one title unclear keeps the other', async () => {
    const reading = await read(useFixture(), 'entre Reprise e Poeira')

    expect(reading.request).toEqual({ similar: ['tt9001904'] })
    expect(reading.ambiguities).toMatchObject([
      { field: 'similar', words: 'Reprise' },
    ])
  })

  test('the title ends where the next understood item starts', async () => {
    expect(await fields(useFixture(), 'parecido com Poeira até 2h')).toEqual({
      similar: ['tt9001904'],
      maxDuration: 120,
    })
  })
})

describe('the whole sentence', () => {
  test('several fields at once', async () => {
    const reading = await read(
      useFixture(),
      'eu e a Iara, algo leve, até 2h, tem criança de 7, 3 filmes',
    )

    expect(reading.request).toEqual({
      attendees: ['bruno', 'iara'],
      moods: ['leve'],
      maxDuration: 120,
      child: 7,
      count: 3,
    })
    expect(reading.understood.map((i) => i.label)).toEqual([
      'Presente: Bruno',
      'Presente: Iara',
      'Clima: leve',
      'até 2h',
      'com criança de 7 anos',
      '3 filmes',
    ])
    expect(reading.notUnderstood).toEqual([])
  })

  test('case and accents do not matter', async () => {
    expect(await fields(useFixture(), 'A IARA, ROMANTICO, Nada Lento')).toEqual(
      {
        attendees: ['iara'],
        moods: ['romântico'],
        noSlow: true,
      },
    )
  })

  test('a longer phrase wins over a shorter one it contains', async () => {
    // "triste" alone is the Clima "pra chorar".
    expect(await fields(useFixture(), 'triste')).toEqual({
      moods: ['pra chorar'],
    })
    expect(await fields(useFixture(), 'nada triste')).toEqual({ noSad: true })
  })

  test('a clause about taste gives nothing and comes back whole', async () => {
    const reading = await read(useFixture(), 'a Iara odeia terror')

    expect(reading).toEqual({
      text: 'a Iara odeia terror',
      request: {},
      understood: [],
      notUnderstood: ['Iara odeia terror'],
      ambiguities: [],
    })
  })

  test('a Clima after a negation in its clause is not understood', async () => {
    const fixture = useFixture()

    const reading = await read(fixture, 'algo leve, nada de terror')

    expect(reading.request).toEqual({ moods: ['leve'] })
    expect(reading.understood.map((i) => i.label)).toEqual(['Clima: leve'])
    expect(reading.notUnderstood).toEqual(['nada de terror'])
    expect((await read(fixture, 'sem comédia')).request).toEqual({})
    expect((await read(fixture, 'não quero terror')).request).toEqual({})
  })

  test('a negation in another clause does not deny the Clima', async () => {
    expect(await fields(useFixture(), 'nada de terror; leve')).toEqual({
      moods: ['leve'],
    })
  })

  test('the clauses around one about taste are still read', async () => {
    const reading = await read(useFixture(), 'chegou a Iara; ela adora terror')

    expect(reading.request).toEqual({ attendees: ['iara'] })
    expect(reading.notUnderstood).toEqual(['ela adora terror'])
  })

  test('the words not understood come back as typed, a run each', async () => {
    const reading = await read(
      useFixture(),
      'algo leve com pipoca, e a Iara traz o vinho',
    )

    expect(reading.request).toEqual({ moods: ['leve'], attendees: ['iara'] })
    expect(reading.notUnderstood).toEqual(['pipoca', 'traz o vinho'])
  })

  test('an empty sentence reads nothing', async () => {
    const empty = {
      request: {},
      understood: [],
      notUnderstood: [],
      ambiguities: [],
    }
    expect(await read(useFixture(), '')).toEqual({ text: '', ...empty })
    expect(await read(useFixture(), '  ,  ')).toEqual({
      text: '  ,  ',
      ...empty,
    })
  })

  test('the same sentence always reads the same', async () => {
    const fixture = useFixture()
    const text = 'eu e o Quim, pra rir, dos anos 80, parecido com Poeira'

    expect(await read(fixture, text)).toEqual(await read(fixture, text))
  })

  test('"eu" with no Dono and no Pessoa so nicknamed is not understood', async () => {
    const fixture = useFixture()
    await fixture.ok(change('UPDATE pessoas SET dono = 0'))
    await fixture.ok(change("DELETE FROM apelidos WHERE apelido = 'eu'"))

    const reading = await read(fixture, 'eu e a Iara')

    expect(reading.request).toEqual({ attendees: ['iara'] })
    expect(reading.notUnderstood).toEqual(['eu'])
  })

  test.each([
    ['leve = 3', 'request_reading.toml [moods]'],
    ['alegre = ["feliz"]', "'alegre' não é um Clima de moods.toml"],
  ])('a [moods] line "%s" is invalid_config', async (line, message) => {
    const fixture = useFixture()
    breakVocabulary(fixture, /^leve = .*$/mu, line)

    const outcome = await fixture.run(readRequest({ text: 'leve' }))

    expect(outcome.exitCode).toBe(1)
    expect(JSON.stringify(outcome.output)).toContain(message)
  })

  test('fillers that are not a list are invalid_config', async () => {
    const fixture = useFixture()
    breakVocabulary(fixture, /^fillers = \[/mu, 'fillers = 1\nold_fillers = [')

    expect(await fixture.run(readRequest({ text: 'leve' }))).toMatchObject({
      exitCode: 1,
      output: { error: { code: 'invalid_config' } },
    })
  })

  test('a sentence too long is invalid_usage', async () => {
    const outcome = await useFixture().run(
      readRequest({ text: 'leve '.repeat(200) }),
    )

    expect(outcome).toEqual({
      exitCode: 2,
      output: {
        error: {
          code: 'invalid_usage',
          message: 'a frase tem mais de 500 caracteres',
        },
      },
    })
  })
})

describe('the Acrescentar', () => {
  const add = (fixture: Fixture, text: string) =>
    fixture.ok(readRequest({ text, fields: ADDITION_FIELDS }), {})

  test('applies Presentes, Climas, Restrições and Parecido', async () => {
    const reading = await add(
      useFixture(),
      'chegou a Iara, leve, até 2h, nada lento, parecido com Poeira',
    )

    expect(reading.request).toEqual({
      attendees: ['iara'],
      moods: ['leve'],
      maxDuration: 120,
      noSlow: true,
      similar: ['tt9001904'],
    })
    expect(reading.notUnderstood).toEqual([])
  })

  test('reads no count, Regra or "de": their words are not understood', async () => {
    const fixture = useFixture()
    await fixture.ok(change("INSERT INTO apelidos VALUES ('rosa', 'Teo')"))

    const reading = await add(
      fixture,
      '3 filmes, pelo gosto da Iara, leve, pelo gosto do Teo',
    )

    expect(reading.request).toEqual({ moods: ['leve'] })
    expect(reading.understood.map((i) => i.label)).toEqual(['Clima: leve'])
    expect(reading.notUnderstood).toEqual([
      '3 filmes',
      'pelo gosto da Iara',
      'pelo gosto do Teo',
    ])
    expect(reading.ambiguities).toEqual([])
  })

  test('adds Presentes and Climas, replaces a Restrição, the year range and the Parecido', () => {
    expect(
      withAddition(
        {
          attendees: ['bruno'],
          moods: ['leve'],
          count: 3,
          maxDuration: 90,
          since: 2010,
          similar: ['tt9000101'],
          noSad: true,
        },
        {
          attendees: ['iara', 'bruno'],
          moods: ['tenso'],
          maxDuration: 120,
          until: 2021,
          similar: ['tt9001904'],
        },
      ),
    ).toEqual({
      attendees: ['bruno', 'iara'],
      moods: ['leve', 'tenso'],
      count: 3,
      maxDuration: 120,
      until: 2021,
      similar: ['tt9001904'],
      noSad: true,
    })
  })

  test('keeps the year range and the Parecido it does not name', () => {
    expect(
      withAddition(
        { attendees: ['bruno'], since: 2010, similar: ['tt9000101'] },
        { noSlow: true },
      ),
    ).toEqual({
      attendees: ['bruno'],
      since: 2010,
      similar: ['tt9000101'],
      noSlow: true,
    })
  })
})
