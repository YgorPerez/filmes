// The queries the Session pages keep and the Link da Sessão's title and
// preview in a chat.
import { describe, expect, it } from 'vite-plus/test'
import { PARTICIPATION } from '#/ui/session-link.copy'
import { VIEW } from '#/ui/session-link.fixture'
import { Route as Feedback } from '#/routes/_owner/sessoes/$sessao/contar'
import { Route as Session } from '#/routes/_owner/sessoes/$sessao/index'
import { Route as NewSession } from '#/routes/_owner/sessoes/nova'
import { Route as Participation } from '#/routes/participar'

type Search = (search: Record<string, unknown>) => Record<string, unknown>
const searchOf = (route: { options: { validateSearch?: unknown } }) =>
  route.options.validateSearch as Search

describe('the Session pages’ queries', () => {
  it('Nova Sessão keeps a known refusal, a note, a Session to repeat and the group', () => {
    const search = searchOf(NewSession)
    expect(
      search({
        erro: 'frase',
        nota: 'tok-1',
        repetir: 's1',
        presentes: 'bruno,iara,../x',
      }),
    ).toMatchObject({
      erro: 'frase',
      nota: 'tok-1',
      repetir: 's1',
      // Kept as text: the route writes it back to the URL as it came.
      presentes: 'bruno,iara',
    })
    expect(
      search({ erro: 'x', nota: 'a b', repetir: '', presentes: '!' }),
    ).toMatchObject({
      erro: undefined,
      nota: undefined,
      repetir: undefined,
      presentes: undefined,
    })
    // A group the router had parsed as a list still comes through.
    expect(search({ repetir: 3, presentes: ['bruno', 'iara'] })).toMatchObject({
      repetir: undefined,
      presentes: 'bruno,iara',
    })
    expect(search({ presentes: 7 }).presentes).toBeUndefined()
    const many = Array.from({ length: 30 }, (_, i) => `p${i}`).join(',')
    expect(
      String(search({ presentes: many }).presentes).split(','),
    ).toHaveLength(20)
  })
})

describe('the Session pages’ queries, on the Session and its Feedback', () => {
  it('the Session page keeps a known notice and refusal, a note and short words', () => {
    const search = searchOf(Session)
    expect(
      search({
        feito: 'aberta',
        erro: 'fechada',
        nota: 'tok-1',
        palavra: ['amanhã', 'x'.repeat(201), 7],
      }),
    ).toEqual({
      feito: 'aberta',
      erro: 'fechada',
      nota: 'tok-1',
      palavra: ['amanhã'],
    })
    expect(search({ feito: 'x', erro: 'y', nota: 'a b' })).toEqual({
      feito: undefined,
      erro: undefined,
      nota: undefined,
      palavra: undefined,
    })
    const many = Array.from({ length: 12 }, (_, i) => `w${i}`)
    expect(search({ palavra: 'só' }).palavra).toEqual(['só'])
    expect(search({ palavra: many }).palavra).toHaveLength(10)
  })

  it('the Feedback form keeps only a note’s token', () => {
    const search = searchOf(Feedback)
    expect(search({ nota: 'tok-1' }).nota).toBe('tok-1')
    expect(search({ nota: 'a b' }).nota).toBeUndefined()
  })
})

describe('the Link da Sessão’s title and preview', () => {
  type Context = {
    participation: typeof VIEW | null
    closed: boolean
  }
  const load = (context: Context) =>
    (
      Participation.options.loader as unknown as (opts: {
        context: Context
      }) => {
        title: string
        preview: { title: string; description: string } | null
      }
    )({ context })
  const head = (loaderData: ReturnType<typeof load> | undefined) =>
    (
      Participation.options.head as unknown as (opts: {
        loaderData: typeof loaderData
      }) => { meta: object[] }
    )({ loaderData })

  it('names the films once she chose, the names before, and previews the call', () => {
    const chosen = load({ participation: VIEW, closed: false })
    expect(chosen.title).toBe(PARTICIPATION.films)
    expect(chosen.preview?.title).toBe('Bruno chamou você pra escolher o filme')
    expect(head(chosen).meta).toHaveLength(3)
    expect(
      load({ participation: { ...VIEW, selected: null }, closed: false }).title,
    ).toBe(PARTICIPATION.pick)
  })

  it('says a closed Session from a broken link, with no preview', () => {
    const closed = load({ participation: null, closed: true })
    expect(closed).toEqual({
      title: PARTICIPATION.unavailable.closed,
      preview: null,
    })
    expect(load({ participation: null, closed: false }).title).toBe(
      PARTICIPATION.unavailable.broken,
    )
    expect(head(closed).meta).toEqual([])
    expect(head(undefined).meta).toEqual([])
  })
})
