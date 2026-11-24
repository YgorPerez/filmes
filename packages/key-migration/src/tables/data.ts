// filmes-dados frontmatter: Portuguese keys and closed-list values → English,
// from the GLOSSARY code names (ADR 0002). Free text (a Veto's text, a
// label, a comment, a request), ids, slugs, dates and Clima names stay as
// written; so does every Markdown body.

import { anything, closed, free, list, map, type Shape } from '../shape.ts'
import { TAG_GROUPS } from './config.ts'

/** A Constraint name (`contexto.restricoes[].nome`, a drop's `restricao`). */
/** The filmes-dados files the migration rewrites: a Pessoa, a Sessão, the
 * Letterboxd resolutions. */
export type DataKind = 'person' | 'session' | 'letterboxd'

export const CONSTRAINTS = {
  ano: 'year',
  crianca: 'child',
  duracao: 'duration',
  fora_da_sessao: 'out_of_session',
  gatilho: 'trigger',
  idioma: 'language',
  parecido: 'similar',
  sem_ja_visto: 'unseen',
  sem_lento: 'no_slow',
  sem_tristeza: 'no_sad',
  // Recorded by Sessions before #66 removed it.
  sem_repetido: 'no_repeat',
}

/** An Adjustment's link, also a content path in `[caminho.peso]`. */
export const LINKS = {
  diretor: 'director',
  roteiro: 'writer',
  elenco: 'cast',
  serie: 'series',
  genero: 'genre',
}

export const LEVELS = {
  nada: 'none',
  pouco: 'low',
  normal: 'normal',
  muito: 'high',
}

export const RULES = { padrao: 'default', media: 'average', de: 'by' }

export const DROP_CAUSES = {
  ja_visto: 'seen',
  trocado: 'swapped',
  restricao: 'constraint',
  veto: 'veto',
  nota_minima: 'min_rating',
}

export const REACTION_KINDS = { nota: 'rating', relato: 'report' }

export const REACTIONS = {
  gostou: 'liked',
  neutro: 'neutral',
  'não gostou': 'disliked',
}

/** A Veto target or an open question's subject: a tag group is renamed, a
 * Catalog id or a film is kept. */
const target = closed(TAG_GROUPS, true)

export const person: Shape = map({
  nome: 'name',
  apelidos: ['aliases', list(free)],
  dono: 'owner',
  email: 'email',
  admin: 'admin',
  vetos: [
    'vetoes',
    list(
      map({
        texto: 'text',
        alvo: ['target', target],
        rotulo: 'label',
        data: 'date',
      }),
    ),
  ],
  ajustes: [
    'adjustments',
    list(
      map({
        elo: ['link', closed(LINKS)],
        nivel: ['level', closed(LEVELS)],
        data: 'date',
      }),
    ),
  ],
  perguntas_abertas: [
    'open_questions',
    list(
      map({
        texto: 'text',
        assunto: ['subject', target],
        rotulo: 'label',
        data: 'date',
        puladas: 'skips',
      }),
    ),
  ],
  imports: [
    'imports',
    list(
      map({
        tipo: 'kind',
        arquivo: 'file',
        data: 'date',
        original: 'original',
        sha256: 'sha256',
      }),
    ),
  ],
})

const constraint = map({
  nome: ['name', closed(CONSTRAINTS)],
  desde: 'since',
  ate: 'until',
  idioma: 'language',
  idade: 'age',
  ate_faixa: 'max_age_rating',
  temas: ['themes', anything],
  filmes: ['films', anything],
  titulos: ['titles', anything],
})

const context = map({
  pedido: 'request',
  duracao_max: 'max_duration',
  clima: ['moods', anything],
  restricoes: ['constraints', list(constraint)],
})

const rule = map({ nome: ['name', closed(RULES)], pessoa: 'person' })

const film = {
  posicao: 'position',
  id: 'id',
  titulo: 'title',
} as const

const drop = map({
  ...film,
  motivo: ['cause', closed(DROP_CAUSES)],
  pessoas: ['people', list(free)],
  pessoa: 'person',
  texto: 'text',
  restricao: ['constraint', closed(CONSTRAINTS)],
  rotulo: 'label',
})

const reply = map({
  data: 'date',
  acrescentar: 'addition',
  filmes: [
    'films',
    list(
      map({
        posicao: 'position',
        id: 'id',
        estrelas: 'stars',
        comentario: 'comment',
      }),
    ),
  ],
})

/** What a Session version holds, at the top of the frontmatter (the current
 * one) and in each item of `versoes` (the earlier ones). */
const versionFields = {
  presentes: ['attendees', list(free)],
  contexto: ['context', context],
  regra: ['rule', rule],
  recomendacao: ['recommendation', list(map({ ...film, novo: 'new' }))],
  mostrados: ['shown', list(map(film))],
  mantidos: ['kept', list(free)],
  saidas: ['dropped', list(drop)],
  respostas: ['replies', list(reply)],
  trocados: ['swapped', list(free)],
} as const

export const session: Shape = map({
  data: 'date',
  dono: 'owner',
  ...versionFields,
  escolhido: 'chosen',
  escolhido_na_recomendacao: 'chosen_in_recommendation',
  escolhido_nos_mostrados: 'chosen_in_shown',
  feedback: [
    'feedback',
    map({
      registrado_em: 'recorded_on',
      reacoes: [
        'reactions',
        list(
          map({
            pessoa: 'person',
            tipo: ['kind', closed(REACTION_KINDS)],
            nota: 'rating',
            nota_original: 'original_rating',
            repassada: 'relayed',
            reacao: ['reaction', closed(REACTIONS)],
            comentario: 'comment',
          }),
        ),
      ],
    }),
  ],
  refeita_em: 'redone_on',
  versoes: [
    'versions',
    list(map({ versao: 'version', data: 'date', ...versionFields })),
  ],
})

export const RESOLUTION_STATUSES = {
  tmdb: 'tmdb',
  minisserie: 'miniseries',
  pendente: 'pending',
  confirmado: 'confirmed',
  descartado: 'discarded',
}

/** `imports/letterboxd.md`: the resolutions of the Letterboxd import. */
export const letterboxdResolutions: Shape = map({
  filmes: [
    'films',
    list(
      map({
        id: 'id',
        nome: 'name',
        ano: 'year',
        data: 'date',
        fonte: 'source',
        tipo: ['kind', closed({ declarado: 'stated' })],
        situacao: ['status', closed(RESOLUTION_STATUSES)],
        filme: 'film',
        entrada: 'input',
        razao: 'discard_reason',
        tmdb: 'tmdb',
      }),
    ),
  ],
})
