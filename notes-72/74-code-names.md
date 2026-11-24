# PT → EN keys for the migration (#77)

Source of truth for ticket #77's script, written by #74 from the GLOSSARY code names (branch `ticket/74-agents-adrs`, `GLOSSARY.md`, ADR 0001 and 0002).

How the key list was gathered: every frontmatter dict the Python engine writes, collected by instrumenting `filmes/dados/markdown.escrever` during the full pytest run (421 tests), plus `tests/fixture/dados` and every `config/*.toml`. Paths use `[]` for list items.

Rules:

- Keys are snake_case. A key is renamed wherever it appears at the path given; the same PT word can map differently at different paths (see `data`, `tipo`, `nome`, `motivo`, `razao`).
- Closed-list values are renamed too (section "Values"). Free text values stay as written: `texto`, `rotulo`, `comentario`, `pedido`, `acrescentar`, `razao`, `fonte` strings, `titulo`, Clima names, `original`.
- Markdown bodies stay PT-BR and untouched: `## Declarados`, `## Relatos`, `## Já vistos` lines in a Pessoa, and the `## Recomendação` block in a Session (its `Força:`/`Tipo:` labels included; the TS reader parses the PT body).
- IDs (`tt…`, `Q…`, slugs, Session ids) never change.
- The round-trip PT → EN → PT must give byte-identical files: keep key order and YAML style (`yaml.safe_dump(..., sort_keys=False, default_flow_style=None, allow_unicode=True)`).

## Pessoa (`pessoas/<slug>.md`)

| PT | EN |
|---|---|
| `nome` | `name` |
| `apelidos` | `aliases` |
| `dono` | `owner` |
| `vetos` | `vetoes` |
| `vetos[].texto` | `vetoes[].text` |
| `vetos[].alvo` | `vetoes[].target` |
| `vetos[].rotulo` | `vetoes[].label` |
| `vetos[].data` | `vetoes[].date` |
| `ajustes` | `adjustments` |
| `ajustes[].elo` | `adjustments[].link` |
| `ajustes[].nivel` | `adjustments[].level` |
| `ajustes[].data` | `adjustments[].date` |
| `perguntas_abertas` | `open_questions` |
| `perguntas_abertas[].texto` | `open_questions[].text` |
| `perguntas_abertas[].assunto` | `open_questions[].subject` |
| `perguntas_abertas[].rotulo` | `open_questions[].label` |
| `perguntas_abertas[].data` | `open_questions[].date` |
| `perguntas_abertas[].puladas` | `open_questions[].skips` |
| `imports` | `imports` |
| `imports[].tipo` | `imports[].kind` |
| `imports[].arquivo` | `imports[].file` |
| `imports[].data` | `imports[].date` |
| `imports[].original` | `imports[].original` |
| `imports[].sha256` | `imports[].sha256` |

New keys from map #72 (born in English, nothing to migrate): `email`, `admin`.

## Session (`sessoes/<id>.md`)

Directory: `sessoes/` → `sessions/`, `pessoas/` → `people/`, `imports/` stays. (Decision for #77: rename the folders in the same cutover commit; Session ids and slugs keep their names.)

| PT | EN |
|---|---|
| `data` | `date` |
| `presentes` | `attendees` |
| `dono` | `owner` |
| `contexto` | `context` |
| `contexto.pedido` | `context.request` |
| `contexto.duracao_max` | `context.max_duration` |
| `contexto.clima` | `context.moods` |
| `contexto.restricoes` | `context.constraints` |
| `contexto.restricoes[].nome` | `context.constraints[].name` |
| `contexto.restricoes[].desde` (year) | `context.constraints[].since` |
| `contexto.restricoes[].ate` (year) | `context.constraints[].until` |
| `contexto.restricoes[].idioma` (language) | `context.constraints[].language` |
| `contexto.restricoes[].idade` (child) | `context.constraints[].age` |
| `contexto.restricoes[].ate_faixa` (child) | `context.constraints[].max_age_rating` |
| `contexto.restricoes[].temas` (trigger) | `context.constraints[].themes` |
| `contexto.restricoes[].filmes` (similar) | `context.constraints[].films` |
| `contexto.restricoes[].titulos` (similar) | `context.constraints[].titles` |
| `regra` | `rule` |
| `regra.nome` | `rule.name` |
| `regra.pessoa` | `rule.person` |
| `escolhido` | `chosen` |
| `escolhido_na_recomendacao` | `chosen_in_recommendation` |
| `escolhido_nos_mostrados` | `chosen_in_shown` |
| `feedback` | `feedback` |
| `feedback.registrado_em` | `feedback.recorded_on` |
| `feedback.reacoes` | `feedback.reactions` |
| `feedback.reacoes[].pessoa` | `feedback.reactions[].person` |
| `feedback.reacoes[].tipo` | `feedback.reactions[].kind` |
| `feedback.reacoes[].nota` | `feedback.reactions[].rating` |
| `feedback.reacoes[].nota_original` | `feedback.reactions[].original_rating` |
| `feedback.reacoes[].repassada` | `feedback.reactions[].relayed` |
| `feedback.reacoes[].reacao` | `feedback.reactions[].reaction` |
| `feedback.reacoes[].comentario` | `feedback.reactions[].comment` |
| `recomendacao` | `recommendation` |
| `recomendacao[].posicao` | `recommendation[].position` |
| `recomendacao[].id` | `recommendation[].id` |
| `recomendacao[].titulo` | `recommendation[].title` |
| `recomendacao[].novo` | `recommendation[].new` |
| `mostrados` | `shown` |
| `mostrados[].posicao` / `.id` / `.titulo` | `shown[].position` / `.id` / `.title` |
| `refeita_em` | `redone_on` |
| `mantidos` | `kept` |
| `saidas` | `dropped` |
| `saidas[].posicao` / `.id` / `.titulo` | `dropped[].position` / `.id` / `.title` |
| `saidas[].motivo` | `dropped[].cause` |
| `saidas[].pessoas` (cause seen) | `dropped[].people` |
| `saidas[].pessoa` (cause veto) | `dropped[].person` |
| `saidas[].texto` (cause veto) | `dropped[].text` |
| `saidas[].restricao` (cause constraint) | `dropped[].constraint` |
| `saidas[].rotulo` | `dropped[].label` |
| `trocados` | `swapped` |
| `respostas` | `replies` |
| `respostas[].data` | `replies[].date` |
| `respostas[].acrescentar` | `replies[].addition` |
| `respostas[].filmes` | `replies[].films` |
| `respostas[].filmes[].posicao` / `.id` | `replies[].films[].position` / `.id` |
| `respostas[].filmes[].estrelas` | `replies[].films[].stars` |
| `respostas[].filmes[].comentario` | `replies[].films[].comment` |
| `versoes` | `versions` |
| `versoes[].versao` | `versions[].version` |
| `versoes[].data` | `versions[].date` |
| `versoes[].<key>` | same mapping as the top-level key: `presentes`, `contexto…`, `regra…`, `recomendacao…`, `mostrados…`, `mantidos`, `saidas…`, `respostas…`, `trocados` |

## Letterboxd resolutions (`imports/letterboxd.md`)

| PT | EN |
|---|---|
| `filmes` | `films` |
| `filmes[].id` | `films[].id` |
| `filmes[].nome` | `films[].name` |
| `filmes[].ano` | `films[].year` |
| `filmes[].data` | `films[].date` |
| `filmes[].fonte` | `films[].source` |
| `filmes[].tipo` | `films[].kind` |
| `filmes[].situacao` | `films[].status` |
| `filmes[].filme` | `films[].film` |
| `filmes[].entrada` | `films[].input` |
| `filmes[].razao` | `films[].discard_reason` |
| `filmes[].motivo` (legacy, read as `razao`) | `films[].discard_reason` |
| `filmes[].tmdb` | `films[].tmdb` |

## Values

| Where | PT | EN |
|---|---|---|
| `adjustments[].link` | `diretor`, `roteiro`, `elenco`, `serie`, `genero` | `director`, `writer`, `cast`, `series`, `genre` |
| `adjustments[].level` | `nada`, `pouco`, `muito` (`normal` is never written) | `none`, `low`, `high` (`normal`) |
| `rule.name` | `padrao`, `media`, `de` (legacy string `media-sem-miseria-com-justica` = `padrao`) | `default`, `average`, `by` |
| `context.constraints[].name` | `ano`, `crianca`, `duracao`, `fora_da_sessao`, `gatilho`, `idioma`, `parecido`, `sem_ja_visto`, `sem_lento`, `sem_tristeza`, `sem_repetido` (legacy) | `year`, `child`, `duration`, `out_of_session`, `trigger`, `language`, `similar`, `unseen`, `no_slow`, `no_sad`, `no_repeat` |
| `dropped[].cause` | `ja_visto`, `trocado`, `restricao`, `veto`, `nota_minima` | `seen`, `swapped`, `constraint`, `veto`, `min_rating` |
| `dropped[].constraint` | constraint names | as `context.constraints[].name` |
| `feedback.reactions[].kind` | `nota`, `relato` | `rating`, `report` |
| `feedback.reactions[].reaction` | `gostou`, `neutro`, `não gostou` | `liked`, `neutral`, `disliked` |
| `films[].status` | `tmdb`, `minisserie`, `pendente`, `confirmado`, `descartado` | `tmdb`, `miniseries`, `pending`, `confirmed`, `discarded` |
| `films[].kind` | `declarado` | `stated` |
| `films[].source` | `Dono` | unchanged (a Source name, prose) |
| `imports[].kind` | `letterboxd`, `letterboxd-rss`, `trakt` | unchanged |
| `vetoes[].target`, `open_questions[].subject` when a tag group | `comedia_boba`, `lento` | `silly_comedy`, `slow` (same as the `tag_vetoes.toml` tables) |

## config

File names: `pesos.toml` → `weights.toml`, `climas.toml` → `moods.toml`, `grupo_sozinho.toml` → `group_alone.toml`, `tristeza.toml` → `sadness.toml`, `vetos_por_tag.toml` → `tag_vetoes.toml`, `versoes-catalogo.json` → `catalog-versions.json` (its keys are out of #77's TOML scope; map them in the same pass if the TS engine reads it). `local.toml` keeps its name (it is outside git, so the script migrates it only when pointed at it): `[caminhos]` → `[paths]`, with `dados` → `data`, `catalogo` → `catalog`, `versoes` → `versions`, `banco` → `database`, `cache` → `cache`, `gravacoes` → `recordings`. The `FILMES_*` environment variable names are #73/#79's call, not #77's.

### `pesos.toml` → `weights.toml`

| PT | EN |
|---|---|
| `[forca.multiplicador]` `forte`, `moderada`, `fraca`, `palpite` | `[strength.multiplier]` `strong`, `moderate`, `weak`, `guess` |
| `[caminho.peso]` `diretor`, `roteiro`, `serie`, `elenco`, `genero` | `[path.weight]` `director`, `writer`, `series`, `cast`, `genre` |
| `[utilidade]` `k`, `evidencias_maximas` | `[utility]` `k`, `max_evidence` |
| `[ajuste.nivel]` `nada`, `pouco`, `normal`, `muito` | `[adjustment.level]` `none`, `low`, `normal`, `high` |
| `[catalogo]` `votos_minimos`, `nota_imdb_minima` | `[catalog]` `min_votes`, `min_imdb_rating` |
| `[recomendacao]` `tamanho` | `[recommendation]` `size` |
| `[ja_visto]` `peso` | `[seen]` `weight` |
| `[credito]` `fator`, `janela` | `[credit]` `factor`, `window` |
| `[vizinhanca]` `peso` | `[neighbors]` `weight` |
| `[clima]` `peso` | `[mood]` `weight` |
| `[grupo]` `peso` | `[group]` `weight` |
| `[pessoas]` `peso_dito` | `[people]` `statement_weight` |
| `[restricoes]` `alcance_sob_demanda` | `[constraints]` `on_demand_reach` |
| `[vetos_por_tag]` `relevancia_minima`, `usuarios_minimos` | `[tag_vetoes]` `min_relevance`, `min_users` |
| `[nota_imdb]` `peso` | `[imdb_rating]` `weight` |
| `[sem_tristeza]` `usuarios_triste`, `usuarios_tema_pesado`, `relevancia_minima` | `[no_sad]` `min_users_sad`, `min_users_heavy_theme`, `min_relevance` |
| `[parecido]` `candidatos`, `tags_genoma`, `tags_genoma_consideradas`, `tags_movielens` | `[similar]` `candidates`, `genome_tags`, `genome_tags_considered`, `movielens_tags` |
| `[parecido.peso]` `genoma`, `tags_movielens`, `vizinhos`, `genero`, `pessoas` | `[similar.weight]` `genome`, `movielens_tags`, `neighbors`, `genre`, `people` |

### `climas.toml` → `moods.toml`

Table names are Clima names the Dono types (`leve`, `"pra rir"`, `tenso`, `"romântico"`, `"pra chorar"`, `"pra pensar"`, `assustador`, `"ação"`): unchanged. Keys: `tags` → `tags`, `generos` → `genres`.

### `grupo_sozinho.toml` → `group_alone.toml`

`grupo` → `group`, `sozinho` → `alone`.

### `tristeza.toml` → `sadness.toml`

`[triste]` → `[sad]`, `[tema_pesado]` → `[heavy_theme]` (also the signal names `triste`/`tema_pesado` in `no_sad` output); keys `tags`, `wikidata` unchanged.

### `vetos_por_tag.toml` → `tag_vetoes.toml`

`[comedia_boba]` → `[silly_comedy]`, `[lento]` → `[slow]` (group keys, also stored in Veto targets and open-question subjects); `rotulo` → `label` (value stays PT), `generos_imdb` → `imdb_genres`, `tags` unchanged.
