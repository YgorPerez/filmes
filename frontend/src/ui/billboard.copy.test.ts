// The Cartaz's words: what a redo changed, what was marked, the bar's
// sentence, an empty Recomendação and the view's failures.
import { describe, expect, it } from 'vite-plus/test'
import { BILLBOARD } from './billboard.copy'

const { reply, view } = BILLBOARD

const NOTHING = {
  swap: [],
  seen: [],
  stars: [],
  comments: [],
  addition: '',
  moods: null,
}

describe('the Cartaz copy', () => {
  it('says what a redo changed, or that the list stayed', () => {
    expect(BILLBOARD.redone(1, 2)).toBe('Refeito: 1 saiu, 2 novos.')
    expect(BILLBOARD.redone(0, 0)).toBe('Refeito: mesma lista.')
  })

  it('names what was marked, a line per kind', () => {
    expect(reply.marked(NOTHING)).toEqual([])
    expect(
      reply.marked({
        swap: ['Cais 2'],
        seen: [{ title: 'Fronteira', people: ['Iara', 'Bruno'] }],
        stars: [{ title: 'Sal', stars: 4 }],
        comments: ['Cais', 'Sal'],
        addition: 'chegou a Ana',
        moods: ['leve', 'pra rir'],
      }),
    ).toEqual([
      'Trocar: Cais 2',
      'Já vi: Fronteira (Iara e Bruno)',
      'Estrelas: Sal 4★',
      'Comentário: Cais e Sal',
      'Acrescentar: “chegou a Ana”',
      'Clima: leve, pra rir',
    ])
    expect(reply.marked({ ...NOTHING, moods: [] })).toEqual(['Clima: nenhum'])
  })

  it('says the marks in a sentence, the Clima too', () => {
    expect(
      reply.summary({
        swap: 0,
        seen: 0,
        stars: 1,
        comments: 2,
        addition: true,
        mood: true,
      }),
    ).toBe('estrelas em 1 filme, 2 comentários, o acrescentar e outro Clima')
  })

  it('says why no film passed, without the minimum IMDb rating', () => {
    expect(view.empty(['até 1h30', 'nota 7+ no IMDb', 'sem lento'])).toBe(
      'Nenhum filme passou nos limites deste pedido (até 1h30 · sem lento). Peça no chat com mais tempo ou menos limites.',
    )
    expect(view.empty(['até 20min', 'nota 7,5+ no IMDb'])).toBe(
      'Nenhum filme passou no limite até 20min. Peça no chat com mais tempo ou menos limites.',
    )
    expect(view.empty(['sem lento'])).toBe(
      'Nenhum filme passou no limite sem lento. Peça no chat com menos limites.',
    )
    expect(view.empty(['nota 7+ no IMDb'])).toBe(
      'Nenhum filme passou neste pedido. Peça outro no chat.',
    )
  })

  it('says why Enviar did not go', () => {
    expect(view.failed('unknown_session')).toBe(
      'Não achei essa Sessão. Peça a lista de novo no chat.',
    )
    expect(view.failed(null)).toBe(
      'Não consegui enviar. Tente de novo ou copie pro chat.',
    )
  })
})
