// What the Sessions' server functions decide before and after the
// engine: which Sessions "para contar" lists, the Session page's input,
// and the told Session a Feedback link finds.
import { describe, expect, it } from 'vite-plus/test'
import {
  draftFor,
  listedSessions,
  sessionPageInput,
  toldSession,
} from './sessions'

const THERE = [{ owner: true }, { owner: false }]
const SESSIONS = [
  { id: 'aberta', open: true, chosen: null, attendees: THERE },
  {
    id: 'vimos',
    open: false,
    chosen: { title: 'Fronteira' },
    attendees: THERE,
  },
  { id: 'nada', open: false, chosen: null, attendees: [{ owner: false }] },
]

describe('the Sessions server functions', () => {
  it('lists every Session, or only the open ones for “para contar”', () => {
    expect(listedSessions(SESSIONS, false)).toBe(SESSIONS)
    expect(listedSessions(SESSIONS, true)?.map((s) => s.id)).toEqual(['aberta'])
    expect(listedSessions(null, true)).toBeNull()
    expect(listedSessions(null, false)).toBeNull()
  })

  it('takes the Session’s slug and only a note’s token', () => {
    expect(sessionPageInput({ session: 's1', note: 'tok-1' })).toEqual({
      session: 's1',
      note: 'tok-1',
    })
    expect(sessionPageInput({ session: 's1', note: '../x' })).toEqual({
      session: 's1',
      note: undefined,
    })
    expect(() => sessionPageInput(undefined)).toThrow('slug required')
  })

  it('finds what a told Session saw, and nothing for an open or unknown one', () => {
    // `mine`: the Dono looking was there, and may correct it (#344).
    expect(toldSession(SESSIONS, 'vimos')).toEqual({
      title: 'Fronteira',
      mine: true,
    })
    expect(toldSession(SESSIONS, 'nada')).toEqual({ title: null, mine: false })
    expect(toldSession(SESSIONS, 'aberta')).toBeUndefined()
    expect(toldSession(null, 'vimos')).toBeUndefined()
  })

  it('a page with neither a note nor a Session to repeat has no draft', async () => {
    expect(await draftFor(undefined)).toBeNull()
  })
})
