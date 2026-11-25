// The JSON the Python CLI prints (`python -m filmes <command> --json`), named
// the way the TypeScript engine names it. The parity oracle (ADR 0004)
// imports this table to read Python's output in English; the port tickets
// read it for the names of each operation's result, so no ticket invents its
// own.
//
// Keys are camelCase, as TypeScript fields are (ADR 0001). Closed-list values
// keep the snake_case the data files use, so one value has one spelling
// everywhere (`min_rating` in a Session file and in a result). Keys that are
// data (a Pessoa slug, a film id, a Constraint name, a table name) are not
// fields: a Pessoa slug or a table name stays, a Constraint name is renamed as
// a value.
//
// Built from every output the pytest suite produced (421 tests, harvested on
// 2026-11-24). Evidence text, warnings and messages stay PT-BR.

import { catalogDumps, catalogVersions, TAG_GROUPS, weights } from './config.ts'
import {
  anything,
  closed,
  entries,
  free,
  list,
  map,
  oneOf,
  type Field,
  type Shape,
} from '../shape.ts'
import type { TomlShape } from '../rewrite-toml.ts'
import {
  CONSTRAINTS,
  DROP_CAUSES,
  LEVELS,
  LINKS,
  RESOLUTION_STATUSES,
  RULES,
} from './data.ts'

/** Força. */
export const STRENGTHS = {
  forte: 'strong',
  moderada: 'moderate',
  fraca: 'weak',
  palpite: 'guess',
}

/** Tipo of the Fact behind an Evidence. */
export const KINDS = {
  metadado: 'metadata',
  nota: 'rating',
  declarado: 'stated',
  relato: 'report',
  review: 'review',
  palpite: 'guess',
}

/** How a Declarado or a Relato feels about its target. */
export const STATEMENT_REACTIONS = {
  ama: 'love',
  gosta: 'like',
  nao_gosta: 'dislike',
  odeia: 'hate',
}

/** What `pessoa remover` removes. */
export const REMOVABLE = {
  declarado: 'stated',
  relato: 'report',
  veto: 'veto',
  visto: 'seen',
  pergunta: 'open_question',
}

/** A Letterboxd item in the import report or the queue. */
export const ITEM_STATUSES = {
  ...RESOLUTION_STATUSES,
  fila: 'queued',
  resolvido: 'resolved',
}

const ERROR_CODES: Record<string, string> = {
  uso_invalido: 'invalid_usage',
  arquivo_invalido: 'invalid_file',
  arquivo_ausente: 'missing_file',
  dados_invalidos: 'invalid_data',
  dados_ausentes: 'missing_data',
  config_invalida: 'invalid_config',
  config_ausente: 'missing_config',
  catalogo_invalido: 'invalid_catalog',
  catalogo_ausente: 'missing_catalog',
  banco_ausente: 'missing_database',
  banco_desatualizado: 'outdated_database',
  versoes_invalidas: 'invalid_versions',
  versoes_ausentes: 'missing_versions',
  atualizacao_falhou: 'update_failed',
  pessoa_desconhecida: 'unknown_person',
  pessoa_ambigua: 'ambiguous_person',
  pessoa_existente: 'person_exists',
  dono_existente: 'owner_exists',
  sessao_desconhecida: 'unknown_session',
  sessao_fechada: 'closed_session',
  alvo_desconhecido: 'unknown_target',
  filme_desconhecido: 'unknown_film',
  filme_ambiguo: 'ambiguous_film',
  filme_sem_imdb: 'film_without_imdb',
  fonte_indisponivel: 'source_unavailable',
  sql_invalido: 'invalid_sql',
  somente_leitura: 'read_only',
  rss_ausente: 'missing_rss',
  item_fora_da_fila: 'item_not_queued',
  import_desconhecido: 'unknown_import',
  import_ambiguo: 'ambiguous_import',
  interno: 'internal',
}
// `pessoa remover` builds `<what>_desconhecido` and `<what>_ambiguo`.
for (const [pt, en] of Object.entries(REMOVABLE)) {
  ERROR_CODES[`${pt}_desconhecido`] = `unknown_${en}`
  ERROR_CODES[`${pt}_ambiguo`] = `ambiguous_${en}`
}
export { ERROR_CODES }

/** `{"erro": {"codigo", "mensagem"}}`, from any command. */
export const error: Shape = map({
  erro: [
    'error',
    map({ codigo: ['code', closed(ERROR_CODES)], mensagem: 'message' }),
  ],
})

/** A Veto target or a question subject: a tag group, or an id that stays. */
const target = closed(TAG_GROUPS, true)
const strength = closed(STRENGTHS)
const kind = closed(KINDS)

/** An Evidence (`evidencia/__init__.py`, `como_json`). */
const evidence = map({
  pessoa: 'person',
  texto: 'text',
  fonte: 'source',
  data: 'date',
  forca: ['strength', strength],
  tipo: ['kind', kind],
  fato_id: 'factId',
  contribuicao: 'contribution',
})

/** A Declarado or a Relato, as `pessoa` prints it. */
const statement = map({
  texto: 'text',
  alvo: 'target',
  rotulo: 'label',
  especifico: 'specific',
  reacao: ['reaction', closed(STATEMENT_REACTIONS)],
  nota: 'rating',
  fonte: 'source',
  data: 'date',
  forca: ['strength', strength],
  tipo: ['kind', kind],
  fato_id: 'factId',
})

const veto = map({
  pessoa: 'person',
  texto: 'text',
  alvo: ['target', target],
  rotulo: 'label',
  data: 'date',
  fato_id: 'factId',
  filmes_tirados: 'filmsRemoved',
  por_caminho: [
    'byPath',
    map({
      direto: 'direct',
      genero_imdb: 'imdbGenre',
      subgeneros: 'subgenres',
      tags: 'tags',
    }),
  ],
})

const adjustment = map({
  elo: ['link', closed(LINKS)],
  nivel: ['level', closed(LEVELS)],
  data: 'date',
  fato_id: 'factId',
})

const openQuestion = map({
  texto: 'text',
  assunto: ['subject', target],
  rotulo: 'label',
  data: 'date',
  puladas: 'skips',
  fato_id: 'factId',
})

const seen = map({
  pessoa: 'person',
  filme: 'film',
  titulo: 'title',
  nota: 'rating',
  achou: 'comment',
  fonte: 'source',
  data: 'date',
  novo: 'new',
  fato_id: 'factId',
})

const rating = map({
  filme_id: 'filmId',
  titulo: 'title',
  nota: 'rating',
  data: 'date',
  fonte: 'source',
  tipo: ['kind', kind],
  fato_id: 'factId',
})

const personImport = map({
  tipo: 'kind',
  arquivo: 'file',
  data: 'date',
  original: 'original',
  sha256: 'sha256',
})

/** What `pessoa remover` removed: any of the items above. */
const removed: Shape = {
  fields: {
    ...statement.fields,
    ...seen.fields,
    ...openQuestion.fields,
    alvo: { name: 'target', shape: target },
  },
}

const film = { posicao: 'position', id: 'id', titulo: 'title' } as const

const drop = map({
  ...film,
  motivo: ['cause', closed(DROP_CAUSES)],
  pessoas: ['people', list(free)],
  pessoa: 'person',
  texto: 'text',
  restricao: ['constraint', closed(CONSTRAINTS)],
  rotulo: 'label',
})

const sessionRef = map({ id: 'id', arquivo: 'file', versao: 'version' })

/** `recomendar`'s `restricoes`: what each Constraint applied and removed. */
const constraintReport: Shape = {
  fields: {
    ano: field('year', { desde: 'since', ate: 'until' }),
    crianca: field('child', { idade: 'age', ate_faixa: 'maxAgeRating' }),
    duracao: field('duration', { maximo_min: 'maxMinutes' }),
    fora_da_sessao: field('out_of_session', {
      ja_vistos: 'seen',
      trocados: 'swapped',
    }),
    gatilho: field('trigger', { temas: ['themes', list(free)] }),
    idioma: field('language', { idioma: 'language' }),
    parecido: field('similar', {
      filmes: ['films', list(free)],
      titulos: ['titles', list(free)],
    }),
    sem_ja_visto: field('unseen', {}),
    sem_lento: field('no_slow', {}),
    sem_tristeza: field('no_sad', {
      por_sinal: [
        'bySignal',
        map({ triste: 'sad', tema_pesado: 'heavy_theme' }),
      ],
    }),
    sem_repetido: field('no_repeat', {}),
  },
}

function field(
  name: string,
  fields: Readonly<Record<string, string | readonly [string, Shape]>>,
): Field {
  return { name, shape: map({ tirados: 'removed', ...fields }) }
}

const attribution = map({ fonte: 'source', texto: 'text' })

const recommendedFilm = map({
  ...film,
  ano: 'year',
  duracao_min: 'runtimeMinutes',
  imdb: 'imdbUrl',
  generos: ['genres', list(free)],
  capa: 'poster',
  titulo_pt: 'titlePt',
  sinopse: 'synopsis',
  nota_imdb: 'imdbRating',
  votos_imdb: 'imdbVotes',
  cobertura: [
    'coverage',
    map({
      com_fato: 'withFact',
      presentes: 'attendees',
      sem_fato: ['withoutFact', list(free)],
    }),
  ],
  so_palpites: 'onlyGuesses',
  novo: 'new',
  utilidade: ['utility', entries(free)],
  evidencias: ['evidence', entries(list(evidence))],
  linhas_do_filme: ['filmLines', list(evidence)],
})

const recommend = map({
  presentes: ['attendees', list(free)],
  regra: ['rule', map({ nome: ['name', closed(RULES)], pessoa: 'person' })],
  credito: ['credit', entries(free)],
  vetos: ['vetoes', list(veto)],
  climas: ['moods', list(free)],
  restricoes: ['constraints', constraintReport],
  filmes: ['films', list(recommendedFilm)],
  mantidos: ['kept', list(free)],
  saidas: ['dropped', list(drop)],
  sessao: ['session', sessionRef],
  atribuicoes: ['attributions', list(attribution)],
  avisos: ['warnings', list(free)],
})

const fact = map({
  pessoa: 'person',
  texto: 'text',
  fonte: 'source',
  data: 'date',
  forca: ['strength', strength],
  tipo: ['kind', kind],
  fato_id: 'factId',
})

const feedback = map({
  sessao: ['session', sessionRef],
  escolhido: [
    'chosen',
    map({
      id: 'id',
      titulo: 'title',
      ano: 'year',
      posicao: 'position',
      posicao_mostrada: 'shownPosition',
    }),
  ],
  fatos: ['facts', list(fact)],
  sem_reacao: ['withoutReaction', list(free)],
})

const openSessions = map({
  sessoes: [
    'sessions',
    list(
      map({
        id: 'id',
        arquivo: 'file',
        data: 'date',
        versao: 'version',
        pedido: 'request',
        presentes: ['attendees', list(free)],
        recomendacao: ['recommendation', list(map({ ...film, novo: 'new' }))],
      }),
    ),
  ],
})

const billboard = map({
  sessao: 'session',
  arquivo: 'file',
  filmes: 'films',
  avisos: ['warnings', list(free)],
})

const filmNote = map({ ...film, estrelas: 'stars', comentario: 'comment' })

const answerBillboard = map({
  sessao: ['session', sessionRef],
  versao: 'version',
  versao_atual: 'currentVersion',
  regerar: 'regenerate',
  manter: ['keep', list(free)],
  saem: ['dropped', list(drop)],
  acrescentar: 'addition',
  comentarios: ['comments', list(filmNote)],
  estrelas: ['stars', list(filmNote)],
  vistos: ['seen', list(seen)],
  avisos: ['warnings', list(free)],
})

const verify = map({
  valida: 'valid',
  linhas_invalidas: ['invalidLines', list(free)],
})

const personView = map({
  pessoa: 'person',
  nome: 'name',
  apelidos: ['aliases', list(free)],
  dono: 'owner',
  vetos: ['vetoes', list(veto)],
  ajustes: ['adjustments', list(adjustment)],
  declarados: ['stated', list(statement)],
  relatos: ['reports', list(statement)],
  vistos: ['seen', list(seen)],
  perguntas_abertas: ['openQuestions', list(openQuestion)],
  imports: ['imports', list(personImport)],
  notas: ['ratings', list(rating)],
  aviso: 'warning',
})

const personWrite = (pt: string, en: string, shape: Shape) =>
  map({ pessoa: 'person', novo: 'new', [pt]: [en, shape] })

const importItem = map({
  id: 'id',
  nome: 'name',
  ano: 'year',
  razao: 'reason',
  caminho: 'resolvedBy',
  filme_id: 'filmId',
  situacao: ['status', closed(ITEM_STATUSES)],
  pessoas: ['people', list(free)],
  candidatos: [
    'candidates',
    list(
      map({
        titulo: 'title',
        titulo_original: 'originalTitle',
        ano: 'year',
        tmdb: 'tmdb',
        link: 'link',
      }),
    ),
  ],
})

const countsByPath = map({
  wikidata: 'wikidata',
  tmdb: 'tmdb',
  manual: 'manual',
  imdb: 'imdb',
})

const factTables = map({
  notas: 'ratings',
  ja_visto: 'seen',
  declarados: 'stated',
  watchlist: 'watchlist',
})

const importReport = map({
  pessoa: 'person',
  filmes: 'films',
  resolvidos: ['resolved', countsByPath],
  descartados: ['discarded', countsByPath],
  fila: 'queued',
  na_fila: ['queue', list(importItem)],
  descartados_itens: ['discardedItems', list(importItem)],
  sem_resolucao: [
    'unresolved',
    list(map({ nome: 'name', imdb: 'imdb', tmdb: 'tmdb', trakt: 'trakt' })),
  ],
  arquivo: 'file',
  arquivo_novo: 'newFile',
  fatos: ['facts', factTables],
  fatos_novos: ['newFacts', factTables],
  fatos_removidos: ['removedFacts', factTables],
  removido: ['removed', personImport],
  atribuicoes: ['attributions', list(attribution)],
  avisos: ['warnings', list(free)],
})

const queueDecision = map({
  id: 'id',
  nome: 'name',
  ano: 'year',
  data: 'date',
  fonte: 'source',
  tipo: ['kind', closed({ declarado: 'stated' })],
  situacao: ['status', closed(ITEM_STATUSES)],
  filme: 'film',
  entrada: 'input',
  razao: 'discardReason',
  novo: 'new',
  atribuicoes: ['attributions', list(attribution)],
})

const queueReprocess = map({
  pessoas: ['people', list(free)],
  resolvidos: ['resolved', list(importItem)],
  descartados: ['discarded', list(importItem)],
  na_fila: ['queue', list(importItem)],
  atribuicoes: ['attributions', list(attribution)],
  avisos: ['warnings', list(free)],
})

const exportResult = map({
  pessoa: 'person',
  formato: 'format',
  arquivo: 'file',
  notas: 'ratings',
  fora_do_catalogo: 'outsideCatalog',
})

/** `config/pesos.toml` as a nested map, the way `avaliar` echoes it. */
function weightsShape(toml: TomlShape, camel: boolean): Shape {
  const root: Record<
    string,
    { name: string; children: Record<string, unknown> }
  > = {}
  for (const [path, table] of Object.entries(toml.tables)) {
    const pt = path.split('.')
    const en = table.name.split('.')
    let level = root
    pt.forEach((segment, i) => {
      level[segment] ??= { name: en[i]!, children: {} }
      const node = level[segment]!
      if (i === pt.length - 1)
        for (const [k, v] of Object.entries(table.keys))
          node.children[k] = { name: v, children: null }
      level = node.children as typeof root
    })
  }
  const toShape = (
    level: Record<string, { name: string; children: unknown }>,
  ): Shape => ({
    fields: Object.fromEntries(
      Object.entries(level).map(([k, v]) => [
        k,
        {
          name: camel ? camelCase(v.name) : v.name,
          shape: v.children
            ? toShape(
                v.children as Record<
                  string,
                  { name: string; children: unknown }
                >,
              )
            : free,
        },
      ]),
    ),
  })
  return toShape(root)
}

function camelCase(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

/** The weight grid: flat keys `caminho.peso`, `utilidade` → each key. */
function gridShape(values: Shape): Shape {
  return {
    fields: Object.fromEntries(
      Object.entries(weights.tables).map(([path, table]) => [
        path,
        {
          name: table.name,
          shape: {
            fields: Object.fromEntries(
              Object.entries(table.keys).map(([k, v]) => [
                k,
                { name: camelCase(v), shape: values },
              ]),
            ),
          },
        },
      ]),
    ),
  }
}

const offline = map({
  pessoas: 'people',
  recuperados: 'retrieved',
  retidos_4_mais: 'heldOut4Plus',
  com_evidencia: 'withEvidence',
  filmes_top_5: 'filmsTop5',
  recall_50: 'recall50',
  cobertura_top_5: 'coverageTop5',
})

const offlineCut = map({
  pessoas: ['people', offline],
  movielens: ['movielens', offline],
})

const evaluate = map({
  data: 'date',
  arquivo: 'file',
  offline: ['offline', offlineCut],
  online: [
    'online',
    map({
      sessoes: 'sessions',
      com_filme: 'withFilm',
      escolhidos_top_5: 'chosenTop5',
      taxa_top_5: 'rateTop5',
      reacoes: 'reactions',
      reacao_media: 'meanReaction',
    }),
  ],
  prioridade: 'priority',
  pesos: ['weights', weightsShape(weights, true)],
  versoes: [
    'versions',
    oneOf(entries(free), map({ manifesto: ['manifest', catalogVersions] })),
  ],
  amostra_movielens: [
    'movielensSample',
    map({ semente: 'seed', usuarios: 'users' }),
  ],
  grade: [
    'grid',
    map({
      combinacoes: 'combinations',
      valores: ['values', gridShape(list(free))],
      melhores: [
        'best',
        list(
          map({
            pesos: ['weights', gridShape(free)],
            recall_50: 'recall50',
            cobertura_top_5: 'coverageTop5',
            offline: ['offline', offlineCut],
          }),
        ),
      ],
    }),
  ],
  avisos: ['warnings', list(free)],
})

/** `atualizar` and `avaliar --progresso` progress lines, on stderr. */
export const progress: Shape = map({
  progresso: 'progress',
  total: 'total',
  mensagem: 'message',
})

/** Each command's success output, by its Python name (subcommands after a
 * space), with the name the TypeScript operation has. */
export const COMMANDS: Readonly<
  Record<string, { name: string; shape: Shape }>
> = {
  reconstruir: {
    name: 'rebuild',
    shape: map({ banco: 'database', tabelas: ['tables', entries(free)] }),
  },
  atualizar: {
    name: 'update',
    shape: map({ dumps: ['dumps', catalogDumps], versoes: 'versions' }),
  },
  recomendar: { name: 'recommend', shape: recommend },
  feedback: { name: 'record_feedback', shape: feedback },
  'sessoes-abertas': { name: 'open_sessions', shape: openSessions },
  cartaz: { name: 'billboard', shape: billboard },
  'cartaz responder': { name: 'answer_billboard', shape: answerBillboard },
  verificar: { name: 'verify_answer', shape: verify },
  'pessoa criar': {
    name: 'person create',
    shape: map({
      pessoa: 'person',
      nome: 'name',
      apelidos: ['aliases', list(free)],
      dono: 'owner',
    }),
  },
  'pessoa ver': { name: 'person view', shape: personView },
  'pessoa declarar': {
    name: 'person state',
    shape: personWrite('declarado', 'stated', statement),
  },
  'pessoa relatar': {
    name: 'person report',
    shape: personWrite('relato', 'report', statement),
  },
  'pessoa vetar': {
    name: 'person veto',
    shape: personWrite('veto', 'veto', veto),
  },
  'pessoa visto': {
    name: 'person seen',
    shape: personWrite('visto', 'seen', seen),
  },
  'pessoa ajustar': {
    name: 'person adjust',
    shape: personWrite('ajuste', 'adjustment', adjustment),
  },
  'pessoa pular': {
    name: 'person skip',
    shape: map({
      pessoa: 'person',
      pergunta: ['openQuestion', openQuestion],
      saiu: 'dropped',
    }),
  },
  'pessoa perguntas': {
    name: 'person questions',
    shape: map({
      pessoa: 'person',
      perguntas_abertas: ['openQuestions', list(openQuestion)],
    }),
  },
  'pessoa remover': {
    name: 'person remove',
    shape: map({
      pessoa: 'person',
      tipo: ['kind', closed(REMOVABLE)],
      removido: ['removed', removed],
    }),
  },
  importar: { name: 'import', shape: importReport },
  'fila ver': {
    name: 'import_queue view',
    shape: map({
      itens: ['items', list(importItem)],
      atribuicoes: ['attributions', list(attribution)],
    }),
  },
  'fila confirmar': { name: 'import_queue confirm', shape: queueDecision },
  'fila descartar': { name: 'import_queue discard', shape: queueDecision },
  'fila reprocessar': { name: 'import_queue reprocess', shape: queueReprocess },
  exportar: { name: 'export', shape: exportResult },
  consultar: {
    name: 'consult',
    // Column names and rows are the SQLite schema's, which stays in
    // Portuguese until Python leaves (#76).
    shape: map({
      colunas: ['columns', list(free)],
      linhas: ['rows', list(anything)],
    }),
  },
  avaliar: { name: 'evaluate', shape: evaluate },
}
