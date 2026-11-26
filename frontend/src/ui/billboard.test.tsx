// @vitest-environment jsdom
// The Cartaz component (#114): what test_cartaz.py checked in the HTML
// (cards in order, the header, the shared Evidence lines, the dots, the
// top) and test_cartaz_guarda.py in the browser (the marks come back after
// a reload, and without storage the Cartaz still works, saying nothing),
// plus the text the marks make, the same `answerBillboard` reads.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { Billboard } from './billboard'
import { CHOSEN_OUTSIDE, MODEL } from './billboard.fixture'
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
    expect(sal.getByRole('link', { name: /IMDb/ }).textContent).toBe(
      'IMDb · 870 votos',
    )
  })

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

  it('a chosen film without a card in a block of its own, with each Reação', () => {
    render(<Billboard billboard={CHOSEN_OUTSIDE} />)
    const block = within(
      screen.getByRole('region', { name: 'Filme escolhido' }),
    )
    expect(block.getByText('Curta da Madrugada (2010)')).toBeTruthy()
    expect(block.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Bruno: achou 8',
      'Iara: não gostou',
    ])
    expect(cards()).toHaveLength(2)
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
    expect(screen.getByText('outro Clima')).toBeTruthy()

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
    expect(
      within(box).getByRole('button', { name: BILLBOARD.reply.copy }),
    ).toBeTruthy()
    expect(
      box.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    expect(within(bar).getByText('1 Trocar')).toBeTruthy()
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
    await user.click(screen.getByRole('button', { name: BILLBOARD.reply.copy }))
    expect(screen.getByRole('status').textContent).toBe(BILLBOARD.reply.nothing)
    expect(onSend).not.toHaveBeenCalled()
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

  it('Copiar puts the text on the clipboard, or selected in a box', async () => {
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('negado'))
    render(<Billboard billboard={MODEL} action="/x" />)
    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    const copy = screen.getByRole('button', { name: BILLBOARD.reply.copy })
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

describe('parseMarks', () => {
  const store = (value: string) => value

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

  it('gives none for what does not read', () => {
    const none = { addition: '', moods: null, films: {} }
    expect(parseMarks(store('{'), MODEL)).toEqual(none)
    expect(parseMarks(store('[]'), MODEL)).toEqual(none)
    expect(parseMarks(store('{"films": 1}'), MODEL)).toEqual(none)
    expect(parseMarks(null, MODEL)).toEqual(none)
  })
})
