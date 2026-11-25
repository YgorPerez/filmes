import type { SetupStep } from '@filmes/engine'

export const HOME = {
  greeting: (name: string) => `Olá, ${name}`,
  logout: 'Sair',
  nav: 'Telas',
  sessions: 'Sessões',
  people: 'Pessoas',
  imports: 'Importar',
  export: 'Exportar Notas',
  feedback: 'Feedback',
  operations: 'Operações',
  request: 'Pedir filme',
  latest: {
    title: 'Última Sessão',
    open: 'Falta o Feedback',
    feedback: 'Dar Feedback',
    feedbackLabel: (id: string) => `Dar Feedback da Sessão ${id}`,
    chosen: (title: string) => `vimos ${title}`,
    nothing: 'não vimos nada',
  },
  guide: {
    title: 'Para começar',
    lead: 'Três passos para as recomendações acertarem. Dá para pedir filme antes, e pular o que não quiser.',
    done: 'Feito',
    skipped: 'Pulado',
    skip: 'Pular',
    skipLabel: (title: string) => `Pular: ${title}`,
    steps: {
      taste: {
        title: 'Meu gosto',
        text: 'Dê Nota a 10 filmes que você viu, ou importe o seu histórico.',
        action: 'Dar Notas',
      },
      import: {
        title: 'Importar do Letterboxd ou do Trakt',
        text: 'Traga as Notas e o que você já viu de lá.',
        action: 'Importar',
      },
      connector: {
        title: 'Conector no Claude',
        text: 'Para pedir filme conversando com o Claude. No Claude, abra Configurações › Conectores, toque em Adicionar conector personalizado, cole este endereço e entre com o seu Google:',
        action: null,
      },
    } satisfies Record<
      SetupStep,
      { title: string; text: string; action: string | null }
    >,
  },
} as const
