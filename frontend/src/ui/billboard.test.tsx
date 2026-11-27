// @vitest-environment jsdom
// The Cartaz component (#114): what test_cartaz.py checked in the HTML
// (cards in order, the header, the shared Evidence lines, the dots, the
// top) and test_cartaz_guarda.py in the browser (the marks come back after
// a reload, and without storage the Cartaz still works, saying nothing),
// plus the text the marks make, the same `answerBillboard` reads.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { Billboard } from './billboard'
import { CHOSEN_OUTSIDE, CLOSED, MODEL } from './billboard.fixture'
import { parseMarks } from './billboard-marks'
import { BILLBOARD } from './billboard.copy'

const KEY = 'filmes-cartaz:2026-11-20-iara:v2'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const cards = () => screen.getAllByRole('article')
const card = (n: number) => within(cards()[n - 1]!)
const pressed = (button: HTMLElement) =>
  button.getAttribute('aria-pressed') === 'true'
/** The `n` on someone's 1 to 10 scale for a film. */
const rating = (who: string, film: number, n: string) =>
  within(
    screen.getByRole('group', {
      name: `nota de ${who} para o filme ${film}, de 1 a 10`,
    }),
  ).getByRole('button', { name: n })
const text = () =>
  (document.querySelector('input[name="texto"]') as HTMLInputElement).value

describe('the Cartaz shows', () => {
  it('one card per film, in the order of the screen', () => {
    render(<Billboard billboard={MODEL} action="/x" />)
    expect(
      cards().map(
        (c) => within(c).getByRole('heading', { level: 3 }).textContent,
      ),
    ).toEqual(['1As Horas Lentas', '2Sal & FerrugemSal e Ferrugem'])
    expect(within(cards()[1]!).getByText(BILLBOARD.card.isNew)).toBeTruthy()
    expect(within(cards()[0]!).queryByText(BILLBOARD.card.isNew)).toBeNull()
  })

  it('the films under the title of their Motivo, in the same order', () => {
    render(<Billboard billboard={MODEL} />)
    const helena = screen.getByRole('region', {
      name: 'Porque você e Iara gostam de Helena Prado',
    })
    const bet = screen.getByRole('region', { name: 'Aposta' })
    expect(within(helena).getAllByRole('article')).toEqual([cards()[0]])
    expect(within(bet).getAllByRole('article')).toEqual([cards()[1]])
    expect(
      within(helena)
        .getByRole('heading', { level: 2 })
        .compareDocumentPosition(cards()[0]!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('a Motivo that comes back after another says so', () => {
    const [first, second] = MODEL.films
    const helena = MODEL.sections[0]!
    render(
      <Billboard
        billboard={{
          ...MODEL,
          films: [first!, { ...second!, bet: false }],
          sections: [helena, { ...helena, again: true, films: [second!.id] }],
        }}
      />,
    )
    const [once, again] = screen.getAllByRole('region', {
      name: /Helena Prado/,
    })
    expect(within(once!).getByRole('heading', { level: 2 }).textContent).toBe(
      'Porque você e Iara gostam de Helena Prado',
    )
    expect(within(again!).getByRole('heading', { level: 2 }).textContent).toBe(
      `Porque você e Iara gostam de Helena Prado ${BILLBOARD.section.again}`,
    )
    expect(within(again!).getAllByRole('article')).toEqual([cards()[1]])
  })
})

describe('the Cartaz shows, the Aposta and the shelf label', () => {
  it('a Session from before the Motivos: the cards with no section, as before', () => {
    render(<Billboard billboard={{ ...MODEL, sections: [] }} />)
    expect(cards().some((c) => c.closest('section') !== null)).toBe(false)
    expect(
      cards().map(
        (c) => within(c).getByRole('heading', { level: 2 }).textContent,
      ),
    ).toEqual(['1As Horas Lentas', '2Sal & FerrugemSal e Ferrugem'])
  })

  it('the Aposta’s stamp on the bet only, beside its NOVO', () => {
    render(<Billboard billboard={MODEL} />)
    const stamp = card(2).getByText(BILLBOARD.card.bet)
    // Why it is a bet goes in its text, for the screen reader: a hover
    // `title` never opens on the phone.
    expect(card(2).getByText(BILLBOARD.card.betHint)).toBeTruthy()
    expect(stamp.hasAttribute('title')).toBe(false)
    expect(card(2).getByText(BILLBOARD.card.isNew)).toBeTruthy()
    expect(card(1).queryByText(BILLBOARD.card.bet)).toBeNull()
  })

  it('the request on the shelf label, the legend and what left', () => {
    render(<Billboard billboard={MODEL} />)
    expect(
      screen
        .getByRole('img', { name: /^Vocês dois/ })
        .getAttribute('aria-label'),
    ).toBe('Vocês dois · até 2h05 · nota 7+ no IMDb · leve')
    expect(screen.getByText('algo leve pra hoje')).toBeTruthy()
    for (const level of ['forte', 'moderada', 'fraca'])
      expect(screen.getByText(level)).toBeTruthy()
    expect(screen.getByText(/^Saiu da prateleira:/).textContent).toBe(
      'Saiu da prateleira: Sessão Maldita (Iara já viu)',
    )
  })
})

describe('the Cartaz shows, the header and the trailer', () => {
  it('the header: the w500 poster, the IMDb chip, the synopsis', () => {
    render(<Billboard billboard={MODEL} />)
    const horas = card(1)
    expect(
      horas
        .getByRole('img', { name: 'Capa de As Horas Lentas' })
        .getAttribute('src'),
    ).toBe('https://image.tmdb.org/t/p/w500/hOrAsLeNtAs9104.jpg')
    const imdb = horas.getByRole('link', { name: /IMDb/ })
    expect(imdb.textContent).toBe('7,4 IMDb · 28 mil votos')
    expect(imdb.getAttribute('href')).toBe(
      'https://www.imdb.com/title/tt9000104/',
    )
    expect(horas.getByText(/relojoeira/)).toBeTruthy()
    expect(horas.getByText('Mistério')).toBeTruthy()
    const sal = card(2)
    expect(sal.queryByRole('img', { name: /^Capa/ })).toBeNull()
    // No rating says so, never a chip that reads cut (#272).
    expect(sal.getByRole('link', { name: /IMDb/ }).textContent).toBe(
      'IMDb: sem nota · 870 votos',
    )
  })

  it('the trailer: a link to YouTube in a new tab, only when the film has one', () => {
    render(<Billboard billboard={MODEL} />)
    const trailer = card(1).getByRole('link', { name: 'trailer' })
    expect(trailer.getAttribute('href')).toBe(
      'https://www.youtube.com/watch?v=hOrAsPtBr01',
    )
    expect(trailer.getAttribute('target')).toBe('_blank')
    expect(document.querySelector('iframe')).toBeNull()
    expect(card(2).queryByRole('link', { name: 'trailer' })).toBeNull()
  })
})

describe('the Cartaz shows, shared Evidence and the Nota prevista', () => {
  it('a shared Evidence on one line, opened by the names, and who has no Fato on hers, with no Força', () => {
    render(<Billboard billboard={MODEL} />)
    const why = (n: number) =>
      within(card(n).getByRole('list', { name: BILLBOARD.card.why }))
    const [shared] = why(1).getAllByRole('listitem')
    expect(shared!.textContent).toBe(
      'Bruno e Iara: dirigido por Helena Prado, como 2 filmes a que deu nota altaWikidata',
    )
    expect(within(shared!).getByLabelText('Força moderada').dataset.level).toBe(
      '2',
    )
    expect(card(1).getByText('Fato sobre 2 de 2')).toBeTruthy()
    const [strong, without] = why(2).getAllByRole('listitem')
    expect(strong!.textContent).toBe('Bruno: deu 5 a Maré Baixa')
    expect(within(strong!).getByLabelText('Força forte').dataset.level).toBe(
      '3',
    )
    expect(without!.textContent).toBe('Iara: sem fato sobre este filme')
    expect(within(without!).queryByLabelText(/Força/)).toBeNull()
  })

  it('the Nota prevista next to the dot of each Presente who has one, and the neighbours behind it in its hint', () => {
    render(<Billboard billboard={MODEL} />)
    const hint = 'Bruno: 8,3 de 10 · 12 vizinhos'
    const dot = card(1).getByRole('button', { name: hint })
    expect(dot.textContent).toBe('8,3')
    const popover = document.getElementById(dot.getAttribute('popovertarget')!)!
    expect(popover.getAttribute('popover')).toBe('auto')
    expect(popover.textContent).toBe(hint)
    expect(card(1).queryByRole('button', { name: /^Iara:/ })).toBeNull()
    expect(card(1).queryByText('Nota prevista')).toBeNull()
    expect(card(2).queryByRole('button', { name: /vizinho/ })).toBeNull()
  })

  it('a Nota prevista stored without its neighbours, with a hint without them', () => {
    const [hours] = MODEL.films
    const film = {
      ...hours!,
      predictedRatings: [{ person: 'bruno', value: 8.31, text: '8,3' }],
    }
    render(<Billboard billboard={{ ...MODEL, films: [film] }} />)
    expect(
      card(1).getByRole('button', { name: 'Bruno: 8,3 de 10' }).textContent,
    ).toBe('8,3')
  })
})

describe('the Cartaz shows, Evidence, dots and the cover', () => {
  it('an Evidence about no Presente of the Cartaz, without a name before it', () => {
    const [, salt] = MODEL.films
    const film = {
      ...salt!,
      lines: [{ ...salt!.lines[0]!, people: ['ninguem'] }],
      withoutFact: [],
    }
    render(<Billboard billboard={{ ...MODEL, films: [film] }} />)
    const why = within(card(1).getByRole('list', { name: BILLBOARD.card.why }))
    expect(why.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'deu 5 a Maré Baixa',
    ])
  })

  it('a number on a hollow dot, and "sem fato" only in the text', () => {
    const [, bet] = MODEL.films
    const film = {
      ...bet!,
      predictedRatings: [
        { person: 'iara', value: 6.94, text: '6,9', raters: 1 },
      ],
    }
    render(<Billboard billboard={{ ...MODEL, films: [film] }} />)
    expect(
      card(1).getByRole('button', { name: 'Iara: 6,9 de 10 · 1 vizinho' })
        .textContent,
    ).toBe('6,9')
    expect(card(1).getByText(BILLBOARD.card.withoutFact('Iara'))).toBeTruthy()
    expect(card(1).queryByRole('button', { name: /sem fato/ })).toBeNull()
  })

  it('the cover opens the film on the IMDb, the dots apart from the link', () => {
    render(<Billboard billboard={MODEL} />)
    const cover = card(1).getByRole('link', { name: 'Capa de As Horas Lentas' })
    expect(cover.getAttribute('href')).toBe(
      'https://www.imdb.com/title/tt9000104/',
    )
    expect(within(cover).queryByRole('button')).toBeNull()
  })

  it('no marks once the Session has its Feedback', () => {
    render(<Billboard billboard={{ ...MODEL, open: false }} />)
    expect(cards()).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Trocar' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: BILLBOARD.reply.send }),
    ).toBeNull()
  })
})

describe('the Cartaz shows, the chosen film', () => {
  it('a chosen film without a card in a block of its own, with each Reação', () => {
    render(<Billboard billboard={CHOSEN_OUTSIDE} />)
    const block = within(
      screen.getByRole('region', { name: 'Filme escolhido' }),
    )
    expect(block.getByText('Curta da Madrugada (2010)')).toBeTruthy()
    // Each line opens with her avatar, whose initial a screen reader skips.
    expect(block.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'BBruno: deu 8 de 10',
      'IIara: não gostou',
    ])
    expect(cards()).toHaveLength(2)
  })

  it('the chosen film’s card with each Reação, under a section or alone', () => {
    render(<Billboard billboard={CLOSED} />)
    const reactions = () =>
      card(1)
        .getByRole('list', { name: 'Filme escolhido' })
        .querySelectorAll('li')
    expect([...reactions()].map((li) => li.textContent)).toEqual([
      'BBruno: previsto 8,3 · deu 6 de 10',
      'IIara: gostou',
    ])
    expect(
      card(1).getByRole('heading', { level: 4, name: 'Filme escolhido' }),
    ).toBeTruthy()
    cleanup()
    render(<Billboard billboard={{ ...CLOSED, sections: [] }} />)
    expect(
      card(1).getByRole('heading', { level: 3, name: 'Filme escolhido' }),
    ).toBeTruthy()
  })
})

describe('the Cartaz shows, a Reação from outside', () => {
  it('a Reação of someone not on the Cartaz, by her slug', () => {
    render(
      <Billboard
        billboard={{
          ...CHOSEN_OUTSIDE,
          chosen: {
            ...CHOSEN_OUTSIDE.chosen!,
            reactions: [
              {
                person: 'teo',
                predicted: '7',
                rating: null,
                reaction: 'neutral',
              },
            ],
          },
        }}
      />,
    )
    const block = within(
      screen.getByRole('region', { name: 'Filme escolhido' }),
    )
    expect(block.getByRole('listitem').textContent).toBe(
      'teo: previsto 7 · neutro',
    )
  })
})

describe('the Cartaz shows, what was marked and the awards', () => {
  it('what the Dono marked before, the awards, a cautious Aposta, and a film whose why is its section', () => {
    const [hours, salt] = MODEL.films
    render(
      <Billboard
        billboard={{
          ...MODEL,
          open: false,
          films: [
            {
              ...hours!,
              awards: ['Oscar de melhor filme'],
              notes: { stars: 3, comments: ['lindo'] },
            },
            {
              ...salt!,
              poster: 'https://image.tmdb.org/t/p/w500/sal.jpg',
              lines: [],
              withoutFact: ['teo'],
              notes: { stars: null, comments: ['curto'] },
            },
          ],
        }}
      />,
    )
    expect(card(1).getByText('Oscar de melhor filme')).toBeTruthy()
    expect(card(1).getByRole('img', { name: '3 de 5 estrelas' })).toBeTruthy()
    expect(card(1).getByText('lindo')).toBeTruthy()
    expect(card(2).queryByRole('img', { name: /estrelas/u })).toBeNull()
    expect(card(2).getByText('curto')).toBeTruthy()
    expect(card(2).getByText(BILLBOARD.card.sectionWhy)).toBeTruthy()
    expect(
      card(2)
        .getByRole('img', { name: 'Capa de Sal & Ferrugem' })
        .getAttribute('loading'),
    ).toBe('lazy')
    cleanup()
    render(
      <Billboard
        billboard={{
          ...MODEL,
          films: [{ ...salt!, cautiousBetReason: 'Aposta mais exigente' }],
        }}
      />,
    )
    expect(card(1).getByText('Aposta mais exigente')).toBeTruthy()
    expect(card(1).queryByText(BILLBOARD.card.sectionWhy)).toBeNull()
  })
})

describe('the Cartaz shows, section lines and no film', () => {
  it('the lines every film of a section has, said once under its title', () => {
    const [hours, salt] = MODEL.films
    const shared = hours!.lines[0]!
    render(
      <Billboard
        billboard={{
          ...MODEL,
          films: [
            { ...hours!, reactions: [] },
            { ...salt!, lines: [...salt!.lines, shared] },
          ],
          sections: [
            {
              kind: 'entity',
              title: 'Porque gostam de Helena Prado',
              again: false,
              films: [hours!.id, salt!.id],
            },
          ],
        }}
      />,
    )
    const together = screen.getByRole('list', { name: BILLBOARD.shared })
    expect(together.textContent).toContain(shared.text)
    expect(card(1).queryByText(shared.text)).toBeNull()
    expect(card(2).getByText('deu 5 a Maré Baixa')).toBeTruthy()
    expect(card(1).queryByRole('list', { name: 'Filme escolhido' })).toBeNull()
  })

  it('that nothing passed the Restrições', () => {
    render(<Billboard billboard={{ ...MODEL, films: [] }} />)
    expect(screen.getByText(BILLBOARD.empty)).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
  })
})

describe('the marks', () => {
  it('make the text `answerBillboard` reads', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    expect(text()).toBe('#cartaz 2026-11-20-iara v2\n')

    await user.click(card(1).getByRole('button', { name: 'Iara' }))
    await user.click(rating('Iara', 1, '8'))
    await user.type(
      screen.getByLabelText('o que Iara achou do filme 1'),
      'lindo · demais',
    )
    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    await user.click(card(2).getByRole('button', { name: '4 de 5' }))
    await user.click(card(2).getByRole('button', { name: 'Comentar' }))
    await user.type(
      screen.getByLabelText('comentário sobre o filme 2'),
      'longo',
    )
    await user.type(screen.getByLabelText(/Acrescentar/), 'chegou a Ana')

    expect(text()).toBe(
      '#cartaz 2026-11-20-iara v2\n' +
        'acrescentar: chegou a Ana\n' +
        '1 tt9000104 · já vi: iara=8 · achou iara: lindo - demais\n' +
        '2 tt9000105 · trocar · estrelas: 4 · comentário: longo\n',
    )
    expect(
      screen.getByText(
        '1 Trocar, 1 Já vi, estrelas em 1 filme, 1 comentário e o acrescentar',
      ),
    ).toBeTruthy()
    // Trocar stamps the poster.
    expect(card(2).getAllByText(BILLBOARD.card.swapStamp)).toHaveLength(2)
  })
})

describe('the marks, Climas and Todos', () => {
  it('the Clima chips start at the version’s and ask for another in the text', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    const chip = (name: string) =>
      within(screen.getByRole('group', { name: /^Clima/ })).getByRole(
        'checkbox',
        { name },
      )
    expect(chip('leve')).toHaveProperty('checked', true)
    expect(chip('pra rir')).toHaveProperty('checked', false)

    await user.click(chip('tenso'))
    expect(text()).toBe('#cartaz 2026-11-20-iara v2\nclima: leve, tenso\n')
    // The bar says the Clima in bold, since it redoes the whole list.
    expect(screen.getByText('Clima: leve, tenso').tagName).toBe('STRONG')

    await user.click(chip('leve'))
    await user.click(chip('tenso'))
    expect(text()).toBe('#cartaz 2026-11-20-iara v2\nclima: nenhum\n')

    // Back to the version's: nothing to ask.
    await user.click(chip('leve'))
    expect(text()).toBe('#cartaz 2026-11-20-iara v2\n')
  })

  it('Todos marks every Presente and stamps Já vi; the same Nota again takes it off', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    await user.click(card(1).getByRole('button', { name: 'Todos' }))
    expect(pressed(card(1).getByRole('button', { name: /Você/ }))).toBe(true)
    expect(card(1).getAllByText(BILLBOARD.card.seenStamp)).toHaveLength(2)
    expect(text()).toContain('1 tt9000104 · já vi: todos\n')
    await user.click(rating('você', 1, '9'))
    expect(text()).toContain('1 tt9000104 · já vi: bruno=9, iara\n')
    await user.click(rating('você', 1, '9'))
    expect(text()).toContain('1 tt9000104 · já vi: todos\n')
    await user.click(card(1).getByRole('button', { name: /Você/ }))
    expect(text()).toContain('1 tt9000104 · já vi: iara\n')
    expect(screen.queryByLabelText(/nota de você/)).toBeNull()
    await user.click(card(1).getByRole('button', { name: /Todos/ }))
    await user.click(card(1).getByRole('button', { name: /Todos/ }))
    expect(text()).toBe('#cartaz 2026-11-20-iara v2\n')
  })
})

describe('the marks, comments and stars', () => {
  it('the comment opens from Comentar, focused, and stays open with text', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    expect(screen.queryByLabelText('comentário sobre o filme 1')).toBeNull()
    const open = card(1).getByRole('button', { name: 'Comentar' })
    expect(open.getAttribute('aria-expanded')).toBe('false')
    await user.click(open)
    const box = screen.getByLabelText('comentário sobre o filme 1')
    expect(document.activeElement).toBe(box)
    await user.type(box, 'curto')
    expect(text()).toContain('1 tt9000104 · comentário: curto\n')
    expect(card(1).queryByRole('button', { name: 'Comentar' })).toBeNull()
  })

  it('the same star again takes the stars off', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    const three = card(1).getByRole('button', { name: '3 de 5' })
    await user.click(three)
    expect(three.getAttribute('aria-pressed')).toBe('true')
    await user.click(three)
    expect(three.getAttribute('aria-pressed')).toBe('false')
    expect(text()).toBe('#cartaz 2026-11-20-iara v2\n')
  })
})

describe('Enviar and Copiar pro chat', () => {
  it('Enviar and the summary sit in the bar at the foot, apart from the acrescentar', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    const bar = screen.getByRole('region', { name: BILLBOARD.reply.bar })
    const box = screen.getByRole('region', { name: BILLBOARD.reply.title })
    expect(
      within(bar).getByRole('button', { name: BILLBOARD.reply.send }),
    ).toBeTruthy()
    expect(
      within(box).queryByRole('button', { name: BILLBOARD.reply.send }),
    ).toBeNull()
    // The web sends the reply itself: no Copiar pro chat there (#272).
    expect(
      within(box).queryByRole('button', { name: BILLBOARD.reply.copy }),
    ).toBeNull()
    expect(
      box.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(within(bar).getByText(BILLBOARD.reply.hint)).toBeTruthy()
    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    expect(within(bar).getByText('1 Trocar')).toBeTruthy()
  })

  it('a poster that does not load gives way to the title', () => {
    render(<Billboard billboard={MODEL} action="/x" />)
    const poster = card(1).getByRole('img', { name: 'Capa de As Horas Lentas' })
    fireEvent.error(poster)
    expect(card(1).queryByRole('img', { name: /^Capa/ })).toBeNull()
    expect(card(1).getAllByText('As Horas Lentas').length).toBeGreaterThan(1)
  })

  it('a poster that failed before the page came alive gives way to the title', () => {
    const complete = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      'complete',
    )
    Object.defineProperty(HTMLImageElement.prototype, 'complete', {
      configurable: true,
      get: () => true,
    })
    try {
      render(<Billboard billboard={MODEL} action="/x" />)
      expect(card(1).queryByRole('img', { name: /^Capa/ })).toBeNull()
    } finally {
      if (complete)
        Object.defineProperty(HTMLImageElement.prototype, 'complete', complete)
    }
  })
})

describe('Enviar and Copiar pro chat, the status and the bar', () => {
  it('a status line goes with the next mark, so it never contradicts the summary', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    await user.click(screen.getByRole('button', { name: BILLBOARD.reply.send }))
    expect(screen.getByRole('status').textContent).toBe(BILLBOARD.reply.nothing)
    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('an acrescentar the reading did not take is asked in the bar before anything goes', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn<() => void>()
    render(
      <Billboard
        billboard={MODEL}
        action="/x"
        unread={{ words: ['nada de terror'], onEdit }}
      />,
    )
    const bar = within(
      screen.getByRole('region', { name: BILLBOARD.reply.bar }),
    )
    expect(bar.getByRole('alert').textContent).toContain('“nada de terror”')
    const anyway = bar.getByRole('button', { name: BILLBOARD.reply.sendAnyway })
    expect(anyway.getAttribute('name')).toBe('confirmar')
    expect(anyway.getAttribute('value')).toBe('sim')
    await user.click(bar.getByRole('button', { name: BILLBOARD.reply.edit }))
    expect(onEdit).toHaveBeenCalled()
  })

  it('a closed Session has no bar', () => {
    render(<Billboard billboard={{ ...MODEL, open: false }} action="/x" />)
    expect(
      screen.queryByRole('region', { name: BILLBOARD.reply.bar }),
    ).toBeNull()
  })

  it('with nothing marked, say so and send nothing', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn<(text: string) => void>()
    render(<Billboard billboard={MODEL} onSend={onSend} />)
    await user.click(screen.getByRole('button', { name: BILLBOARD.reply.send }))
    expect(screen.getByRole('status').textContent).toBe(BILLBOARD.reply.nothing)
    expect(onSend).not.toHaveBeenCalled()
    // A mark makes it stale: it goes.
    await user.click(card(1).getByRole('button', { name: 'Trocar' }))
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('Enviar and Copiar pro chat, in the view and on the web', () => {
  it('in the MCP Apps view, Copiar waits for an Enviar that could not go', () => {
    render(
      <Billboard billboard={MODEL} onSend={vi.fn<(t: string) => void>()} />,
    )
    expect(
      screen.queryByRole('button', { name: BILLBOARD.reply.copy }),
    ).toBeNull()
  })

  it('on the web, the empty form is not posted and says so', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    await user.click(screen.getByRole('button', { name: BILLBOARD.reply.send }))
    expect(screen.getByRole('status').textContent).toBe(BILLBOARD.reply.nothing)
  })

  it('Enviar hands the text to `onSend` (the MCP Apps view)', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn<(text: string) => void>()
    render(<Billboard billboard={MODEL} onSend={onSend} />)
    await user.click(card(1).getByRole('button', { name: 'Trocar' }))
    await user.click(screen.getByRole('button', { name: BILLBOARD.reply.send }))
    expect(onSend).toHaveBeenCalledWith(
      '#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n',
    )
  })
})

describe('Enviar and Copiar pro chat, the clipboard', () => {
  it('Copiar puts the text on the clipboard, or selected in a box', async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('negado'))
    // Copiar shows only when the host cannot take the reply (#277).
    render(
      <Billboard
        billboard={MODEL}
        onSend={() =>
          Promise.resolve({ message: 'sem envio', sent: false, copy: true })
        }
      />,
    )
    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    expect(
      screen.queryByRole('button', { name: BILLBOARD.reply.copy }),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: BILLBOARD.reply.send }))
    const copy = await screen.findByRole('button', {
      name: BILLBOARD.reply.copy,
    })
    await user.click(copy)
    expect(writeText).toHaveBeenCalledWith(
      '#cartaz 2026-11-20-iara v2\n2 tt9000105 · trocar\n',
    )
    expect(screen.getByRole('status').textContent).toBe(BILLBOARD.reply.copied)
    await user.click(copy)
    expect(screen.getByRole('status').textContent).toBe(BILLBOARD.reply.select)
    const box = screen.getByLabelText(BILLBOARD.reply.output)
    expect((box as HTMLTextAreaElement).value).toBe(
      '#cartaz 2026-11-20-iara v2\n2 tt9000105 · trocar\n',
    )
    expect(document.activeElement).toBe(box)
    writeText.mockRestore()
  })
})

describe('the inline card', () => {
  const expand = () => {}

  it('a closed Session opens the whole Cartaz; a first version says no change', () => {
    render(
      <Billboard
        billboard={{ ...MODEL, open: false, version: 1 }}
        layout="inline"
        onExpand={expand}
      />,
    )
    expect(
      screen.getByRole('button', { name: BILLBOARD.view.open }),
    ).toBeTruthy()
    expect(screen.queryByText(/^Saiu:/u)).toBeNull()
  })

  it('with no film, says why and offers nothing to mark', () => {
    render(
      <Billboard
        billboard={{ ...MODEL, films: [] }}
        layout="inline"
        onExpand={expand}
      />,
    )
    expect(
      screen.getByText(BILLBOARD.view.empty(MODEL.request.parts)),
    ).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('the marks made before go with Enviar, and Copiar comes when it could not', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    cleanup()

    const onSend = vi.fn<
      (
        text: string,
      ) => Promise<{ message: string; sent: boolean; copy: boolean }>
    >(() => Promise.resolve({ message: 'Não deu.', sent: false, copy: true }))
    render(
      <Billboard
        billboard={MODEL}
        layout="inline"
        onExpand={expand}
        onSend={onSend}
      />,
    )
    expect(screen.getByText('Trocar: Sal & Ferrugem')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: BILLBOARD.reply.send }))
    expect(onSend).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole('button', { name: BILLBOARD.reply.copy }),
    ).toBeTruthy()
  })
})

describe('in the MCP Apps view without fullscreen', () => {
  const onSend = () => {}

  it('with no film, says what to ask in the chat', () => {
    render(<Billboard billboard={{ ...MODEL, films: [] }} onSend={onSend} />)
    expect(
      screen.getByText(BILLBOARD.view.empty(MODEL.request.parts)),
    ).toBeTruthy()
  })

  it('a long shelf is capped, with the way to see it whole', async () => {
    const sizes = ['scrollHeight', 'clientHeight'].map(
      (name) =>
        [
          name,
          Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
        ] as const,
    )
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get: () => 2000,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 880,
    })
    try {
      const user = userEvent.setup()
      render(<Billboard billboard={MODEL} onSend={onSend} />)
      await user.click(
        screen.getByRole('button', { name: BILLBOARD.view.seeAll }),
      )
      expect(
        screen.queryByRole('button', { name: BILLBOARD.view.seeAll }),
      ).toBeNull()
      expect(cards()).toHaveLength(2)
    } finally {
      for (const [name, descriptor] of sizes)
        if (descriptor)
          Object.defineProperty(HTMLElement.prototype, name, descriptor)
    }
  })
})

describe('the marks kept in the browser', () => {
  it('come back when the Cartaz loads again, under one key per Session and version', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    await user.click(card(1).getByRole('button', { name: 'Iara' }))
    await user.click(rating('Iara', 1, '8'))
    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    await user.type(screen.getByLabelText(/Acrescentar/), 'chegou a Ana')
    expect(screen.getByText(BILLBOARD.reply.kept)).toBeTruthy()
    expect(Object.keys(localStorage)).toEqual([KEY])
    const before = text()
    cleanup()

    render(<Billboard billboard={MODEL} action="/x" />)
    expect(text()).toBe(before)
    expect(pressed(card(1).getByRole('button', { name: 'Iara' }))).toBe(true)
    cleanup()

    // Another version starts with none.
    render(<Billboard billboard={{ ...MODEL, version: 3 }} action="/x" />)
    expect(text()).toBe('#cartaz 2026-11-20-iara v3\n')
  })

  it('are forgotten once sent', () => {
    localStorage.setItem(KEY, JSON.stringify({ addition: 'x', films: {} }))
    render(<Billboard billboard={MODEL} action="/x" sent />)
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(text()).toBe('#cartaz 2026-11-20-iara v2\n')
  })

  it('without storage, the Cartaz works and says nothing about keeping', async () => {
    const user = userEvent.setup()
    const blocked = vi
      .spyOn(window, 'localStorage', 'get')
      .mockImplementation(() => {
        throw new Error('bloqueado')
      })
    render(<Billboard billboard={MODEL} action="/x" />)
    await user.click(card(1).getByRole('button', { name: 'Trocar' }))
    expect(text()).toContain('1 tt9000104 · trocar')
    expect(screen.queryByText(BILLBOARD.reply.kept)).toBeNull()
    blocked.mockRestore()
  })

  it('a full storage goes on without keeping', async () => {
    const user = userEvent.setup()
    render(<Billboard billboard={MODEL} action="/x" />)
    const full = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('cheio')
      })
    await user.click(card(1).getByRole('button', { name: 'Trocar' }))
    expect(text()).toContain('1 tt9000104 · trocar')
    full.mockRestore()
  })
})

const store = (value: string) => value

describe('parseMarks', () => {
  it('keeps only what reads, for the films and Presentes of the Cartaz', () => {
    const marks = parseMarks(
      store(
        JSON.stringify({
          addition: 7,
          films: {
            tt9000104: {
              seen: ['iara', 'zeca'],
              ratings: { iara: '8', zeca: 9 },
              thoughts: 'x',
              swap: 'sim',
              stars: 9,
              comment: 2,
            },
            tt9000105: 'x',
            tt1: { swap: true },
          },
        }),
      ),
      MODEL,
    )
    expect(marks).toEqual({
      addition: '',
      moods: null,
      films: {
        tt9000104: {
          seen: ['iara'],
          ratings: { iara: '8' },
          thoughts: {},
          swap: false,
          stars: 0,
          comment: '',
        },
        tt9000105: {
          seen: [],
          ratings: {},
          thoughts: {},
          swap: false,
          stars: 0,
          comment: '',
        },
      },
    })
  })

  it('keeps the chosen Climas that are chips of the Cartaz, in their order', () => {
    const marks = (moods: unknown) =>
      parseMarks(store(JSON.stringify({ moods, films: {} })), MODEL).moods

    expect(marks(['tenso', 'épico', 'leve', 3])).toEqual(['leve', 'tenso'])
    expect(marks([])).toEqual([])
    expect(marks('leve')).toBeNull()
  })
})

describe('parseMarks, what does not read', () => {
  it('gives none for what does not read', () => {
    const none = { addition: '', moods: null, films: {} }
    expect(parseMarks(store('{'), MODEL)).toEqual(none)
    expect(parseMarks(store('[]'), MODEL)).toEqual(none)
    expect(parseMarks(store('{"films": 1}'), MODEL)).toEqual(none)
    expect(parseMarks(null, MODEL)).toEqual(none)
  })
})
