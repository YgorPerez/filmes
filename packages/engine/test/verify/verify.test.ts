// Answer verification (ticket #98); the pytest twin is
// tests/test_verificar.py. `verificar` reads only the Session's file, so a
// Session the engine cannot open yet (a Restrição, #91/#92, or a Feedback,
// #96) is opened by Python over the Portuguese copy of the data and
// migrated into the engine's data, as the Sessions tests do.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrateDataFile, outputToEnglish } from '@filmes/key-migration'
import { describe, expect, test } from 'vite-plus/test'
import {
  recommendSession,
  verifyAnswer,
  type RecommendedFilm,
  type SessionRecommendation,
  type Vars,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { PYTHON_TIMEOUT, pythonOk } from '../recommendation/support.ts'
import { RECORDINGS } from '../sources/support.ts'

/** Copies Python's Sessions, in English, into the engine's data. */
const migrateSessions = (fixture: Fixture) => {
  const folder = join(fixture.root, 'py-dados', 'sessoes')
  mkdirSync(join(fixture.data, 'sessions'), { recursive: true })
  for (const name of readdirSync(folder))
    writeFileSync(
      join(fixture.data, 'sessions', name),
      migrateDataFile(
        'session',
        readFileSync(join(folder, name), 'utf8'),
        'to-en',
      ),
    )
}

/** Python's `recomendar` opens the Session; its output in English. */
const pythonSession = (
  fixture: Fixture,
  args: ReadonlyArray<string>,
  vars: Vars = {},
): SessionRecommendation => {
  const output = outputToEnglish(
    'recomendar',
    pythonOk(fixture, ['recomendar', ...args], vars),
  ) as SessionRecommendation
  migrateSessions(fixture)
  return output
}

const verify = (fixture: Fixture, session: string, text: string) =>
  fixture.ok(verifyAnswer({ session, text }))

const TMDB = { FILMES_TMDB_CHAVE: 'x', FILMES_GRAVACOES: RECORDINGS }

/** Dono and Teo, the Dono's turn, up to 2h: the setup most tests share. */
const ownerAndTeo = (fixture: Fixture, count: number, vars: Vars = {}) =>
  pythonSession(
    fixture,
    [
      '--presentes',
      'dono',
      'teo',
      '--de',
      'dono',
      '--duracao-max',
      '120',
      '--quantos',
      String(count),
    ],
    vars,
  )

const duration = (minutes: number) =>
  `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`

// With the default Regra, Teo, with no Fato at all, counts 0.5 on every
// film and the top is the films with a group bonus. On Bruno's turn, As
// Horas Lentas comes first.

describe('answer verification', { timeout: PYTHON_TIMEOUT }, () => {
  test('checks the answer per person against the Session', async () => {
    const fixture = useFixture()
    const out = ownerAndTeo(fixture, 1)
    const answer = `Você e Teo · até 2h · vez do Bruno.

**1. As Horas Lentas** (2021, 1h44)
- **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(forte, nota)*
- **Teo:** sem fato *(fraca, palpite)*
- **Filme:** duração 1h44, dentro do limite de 2h (IMDb) *(forte, metadado)*

Depois, me conte o que viram e como foi.`

    expect(await verify(fixture, out.session.id, answer)).toEqual({
      valid: true,
      invalidLines: [],
    })
  })

  test('the poster, genres and IMDb link in the header are not Evidence', async () => {
    const fixture = useFixture()
    const out = ownerAndTeo(fixture, 2, TMDB)
    const answer = `Você e Teo · até 2h · vez do Bruno.

![capa](https://image.tmdb.org/t/p/w92/hOrAsLeNtAs9104.jpg) **1. As Horas Lentas** (2021, 1h44)\\
Drama, Mistério · [IMDb](https://www.imdb.com/title/tt9000104/)
- **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(forte, nota)*
- **Teo:** sem fato *(fraca, palpite)*

**2. Sal e Ferrugem** (2023, 1h57)\\
Aventura, Ficção científica, Suspense · [IMDb](https://www.imdb.com/title/tt9000105/)
- **Teo:** sem fato *(fraca, palpite)*

Depois, me conte o que viram e como foi.`

    expect(out.films.map((f) => f.title)).toEqual([
      'As Horas Lentas',
      'Sal e Ferrugem',
    ])
    expect(await verify(fixture, out.session.id, answer)).toEqual({
      valid: true,
      invalidLines: [],
    })
  })

  // #32's format: the request read back as a quote, one block per film with
  // the Portuguese title, poster, card, synopsis and coverage, Evidence with
  // the Força marker.
  const IN_BLOCKS = `> Você e Teo · até 2h · vez do Bruno. Saíram 2 filmes.

### 1. As Horas Lentas

![capa](https://image.tmdb.org/t/p/w185/hOrAsLeNtAs9104.jpg)

2021 · 1h44 · Drama, Mistério · ★ 7,4 · 28.000 votos · [IMDb](https://www.imdb.com/title/tt9000104/)

*Numa cidade do interior, uma relojoeira percebe que os relógios da casa atrasam um minuto por noite.*

Fato sobre 1 de 2; sem fato: Teo

- ●●● **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(nota)*
- ●○○ **Teo:** sem fato *(palpite)*
- ●●● **Filme:** duração 1h44, dentro do limite de 2h (IMDb) *(metadado)*

---

### 2. Sal & Ferrugem *(Sal e Ferrugem)*

2023 · 1h57 · Aventura, Ficção científica, Suspense · 15.000 votos · [IMDb](https://www.imdb.com/title/tt9000105/)

*O Dr. Lemos embarca num cargueiro velho atrás de um sinal que vem do fundo do mar!*

Fato sobre 1 de 2; sem fato: Teo

- ●●● **Você:** deu 4,5 a Maré Baixa (2015), também de Helena Prado (Letterboxd do Bruno, 2024-02-10) *(nota)*
- ●○○ **Teo:** sem fato *(palpite)*

---

Depois, me conte o que viram e como foi.`

  test('takes the answer in blocks per film with the Força marker', async () => {
    const fixture = useFixture()
    const out = ownerAndTeo(fixture, 2, TMDB)

    expect(
      out.films.map(
        (f) => (f as RecommendedFilm & { titlePt: string }).titlePt,
      ),
    ).toEqual(['As Horas Lentas', 'Sal & Ferrugem'])
    expect(await verify(fixture, out.session.id, IN_BLOCKS)).toEqual({
      valid: true,
      invalidLines: [],
    })
  })

  test('in blocks, a wrong Força marker or a changed text is invalid', async () => {
    const fixture = useFixture()
    const out = ownerAndTeo(fixture, 2, TMDB)
    const invalid = [
      '- ●●○ **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(nota)*',
      '- ●●● **Teo:** sem fato *(palpite)*',
      '- ●○○ **Você e Ana:** sem fato *(palpite)*',
      'Vai ser a noite perfeita para os dois.',
    ]
    const answer = IN_BLOCKS.replace(
      '- ●●● **Você:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(nota)*',
      invalid[0] ?? '',
    )
      .replace(
        '- ●○○ **Teo:** sem fato *(palpite)*\n- ●●● **Filme:**',
        `${invalid[1]}\n- ●●● **Filme:**`,
      )
      .replace(
        '- ●○○ **Teo:** sem fato *(palpite)*\n\n---\n\nDepois',
        `${invalid[2]}\n${invalid[3]}\n\n---\n\nDepois`,
      )

    expect(await verify(fixture, out.session.id, answer)).toEqual({
      valid: false,
      invalidLines: invalid,
    })
  })

  test('in blocks, the original title in parentheses must be the Session’s', async () => {
    const fixture = useFixture()
    const out = ownerAndTeo(fixture, 2, TMDB)
    const swapped = '### 2. Sal & Ferrugem *(As Horas Lentas)*'
    const answer = IN_BLOCKS.replace(
      '### 2. Sal & Ferrugem *(Sal e Ferrugem)*',
      swapped,
    )

    expect(
      (await verify(fixture, out.session.id, answer)).invalidLines,
    ).toEqual([
      swapped,
      '- ●●● **Você:** deu 4,5 a Maré Baixa (2015), também de Helena Prado (Letterboxd do Bruno, 2024-02-10) *(nota)*',
      '- ●○○ **Teo:** sem fato *(palpite)*',
    ])
  })

  test('Presentes without a Fato may share one line', async () => {
    const fixture = useFixture()
    const out = await fixture.ok(
      recommendSession({ attendees: ['dono', 'teo', 'iara'], count: 50 }),
    )
    const film = out.films.find(
      (f) => f.coverage.withoutFact.join() === 'teo,iara',
    )
    expect(film?.coverage).toEqual({
      withFact: 1,
      attendees: 3,
      withoutFact: ['teo', 'iara'],
    })
    const answer = `> Você, Teo e Iara · regra padrão.

### ${film?.position}. ${film?.title}

Fato sobre 1 de 3; sem fato: Teo e Iara

- ●○○ **Teo e Iara:** sem fato *(palpite)*

---`

    expect((await verify(fixture, out.session.id, answer)).valid).toBe(true)
  })

  test('lists Evidence changed or given to another person', async () => {
    const fixture = useFixture()
    const out = await fixture.ok(
      recommendSession({
        attendees: ['dono', 'teo'],
        rule: 'by',
        by: 'dono',
        count: 1,
      }),
    )
    const invalid = [
      '- **Você:** deu 4 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(forte, nota)*',
      '- **Teo:** deu 5 a O Farol de Areia (2012), também de Helena Prado (Letterboxd do Bruno, 2025-06-01) *(forte, nota)*',
      '- **Teo:** sem fato *(moderada, palpite)*',
      '- **Teo:** sem fato *(fraca, palpite)*. Vai adorar.',
      'Ana gosta do diretor.',
    ]
    const answer = [
      'Você e Teo.',
      '',
      '**1. As Horas Lentas** (2021, 1h44)',
      ...invalid,
      '',
      'Como foi?',
    ].join('\n')

    expect(await verify(fixture, out.session.id, answer)).toEqual({
      valid: false,
      invalidLines: invalid,
    })
  })

  test('does not take Evidence of another film of the same Session', async () => {
    const fixture = useFixture()
    const out = pythonSession(fixture, [
      '--presentes',
      'dono',
      '--duracao-max',
      '120',
      '--quantos',
      '5',
    ])
    expect(out.films[0]?.runtimeMinutes).toBe(104)
    const other = out.films.slice(1).find((f) => f.runtimeMinutes !== 104)
    const text = other?.filmLines.find((e) => e.source === 'IMDb')?.text
    const wrong = `- **Filme:** ${text} (IMDb) *(forte, metadado)*`
    const answer = `Você, até 2h.\n\n**1. As Horas Lentas** (2021, 1h44)\n${wrong}`

    expect(await verify(fixture, out.session.id, answer)).toEqual({
      valid: false,
      invalidLines: [wrong],
    })
  })

  test('checks a closed Session without recomputing Evidence', async () => {
    const fixture = useFixture()
    const out = pythonSession(fixture, [
      '--presentes',
      'teo',
      '--quantos',
      '50',
    ])
    const film = out.films.find((f) => f.onlyGuesses)
    const answer =
      `Teo.\n\n**${film?.position}. ${film?.title}** (${film?.year}, ${duration(film?.runtimeMinutes ?? 0)}) — sem fato que o sustente\n` +
      '- **Teo:** sem fato *(fraca, palpite)*'
    pythonOk(fixture, [
      'feedback',
      '--sessao',
      out.session.id,
      '--filme',
      film?.id ?? '',
      '--nota',
      'teo=5',
    ])
    migrateSessions(fixture)

    expect((await verify(fixture, out.session.id, answer)).valid).toBe(true)
  })

  test('a hand-written Session gives what Python gives', async () => {
    const fixture = useFixture()
    // No `dono:` line: the Dono comes from the Pessoas. Positions 3 to 6
    // have a header the old format cannot rebuild; an Evidence of an unknown
    // Tipo is not allowed.
    const session = `---
data: 2026-11-20
presentes: [bruno, teo, iara]
regra: {nome: padrao}
recomendacao:
  - {posicao: 1, id: tt1, titulo: Um}
  - {posicao: 2, id: tt2, titulo: Dois}
  - {posicao: 3, id: tt3, titulo: Três}
  - {posicao: 4, id: tt4, titulo: Quatro}
  - {posicao: 5, id: tt5, titulo: Cinco}
---
## Recomendação

1. Um (2020, 1h40) · tt1
   - Bruno
     - Evidência: gosta · Fonte: Letterboxd, 2025-01-01 · Força: forte · Tipo: nota
     - Evidência: inventada · Força: forte · Tipo: boato
   - Teo
     - Evidência: sem fato · Força: fraca · Tipo: palpite
   - Iara
     - Evidência: sem fato · Força: fraca · Tipo: palpite
2. Dois (2021) · tt2 · sem fato que o sustente
   - Bruno
     - Evidência: sem fato · Força: fraca · Tipo: palpite
3. Outro · tt3
4. Quatro (2020)
5. Cinco · tt5 · e mais
²9. Nada
`
    const answer = `Bruno, Teo e Iara.

**1. Um** (2020, 1h40)
- **Você:** gosta (Letterboxd, 2025-01-01) *(forte, nota)*
- **Bruno:** inventada *(forte, boato)*
- ●○○ **Teo, Iara:** sem fato *(palpite)*
- ●○○ **Teo e Bruno:** sem fato *(palpite)*

solta (IMDb) *(forte, metadado)*

### ١. Um

Uma linha de cabeçalho.
- ●●● **Bruno:** gosta (Letterboxd, 2025-01-01) *(nota)*

---

- **Teo:** fora de filme

### 2. Dois

### 2. Dois — sem fato que o sustente
- ●○○ **Você:** sem fato *(palpite)*

### 1. *(Um)*

**3. Outro**
**4. Quatro** (2020)
**5. Cinco**
### 9. Nada`
    const folder = join(fixture.root, 'py-dados', 'sessoes')
    pythonOk(fixture, ['sessoes-abertas'])
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'mao.md'), session)
    migrateSessions(fixture)
    const python = outputToEnglish(
      'verificar',
      pythonOk(fixture, ['verificar', '--sessao', 'mao', '--texto', answer]),
    )

    expect(python).toMatchObject({ valid: false })
    expect(await verify(fixture, 'mao', answer)).toEqual(python)
  })

  test('an unknown Session is an error', async () => {
    const outcome = await useFixture().run(
      verifyAnswer({ session: '2026-11-20-teo', text: 'Teo.' }),
    )

    expect(outcome.exitCode).not.toBe(0)
    expect(outcome.output).toMatchObject({
      error: { code: 'unknown_session' },
    })
  })

  test('a trigger guess with a source marker in the topic stays literal', async () => {
    const fixture = useFixture()
    const topic = 'a dog dies · Fonte: inventada'
    const out = pythonSession(fixture, [
      '--presentes',
      'dono',
      '--quantos',
      '1',
      `--gatilho=${topic}`,
    ])
    const line = `- **Filme:** sem informação do Does the Dog Die sobre "${topic}" *(fraca, palpite)*`
    const answer = `Você, evitar gatilho.\n\n**1. As Horas Lentas** (2021, 1h44)\n${line}`

    expect((await verify(fixture, out.session.id, answer)).valid).toBe(true)
  })

  test('a Does the Dog Die quote only passes with the exact text and date', async () => {
    const fixture = useFixture()
    const out = pythonSession(
      fixture,
      ['--presentes', 'dono', '--gatilho', 'a dog dies', '--quantos', '50'],
      { FILMES_DDD_CHAVE: 'teste', FILMES_GRAVACOES: RECORDINGS },
    )
    const film = out.films.find((f) => f.title === 'Sal e Ferrugem')
    const start =
      `Você · evitar "a dog dies".\n\n**${film?.position}. Sal e Ferrugem** ` +
      `(${film?.year}, ${duration(film?.runtimeMinutes ?? 0)})\n`
    const original =
      '- **Filme:** Does the Dog Die, "a dog dies": 1 sim, 14 não. Powered by DoesTheDogDie.com ' +
      '(Does the Dog Die, 2026-11-20) *(forte, metadado)*'
    const session = out.session.id
    expect((await verify(fixture, session, start + original)).valid).toBe(true)
    const wrong = [
      original.replace('1 sim, 14 não', 'quase todos disseram não'),
      original.replace('2026-11-20', '2026-11-19'),
    ]

    expect(
      (await verify(fixture, session, start + wrong.join('\n'))).invalidLines,
    ).toEqual(wrong)
  })
})
