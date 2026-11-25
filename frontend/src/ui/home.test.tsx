// @vitest-environment jsdom
// The home in its three states of the guide (#143, map #140): just arrived,
// some steps out of the way, and set up; and what it leads to in each.
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
  sessions: 3,
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

const show = (home: Partial<HomeData> = {}, admin = false) =>
  render(<Home name="Bruno Lima" admin={admin} home={{ ...SET_UP, ...home }} />)

const guiding = (
  state: Parameters<typeof steps>[0] = {},
  ratings = 4,
): Partial<HomeData> => ({ setup: { steps: steps(state), ratings } })

const link = (name: string | RegExp) => screen.getByRole('link', { name })
const href = (name: string | RegExp) => link(name).getAttribute('href')

/** The orange buttons and links of the page (The One Orange Button Rule). */
const orange = (container: HTMLElement) =>
  container.querySelectorAll('a.bg-sticker-orange, button.bg-sticker-orange')

describe('Home', () => {
  it('greets the Dono by name', () => {
    show()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Olá, Bruno Lima' }),
    ).toBeTruthy()
  })

  it('leads to every screen, with Operações only for an admin', () => {
    show()
    const shelf = screen.getByRole('navigation', { name: 'Telas' })
    expect(
      within(shelf)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/sessoes', '/pessoas', '/notas', '/feedback', '/exportar'])
    expect(within(shelf).getByText('3')).toBeTruthy()
    expect(within(shelf).getByText('12 dadas')).toBeTruthy()
    cleanup()
    show({}, true)
    expect(href(/^Operações/)).toBe('/operacoes')
  })
})

describe('Home, set up', () => {
  it('puts the big "pedir filme" on top, under the stamped card, with no guide', () => {
    const { container } = show()
    expect(screen.queryByRole('list', { name: 'Para começar' })).toBeNull()
    const stamps = screen.getByRole('list', { name: 'Carimbos' })
    expect(
      within(stamps)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label')),
    ).toEqual(['Meu gosto: feito', 'Importar: pulado', 'Claude: feito'])
    expect(screen.getByText('Bruno')).toBeTruthy()
    expect(href('Pedir filme')).toBe('/sessoes/nova')
    expect(orange(container)).toHaveLength(1)
    const html = container.innerHTML
    expect(html.indexOf('Pedir filme')).toBeLessThan(html.indexOf('Telas'))
  })

  it('shows the latest Sessão, with its Feedback while open', () => {
    show({ latest: SESSION })
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
    ).toEqual(['O Farol de Areia', 'Maré Baixa'])
    expect(card.textContent).toContain('Falta contar como foi')
    expect(
      within(card).getByRole('link', {
        name: 'Contar como foi a Sessão 2026-11-21-1',
      }),
    ).toHaveProperty('pathname', '/feedback/2026-11-21-1')
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
    expect(card.querySelector('a[href^="/feedback/"]')).toBeNull()
  })

  it('still asks for a film, with no card, when the engine cannot say', () => {
    show({ setup: null, sessions: null })
    expect(screen.queryByRole('list', { name: 'Carimbos' })).toBeNull()
    expect(href('Pedir filme')).toBe('/sessoes/nova')
    expect(href('Sessões')).toBe('/sessoes')
  })
})

describe('Home, the setup guide', () => {
  it('stamps the card with each step, and counts the pending ones', () => {
    show(guiding({ taste: 'done', import: 'skipped' }, 12))
    const card = screen.getByRole('region', {
      name: 'Carteirinha: 1 passo pendente',
    })
    expect(card.textContent).toContain('Bruno')
    expect(card.textContent).toContain('falta 1 carimbo')
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((li) => [li.getAttribute('aria-label'), li.textContent]),
    ).toEqual([
      ['Meu gosto: feito', 'ok12 notasMeu gosto'],
      ['Importar: pulado', 'puleiImportar'],
      ['Claude: pendente', '3Claude'],
    ])
  })

  it('lists the steps not done, a "pular" for each pending one', () => {
    show(guiding({ taste: 'done' }))
    const list = screen.getByRole('list', { name: 'Para começar' })
    expect(list.textContent).not.toContain('Meu gosto')
    const skips = list.querySelectorAll('form[action="/inicio/pular"]')
    expect(
      [...skips].map((form) => [
        form.getAttribute('method'),
        form.querySelector<HTMLInputElement>('input[name="passo"]')?.value,
      ]),
    ).toEqual([
      ['post', 'import'],
      ['post', 'connector'],
    ])
    expect(
      screen.getByRole('button', {
        name: 'Pular: Importar do Letterboxd ou do Trakt',
      }),
    ).toBeTruthy()
  })

  it('opens the first pending step, with its main action the only orange one', () => {
    const { container } = show(guiding())
    expect(
      screen.getByRole('heading', { level: 3, name: /Meu gosto/ }),
    ).toBeTruthy()
    expect(screen.getByRole('img', { name: '4 de 10 Notas' })).toBeTruthy()
    expect(href('Dar notas')).toBe('/notas')
    expect(href('Importar')).toBe('/importar/bruno')
    expect(orange(container)).toHaveLength(1)
    expect(orange(container)[0]?.textContent).toBe('Dar notas')
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
    expect(orange(container)).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    expect(writeText).toHaveBeenCalledWith('https://cinema.example/mcp')
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy()
  })

  it('says how to copy by hand when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => Promise.reject(new Error('no')) },
      configurable: true,
    })
    show(guiding({ taste: 'done', import: 'done' }))
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    expect(screen.getByRole('status').textContent).toContain(
      'Selecione o endereço e copie',
    )
  })

  it('keeps a skipped step closed, to resume, with no form', () => {
    show(guiding({ import: 'skipped' }))
    const list = screen.getByRole('list', { name: 'Para começar' })
    expect(list.querySelector('input[value="import"]')).toBeNull()
    expect(within(list).getByText('Retomar')).toBeTruthy()
  })

  it('never blocks: "pedir filme" is there, below the guide', () => {
    const { container } = show(guiding())
    expect(href('Pedir filme')).toBe('/sessoes/nova')
    const html = container.innerHTML
    expect(html.indexOf('Para começar')).toBeLessThan(
      html.indexOf('Pedir filme'),
    )
  })
})
