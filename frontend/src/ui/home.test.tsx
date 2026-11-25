import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import type {
  HomeData,
  LatestSession,
  SetupStepView,
} from '#/platform/setup-guide'
import { Home } from './home'

const SET_UP: HomeData = {
  person: 'bruno',
  guide: null,
  latest: null,
  mcpUrl: 'https://cinema.example/mcp',
}

const steps = (
  state: Partial<Record<SetupStepView['step'], 'done' | 'skipped'>> = {},
): SetupStepView[] =>
  (['taste', 'import', 'connector'] as const).map((step) => ({
    step,
    done: state[step] === 'done',
    skipped: state[step] === 'skipped',
  }))

const SESSION: LatestSession = {
  id: '2026-11-19-1',
  date: '2026-11-19',
  request: 'algo leve',
  attendees: [{ person: 'bruno', name: 'Bruno', owner: true }],
  recommendation: [],
  open: true,
  chosen: null,
  moods: [],
  constraints: [],
}

const render = (home: Partial<HomeData> = {}, admin = false) =>
  renderToStaticMarkup(
    <Home name="Bruno" admin={admin} home={{ ...SET_UP, ...home }} />,
  )

describe('Home', () => {
  it('greets the Dono by name and lets her log out with a POST', () => {
    const html = render()
    expect(html).toContain('Olá, Bruno')
    expect(html).toMatch(
      /<form action="\/auth\/logout" method="post"><button type="submit"[^>]*>Sair/,
    )
  })

  it('leads to every screen, and to Operações only for an admin', () => {
    const html = render()
    for (const [href, label] of [
      ['/sessoes', 'Sessões'],
      ['/pessoas', 'Pessoas'],
      ['/importar', 'Importar'],
      ['/exportar', 'Exportar Notas'],
      ['/feedback', 'Feedback'],
    ])
      expect(html).toMatch(new RegExp(`<a href="${href}"[^>]*>${label}</a>`))
    expect(html).not.toContain('/operacoes')
    expect(render({}, true)).toMatch(
      /<a href="\/operacoes"[^>]*>Operações<\/a>/,
    )
  })
})

describe('Home, set up', () => {
  it('puts "pedir filme" on top, and shows no guide', () => {
    const html = render()
    expect(html).toMatch(/<a href="\/sessoes\/nova"[^>]*>Pedir filme<\/a>/)
    expect(html).not.toContain('Para começar')
    expect(html.indexOf('Pedir filme')).toBeLessThan(html.indexOf('Telas'))
  })

  it('shows the latest Sessão, with its Feedback while open', () => {
    const html = render({ latest: SESSION })
    expect(html).toContain('Última Sessão')
    expect(html).toMatch(/<a href="\/sessoes\/2026-11-19-1"[^>]*>/)
    expect(html).toContain('algo leve')
    expect(html).toMatch(/<a href="\/feedback\/2026-11-19-1"[^>]*>/)
    expect(html).toContain('Falta o Feedback')

    const closed = render({
      latest: { ...SESSION, open: false, chosen: { id: 'tt1', title: 'X' } },
    })
    expect(closed).not.toContain('/feedback/2026-11-19-1')
    expect(closed).not.toContain('Falta o Feedback')
  })
})

describe('Home, the setup guide', () => {
  it('lists the three steps, each with its state and a "pular" for a pending one', () => {
    const html = render({ guide: steps({ taste: 'done' }) })
    expect(html).toContain('Para começar')
    expect(html).toContain('Meu gosto')
    expect(html).toContain('Importar do Letterboxd ou do Trakt')
    expect(html).toContain('Conector no Claude')
    expect(html).toContain('Feito')
    // Two pending steps, each with its own skip form.
    expect(
      html.match(/<form action="\/inicio\/pular" method="post">/g),
    ).toHaveLength(2)
    expect(html).toContain('name="passo" value="import"')
    expect(html).toContain('name="passo" value="connector"')
    expect(html).not.toContain('name="passo" value="taste"')
  })

  it('says a skipped step was skipped, with no form', () => {
    const html = render({ guide: steps({ import: 'skipped' }) })
    expect(html).toContain('Pulado')
    expect(html).not.toContain('name="passo" value="import"')
  })

  it('leads each step to where it is done', () => {
    const html = render({ guide: steps() })
    expect(html).toMatch(/<a href="\/notas"[^>]*>Dar Notas<\/a>/)
    expect(html).toMatch(/<a href="\/importar\/bruno"[^>]*>Importar<\/a>/)
  })

  it('gives the MCP URL and how to add it as a custom connector in Claude', () => {
    const html = render({ guide: steps() })
    expect(html).toContain('<code>https://cinema.example/mcp</code>')
    expect(html).toContain('Adicionar conector personalizado')
  })

  it('never blocks: "pedir filme" is there, below the guide', () => {
    const html = render({ guide: steps() })
    expect(html).toMatch(/<a href="\/sessoes\/nova"[^>]*>Pedir filme<\/a>/)
    expect(html.indexOf('Para começar')).toBeLessThan(
      html.indexOf('Pedir filme'),
    )
  })
})
