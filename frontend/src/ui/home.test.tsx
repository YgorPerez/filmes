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
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Pedir filme',
    ])
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

describe('Home, the latest Sessão', () => {
  it('shows it under "pedir filme", with its films and the way to tell how it went', () => {
    const { container } = show({ latest: SESSION })
    const card = screen.getByRole('region', { name: 'Última Sessão' })
    expect(
      within(card).getByRole('link', { name: /Última Sessão/ }),
    ).toHaveProperty('pathname', '/sessoes/2026-11-21-1')
    expect(card.textContent).toContain('Sábado, 21 nov · Você e Teo')
    expect(card.textContent).toContain('algo leve')
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1O Farol de Areia', '2Maré Baixa'])
    expect(card.textContent).toContain('Falta contar como foi')
    expect(
      within(card).getByRole('link', {
        name: 'Contar como foi a Sessão 2026-11-21-1',
      }),
    ).toHaveProperty('pathname', '/sessoes/2026-11-21-1/contar')
    const html = container.innerHTML
    expect(html.indexOf('Pedir filme')).toBeLessThan(
      html.indexOf('Última Sessão'),
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
    const card = screen.getByRole('region', { name: 'Última Sessão' })
    expect(card.textContent).toContain('vimos Maré Baixa')
    expect(card.textContent).not.toContain('Falta contar como foi')
    expect(card.querySelector('a[href$="/contar"]')).toBeNull()
  })
})

describe('Home, the setup guide', () => {
  it('lists the three steps once, each with its state, and the progress', () => {
    show(guiding({ taste: 'done', import: 'skipped' }, 12))
    const region = guide()!
    expect(
      within(region)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'Meu gostofeito, 12 notas',
      'Importar do Letterboxd ou do Trakt' + 'pulado',
      'Conector no Claude' + 'falta fazer',
    ])
    const progress = within(region).getByRole('progressbar', {
      name: 'Passos feitos',
    })
    expect(progress.getAttribute('aria-valuenow')).toBe('1')
    expect(progress.getAttribute('aria-valuemax')).toBe('3')
    expect(progress.getAttribute('aria-valuetext')).toBe('1 de 3 feitos')
  })

  it('gives each pending step its action and a "pular"', () => {
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
      ['post', 'import'],
      ['post', 'connector'],
    ])
    expect(
      screen.getByRole('button', {
        name: 'Pular: Importar do Letterboxd ou do Trakt',
      }),
    ).toBeTruthy()
    expect(href('Dar notas')).toBe('/meu-gosto/notas')
    expect(href('Importar')).toBe('/meu-gosto/importar')
    expect(screen.getByRole('button', { name: 'Copiar endereço' })).toBeTruthy()
  })

  it('opens only the first pending step, and keeps "pedir filme" the one orange button', () => {
    const { container } = show(guiding())
    expect(screen.getByRole('img', { name: '4 de 10 Notas' })).toBeTruthy()
    expect(container.textContent).not.toContain('https://cinema.example/mcp')
    expect(orange(container)).toHaveLength(1)
    expect(orange(container)[0]?.textContent).toBe('Pedir filme')
  })

  it('gives the MCP URL and how to add it in Claude, and copies it', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(
      async () => undefined,
    )
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const { container } = show(guiding({ taste: 'done', import: 'done' }))
    expect(screen.getByText('https://cinema.example/mcp')).toBeTruthy()
    expect(container.textContent).toContain('Adicionar conector personalizado')
    expect(container.textContent).toContain('Este passo se marca sozinho')
    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar endereço' }),
    )
    expect(writeText).toHaveBeenCalledWith('https://cinema.example/mcp')
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy()
  })

  it('says how to copy by hand when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => Promise.reject(new Error('no')) },
      configurable: true,
    })
    show(guiding({ taste: 'done', import: 'done' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar endereço' }),
    )
    expect(screen.getByRole('status').textContent).toContain(
      'Selecione o endereço e copie',
    )
  })

  it('keeps a skipped step closed, to resume, with no "pular"', () => {
    show(guiding({ import: 'skipped' }))
    const region = guide()!
    expect(region.querySelector('input[value="import"]')).toBeNull()
    expect(within(region).getByText('Retomar')).toBeTruthy()
  })

  it('never blocks: "pedir filme" comes before the guide', () => {
    const { container } = show(guiding())
    const html = container.innerHTML
    expect(html.indexOf('Pedir filme')).toBeLessThan(
      html.indexOf('Para começar'),
    )
  })
})
