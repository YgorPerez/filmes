// @vitest-environment jsdom
// The home after the layout pass (#219, map #218): the counter to ask for
// a film first, the latest Sessão with its Feedback, and the setup guide as
// one list of three steps while a step is pending.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type {
  HomeData,
  LatestSession,
  SetupStepView,
} from '#/platform/setup-guide'
import { Home } from './home'

afterEach(cleanup)

const steps = (
  state: Partial<Record<SetupStepView['step'], 'done' | 'skipped'>> = {},
): SetupStepView[] =>
  (['taste', 'import', 'connector'] as const).map((step) => ({
    step,
    done: state[step] === 'done',
    skipped: state[step] === 'skipped',
  }))

const SET_UP: HomeData = {
  person: 'bruno',
  setup: {
    steps: steps({ taste: 'done', import: 'skipped', connector: 'done' }),
    ratings: 12,
  },
  latest: null,
  mcpUrl: 'https://cinema.example/mcp',
  today: '2026-11-22',
  covers: {},
}

const SESSION: LatestSession = {
  id: '2026-11-21-1',
  date: '2026-11-21',
  request: 'algo leve',
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'teo', name: 'Teo', owner: false },
  ],
  recommendation: [
    { position: 1, id: 'tt1', title: 'O Farol de Areia' },
    { position: 2, id: 'tt2', title: 'Maré Baixa' },
  ],
  open: true,
  chosen: null,
  moods: [],
  constraints: [],
  version: 1,
  additions: [],
}

const show = (home: Partial<HomeData> = {}) =>
  render(<Home home={{ ...SET_UP, ...home }} />)

const guiding = (
  state: Parameters<typeof steps>[0] = {},
  ratings = 4,
): Partial<HomeData> => ({ setup: { steps: steps(state), ratings } })

const link = (name: string | RegExp) => screen.getByRole('link', { name })
const href = (name: string | RegExp) => link(name).getAttribute('href')
const guide = () => screen.queryByRole('region', { name: 'Para começar' })

/** The orange buttons and links of the page (The One Orange Button Rule). */
const orange = (container: HTMLElement) =>
  container.querySelectorAll('a.bg-sticker-orange, button.bg-sticker-orange')

describe('Home', () => {
  it('opens on the counter: the question, what a request asks, and "pedir filme"', () => {
    const { container } = show()
    const ask = screen.getByRole('region', { name: 'O que vai ser hoje?' })
    expect(within(ask).getByRole('heading', { level: 1 }).textContent).toBe(
      'O que vai ser hoje?',
    )
    expect(
      within(ask).getByRole('img', {
        name: 'O pedido: quem está, quanto tempo vocês têm e o que a noite pede.',
      }),
    ).toBeTruthy()
    expect(href('Pedir filme')).toBe('/sessoes/nova')
    expect(orange(container)).toHaveLength(1)
  })

  it('has no list of screens: the tabs lead to them', () => {
    show()
    expect(screen.queryByRole('navigation')).toBeNull()
    expect(
      screen
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
        .every((href) => href === '/sessoes/nova'),
    ).toBe(true)
  })

  it('says where the first Sessão will show, once the guide is out of the way', () => {
    show()
    expect(screen.getByText('Sua primeira Sessão aparece aqui.')).toBeTruthy()
  })

  it("lets a tap on the shelf label open the request too, out of the keyboard's way", () => {
    const { container } = show()
    const label = container.querySelector('a[tabindex="-1"]')!
    expect(label.getAttribute('href')).toBe('/sessoes/nova')
    expect(label.querySelector('[role="img"]')).toBeTruthy()
    expect(label.getAttribute('tabindex')).toBe('-1')
  })

  it('hides the guide once no step is pending, skipped ones included', () => {
    show()
    expect(guide()).toBeNull()
  })

  it('still asks for a film, with no guide, when the engine cannot say', () => {
    show({ setup: null })
    expect(guide()).toBeNull()
    expect(href('Pedir filme')).toBe('/sessoes/nova')
  })
})

const card = () => screen.getByRole('region', { name: 'Última Sessão' })

describe('Home, the latest Sessão', () => {
  it('shows it under "pedir filme", with its films and the way to tell how it went', () => {
    const { container } = show({ latest: SESSION })
    expect(
      within(card()).getByRole('link', { name: /Última Sessão/ }),
    ).toHaveProperty('pathname', '/sessoes/2026-11-21-1')
    expect(card().textContent).toContain('Ontem · Você e Teo')
    expect(card().textContent).toContain('algo leve')
    expect(card().textContent).toContain('Falta contar como foi')
    expect(
      within(card()).getByRole('link', {
        name: 'Contar como foi a Sessão 2026-11-21-1',
      }),
    ).toHaveProperty('pathname', '/sessoes/2026-11-21-1/contar')
    const html = container.innerHTML
    expect(html.indexOf('Pedir filme')).toBeLessThan(
      html.indexOf('Última Sessão'),
    )
  })

  it('makes each film a link to its card in the Cartaz, with its cover when there is one', () => {
    show({
      latest: SESSION,
      covers: { tt1: 'https://image.example/tt1.jpg', tt2: null },
    })
    const films = within(card()).getByRole('list', { name: 'Filmes da Sessão' })
    const links = within(films).getAllByRole('link')
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['1O Farol de Areia', '/sessoes/2026-11-21-1#filme-tt1'],
      ['2Maré Baixa', '/sessoes/2026-11-21-1#filme-tt2'],
    ])
    expect(links[0]?.querySelector('img')?.getAttribute('src')).toBe(
      'https://image.example/tt1.jpg',
    )
    expect(links[1]?.querySelector('img')).toBeNull()
  })

  it('on the night it was made, leads back to the Cartaz first, and the Feedback is a link', () => {
    show({ latest: SESSION, today: '2026-11-21' })
    expect(card().textContent).toContain('Hoje · Você e Teo')
    expect(
      within(card()).getByRole('link', { name: 'Ver o Cartaz' }),
    ).toHaveProperty('pathname', '/sessoes/2026-11-21-1')
    expect(card().textContent).not.toContain('Falta contar como foi')
    expect(
      within(card()).getByRole('link', {
        name: 'Contar como foi a Sessão 2026-11-21-1',
      }),
    ).toBeTruthy()
  })
})

describe('Home, the latest Sessão, its date and what comes next', () => {
  it.each([
    ['2026-11-22', 'Ontem'],
    ['2026-11-25', 'Sábado'],
    ['2026-12-01', 'Sábado, 21 nov'],
  ])('dates it from today (%s): %s', (today, label) => {
    show({ latest: SESSION, today })
    expect(card().textContent).toContain(`${label} · Você e Teo`)
  })

  it('asks for the same request again, filled as that Sessão was asked', () => {
    show({ latest: { ...SESSION, constraints: ['até 2h'] } })
    const again = within(card()).getByRole('link', { name: /Pedir de novo/ })
    expect(again.textContent).toBe('Pedir de novo: Você e Teo, até 2h')
    expect(again.getAttribute('href')).toBe(
      '/sessoes/nova?repetir=2026-11-21-1',
    )
  })

  it('says what a closed Sessão chose, with no Feedback to give', () => {
    show({
      latest: {
        ...SESSION,
        open: false,
        chosen: { id: 'tt2', title: 'Maré Baixa' },
      },
    })
    expect(card().textContent).toContain('Viram Maré Baixa')
    expect(card().textContent).not.toContain('Falta contar como foi')
    expect(card().querySelector('a[href$="/contar"]')).toBeNull()
  })
})

describe('Home, the setup guide', () => {
  it('lists two steps, each with its state, under what the guide buys her', () => {
    show(guiding({ taste: 'done', import: 'skipped' }, 12))
    const region = guide()!
    expect(
      within(region)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Meu gostofeito, 12 notas', 'Conector no Claude, falta fazer'])
    expect(region.textContent).toContain('a lista sai só com palpites')
    expect(within(region).queryByRole('progressbar')).toBeNull()
  })

  it('gives Meu gosto both ways to do it, and each pending step a "pular"', () => {
    show(guiding())
    const region = guide()!
    const skips = region.querySelectorAll('form[action="/inicio/pular"]')
    expect(
      [...skips].map((form) => [
        form.getAttribute('method'),
        form.querySelector<HTMLInputElement>('input[name="passo"]')?.value,
      ]),
    ).toEqual([
      ['post', 'taste'],
      ['post', 'connector'],
    ])
    expect(
      screen.getByRole('button', { name: 'Pular: Meu gosto' }),
    ).toBeTruthy()
    expect(href('Dar notas')).toBe('/meu-gosto/notas')
    expect(href('Importar')).toBe('/meu-gosto/importar')
  })

  it('says what the connector is even behind Meu gosto, and folds how to add it', () => {
    const { container } = show(guiding())
    expect(screen.getByRole('img', { name: '4 de 10 Notas' })).toBeTruthy()
    expect(container.textContent).toContain(
      'Para pedir filme conversando com o Claude',
    )
    const how = container.querySelector('details')!
    expect(how.open).toBe(false)
    expect(how.querySelector('summary')?.textContent).toContain(
      'Ver como conectar',
    )
    expect(how.textContent).toContain('https://cinema.example/mcp')
    expect(orange(container)).toHaveLength(1)
    expect(orange(container)[0]?.textContent).toBe('Pedir filme')
  })

  it('at zero Notas, says how long it takes instead of ten empty dots', () => {
    show(guiding({}, 0))
    expect(screen.queryByRole('img', { name: /de 10 Notas/ })).toBeNull()
    expect(guide()!.textContent).toContain('Leva uns 2 minutos.')
  })
})

describe('Home, the setup guide, the MCP URL and skipped steps', () => {
  it('gives the MCP URL and how to add it in Claude, copies it and says where to paste', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(
      async () => undefined,
    )
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const { container } = show(guiding({ taste: 'done' }))
    expect(screen.getByText('https://cinema.example/mcp')).toBeTruthy()
    expect(container.textContent).toContain('Adicionar conector personalizado')
    expect(container.textContent).toContain('Este passo se marca sozinho')
    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar endereço' }),
    )
    expect(writeText).toHaveBeenCalledWith('https://cinema.example/mcp')
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe(
      'Copiado. Agora cole no Claude, em Conectores.',
    )
  })

  it('says how to copy by hand when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => Promise.reject(new Error('no')) },
      configurable: true,
    })
    show(guiding({ taste: 'done' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar endereço' }),
    )
    expect(screen.getByRole('status').textContent).toContain(
      'Selecione o endereço e copie',
    )
  })

  it('keeps a skipped step closed on one line, "pulado · Retomar", with no "pular"', () => {
    show(guiding({ taste: 'skipped' }))
    const region = guide()!
    expect(region.querySelector('input[value="taste"]')).toBeNull()
    const summary = region.querySelector('summary')!
    expect(summary.textContent).toBe('Meu gostopulado · RetomarFechar')
  })

  it("leaves the engine's import step out: an import alone does not hold the guide open", () => {
    show(guiding({ taste: 'done', connector: 'done' }))
    expect(guide()).toBeNull()
  })
})

describe('Home, the setup guide, never blocking', () => {
  it('never blocks: "pedir filme" comes before the guide', () => {
    const { container } = show(guiding())
    const html = container.innerHTML
    expect(html.indexOf('Pedir filme')).toBeLessThan(
      html.indexOf('Para começar'),
    )
  })
})
