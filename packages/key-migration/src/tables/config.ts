// `config/`: Portuguese file names, tables and keys → English, from the
// GLOSSARY code names (ADR 0002). Comments stay PT-BR, as do the Clima names
// (the tables of `climas.toml`) and a tag group's `rotulo` value.

import type { TomlShape } from '../rewrite-toml.ts'
import { entries, map, type Shape } from '../shape.ts'

const same = <const K extends string>(...keys: K[]) =>
  Object.fromEntries(keys.map((k) => [k, k])) as Record<K, K>

export const weights: TomlShape = {
  tables: {
    'forca.multiplicador': {
      name: 'strength.multiplier',
      keys: {
        forte: 'strong',
        moderada: 'moderate',
        fraca: 'weak',
        palpite: 'guess',
      },
    },
    'caminho.peso': {
      name: 'path.weight',
      keys: {
        diretor: 'director',
        roteiro: 'writer',
        serie: 'series',
        elenco: 'cast',
        genero: 'genre',
      },
    },
    utilidade: {
      name: 'utility',
      keys: { k: 'k', evidencias_maximas: 'max_evidence' },
    },
    'ajuste.nivel': {
      name: 'adjustment.level',
      keys: { nada: 'none', pouco: 'low', normal: 'normal', muito: 'high' },
    },
    catalogo: {
      name: 'catalog',
      keys: { votos_minimos: 'min_votes', nota_imdb_minima: 'min_imdb_rating' },
    },
    recomendacao: { name: 'recommendation', keys: { tamanho: 'size' } },
    ja_visto: { name: 'seen', keys: { peso: 'weight' } },
    credito: { name: 'credit', keys: { fator: 'factor', janela: 'window' } },
    vizinhanca: { name: 'neighbors', keys: { peso: 'weight' } },
    clima: { name: 'mood', keys: { peso: 'weight' } },
    grupo: { name: 'group', keys: { peso: 'weight' } },
    pessoas: { name: 'people', keys: { peso_dito: 'statement_weight' } },
    restricoes: {
      name: 'constraints',
      keys: { alcance_sob_demanda: 'on_demand_reach' },
    },
    vetos_por_tag: {
      name: 'tag_vetoes',
      keys: {
        relevancia_minima: 'min_relevance',
        usuarios_minimos: 'min_users',
      },
    },
    nota_imdb: { name: 'imdb_rating', keys: { peso: 'weight' } },
    sem_tristeza: {
      name: 'no_sad',
      keys: {
        usuarios_triste: 'min_users_sad',
        usuarios_tema_pesado: 'min_users_heavy_theme',
        relevancia_minima: 'min_relevance',
      },
    },
    parecido: {
      name: 'similar',
      keys: {
        candidatos: 'candidates',
        tags_genoma: 'genome_tags',
        tags_genoma_consideradas: 'genome_tags_considered',
        tags_movielens: 'movielens_tags',
      },
    },
    'parecido.peso': {
      name: 'similar.weight',
      keys: {
        genoma: 'genome',
        tags_movielens: 'movielens_tags',
        vizinhos: 'neighbors',
        genero: 'genre',
        pessoas: 'people',
      },
    },
  },
}

/** The Clima names are the tables, and the Dono types them: they stay. */
export const moods: TomlShape = {
  tables: {},
  anyTable: { tags: 'tags', generos: 'genres' },
}

export const groupAlone: TomlShape = {
  tables: { '': { name: '', keys: { grupo: 'group', sozinho: 'alone' } } },
}

export const sadness: TomlShape = {
  tables: {
    triste: { name: 'sad', keys: same('tags') },
    tema_pesado: { name: 'heavy_theme', keys: same('tags', 'wikidata') },
  },
}

/** The tag groups a Veto can name. Their keys are also stored in filmes-dados
 * (a Veto target, an open question's subject): see `TAG_GROUPS`. */
export const TAG_GROUPS = { comedia_boba: 'silly_comedy', lento: 'slow' }

const tagGroupKeys = {
  rotulo: 'label',
  generos_imdb: 'imdb_genres',
  tags: 'tags',
}

export const tagVetoes: TomlShape = {
  tables: Object.fromEntries(
    Object.entries(TAG_GROUPS).map(([pt, en]) => [
      pt,
      { name: en, keys: tagGroupKeys },
    ]),
  ),
}

/** `config/local.toml`, outside git: migrated only when it is in the folder
 * the script is pointed at. */
export const local: TomlShape = {
  tables: {
    caminhos: {
      name: 'paths',
      keys: {
        dados: 'data',
        catalogo: 'catalog',
        versoes: 'versions',
        banco: 'database',
        cache: 'cache',
        gravacoes: 'recordings',
      },
    },
  },
}

/** The dumps of `versoes-catalogo.json`, by file name (which stays). */
export const catalogDumps: Shape = entries(
  map({
    bytes: 'bytes',
    data: 'date',
    fonte: 'source',
    sha256: 'sha256',
    url: 'url',
  }),
)

/** `versoes-catalogo.json`, the manifest of the pinned dumps. */
export const catalogVersions: Shape = map({ dumps: ['dumps', catalogDumps] })

export type ConfigFile =
  | { readonly kind: 'toml'; readonly name: string; readonly shape: TomlShape }
  | { readonly kind: 'json'; readonly name: string; readonly shape: Shape }

/** Every file of `config/`, by its Portuguese name. */
export const CONFIG_FILES: Readonly<Record<string, ConfigFile>> = {
  'pesos.toml': { kind: 'toml', name: 'weights.toml', shape: weights },
  'climas.toml': { kind: 'toml', name: 'moods.toml', shape: moods },
  'grupo_sozinho.toml': {
    kind: 'toml',
    name: 'group_alone.toml',
    shape: groupAlone,
  },
  'tristeza.toml': { kind: 'toml', name: 'sadness.toml', shape: sadness },
  'vetos_por_tag.toml': {
    kind: 'toml',
    name: 'tag_vetoes.toml',
    shape: tagVetoes,
  },
  'local.toml': { kind: 'toml', name: 'local.toml', shape: local },
  'versoes-catalogo.json': {
    kind: 'json',
    name: 'catalog-versions.json',
    shape: catalogVersions,
  },
}
