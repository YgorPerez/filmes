import type { OperationsRefusal } from '#/content/operations-form'

const commits = (n: number) => (n === 1 ? '1 commit' : `${n} commits`)

const percent = (value: number | null) =>
  value === null
    ? '—'
    : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

const time = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  })

export const OPERATIONS = {
  title: 'Operações',
  refusals: {
    'em-andamento':
      'Já tem uma avaliação em andamento. Espere terminar para iniciar outra.',
    'sem-pasta':
      'Configure a pasta de relatórios no servidor para rodar a avaliação.',
    pedido: 'Esse pedido não veio desta tela. Use o botão da ação.',
    indisponivel: 'A ação falhou. Tente de novo daqui a pouco.',
  } satisfies Record<OperationsRefusal, string>,
  percent,
  push: {
    title: 'Envio dos dados',
    lead: 'Os commits do filmes-dados vão para o GitHub.',
    unavailable:
      'Não foi possível ler a fila de envio. Recarregue a página para tentar de novo.',
    off: 'O envio está desligado neste servidor. Os commits ficam só aqui, sem ir para o GitHub.',
    remoteSetting: 'FILMES_DATA_REMOTE',
    ok: 'Fila em dia. Todos os commits foram enviados.',
    pending: (n: number) => `${commits(n)} na fila.`,
    failing: 'Envio falhando',
    failures: (n: number) =>
      n === 1 ? '1 falha seguida.' : `${n} falhas seguidas.`,
    since: (iso: string) => `A primeira falha foi em ${time(iso)}.`,
    lastError: 'Último erro do Git',
    retry: 'Tentar enviar agora',
    banner: (pending: number, failures: number) =>
      `O envio dos dados falhou ${failures} vezes seguidas. ${commits(pending)} na fila.`,
    bannerLink: 'Ver Operações',
  },
  evaluation: {
    title: 'Avaliar a Recomendação',
    lead: 'Compara as Recomendações com as Notas e com o Feedback das últimas Sessões. O relatório fica salvo com a data de hoje.',
    unavailable:
      'Não foi possível ler a configuração da avaliação. Recarregue a página para tentar de novo.',
    folderSetting: 'FILMES_AVALIACOES',
    grid: 'Testar outras combinações de pesos',
    gridHint: 'Roda a avaliação para cada combinação. Leva mais tempo.',
    run: 'Avaliar',
    running: 'Avaliando…',
    startedBy: (by: string, at: string, grid: boolean) =>
      `${by} iniciou ${grid ? 'a comparação de pesos' : 'a avaliação'} em ${time(at)}.`,
    progress: 'Progresso da avaliação',
    refresh: 'Atualizar progresso',
    done: (at: string) => `A avaliação terminou em ${time(at)}.`,
    failed: 'A avaliação parou. Tente rodar de novo.',
    measures: 'Teste com Notas reservadas',
    sample: 'Amostra',
    people: 'Pessoas',
    movielens: 'MovieLens',
    measured: 'Perfis',
    recall: 'Recall@50',
    coverage: 'Cobertura no top 5',
    online: (sessions: number, rate: number | null) => {
      if (sessions === 0) return 'Nenhuma Sessão com Feedback.'
      const count = sessions === 1 ? '1 Sessão' : `${sessions} Sessões`
      return rate === null
        ? `Feedback de ${count}. Sem taxa de escolha no top 5.`
        : `Feedback de ${count}. O filme escolhido estava no top 5 em ${percent(rate)} delas.`
    },
    priority: (priority: 'online' | 'offline') =>
      priority === 'online'
        ? 'Já há Sessões suficientes com Feedback, e ele vale mais que o teste com Notas.'
        : 'Ainda há poucas Sessões com Feedback, então vale mais o teste com Notas.',
    best: 'Combinações com melhor resultado',
    rank: 'Posição',
    bestRow: (n: number) => `${n}º`,
    file: (file: string) => `Relatório gravado em ${file}.`,
    report: (date: string) => `Relatório de ${date}`,
    noReport: 'Ainda não há relatório.',
  },
  consult: {
    title: 'Consultar o banco',
    lead: 'Rode um SELECT por vez. A consulta só lê o banco.',
    label: 'SQL',
    placeholder: 'SELECT titulo FROM filmes LIMIT 5',
    run: 'Consultar',
    results: 'Resultado da consulta',
    rows: (total: number, shown: number) =>
      shown < total
        ? `Mostrando ${shown} de ${total} linhas.`
        : total === 1
          ? '1 linha.'
          : `${total} linhas.`,
    empty: 'A consulta retornou 0 linhas.',
    errors: {
      read_only: 'O console só lê o banco. Use um SELECT.',
      invalid_sql:
        'O banco recusou o SQL. Confira a instrução e tente de novo.',
    } as Record<string, string>,
    other: 'Não foi possível consultar o banco agora. Tente mais tarde.',
    null: 'NULL',
  },
} as const
