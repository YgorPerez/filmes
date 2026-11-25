import type {
  OperationsNotice,
  OperationsRefusal,
} from '#/content/operations-form'

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
  back: 'Voltar',
  title: 'Operações',
  lead: 'Só quem é admin vê esta tela: o envio do repo de dados, a avaliação da Recomendação e o console do banco.',
  notices: {
    avaliando: 'A avaliação começou. O progresso aparece abaixo.',
    enviado: 'Tentei enviar agora. O resultado está no quadro do envio.',
  } satisfies Record<OperationsNotice, string>,
  refusals: {
    'em-andamento': 'Já há uma avaliação em andamento. Espere ela terminar.',
    'sem-pasta':
      'A avaliação não está configurada: falta FILMES_AVALIACOES no servidor.',
    pedido: 'Esse pedido não veio desta tela. Tente pelo botão.',
    indisponivel: 'Não deu para fazer isso agora. Tente de novo daqui a pouco.',
  } satisfies Record<OperationsRefusal, string>,
  percent,
  time,
  push: {
    title: 'Envio do repo de dados',
    lead: 'Cada gravação vira um commit no filmes-dados, enviado ao GitHub em seguida.',
    unavailable:
      'O envio não pôde ser lido: o motor não está pronto neste servidor.',
    off: 'O envio está desligado neste servidor (sem FILMES_DATA_REMOTE). Os commits ficam só aqui.',
    ok: 'Tudo enviado.',
    pending: (n: number) => `${commits(n)} na fila para enviar.`,
    failures: (n: number) =>
      n === 1 ? '1 falha seguida.' : `${n} falhas seguidas.`,
    since: (iso: string) => `Falhando desde ${time(iso)}.`,
    lastError: 'Último erro',
    retry: 'Tentar enviar agora',
    banner: (pending: number, failures: number) =>
      `O envio do repo de dados falhou ${failures} vezes seguidas; ${commits(pending)} esperando.`,
    bannerLink: 'Ver Operações',
  },
  evaluation: {
    title: 'Avaliar a Recomendação',
    lead: 'Mede a Recomendação contra as Notas de cada Pessoa (corte offline) e o Feedback das últimas Sessões, e grava um relatório com a data de hoje.',
    unset:
      'Não configurado: falta FILMES_AVALIACOES, a pasta onde os relatórios ficam (fora do filmes-dados). Sem ela, a avaliação não roda.',
    unavailable:
      'A avaliação não está pronta neste servidor: o motor não pôde ler a configuração.',
    grid: 'Comparar também os pesos da grade',
    gridHint: 'demora bem mais',
    run: 'Avaliar',
    running: 'Avaliando…',
    startedBy: (by: string, at: string, grid: boolean) =>
      `${grid ? 'Avaliação com a grade' : 'Avaliação'} iniciada por ${by} em ${time(at)}.`,
    progress: 'Progresso da avaliação',
    refresh: 'Atualizar',
    done: (at: string) => `Terminou em ${time(at)}.`,
    failed: (code: string, message: string) =>
      `A avaliação parou com erro (${code}): ${message}`,
    measures: 'Medidas do corte offline',
    sample: 'Amostra',
    people: 'Pessoas',
    movielens: 'MovieLens',
    measured: 'Medidas',
    recall: 'Recall@50',
    coverage: 'Cobertura no top 5',
    online: (sessions: number, rate: number | null) =>
      `Feedback de ${sessions === 1 ? '1 Sessão' : `${sessions} Sessões`}; escolhido no top 5: ${percent(rate)}.`,
    priority: (priority: 'online' | 'offline') =>
      priority === 'online'
        ? 'Prioridade: o Feedback (já há Sessões suficientes).'
        : 'Prioridade: o corte offline (ainda há poucas Sessões com Feedback).',
    best: 'Melhores pesos da grade',
    bestRow: (n: number) => `${n}º`,
    file: (file: string) => `Relatório gravado em ${file}.`,
    report: (date: string) => `Relatório de ${date}`,
    noReport: 'Nenhum relatório ainda.',
  },
  consult: {
    title: 'Consultar o banco',
    lead: 'Uma consulta SQL só de leitura no banco derivado. Só SELECT; uma instrução por vez.',
    label: 'SQL',
    placeholder: 'SELECT titulo FROM filmes LIMIT 5',
    run: 'Consultar',
    rows: (total: number, shown: number) =>
      `${total === 1 ? '1 linha' : `${total} linhas`}${shown < total ? `; mostrando as primeiras ${shown}` : ''}.`,
    empty: 'A consulta não trouxe linhas.',
    errors: {
      read_only: 'Só leitura: o console aceita só SELECT.',
      invalid_sql: 'SQL inválido.',
    } as Record<string, string>,
    other: 'O console não pôde rodar a consulta neste servidor.',
    null: 'NULL',
  },
} as const
