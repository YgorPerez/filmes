// Pessoa files (ticket #86): reading every Pessoa, resolving one, creating
// one, writing one back, and the body sections. The pytest twins are the
// file-level parts of tests/test_pessoa.py and test_perguntas_abertas.py;
// the `pessoa` command and the DB sync come with #87.
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { data, migrateDataFile, output } from '@filmes/key-migration'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  addItem,
  createPerson,
  decodePerson,
  decodePersonSync,
  EngineError,
  items,
  type EngineServices,
  type Run,
  LEVELS,
  LINKS,
  parseYaml,
  readPeople,
  readPerson,
  removeItem,
  resolvePerson,
  savePerson,
  skipQuestion,
  STATEMENT_REACTIONS,
  type OpenQuestion,
  type Person,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

/** Carol, as tests/test_pessoa.py writes her, migrated to English keys. */
const CAROL = migrateDataFile(
  'person',
  `---
nome: Carol
apelidos: [Carolzinha]
vetos:
- texto: nada da Sofia Rangel
  alvo: Q9000018
  rotulo: Sofia Rangel
  data: 2026-01-05
imports: []
---
Amiga da faculdade.

## Declarados

- 2025-03-01 · questionário · genérico · gosta de Comédia (Q9001802) · "comédia sempre"
- 2026-02-02 · questionário · específico · ama Barulho (tt9000501) · "Barulho é o melhor"

## Relatos

- 2026-04-04 · descrição do Dono · específico · não gosta de Davi Couto (Q9001803) · "acha o Davi Couto canastrão"
`,
  'to-en',
)

const file = (fixture: Fixture, slug: string) =>
  join(fixture.data, 'people', `${slug}.md`)

const write = (fixture: Fixture, slug: string, text: string) =>
  writeFileSync(file(fixture, slug), text, 'utf8')

const frontmatter = (fixture: Fixture, slug: string) => {
  const text = readFileSync(file(fixture, slug), 'utf8')
  const value = parseYaml(text.slice(4, text.indexOf('\n---', 4)))
  return value instanceof Map ? Object.fromEntries(value) : value
}

const errorOf = async <A, E>(
  fixture: Fixture,
  effect: Effect.Effect<A, E, EngineServices | Run>,
) => {
  const outcome = await fixture.run(effect)
  if (outcome.exitCode === 0) throw new Error('expected an error')
  return outcome.output.error
}

const person = (fixture: Fixture, slug: string) =>
  fixture.ok(readPerson(file(fixture, slug)))

describe('reading the Pessoas', () => {
  test('every fixture Pessoa parses', async () => {
    const fixture = useFixture()

    const people = await fixture.ok(readPeople)

    expect(people.map((p) => p.slug)).toEqual([
      'bruno',
      'iara',
      'quim',
      'rosa',
      'teo',
      'vera',
    ])
    const [bruno, iara, quim] = people
    expect(bruno).toMatchObject({
      name: 'Bruno',
      aliases: ['eu'],
      owner: true,
      email: 'bruno@example.org',
      admin: false,
      vetoes: [],
      body: '',
    })
    expect(iara).toMatchObject({ owner: false, email: 'iara@example.org' })
    expect(quim?.openQuestions).toEqual([
      {
        text: 'o Quim curte os filmes da Helena Prado?',
        subject: 'Q9000001',
        label: 'Helena Prado',
        date: '2026-11-19',
        skips: 1,
      },
    ])
  })

  test('a Pessoa with Vetos and body sections parses', async () => {
    const fixture = useFixture()
    write(fixture, 'carol', CAROL)

    const carol = await person(fixture, 'carol')

    expect(carol.aliases).toEqual(['Carolzinha'])
    // An unquoted date is a date to YAML 1.1, kept as its text.
    expect(carol.vetoes).toEqual([
      {
        text: 'nada da Sofia Rangel',
        target: 'Q9000018',
        label: 'Sofia Rangel',
        date: '2026-01-05',
      },
    ])
    expect(await fixture.ok(items(carol, 'stated'))).toEqual([
      {
        date: '2025-03-01',
        source: 'questionário',
        specific: false,
        reaction: 'like',
        label: 'Comédia',
        target: 'Q9001802',
        text: 'comédia sempre',
      },
      {
        date: '2026-02-02',
        source: 'questionário',
        specific: true,
        reaction: 'love',
        label: 'Barulho',
        target: 'tt9000501',
        text: 'Barulho é o melhor',
      },
    ])
    expect(await fixture.ok(items(carol, 'reports'))).toMatchObject([
      { reaction: 'dislike', target: 'Q9001803', specific: true },
    ])
    expect(await fixture.ok(items(carol, 'seen'))).toEqual([])
  })

  test('a line out of format is invalid_data naming the file and the line', async () => {
    const fixture = useFixture()
    write(
      fixture,
      'carol',
      CAROL.replace('2025-03-01 · questionário', 'ontem, no questionário'),
    )
    const carol = await person(fixture, 'carol')

    const error = await errorOf(fixture, items(carol, 'stated'))

    expect(error).toEqual({
      code: 'invalid_data',
      message:
        'people/carol.md, linha 5 do corpo: Declarado fora do formato: ' +
        '- ontem, no questionário · genérico · gosta de Comédia (Q9001802) · "comédia sempre"',
    })
    // Read lazily, as in Python: the other sections still read.
    expect(await fixture.ok(items(carol, 'reports'))).toHaveLength(1)
  })

  test('a date that is not a calendar date is out of format', async () => {
    const fixture = useFixture()
    write(fixture, 'carol', CAROL.replace('2026-04-04', '2026-02-30'))

    const error = await errorOf(
      fixture,
      Effect.flatMap(readPerson(file(fixture, 'carol')), (p) =>
        items(p, 'reports'),
      ),
    )

    expect(error.message).toContain('linha 10 do corpo: Relato fora do formato')
  })

  test('no filmes-dados is missing_data', async () => {
    const fixture = useFixture()
    rmSync(fixture.data, { recursive: true })

    expect(await errorOf(fixture, readPeople)).toEqual({
      code: 'missing_data',
      message: `repo de dados não encontrado em ${fixture.data}`,
    })
  })

  test('no people folder is no Pessoa', async () => {
    const fixture = useFixture()
    rmSync(join(fixture.data, 'people'), { recursive: true })

    expect(await fixture.ok(readPeople)).toEqual([])
  })

  test.each([
    ['no frontmatter', 'só texto\n', 'falta o campo nome'],
    [
      'an open frontmatter',
      '---\nname: Ana\n',
      "frontmatter sem o '---' de fechamento",
    ],
    ['broken YAML', '---\nname: [Ana\n---\n', 'frontmatter inválido: '],
    ['a list frontmatter', '---\n- a\n---\n', 'falta o campo nome'],
    [
      'a Veto with no target',
      '---\nname: Ana\nvetoes:\n- {text: x, date: 2026-01-01}\n---\n',
      "Veto precisa de texto, alvo e data: {'text': 'x', 'date': '2026-01-01'}",
    ],
    [
      'a Veto with a bad date',
      "---\nname: Ana\nvetoes:\n- {text: x, target: Q1, date: '2026-13-01'}\n---\n",
      "data do Veto inválida: '2026-13-01'",
    ],
    [
      'an Ajuste with an unknown link',
      "---\nname: Ana\nadjustments:\n- {link: elenco, level: none, date: '2026-01-01'}\n---\n",
      "elo do Ajuste inválido: 'elenco' (use director, writer, cast, series, genre)",
    ],
    [
      'an Ajuste at normal',
      "---\nname: Ana\nadjustments:\n- {link: cast, level: normal, date: '2026-01-01'}\n---\n",
      "nível do Ajuste inválido: 'normal' (use none, low ou high)",
    ],
    [
      'an Ajuste with no level',
      "---\nname: Ana\nadjustments:\n- {link: cast, date: '2026-01-01'}\n---\n",
      "Ajuste precisa de elo, nivel e data: {'link': 'cast', 'date': '2026-01-01'}",
    ],
    [
      'an Ajuste with a bad date',
      '---\nname: Ana\nadjustments:\n- {link: cast, level: low, date: ontem}\n---\n',
      "data do Ajuste inválida: 'ontem'",
    ],
    [
      'two Ajustes for one link',
      "---\nname: Ana\nadjustments:\n- {link: cast, level: low, date: '2026-01-01'}\n- {link: cast, level: high, date: '2026-01-02'}\n---\n",
      'mais de um Ajuste para o elo cast',
    ],
    [
      'an open question skipped twice',
      "---\nname: Ana\nopen_questions:\n- {text: x?, date: '2026-01-01', skips: 2}\n---\n",
      'puladas da pergunta aberta inválido: 2 (de 1 a 1; pulada 2 vezes, sai)',
    ],
    [
      'an open question with skips 1.0',
      "---\nname: Ana\nopen_questions:\n- {text: x?, date: '2026-01-01', skips: 1.0}\n---\n",
      'puladas da pergunta aberta inválido: 1.0',
    ],
    [
      'an open question with no date',
      '---\nname: Ana\nopen_questions:\n- {text: x?, skips: 1}\n---\n',
      "pergunta aberta precisa de texto, data e puladas: {'text': 'x?', 'skips': 1}",
    ],
    [
      'an open question with a bad date',
      "---\nname: Ana\nopen_questions:\n- {text: x?, date: '2026', skips: 1}\n---\n",
      "data da pergunta aberta inválida: '2026'",
    ],
    [
      'an open question asked twice',
      "---\nname: Ana\nopen_questions:\n- {text: Curte X?, date: '2026-01-01', skips: 1}\n- {text: curte x?, date: '2026-01-02', skips: 1}\n---\n",
      "pergunta aberta repetida: 'curte x?'",
    ],
  ])('%s is invalid_data', async (_, text, message) => {
    const fixture = useFixture()
    write(fixture, 'ana', text)

    const error = await errorOf(fixture, readPeople)

    expect(error.code).toBe('invalid_data')
    expect(error.message).toContain(message)
    expect(error.message).toContain(file(fixture, 'ana'))
  })

  test('a frontmatter that is a number is a defect, as in Python', async () => {
    const fixture = useFixture()
    write(fixture, 'ana', '---\n3\n---\n')

    expect((await errorOf(fixture, readPeople)).code).toBe('internal')
  })

  test('keys and values read as Python read them', async () => {
    const fixture = useFixture()
    write(
      fixture,
      'ana',
      [
        '---',
        'name: 1.0',
        'aliases: Ana',
        'owner: 0',
        'email: null',
        'admin: on',
        'vetoes:',
        '- {text: x, target: comedy_dumb, date: 20260101}',
        'open_questions:',
        "- {text: x?, subject: '', label: L, date: '2026-01-01', skips: 1}",
        '- {text: y?, subject: Q1, date: 2026-W01, skips: 1}',
        'imports: [{kind: letterboxd, date: 2026-01-01}]',
        '---',
        '',
        '',
        'texto',
      ].join('\n'),
    )

    const ana = await person(fixture, 'ana')

    expect(ana).toMatchObject({
      name: '1.0',
      // A str is iterated by character.
      aliases: ['A', 'n', 'a'],
      owner: false,
      email: null,
      admin: true,
      // 20260101 is an int; str() of it is a date fromisoformat takes.
      vetoes: [
        {
          text: 'x',
          target: 'comedy_dumb',
          label: 'comedy_dumb',
          date: '20260101',
        },
      ],
      openQuestions: [
        { text: 'x?', subject: null, label: null },
        { text: 'y?', subject: 'Q1', label: 'Q1', date: '2026-W01' },
      ],
      body: 'texto',
    })
    expect(ana.imports).toEqual([
      new Map([
        ['kind', 'letterboxd'],
        ['date', '2026-01-01'],
      ]),
    ])
  })

  test('decodePersonSync throws the EngineError', () => {
    expect(decodePersonSync('/x/ana.md', '---\nname: Ana\n---\n').slug).toBe(
      'ana',
    )
    expect(() => decodePersonSync('/x/ana.md', 'nada')).toThrow(EngineError)
  })
})

describe('resolving a Pessoa', () => {
  test('by alias, ignoring case', async () => {
    const fixture = useFixture()
    write(fixture, 'carol', CAROL)

    expect((await fixture.ok(resolvePerson(' CAROLZINHA '))).slug).toBe('carol')
    expect((await fixture.ok(resolvePerson('Carol'))).slug).toBe('carol')
  })

  test('"dono" is the Dono', async () => {
    const fixture = useFixture()

    const owner = await fixture.ok(resolvePerson('Dono'))

    expect(owner.slug).toBe('bruno')
    expect(owner.owner).toBe(true)
  })

  test('no Dono to find', async () => {
    const fixture = useFixture()
    write(fixture, 'bruno', '---\nname: Bruno\n---\n')
    write(fixture, 'vera', '---\nname: Vera\n---\n')

    expect(await errorOf(fixture, resolvePerson('dono'))).toEqual({
      code: 'unknown_person',
      message: 'nenhuma Pessoa tem dono: true no repo de dados',
    })
  })

  test('an unknown name', async () => {
    const fixture = useFixture()

    expect(await errorOf(fixture, resolvePerson('fulano'))).toEqual({
      code: 'unknown_person',
      message: "nenhuma Pessoa se chama 'fulano'",
    })
  })

  test('a name two Pessoas share', async () => {
    const fixture = useFixture()
    write(fixture, 'ana', '---\nname: Ana\naliases: [Rô]\n---\n')
    write(fixture, 'rosana', '---\nname: Rosana\naliases: [rô]\n---\n')

    expect(await errorOf(fixture, resolvePerson('Rô'))).toEqual({
      code: 'ambiguous_person',
      message: "'Rô' pode ser mais de uma Pessoa: ana, rosana",
    })
  })
})

describe('creating a Pessoa', () => {
  test('writes the file with name and aliases', async () => {
    const fixture = useFixture()

    const ana = await fixture.ok(
      createPerson({
        name: ' Ana Lima ',
        aliases: ['Ana', 'Aninha', 'Ana'],
        slug: 'ana',
      }),
    )

    expect(ana.slug).toBe('ana')
    expect(frontmatter(fixture, 'ana')).toEqual({
      name: 'Ana Lima',
      aliases: ['Ana', 'Aninha'],
      vetoes: [],
      imports: [],
    })
    expect(readFileSync(file(fixture, 'ana'), 'utf8')).toBe(
      '---\nname: Ana Lima\naliases: [Ana, Aninha]\nvetoes: []\nimports: []\n---\n',
    )
  })

  test('the slug comes from the name, without accents', async () => {
    const fixture = useFixture()

    const leo = await fixture.ok(createPerson({ name: 'Léo Araújo' }))

    expect(leo.slug).toBe('leo-araujo')
    expect((await person(fixture, 'leo-araujo')).name).toBe('Léo Araújo')
  })

  test('one more Dono beside the ones there are (#131)', async () => {
    const fixture = useFixture()

    await fixture.ok(
      createPerson({ name: 'Ana', owner: true, email: 'ana@example.org' }),
    )

    expect(frontmatter(fixture, 'ana')).toMatchObject({ owner: true })
  })

  test.each([
    [
      { name: 'Outro Bruno', slug: 'bruno' },
      'person_exists',
      "já existe uma Pessoa com o slug 'bruno'",
    ],
    [
      { name: 'Ana', slug: 'Ana' },
      'invalid_usage',
      "slug inválido: 'Ana' (só letras minúsculas sem acento, números e '-')",
    ],
    [
      { name: '日本' },
      'invalid_usage',
      "slug inválido: '' (só letras minúsculas sem acento, números e '-')",
    ],
    [
      { name: ' DONO ' },
      'invalid_usage',
      "'dono' é reservado para achar o Dono",
    ],
    [
      { name: 'Ana', slug: 'dono' },
      'invalid_usage',
      "'dono' é reservado para achar o Dono",
    ],
    [
      { name: 'Ana', owner: true },
      'invalid_usage',
      'um Dono precisa do e-mail do Google, para entrar no site',
    ],
    [
      { name: 'Ana', owner: true, email: 'ana@example' },
      'invalid_usage',
      "e-mail inválido: 'ana@example'",
    ],
    [
      { name: 'Ana', owner: true, email: 'ana lima@example.org' },
      'invalid_usage',
      "e-mail inválido: 'ana lima@example.org'",
    ],
    [
      { name: 'Ana', email: 'ana@example.org' },
      'invalid_usage',
      'só um Dono tem e-mail: ele serve para entrar no site',
    ],
    [
      { name: 'Ana', owner: true, email: 'Bruno@Example.org' },
      'invalid_usage',
      "o e-mail 'bruno@example.org' já é de bruno",
    ],
  ])('%j is an error', async (input, code, message) => {
    const fixture = useFixture()

    expect(await errorOf(fixture, createPerson(input))).toEqual({
      code,
      message,
    })
  })
})

describe('writing a Pessoa back', () => {
  test('write then read gives the same Pessoa, for every fixture Pessoa and Carol', async () => {
    const fixture = useFixture()
    write(fixture, 'carol', CAROL)
    const before = await fixture.ok(readPeople)

    for (const p of before) await fixture.ok(savePerson(p))

    expect(await fixture.ok(readPeople)).toEqual(before)
  })

  test('keeps email and admin, and writes the keys in their order', async () => {
    const fixture = useFixture()
    const bruno: Person = {
      ...(await person(fixture, 'bruno')),
      admin: true,
      adjustments: [{ link: 'cast', level: 'none', date: '2026-11-22' }],
      openQuestions: [
        {
          text: "o 'Bruno' curte terror?",
          date: '2026-11-22',
          skips: 1,
          subject: 'horror',
          label: 'terror',
        },
        {
          text: 'e drama?',
          date: '2026-11-22',
          skips: 1,
          subject: null,
          label: null,
        },
      ],
      imports: [new Map([['kind', 'letterboxd']])],
      body: 'Livre.\n',
    }

    await fixture.ok(savePerson(bruno))

    expect(readFileSync(file(fixture, 'bruno'), 'utf8')).toBe(
      [
        '---',
        'name: Bruno',
        'aliases: [eu]',
        'owner: true',
        'email: bruno@example.org',
        'admin: true',
        'vetoes: []',
        'adjustments:',
        "- {link: cast, level: none, date: '2026-11-22'}",
        'open_questions:',
        "- {text: 'o ''Bruno'' curte terror?', subject: horror, label: terror, date: '2026-11-22', skips: 1}",
        "- {text: 'e drama?', date: '2026-11-22', skips: 1}",
        'imports:',
        '- {kind: letterboxd}',
        '---',
        'Livre.',
        '',
      ].join('\n'),
    )
    expect(await person(fixture, 'bruno')).toEqual(bruno)
  })
})

describe('the sections of a Pessoa', () => {
  test('a new Relato goes after the last one and keeps the free text', async () => {
    const fixture = useFixture()
    write(fixture, 'carol', CAROL)
    const carol = await person(fixture, 'carol')

    const { person: updated, added } = await fixture.ok(
      addItem(carol, 'reports', {
        date: '2026-11-20',
        source: 'descrição do Dono',
        specific: false,
        text: 'odeia filme lento',
        reaction: null,
        target: null,
        label: null,
      }),
    )
    await fixture.ok(savePerson(updated))

    expect(added).toBe(true)
    const text = readFileSync(file(fixture, 'carol'), 'utf8')
    expect(text).toContain('Amiga da faculdade.')
    expect(text.indexOf('canastrão')).toBeLessThan(
      text.indexOf('"odeia filme lento"'),
    )
    expect(text.split('## Relatos')).toHaveLength(2)
    expect(
      text.endsWith(
        'canastrão"\n- 2026-11-20 · descrição do Dono · genérico · "odeia filme lento"\n',
      ),
    ).toBe(true)
  })

  test('an item already there is not added again', async () => {
    const fixture = useFixture()
    write(fixture, 'carol', CAROL)
    const carol = await person(fixture, 'carol')
    const [first] = await fixture.ok(items(carol, 'stated'))
    if (!first) throw new Error('no Declarado')

    const { person: same, added } = await fixture.ok(
      addItem(carol, 'stated', first),
    )

    expect(added).toBe(false)
    expect(same).toBe(carol)
  })

  test('a missing section is created at the end, and a removed item leaves it', async () => {
    const fixture = useFixture()
    write(fixture, 'carol', `${CAROL}\n\n`)
    const carol = await person(fixture, 'carol')
    const seen = {
      date: '2026-11-21',
      source: 'conversa com o Dono',
      target: 'tt9000602',
      label: 'Casa Cheia',
      rating: 4.5,
    }

    const { person: withSeen } = await fixture.ok(addItem(carol, 'seen', seen))
    const second = {
      ...seen,
      target: 'tt9000601',
      label: 'Pequenos Milagres',
      rating: null,
    }
    const { person: withTwo } = await fixture.ok(
      addItem(withSeen, 'seen', second),
    )

    expect(
      withTwo.body.endsWith(
        'canastrão"\n\n## Já vistos\n\n' +
          '- 2026-11-21 · conversa com o Dono · Casa Cheia (tt9000602) · nota 4,5\n' +
          '- 2026-11-21 · conversa com o Dono · Pequenos Milagres (tt9000601)\n',
      ),
    ).toBe(true)
    expect(await fixture.ok(items(withTwo, 'seen'))).toEqual([seen, second])

    const removed = await fixture.ok(removeItem(withTwo, 'seen', seen))
    expect(await fixture.ok(items(removed, 'seen'))).toEqual([second])
    const empty = await fixture.ok(removeItem(removed, 'seen', second))
    expect(empty.body).toContain('## Já vistos\n')
    expect(
      (await fixture.run(removeItem(empty, 'seen', second))).exitCode,
    ).toBe(1)
  })

  test('a section with nothing but its title gets the item after the blank line', async () => {
    const fixture = useFixture()
    write(fixture, 'ana', '---\nname: Ana\n---\n## Relatos\n\n## Outra\n')
    const ana = await person(fixture, 'ana')
    const report = {
      date: '2026-11-20',
      source: 'x',
      specific: true,
      text: 't',
      reaction: 'hate' as const,
      target: 'Q1',
      label: 'Y',
    }

    const { person: updated } = await fixture.ok(
      addItem(ana, 'reports', report),
    )

    expect(updated.body).toBe(
      '## Relatos\n\n- 2026-11-20 · x · específico · odeia Y (Q1) · "t"\n## Outra\n',
    )
    const first = await fixture.ok(
      addItem({ ...ana, body: '' }, 'stated', report),
    )
    expect(first.person.body).toBe(
      '## Declarados\n\n- 2026-11-20 · x · específico · odeia Y (Q1) · "t"\n',
    )
  })

  test('Vetos are one per target; Ajustes one per link, the new replacing the old', async () => {
    const fixture = useFixture()
    const bruno = await person(fixture, 'bruno')
    const veto = {
      text: 'nunca vê terror',
      target: 'Q9001801',
      label: 'Terror',
      date: '2026-11-20',
    }

    const once = await fixture.ok(addItem(bruno, 'vetoes', veto))
    const twice = await fixture.ok(
      addItem(once.person, 'vetoes', { ...veto, text: 'terror nem pensar' }),
    )
    expect([once.added, twice.added]).toEqual([true, false])
    expect(await fixture.ok(removeItem(once.person, 'vetoes', veto))).toEqual(
      bruno,
    )
    expect(
      (await fixture.run(removeItem(bruno, 'vetoes', veto))).exitCode,
    ).toBe(1)

    const low = {
      link: 'cast' as const,
      level: 'low' as const,
      date: '2026-11-20',
    }
    const high = { ...low, level: 'high' as const }
    const withLow = await fixture.ok(addItem(bruno, 'adjustments', low))
    const withHigh = await fixture.ok(
      addItem(withLow.person, 'adjustments', high),
    )
    const again = await fixture.ok(
      addItem(withHigh.person, 'adjustments', high),
    )
    expect(withHigh.person.adjustments).toEqual([high])
    expect(again.added).toBe(false)
    expect(await fixture.ok(items(withHigh.person, 'adjustments'))).toEqual([
      high,
    ])
    expect(
      (await fixture.ok(removeItem(withHigh.person, 'adjustments', high)))
        .adjustments,
    ).toEqual([])
    expect(await fixture.ok(items(bruno, 'vetoes'))).toEqual([])
  })

  test('open questions: one per subject, or per text; skipped twice, they leave', async () => {
    const fixture = useFixture()
    const quim = await person(fixture, 'quim')
    const [helena] = quim.openQuestions
    if (!helena) throw new Error('no open question')
    const terror: OpenQuestion = {
      text: 'curte terror?',
      date: '2026-11-21',
      skips: 1,
      subject: null,
      label: null,
    }

    const added = await fixture.ok(addItem(quim, 'open_questions', terror))
    const same = await fixture.ok(
      addItem(added.person, 'open_questions', {
        ...terror,
        text: 'CURTE TERROR?',
      }),
    )
    expect([added.added, same.added]).toEqual([true, false])
    expect(await fixture.ok(items(added.person, 'open_questions'))).toEqual([
      helena,
      terror,
    ])
    expect(
      (await fixture.ok(removeItem(added.person, 'open_questions', terror)))
        .openQuestions,
    ).toEqual([helena])

    // Skipped again with a subject it lacked: the count goes up, the subject stays.
    const subject = skipQuestion(added.person, {
      ...terror,
      date: '2026-11-22',
      subject: 'horror',
      label: 'terror',
    })
    expect(subject).toMatchObject({
      dropped: true,
      question: { skips: 2, subject: 'horror', date: '2026-11-22' },
    })
    expect(subject.person.openQuestions).toEqual([helena])

    const fresh = skipQuestion(quim, terror)
    expect(fresh).toEqual({
      person: added.person,
      question: terror,
      dropped: false,
    })

    const kept = skipQuestion(
      { ...quim, openQuestions: [{ ...helena, skips: 0 }] },
      { ...helena, subject: 'Q9000001', text: 'outra' },
    )
    expect(kept).toMatchObject({
      dropped: false,
      question: { skips: 1, text: helena.text, label: 'Helena Prado' },
    })
    expect(kept.person.openQuestions).toEqual([kept.question])
  })

  test('a Pessoa decodes the same from text as from her file', async () => {
    const fixture = useFixture()
    write(fixture, 'carol', CAROL)

    expect(
      await fixture.ok(decodePerson(file(fixture, 'carol'), CAROL)),
    ).toEqual(await person(fixture, 'carol'))
  })
})

describe('closed lists', () => {
  test('are the code names of the key migration', () => {
    expect(LINKS).toEqual(Object.values(data.LINKS))
    expect(LEVELS).toEqual(Object.values(data.LEVELS))
    expect(STATEMENT_REACTIONS).toEqual(
      Object.values(output.STATEMENT_REACTIONS),
    )
  })
})
