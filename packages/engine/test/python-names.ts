// The Python engine's closed-list names and the English names the engine
// uses for them (ADR 0002), as the key migration recorded them before it was
// retired (#135). The derived database still stores the Portuguese values, so
// the tests keep checking the engine's own mappings against these.

/** A Constraint name. */
export const CONSTRAINTS: Readonly<Record<string, string>> = {
  "ano": "year",
  "crianca": "child",
  "duracao": "duration",
  "fora_da_sessao": "out_of_session",
  "gatilho": "trigger",
  "idioma": "language",
  "parecido": "similar",
  "sem_ja_visto": "unseen",
  "sem_lento": "no_slow",
  "sem_tristeza": "no_sad",
  "sem_repetido": "no_repeat"
}

/** An Adjustment link, also a content path. */
export const LINKS: Readonly<Record<string, string>> = {
  "diretor": "director",
  "roteiro": "writer",
  "elenco": "cast",
  "serie": "series",
  "genero": "genre"
}

/** An Adjustment level. */
export const LEVELS: Readonly<Record<string, string>> = {
  "nada": "none",
  "pouco": "low",
  "normal": "normal",
  "muito": "high"
}

/** A Regra de escolha. */
export const RULES: Readonly<Record<string, string>> = {
  "padrao": "default",
  "media": "average",
  "de": "by"
}

/** Força. */
export const STRENGTHS: Readonly<Record<string, string>> = {
  "forte": "strong",
  "moderada": "moderate",
  "fraca": "weak",
  "palpite": "guess"
}

/** The Tipo of the Fato behind an Evidence. */
export const KINDS: Readonly<Record<string, string>> = {
  "metadado": "metadata",
  "nota": "rating",
  "declarado": "stated",
  "relato": "report",
  "review": "review",
  "palpite": "guess"
}

/** How a Declarado or a Relato feels about its target. */
export const STATEMENT_REACTIONS: Readonly<Record<string, string>> = {
  "ama": "love",
  "gosta": "like",
  "nao_gosta": "dislike",
  "odeia": "hate"
}

/** The tag groups a Veto can name. */
export const TAG_GROUPS: Readonly<Record<string, string>> = {
  "comedia_boba": "silly_comedy",
  "lento": "slow"
}

/** An error code. */
export const ERROR_CODES: Readonly<Record<string, string>> = {
  "uso_invalido": "invalid_usage",
  "arquivo_invalido": "invalid_file",
  "arquivo_ausente": "missing_file",
  "dados_invalidos": "invalid_data",
  "dados_ausentes": "missing_data",
  "config_invalida": "invalid_config",
  "config_ausente": "missing_config",
  "catalogo_invalido": "invalid_catalog",
  "catalogo_ausente": "missing_catalog",
  "banco_ausente": "missing_database",
  "banco_desatualizado": "outdated_database",
  "versoes_invalidas": "invalid_versions",
  "versoes_ausentes": "missing_versions",
  "atualizacao_falhou": "update_failed",
  "pessoa_desconhecida": "unknown_person",
  "pessoa_ambigua": "ambiguous_person",
  "pessoa_existente": "person_exists",
  "dono_existente": "owner_exists",
  "sessao_desconhecida": "unknown_session",
  "sessao_fechada": "closed_session",
  "alvo_desconhecido": "unknown_target",
  "filme_desconhecido": "unknown_film",
  "filme_ambiguo": "ambiguous_film",
  "filme_sem_imdb": "film_without_imdb",
  "fonte_indisponivel": "source_unavailable",
  "sql_invalido": "invalid_sql",
  "somente_leitura": "read_only",
  "rss_ausente": "missing_rss",
  "item_fora_da_fila": "item_not_queued",
  "import_desconhecido": "unknown_import",
  "import_ambiguo": "ambiguous_import",
  "interno": "internal",
  "declarado_desconhecido": "unknown_stated",
  "declarado_ambiguo": "ambiguous_stated",
  "relato_desconhecido": "unknown_report",
  "relato_ambiguo": "ambiguous_report",
  "veto_desconhecido": "unknown_veto",
  "veto_ambiguo": "ambiguous_veto",
  "visto_desconhecido": "unknown_seen",
  "visto_ambiguo": "ambiguous_seen",
  "pergunta_desconhecido": "unknown_open_question",
  "pergunta_ambiguo": "ambiguous_open_question"
}
