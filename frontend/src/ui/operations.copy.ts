import type { OperationsRefusal } from '#/content/operations-form'
import { shortDate } from './dates'

const commits = (n: number) => (n === 1 ? '1 commit' : `${n} commits`)

const count = (n: number) => n.toLocaleString('pt-BR')

const decimal = (n: number) =>
  n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

const percent = (value: number | null) =>
  value === null
    ? '—'
    : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

/** "20 nov 2026, 22:54", in Brasília's time, as every date of the page. */
const time = (iso: string) => {
  const local = new Date(iso).toLocaleString('sv-SE', {
    timeZone: 'America/Sao_Paulo',
  })
  return `${shortDate(local)}, ${local.slice(11, 16)}`
}

/** What each weight of the grid is called on the page, by its section and
 * key in `config/weights.toml`. */
const WEIGHT_NAMES: Readonly<Record<string, string>> = {
  'path.weight.director': 'diretor',
  'path.weight.writer': 'roteiro',
  'path.weight.series': 'série',
  'path.weight.cast': 'elenco',
  'path.weight.genre': 'gênero',
  'strength.multiplier.strong': 'Força forte',
  'strength.multiplier.moderate': 'Força moderada',
  'strength.multiplier.weak': 'Força fraca',
  'strength.multiplier.guess': 'palpite',
  'utility.max_evidence': 'Evidências por filme',
  'rating_decay.half_life_years': 'meia-vida da Nota (anos)',
}

type Change = { section: string; key: string; from: number | null; to: number }

export const OPERATIONS = {
  title: 'Operações',
  refusals: {
    'em-andamento':
      'Já tem uma avaliação em andamento. Espere terminar para iniciar outra.',
    'sem-pasta':
      'Configure a pasta de relatórios no servidor para rodar a avaliação.',
    pedido: 'Esse pedido não veio desta tela. Use o botão da ação.',
    indisponivel: 'A ação falhou. Tente de novo daqui a pouco.',
    falha:
      'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
  } satisfies Record<OperationsRefusal, string>,
  percent,
  copied: 'Copiado.',
  copyManual: 'Não deu para copiar: selecione o texto e copie à mão.',
  push: {
    title: 'Envio dos dados',
    lead: 'Os commits do filmes-dados vão para o GitHub.',
    upToDate: (at: string | null) =>
      at === null ? 'Em dia.' : `Em dia · último envio em ${time(at)}.`,
    unavailable:
      'Não foi possível ler a fila de envio. Recarregue a página para tentar de novo.',
    off: 'O envio está desligado neste servidor. Os commits ficam só aqui, sem ir para o GitHub.',
    remoteSetting: 'FILMES_DATA_REMOTE',
    pending: (n: number) => `${commits(n)} na fila.`,
    /** The queue line over its list, while pushes fail. */
    pendingList: (total: number, shown: number) =>
      shown < total
        ? `${commits(total)} na fila. Os ${shown} mais recentes:`
        : `${commits(total)} na fila:`,
    failing: 'O envio dos dados está falhando',
    nextStep:
      'Tente enviar agora. Se continuar falhando, confira a deploy key do filmes-dados na VPS e o último erro do Git, abaixo.',
    failures: (n: number) =>
      n === 1 ? '1 falha seguida.' : `${n} falhas seguidas.`,
    since: (iso: string) => `A primeira falha foi em ${time(iso)}.`,
    lastError: 'Último erro do Git',
    retry: 'Tentar enviar agora',
    sending: 'Enviando…',
    banner: (pending: number, failures: number) =>
      `O envio dos dados falhou ${failures} vezes seguidas. ${commits(pending)} na fila.`,
    bannerLink: 'Ver Operações',
  },
  evaluation: {
    title: 'Avaliar a Recomendação',
    lead: 'Compara as Recomendações com as Notas e com o Feedback das últimas Sessões. O relatório fica salvo com a data de hoje; outro no mesmo dia o substitui.',
    unavailable:
      'Não foi possível ler a configuração da avaliação. Recarregue a página para tentar de novo.',
    folderSetting: 'FILMES_AVALIACOES',
    grid: 'Testar outras combinações de pesos',
    gridHint:
      'Roda a avaliação para cada combinação e diz quais pesos foram melhor. Leva bem mais tempo.',
    run: 'Avaliar',
    running: 'Avaliando…',
    startedBy: (by: string, at: string, grid: boolean) =>
      `${by} iniciou ${grid ? 'a comparação de pesos' : 'a avaliação'} em ${time(at)}. ${grid ? 'Com a comparação de pesos, leva alguns minutos.' : 'Leva cerca de 1 minuto.'}`,
    progress: 'Progresso da avaliação',
    refresh: 'Atualizar progresso',
    done: (at: string) => `Terminou em ${time(at)}.`,
    verdict: (recall: number | null, people: number) =>
      recall === null
        ? `Sem medida: nenhuma Nota alta reservada entre ${people === 1 ? '1 Pessoa' : `${people} Pessoas`}.`
        : `A lista acerta ${percent(recall)} das Notas altas reservadas, com ${people === 1 ? '1 Pessoa' : `${people} Pessoas`}.`,
    delta: (now: number, before: number, date: string) => {
      const points = Math.round((now - before) * 100)
      const since = shortDate(date)
      if (points === 0) return `Igual à de ${since}.`
      return `${points > 0 ? '+' : '−'}${Math.abs(points)} ${Math.abs(points) === 1 ? 'ponto' : 'pontos'} desde ${since}.`
    },
    smallSample:
      'Amostra pequena: com menos de 10 Pessoas, a medida muda muito de uma avaliação para outra.',
    legend:
      'Recall@50: das Notas altas que o teste esconde, quantas voltam entre os 50 primeiros da lista. Cobertura no top 5: quanto dos 5 primeiros tem alguma Evidência.',
    noMovielens: 'sem dados: falta o ml-32m no Catálogo',
    noSample: 'sem dados',
    failed: 'A avaliação parou. Tente rodar de novo.',
    measures: 'Teste com Notas reservadas',
    sample: 'Amostra',
    people: 'Pessoas',
    movielens: 'MovieLens',
    measured: 'Medidas',
    recall: 'Recall@50',
    coverage: 'Cobertura no top 5',
    online: (sessions: number, rate: number | null) => {
      if (sessions === 0) return 'Nenhuma Sessão com Feedback.'
      const count = sessions === 1 ? '1 Sessão' : `${sessions} Sessões`
      return rate === null
        ? `Feedback de ${count}. Sem taxa de escolha no top 5.`
        : `Feedback de ${count}. O filme escolhido estava no top 5 em ${percent(rate)} delas.`
    },
    onlineTitle: 'Feedback das Sessões',
    priority: (priority: 'online' | 'offline') =>
      priority === 'online'
        ? 'Já há Sessões suficientes com Feedback, e ele vale mais que o teste com Notas.'
        : 'Ainda há poucas Sessões com Feedback, então vale mais o teste com Notas.',
    best: 'Combinações com melhor resultado',
    /** Above the grid's table: whether any combination beats today's
     * weights. `current`: the rank of today's weights among the best (0
     * first), -1 when they are not among them. */
    gridVerdict: (tried: number | null, current: number, shown: number) => {
      const among =
        tried === null
          ? 'das combinações testadas'
          : `das ${count(tried)} combinações testadas`
      if (current === 0) return `Nenhuma ${among} supera os pesos de hoje.`
      if (current < 0)
        return shown === 1
          ? `A melhor ${among} supera os pesos de hoje.`
          : `As ${shown} melhores ${among} superam os pesos de hoje.`
      return current === 1
        ? `Só a 1ª ${among} supera os pesos de hoje.`
        : `As ${current} primeiras ${among} superam os pesos de hoje.`
    },
    bestHint:
      'A ordem é pelo Recall@50; no empate, pela cobertura no top 5 e depois pela que muda menos pesos. Para usar uma, copie os pesos para o config/weights.toml.',
    noGain: 'sem ganho',
    gridFile: 'As medidas de cada combinação ficam no arquivo do relatório.',
    rank: 'Posição',
    bestRow: (n: number) => `${n}º`,
    changes: 'O que muda',
    current: 'os pesos de hoje',
    currentTag: 'atual',
    tie: 'empate',
    change: ({ section, key, from, to }: Change) =>
      `${WEIGHT_NAMES[`${section}.${key}`] ?? `${section}.${key}`} ${from === null ? '—' : decimal(from)} → ${decimal(to)}`,
    toml: (changes: readonly Change[]) =>
      Object.entries(Object.groupBy(changes, (change) => change.section))
        .map(
          ([section, list]) =>
            `[${section}]\n${(list ?? []).map((c) => `${c.key} = ${c.to}`).join('\n')}`,
        )
        .join('\n\n'),
    copyWeights: 'Copiar pesos',
    copyWeightsOf: (n: number) => `Copiar os pesos da ${n}ª combinação`,
    report: (date: string) => `Relatório de ${shortDate(date)}`,
    download: 'Baixar relatório (.md)',
    copyToml: 'Copiar como TOML',
    /** A report row with no held-out Nota in any column. */
    noRatingsRow: 'sem Notas nesse corte',
    /** A report cell with no held-out Nota. */
    noRatingsCell: 'sem Notas',
    shortHashes:
      'Os hashes vão encurtados; os inteiros estão no arquivo do relatório.',
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
        ? `Mostrando as primeiras ${count(shown)} de ${count(total)} linhas. Use LIMIT e OFFSET para ver o resto.`
        : total === 1
          ? '1 linha.'
          : `${count(total)} linhas.`,
    empty: 'A consulta retornou 0 linhas.',
    tables: (n: number) => `Tabelas e visões (${n})`,
    tablesHint: 'Toque num nome para ver as primeiras 20 linhas.',
    view: 'visão',
    saved: 'Consultas prontas',
    queries: [
      {
        name: 'Notas mais recentes',
        sql: 'SELECT n.pessoa, f.titulo, n.nota, n.data, n.fonte\nFROM notas_vigentes n LEFT JOIN filmes f ON f.id = n.filme_id\nORDER BY n.data DESC LIMIT 20',
      },
      {
        name: 'Sessões abertas',
        sql: 'SELECT id, data, regra, pedido FROM sessoes\nWHERE feedback_em IS NULL ORDER BY data DESC',
      },
      {
        name: 'Notas por Fonte',
        sql: 'SELECT fonte, count(*) AS notas FROM notas\nGROUP BY fonte ORDER BY notas DESC',
      },
      {
        name: 'Fatos por elo',
        sql: 'SELECT predicado, count(*) AS fatos FROM arestas\nGROUP BY predicado ORDER BY fatos DESC',
      },
      {
        name: 'Todas as Pessoas',
        sql: 'SELECT * FROM pessoas',
      },
    ],
    errors: {
      read_only: 'O console só lê o banco. Use um SELECT.',
      invalid_sql:
        'O banco recusou o SQL. Confira a instrução e tente de novo.',
    } as Record<string, string>,
    other: 'Não foi possível consultar o banco agora. Tente mais tarde.',
    null: 'NULL',
  },
} as const
