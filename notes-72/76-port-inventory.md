# #76 Engine port inventory, order and oracle design

Map: #72. Researched on `spec/72-online` at `bd87d87`, read-only. Python 3.14.4 with SQLite 3.46.1 in the repo's `.venv`; Node 24.21.0 ships SQLite 3.53.4 in `node:sqlite`.

## Summary

- The engine has 9,489 lines of Python in 117 files, plus 18 schema files, 14 CLI commands (two of them with subcommands), 13 MCP tools, 417 pytest tests in 42 files and 50 MCP tests in 13 files.
- Proposed order: shared building blocks first (Python-compat helpers, runtime, oracle), then Pessoas, then evidence and ranking, then Sessions, Feedback and the Cartaz, then imports, then evaluate, and reconstruct last. The work splits into 27 engine tickets, 3 MCP tickets and 7 web-app screen tickets.
- Four findings change the map's plan. Details are in "Findings that change the map".
  1. After cutover, the Python reconstruct on servidor-azul cannot read the English filmes-dados or the English `config/*.toml`.
  2. A blue/green database swap drops every write the VPS made since the build.
  3. The server needs a write lock and a per-request "run", which the per-process CLI never needed.
  4. "Dono" stops being one fixed Pessoa.
- The riskiest parity differences are below. The first three are the ones to watch.
  1. Python ≥3.12 `sum()` uses compensated (Neumaier) summation, so plain JavaScript addition breaks exact ties in the ranking.
  2. `fato_id` hashes Python's `str()` of numbers, so a REAL `4.0` hashes as `"4.0"`, and `node:sqlite` hands it back as `4`.
  3. Queries with no `ORDER BY` feed float accumulation and first-wins tie rules, and the two runtimes bundle different SQLite versions.
  4. Python's `round()` and `:.1f` round half to even on the exact binary value, so `round(2.5)` is 2 and `f"{1.25:.1f}"` is `"1.2"`, where JavaScript gives 3 and `"1.3"`.

All four were reproduced on this machine (see "Parity risks").

---

## 1. Inventory

### 1.1 CLI commands (`filmes/comandos/`, `python -m filmes <cmd> --json`)

| Command | Lines | What it does | Engine modules it reaches | pytest files that cover it |
|---|---|---|---|---|
| `reconstruir` | 11 | rebuilds the SQLite from the schema and the loading steps, then swaps it in atomically | `banco/reconstrucao`, every `banco/etapas/*`, `catalogo/*`, `importar/letterboxd`, `importar/trakt`, `sessao/banco`, `banco/pessoas` | test_reconstruir (4), test_ingestao (19); used by the `banco` fixture in about 35 files |
| `atualizar` | 18 | downloads the IMDb, Wikidata and GroupLens dumps and pins them in `config/versoes-catalogo.json`, with progress on stderr | `catalogo/atualizacao`, `wikidata`, `review`, `versoes` | test_ingestao, test_avaliar |
| `recomendar` | 96 | returns the Recomendação and opens or redoes the Sessão (`--sessao`, `--manter`, `--trocar`, every Restrição flag) | `recomendacao/*`, `sessao/*`, `sob_demanda/*` | test_recomendar (15), test_caminho_conteudo (8), test_vizinhanca (10), test_clima (14), test_grupo (14), test_cabecalho (13), test_restricoes (34), test_restricao_ano (8), test_restricao_tristeza (11), test_sem_lento (3), test_veto_por_tag_e_nota_imdb (6), test_veto_subgeneros (3), test_ajuste_e_corte (9), test_parecido (12), test_parecido_na_sessao (11), test_fora_da_sessao (10), test_regerar_mantidos (11), test_refazer_sessao (5), test_sessoes (9), test_credito (14) |
| `feedback` | 20 | records the Filme escolhido and the reactions, then closes the Sessão | `sessao/feedback`, `fatos`, `banco`, `dados/nota` | test_feedback (18), test_credito, test_sessoes |
| `sessoes-abertas` | 11 | lists Sessions without Feedback, newest first | `sessao/__init__`, `arquivo` | test_sessoes, test_feedback, test_refazer_sessao |
| `cartaz` (+ `cartaz responder`) | 43 | writes the HTML Cartaz and records `mostrados`; `responder` reads the pasted `#cartaz` text from stdin | `cartaz/__init__`, `cartaz/responder`, `cartaz.js`/`.css` | test_cartaz (8), test_cartaz_mostrados (4), test_cartaz_guarda (2), test_cartaz_responde (12), test_cartaz_responder (18) |
| `verificar` | 13 | checks the Claude answer's Evidence lines against the recorded Sessão | `verificar/` | test_verificar (12) |
| `pessoa` (`criar`, `ver`, `declarar`, `relatar`, `vetar`, `visto`, `ajustar`, `pular`, `perguntas`, `remover`) | 409 | the Pessoa registry and taste writes | `dados/pessoas`, `banco/pessoas`, `recomendacao/vetos`, `sessao/feedback`, `evidencia/regua` | test_pessoa (30), test_pessoa_visto (7), test_perguntas_abertas (9), test_pessoa_remover (8), test_ajuste_e_corte |
| `importar` (`--letterboxd`, `--letterboxd-rss`, `--trakt`, `--remover`) | 29 | Letterboxd ZIP or RSS, Trakt ZIP, and removing an import | `importar/*`, `sob_demanda/tmdb` | test_letterboxd (13), test_letterboxd_rss (6), test_trakt (4), test_importar_remover (4) |
| `fila` (`ver`, `confirmar`, `descartar`, `reprocessar`) | 31 | the Letterboxd resolution queue | `importar/fila`, `decisoes`, `letterboxd`, `sob_demanda/tmdb` | test_letterboxd, test_letterboxd_rss, test_fila_reprocessar (4) |
| `exportar` | 20 | writes the IMDb CSV a Pessoa's Notas go into (MovieLens import) | `exportar/imdb` | test_exportar (3) |
| `consultar` | 37 | read-only SQL through an authorizer (SELECT, READ, FUNCTION, RECURSIVE) | `banco` | test_consultar (3), and the `cli.consultar` helper used in about 30 files |
| `avaliar` | 22 | offline recall and coverage, recent Feedback, the weight grid and a dated report | `avaliacao/*`, `catalogo/vizinhos`, `recomendacao` | test_avaliar (6) |
| (the contract itself) | — | errors come out as `{"erro":{codigo,mensagem}}` with exit code 2 for `uso_invalido` | `cli.py`, `erros.py` | test_erros (3) |

### 1.2 Modules under `filmes/` (lines, role, internal dependencies)

**Contract and runtime**
- `cli.py` (66): argparse discovery of `comandos/*`, the JSON contract and exit codes. Replaced by the thin TS CLI plus engine functions.
- `ambiente.py` (110): paths (`FILMES_*` env or `config/local.toml`), `pesos.toml`, and `hoje` from `FILMES_HOJE`. **`RAIZ/config/*.toml` paths are hard-coded** for `climas`, `grupo_sozinho`, `vetos_por_tag` and `tristeza`.
- `erros.py` (11): `ErroFilmes(codigo, mensagem)`.

**`banco/` (778, the derived SQLite)**
- `__init__.py`: `abrir_leitura` (mode=ro) and `fato_id(tabela, *valores)` = `tabela:` + `sha1("\x1f".join(str(v)))[:12]`.
- `reconstrucao.py`: applies `esquema/NN_*.sql` in name order and runs `etapas/NN_*.py` in name order into a temp file, then calls `os.replace`.
- `pessoas.py` (157): loads and `sincronizar`s one Pessoa's facts (vetos, ajustes, perguntas, ditos, vistos) and deletes them by `fato_id LIKE` prefix. Depends on `dados.pessoas`.
- `esquema/` (18 files: catalog, public metadata, IMDb genres, cast, series, Wikidata subclasses, pessoas, gosto, ajustes, perguntas, notas, letterboxd, sessoes, comentarios, review, parecenca, restricoes, imported vistos). Views include `notas_vigentes` and `ja_vistos`.
- `etapas/` (106): `10_pessoas`, `11_catalogo_real` (skipped when the catalog folder has `filmes.csv`, which is the fixture), `12_subgeneros`, `20_tabelas_csv`, `21_series_de_filmes`, `31_letterboxd`, `32_trakt`, `40_sessoes`, `60_faixas_etarias`, `70_parecenca` (registers the `ln` and `ln1p` SQL functions).

**`catalogo/` (1,044, used only by reconstruct and atualizar, except `generos` and `classificacao`)**
- `atualizacao.py` (217): HTTP downloads, gzip, zip, ijson, then manifest swap.
- `versoes.py` (89): the sha256 manifest and `fonte_e_data`.
- `wikidata.py` (111): SPARQL queries and incremental JSON reading (ijson).
- `imdb.py` (64): TSVs to `filmes` and `adultos`.
- `grafo.py` (121): Wikidata triples to `arestas`, idioms and ratings.
- `elenco.py` (45): top 3 credits and P345.
- `review.py` (122): GroupLens genome and tags, and `contar_tags`.
- `vizinhos.py` (68): **numpy/scipy CSR item-item top 50**, shared with `avaliar`.
- `subgeneros.py` (16), `tabelas.py` (50, CSV → table, the fixture path).
- `classificacao.py` (68): age-rating conversion, used by the child restriction too.
- `generos.py` (67): the PT genre table, used by vetos and the header.

**`dados/` (522, filmes-dados files)**
- `markdown.py` (29): PyYAML `safe_load` and `safe_dump(sort_keys=False, default_flow_style=None)`.
- `pessoas.py` (462): Pessoa frontmatter plus body sections (`## Declarados`, `## Relatos`, `## Já vistos`, line format `data · fonte · específico · reação alvo (ID) · "texto"`), resolve by slug, name or nickname, and `slug_de` (NFKD to ASCII).
- `nota.py` (24): `"4"`, `"4,5"` and `"9/10"` scales.

**`evidencia/` (297)**
- `__init__.py`: the `Evidencia` dataclass, `contribuicao = base × multiplier`, `como_json` (rounds to 4 places), `sem_fato`, `linha_do_pedido`.
- `regua.py` (190): every Força rule and `TETO_DO_ELO`.
- `texto.py` (44): PT wording (`nota` via `:g`, thousands with `.`, `1h44`).

**`recomendacao/` (2,363)**
- `__init__.py` (250): orchestration. Candidates → vetos → Restrições → signals → credit → three ordering bands → on-demand approval within `alcance` → output.
- `candidatos.py` (31), `regra.py` (48, padrão/média/de, neutral 0.5), `utilidade.py` (18, top-N cut and sigmoid), `presentes.py` (33, `COLLATE NOCASE` resolve), `climas.py` (46), `vetos.py` (114, entity, film, subgenre and tag group), `cabecalho.py` (43, TMDB pt-BR card and `primeira_frase`), `atribuicoes.py` (33), `mantidos.py` (147, regenerate-with-keep), `parecenca.py` (230, the similarity measure).
- `sinais/` (411): `conteudo` (149), `declarados` (52), `vizinhanca` (47), `ja_visto` (24), `nota_imdb` (35), `clima` (15), `grupo` (20) and the `_tags` helper (68, uses `Decimal` truncation).
- `restricoes/` (959): the framework in `__init__` (180: `avaliar`, `PENDENTE`, `resolver`, `herdar`, `troca_a_lista`, `aviso_da_lista`), plus `ano`, `crianca` (OMDb), `duracao`, `fora_da_sessao`, `gatilho` (DDD), `idioma`, `parecido`, `sem_ja_visto`, `sem_lento`, `sem_tristeza`.

**`sob_demanda/` (455)**: `fonte.py` (cache first, then the API, 3 tries with backoff 2s and 4s, disabled-for-the-run after a failure, warn once, `FILMES_GRAVACOES` recordings with `.falha.json {motivo, vezes}`), `cache.py` (a separate SQLite, `respostas(fonte, chave, corpo, obtido_em, expira_em)`), `omdb.py` (30 days), `ddd.py` (30 days, two requests), `tmdb.py` (182 days; keys `filme-<slug80>-<ano>-<sha256[:12]>`, `serie-…`, `externos-<id>`, `detalhes-<id>`, `find-<tconst>-pt-BR`; search pagination; v3 key or v4 bearer by length).

**`sessao/` (819)**: `arquivo.py` (227: the file format, `novo_id`, `ordem`, `corpo` and the inverse `filmes_do_corpo`), `banco.py` (60), `fatos.py` (134, the Fatos of a Feedback), `feedback.py` (198), `credito.py` (72), `__init__.py` (128: `abrir`, `refazer`, `mostrar`, `abertas`, `escrita` with `BEGIN IMMEDIATE`).

**`importar/` (1,227)**: `letterboxd.py` (462: the resolution chain of decision → TMDB id → local Wikidata → TMDB search, Year ± 1, miniseries, plus load and reprocess), `zip_letterboxd.py` (175, csv and `slug`), `rss_letterboxd.py` (131: XML and `parsedate_to_datetime`), `trakt.py` (123), `zip_trakt.py` (108), `fila.py` (87), `decisoes.py` (44, `imports/letterboxd.md`), `arquivos.py` (42, keeps the original uploads), `remover.py` (54).

**`cartaz/` (866)**: `__init__.py` (346: HTML generation and the per-Presente strongest Evidence), `responder.py` (299: parses `#cartaz <sessão> v<n>` and records Já vi, notes, Trocar, stars, comments and acrescentar), `cartaz.js` (146, Copiar pro chat and localStorage), `cartaz.css` (75).

**`verificar/`** (162), **`exportar/imdb.py`** (58), and **`avaliacao/`** (601: `__init__`, `offline` with TEMP views that shadow `main`, `pessoas`, `movielens` with `Random(27).sample` of 1,000 users, `grade` with `statistics.mean`, and `relatorio` with YAML in Markdown).

Third-party Python deps: `pyyaml`, `ijson`, `numpy` and `scipy` (only in `catalogo/vizinhos`).

### 1.3 MCP tools (`mcp/src/ferramentas/`, each shells out to the CLI)

| Tool | CLI | MCP tests | Fate in the map |
|---|---|---|---|
| `recomendar` | `recomendar` | servidor.test (most of the 20), parecido.test (4) | → `recommend` |
| `sessoes_abertas` | `sessoes-abertas` | servidor.test | → `open_sessions` |
| `registrar_feedback` | `feedback` | servidor.test, feedback.test (2) | → `record_feedback` |
| `cartaz` | `cartaz` | servidor.test | → the MCP Apps `ui://` Cartaz; no HTML file |
| `responder_cartaz` | `cartaz responder` | cartaz_responder.test (3) | → `answer_poster` (the text format stays the Enviar payload) |
| `verificar_resposta` | `verificar` | verificar.test (1) | → `verify_answer` |
| `pessoa` | `pessoa *` | pessoa.test (7), remover.test (3) | → `person` (or one tool per action, decided in M1b) |
| `importar` | `importar` | letterboxd.test (3), trakt.test (1), remover.test | RSS stays a tool; ZIP needs an upload, so the web app handles it |
| `fila_import` | `fila` | letterboxd.test | → `import_queue` |
| `exportar` | `exportar` | exportar.test (1) | writes a server path; becomes a download in the web app |
| `consultar` | `consultar` | servidor.test | → `consult`, `admin: true` only |
| `avaliar` | `avaliar --progresso` | avaliar.test (1) | → `evaluate`, `admin: true` only, with progress notifications |
| `atualizar` | `atualizar` | atualizar.test (1) | servidor-azul only; becomes a CLI step of `db:publish` and stops being a tool |

The skill (`skill/filmes/*.md`, 384 lines) moves into `instructions` and the tool descriptions.

### 1.4 Fixtures and test seams

- `tests/conftest.py`: the `cli` fixture runs a subprocess per call over a per-test copy of `tests/fixture/dados`, with `FILMES_HOJE=2026-11-20`. The `banco` fixture runs `reconstruir` first. No test imports `filmes`.
- `tests/fixture/catalogo/*.csv` (16 tables) is the CSV path. `tests/fixture/gravacoes/catalogo/*` holds the recorded dumps that test the real ingestion path through `atualizar`. `gravacoes/{omdb,ddd,tmdb,letterboxd}` hold 34 recorded responses. `letterboxd/olga/*.csv` and `trakt/*.json` are the import inputs.
- `mcp/test/*`: the SDK client over `InMemoryTransport`, calling the real Python CLI on the same fixture.

---

## 2. Dependencies and port order

### 2.1 Dependency layers (bottom up)

```
L0  py-compat (sum, round, format, str, casefold, slug), fact_id, errors
L1  runtime: Environment (paths, weights, today), SQLite service, config TOML, Markdown/YAML
L2  dados/pessoas + nota  ─┐        sob_demanda (cache, Source, OMDb, DDD, TMDB)
L3  banco/pessoas (sync)   │        evidencia (Evidence, regua, texto)
L4  recomendacao core: candidatos, presentes, regra, utilidade, vetos, climas, sinais/*, credito(read)
L5  restricoes framework + local ones → on-demand ones (crianca, gatilho) → parecenca/parecido
L6  sessao: arquivo, banco, fatos, abrir/abertas → refazer/mantidos/fora_da_sessao → feedback/credito line
L7  cartaz model + responder, verificar
L8  importar: letterboxd (zip → rss → fila), trakt, remover; exportar; consultar
L9  avaliacao (needs L4–L6 and catalogo/vizinhos.calcular)
L10 reconstruct: tabelas/etapas (fixture path) → real catalog ingestion (imdb, wikidata, grafo, elenco, review, vizinhos, subgeneros) → atualizar
```

Real cross-layer edges worth knowing:
- `sob_demanda/tmdb` imports `importar/zip_letterboxd.slug` and `recomendacao/atribuicoes`. Move `slug` into L0.
- `comandos/pessoa` imports `sessao/feedback` (to remove a Feedback comment) and `recomendacao/vetos` (group labels).
- `sessao/feedback` imports `recomendacao/presentes`.
- `cartaz` imports `recomendacao/restricoes` (labels) and `cabecalho`.
- `avaliacao/movielens` imports `catalogo/vizinhos` (numpy/scipy). In TS, `calcular` lands with evaluate and reconstruct reuses it.
- Reconstruct's loaders `10_pessoas`, `31_letterboxd`, `32_trakt` and `40_sessoes` are the same code the write commands use. They port early. Only the catalog half is "reconstruct last".

### 2.2 Order (ends with reconstruct)

1. Shared building blocks: py-compat helpers and fact ids, runtime and SQLite and the test seam, then the oracle harness.
2. Pessoas (files, sync, `pessoa` actions).
3. Evidence primitives, on-demand sources, ranking pipeline, Restrições, similarity.
4. Sessions (open/list, redo/keep/swap), Feedback, Cartaz model plus responder, verificar.
5. Imports (Letterboxd ZIP, RSS and queue, Trakt and remove), export, consult.
6. MCP tools in-process, plus the data reload and publish path. This is the launch gate.
7. Evaluate.
8. Reconstruct (fixture path, then the real catalog, then `atualizar`), the full real-DB parity run, and then Python leaves.

Until step 8, every TS test and the VPS read a database built by Python. The schema stays frozen, Portuguese table and column names included. Renaming the schema is its own ticket after Python leaves, if anyone wants it.

---

## 3. On-demand sources and cache in Effect

What the Python does, and what the Effect version must keep:

| Behaviour | Python | Effect v4 shape |
|---|---|---|
| API key | env var; without it, one warning and the source answers None | `Config.redacted("FILMES_TMDB_KEY")` (EN names per #77) read into a `SourceKeys` service; a missing key → the source starts `Disabled` with that warning |
| Transient retry | 3 tries; URLError, timeout, OSError, HTTP 429 and 5xx; sleep 2s, then 4s | `HttpClient` from `effect/unstable/http` with `FetchHttpClient.layer`; `Effect.retry({ schedule: Schedule.exponential("2 seconds"), times: 2, while: isTransient })`; 10s `Effect.timeout` per request; tests use `TestClock` |
| Disabled for the run | `Fonte.desligada`, one instance per source per `Contexto` | a per-run `Ref<Map<SourceName, Enabled \| Disabled>>` and `Ref<Array<warning>>` in a `Run` service built per request (`Layer.fresh`, scoped to the request), never module-global. On the server, a "run" is one tool call or one web request |
| 404 | "not found" body, which gets cached | the same; each client owns `notFound()` |
| OMDb key or limit error inside a 200 | `FalhaDaFonte` (not transient) → disable | a tagged `SourceFailure` with `transient: false` |
| TMDB search pagination | follows `total_pages` | the same, inside one cached entry |
| Cache | `<banco>-cache.sqlite` or `FILMES_CACHE`; `expira_em > hoje`; failures are never cached | the same schema and keys, so a cache filled by Python is readable by TS (the oracle relies on this). On the server: `journal_mode=WAL`, `busy_timeout`, one shared connection, writes via `INSERT OR REPLACE`. The file lives in the volume beside the DB versions, outside the swap |
| Recordings | `FILMES_GRAVACOES/<pasta>/<chave>.json`; missing = not found; `<chave>.falha.json {motivo, vezes?}` fails the first N calls then reads the file, and without `vezes` always fails | a `Transport` service with `Live` (HttpClient) and `Recorded(dir)` layers reading **the same files**; the `vezes` counter lives in the per-run state; no sleeping in `Recorded` |
| Keys | `slug(título)[:80]` + `sha256(título)[:12]` | needs `slug` and sha256 over UTF-8 to match exactly (L0 golden vectors) |
| Attribution and warnings text | PT strings | unchanged (UI text) |

The Letterboxd RSS fetch follows the same rules but is not a cached `Fonte`. It has a recording at `gravacoes/letterboxd/rss-<user>.xml`.

---

## 4. Oracle design

### 4.1 Shape

A Node script in `packages/engine/oracle/` that is not shipped. Each scenario is a sequence of **steps in the Python CLI vocabulary** (argv plus optional stdin). Each step runs on both engines from the same starting state:

- **Python side:** `uv run python -m filmes <argv> --json`, with `FILMES_DADOS=<work>/py/dados` holding the **original PT files**, the PT config, `FILMES_BANCO=<work>/py/filmes.sqlite`, `FILMES_HOJE` pinned, `FILMES_GRAVACOES` or a cache copy, and `PYTHONHASHSEED=0`.
- **TS side:** an *argv adapter* (oracle-only, deleted with Python) parses the same argv and calls the engine's public operations, with `data` = `<work>/ts/data` holding **the copy migrated by #77's script**, the EN config, its own copy of the same starting DB, the same today and the same recordings or cache copy.
- **Starting state:** both sides get byte copies of one Python-built DB, so reads are compared on identical data. When TS reconstruct lands, a separate reconstruct scenario compares the DBs themselves (4.4).

### 4.2 Inputs

1. **Fixture, harvested from pytest.** A `conftest.py` hook (an env flag, off by default) appends each test's `cli.rodar` calls (argv, stdin, `env` overrides) as one scenario in JSONL. That gives about 417 scenarios, most of 1 to 15 steps, with coverage the suite already has. Hand-written scenarios add what the suite misses: multi-Presente groups with credit, every Restrição combination, `--parecido` on several references, redo chains.
2. **Real database sample.** This runs on servidor-azul, not in CI. It uses the full 2.9 GB DB plus a scratch copy of the real filmes-dados. A *sample* here means sampled requests, not a subset of the DB: cutting the catalog breaks the joins and the neighbourhood. A seeded generator (seed in the report) draws about 300 `recomendar` calls over real Pessoas: 1 to 3 Presentes, every Regra, `--clima` from the vocabulary, each Restrição alone and in pairs, `--quantos 20` so ranking ties past position 5 show up. It adds a redo with `--manter` and `--trocar` per tenth Sessão, Feedback on a third, `pessoa ver` for every Pessoa, `consultar` with a fixed SQL set, `cartaz` and `verificar` on every opened Sessão, and `sessoes-abertas`. On-demand sources: the Python pass runs first with live keys and a **fresh `FILMES_CACHE`**. TS then gets a byte copy of that cache with the same `hoje`, so TS never touches the network and sees exactly the responses Python saw.
3. **Reconstruct.** The fixture CSV path, the recorded-dumps path (`gravacoes/catalogo`), and a *catalog slice*: about 2,000 films cut from the real dumps by a script that keeps referential closure (Wikidata items, MovieLens ids, ratings of those films). The full real build is compared once in ticket E26.

### 4.3 Comparison

Per step, in this order:

1. **Exit status and error.** Exit code and `erro.codigo` must match exactly. `erro.mensagem` must match exactly too (it is PT user text), except for `uso_invalido`, whose argparse wording cannot be reproduced. There only the code is compared.
2. **JSON output.** Parse both sides. Map Python keys and enumerated values to EN with **the same key map #77's migration uses**, imported, not copied. Then compare deeply:
   - **Objects:** key order is ignored (Python dicts and JS objects differ, and JS reorders integer-like keys).
   - **Arrays:** order-sensitive by default, because rankings, evidence lists and `avisos` are ordered. A short allowlist of paths is compared as multisets, each entry with a reason (for example `restricoes.*` keys, `tabelas`).
   - **Numbers:** compared as numbers, so `4.0 == 4`. Exact by default, since the output is already rounded to 4 places. Fields that are not rounded (`avaliar` metrics, `credito` before rounding) get an absolute tolerance of 1e-9, declared per path.
   - **Strings:** compared exactly, because they are evidence text the verifier and the Claude copy word for word.
   - **Paths:** absolute paths (`arquivo`, `banco`) are normalized by replacing `<work>/py` and `<work>/ts` with `<work>`.
   - **Dates:** `FILMES_HOJE` is pinned (2026-11-20 for the fixture, a fixed date per real run). TS reads it through the same env into its Clock layer. Without it, "today" is the date in America/Sao_Paulo, not UTC (see risk R9).
3. **Data directory after the step.** Run the #77 migration on `py/dados` into a temporary EN copy, then compare it with `ts/data`. Frontmatter is compared as parsed YAML (semantic), with the same number rules. The body is compared byte for byte (Sessão body, Pessoa sections, `imports/letterboxd.md`). Files that exist on only one side are a difference. Upload copies under `imports/<slug>/` are compared by sha256.
4. **DB after write steps.** Rows of the tables the write commands touch (pessoas, apelidos, vetos, ajustes, perguntas_abertas, declarados, relatos, notas, ja_visto, sessoes, sessao_presentes, reacoes, comentarios, itens_letterboxd and the Trakt rows) are compared as multisets of rows, with REAL vs INTEGER folded and `fato_id` exact.
5. **Python self-check.** Each scenario runs on Python twice, with `PYTHONHASHSEED=0` and `=1`. A difference there is Python nondeterminism, not parity. It is reported apart and fixed in Python or allowlisted, so it never shows up as a TS bug.

### 4.4 Reconstruct comparison

Both engines build from the same inputs into separate files. For every table, compare `PRAGMA table_info` and the row multiset. REAL columns use a 1e-12 relative tolerance only for `tags_no_catalogo.valor` and `normas_tags_movielens.norma` (ln, log1p and sqrt), everything else is exact. Also compare `sqlite_master` SQL text for views and indexes, and the `reconstruir` JSON (`tabelas` counts). Byte equality of the files is **not** the goal (page layout and SQLite versions differ). The map's "identical database" should be read as "identical schema and identical rows".

### 4.5 Recorded decisions

`packages/engine/oracle/decisions.yaml` holds one entry per accepted difference: `id`, a scenario and path glob, the Python value pattern, the TS value pattern, the reason, and a link (ADR, issue or PR comment). The oracle fails on any difference that no entry matches, and also on an entry that matched nothing in a full run (a stale decision). The port tickets add entries. Nobody else does.

### 4.6 Where it runs

- **CI (`pr.yml`):** the fixture oracle, both engines. The CI from #73 already has `uv`.
- **servidor-azul, on demand:** `pnpm oracle --real` writes a dated report under `docs/oracle/`. This is an agent or user step on that machine. The CI runner has no 2.9 GB DB.

---

## 5. Parity risks (Python vs TypeScript)

Ranked by how likely each one is to change something a person sees.

| # | Difference | Where in the engine | Reproduced | Port rule |
|---|---|---|---|---|
| R1 | **`sum()` of floats is compensated (Neumaier) since Python 3.12**: `sum([0.1]*10) == 1.0`; JS `reduce` gives `0.9999999999999999` | `utilidade.individual` (two sums plus one add), `bonus` in `recomendacao/__init__`, `regra` mean, `parecenca` (`valor`, `total`, `norma_ref`), `credito` means | yes | a `pySum` that copies CPython's `builtin_sum_impl` float path exactly. Never use `reduce` on floats. Golden vectors from Python. A last-bit change turns an exact tie (which Python breaks by votes, then id) into a non-tie, so the ranking moves |
| R2 | **`fato_id` hashes `str(v)`**: `str(4.0) == "4.0"`, JS `String(4) == "4"`; `node:sqlite` returns REAL 4.0 as `4`; `str(True) == "True"`; `str(date)`; `str(1e-05)` | `sessao/fatos` (`float(nota)`), `nota_imdb` (REAL column), `banco/pessoas` vistos (float nota), Trakt (`valor / 2` is float), Letterboxd (`float(rating)`), review and tabelas (CSV strings, safe) | yes | `factId` takes typed parts: `{float: x}` renders like Python `repr` (`"4.0"`, `"1e-05"`, `"1e+16"`), ints plainly, `None` as `""`. Every call site states the Python type. Golden vectors. Otherwise every Nota, Reação or Visto id differs, and with it the DB rows TS sync writes and every `fato_id` in the JSON |
| R3 | **Row order of queries with no `ORDER BY`** depends on the query plan; Python links SQLite 3.46.1, Node bundles 3.53.4 | `parecenca._genoma` and `_tags` (float accumulation per film, and `_tema` keeps the first max on ties), `_pessoas`, `_generos`, `credito` (`SELECT * FROM reacoes`), `presentes`, `sem_tristeza`; listed with line numbers in the appendix | partly (versions differ) | add `ORDER BY` to those queries **in Python first** (a tiny ticket inside E1), so both sides read the same order, then port. The oracle's real run is the proof |
| R4 | **Rounding**: `round()` and `format` are half-to-even on the exact binary value: `round(2.5)=2`, `round(0.125,2)=0.12`, `f"{1.25:.1f}"="1.2"`; JS `Math.round` and `toFixed` round half up | `cartaz._votos` (`round(votos/1000)` "2 mil" vs "3 mil", `votos/1e6:.1f` "1,2 mi" vs "1,3 mi"), `credito.linha` (`round(…,1)`), `round(u,4)` in output (ties are practically impossible there), `grade` (`round(…,12)`) | yes | a `pyRound(x, n)` and `pyFixed(x, n)` with ties to even on the exact value. `toFixed` is correct except on exact ties, so check for a tie and fall back |
| R5 | **casefold vs toLowerCase**: `'ß'.casefold()=='ss'`; final sigma; ligatures | Letterboxd title matching (`_chave_do_titulo`: casefold, NFKD, isalnum), `climas` key, `presentes`, `dados/pessoas` resolve, DDD topic lookup, `idioma`, `feedback` title match (custom SQL function `dobrar`), `cartaz` initials | yes (`ß`) | a `casefold` helper with Unicode CaseFolding.txt (full folding), plus `isalnum` as `\p{L}\p{N}` (checked against Python's `str.isalnum` over the BMP in golden vectors) |
| R6 | **YAML 1.1 (PyYAML) vs 1.2 (`yaml` npm)**: unquoted `2026-11-20` becomes a date object in Python and a string in 1.2; `yes`/`no`/`on`/`off` are booleans in 1.1; sexagesimal `1:30`; PyYAML wraps long strings at 80 columns and picks its own quoting | every filmes-dados read and write; `str(feedback["registrado_em"])` feeds `fato_id` | by reading the code | TS parses with `version: "1.1"`, keeps timestamps as ISO strings, and renders dates through one `pyStrDate`. TS-written files only need to be stable and round-trip with #77; the oracle compares frontmatter semantically, so byte layout is free |
| R7 | **JSON numbers**: Python prints `4.0`, `1e-05`, `NaN`; JS prints `4`, `0.00001`, `null` | CLI and MCP output, `cache.corpo`, `pesos` echoed by `avaliar` | yes | the oracle compares numbers numerically. Nothing downstream may depend on `4.0` vs `4` (the MCP output is read by an LLM) |
| R8 | **Sorting**: Python `sorted(key=…, reverse=True)` keeps ties in input order; tuple keys mixing floats and strings; strings compared by code point (JS compares UTF-16 code units, which differs only above the BMP); `min()` and `max()` return the first extreme | ordering key `_chave`, evidence sort `(-abs(c), fato_id)`, `do_sinal` (ties keep generation order), `sessoes-abertas` reverse sort, `parecido` top 50, `_tags.melhores` desempate tuples, `forca_elo` `min(key=…)` | by reading the code | one `compareTuple` helper and `Array.prototype.sort` (stable) with an inverted comparator for `reverse=True`. **Never** sort then `.reverse()`. Evidence generation order must follow Python's module order (`sinais/*` and `restricoes/*` alphabetical by file name) and TOML table order (`[caminho.peso]` iteration order) |
| R9 | **Today and time zones**: `dt.date.today()` is the host's local date (BRT on servidor-azul, while the container defaults to UTC); RSS `parsedate_to_datetime(...).date()` keeps the item's own offset; `_mais_velha_que` handles 29 February | Clock, Letterboxd RSS dates, the Força age rules | by reading the code | Clock is "today in America/Sao_Paulo" unless `FILMES_HOJE`; RSS dates are taken from the RFC 2822 string's own offset, never via UTC; port the leap-day fallback |
| R10 | **Math functions**: `math.exp`, `log`, `log1p` (glibc) vs V8's fdlibm port can differ by 1 ulp | the utility sigmoid, the `ln` and `ln1p` SQL functions in `70_parecenca`, `parecenca` cosines | not seen yet | the output rounds to 4 places, so only ties matter. The oracle's real run measures it. If it ever bites, port the specific libm functions |
| R11 | **Exact means and seeded randomness**: `statistics.mean` is exact (Fractions); `Random(27).sample` is MT19937 plus CPython's `sample` algorithm | `avaliar` only | by reading the code | port MT19937 and CPython `sample` and `_randbelow` (golden vectors), and an exact rational mean. Or record a decision that evaluate's sample differs and compare evaluate only through its own invariants |
| R12 | **Numeric strings and slices**: Python slices by code point, JS by UTF-16 unit; `f"{n:,}"` and `:g`; `Decimal(str(x)).quantize(ROUND_DOWN)` | `cartaz` initials and avatars, `texto.nota`/`inteiro`, `_tags._decimal`, `dados/pessoas` `nota {:g}` | partly | helpers in L0: `pyFormatG`, `thousandsDot`, `truncate2` (string-based on the shortest repr, which matches between the two except exponent forms), and `Array.from(str)` for slices |
| R13 | **SQLite surface**: custom functions (`ln`, `ln1p`, `dobrar`); the `consultar` authorizer (Node 24.21 has `setAuthorizer`); TEMP tables on a `mode=ro` connection (evaluate); integers above 2^53 make `node:sqlite` throw without `readBigInts`; `COLLATE NOCASE` is ASCII-only on both sides | `consultar`, `avaliar`, `feedback` | `setAuthorizer` and `function` confirmed on Node 24.21 | the SQLite service registers the same functions, opens read-only with `readOnly: true`, and enables BigInt reads only in `consult` (rendered as strings in JSON) |
| R14 | **CSV, ZIP and XML parsers**: Python `csv` (excel dialect, lenient with stray quotes), `zipfile`, `xml.etree` with namespaces, `ijson` streaming | imports and reconstruct | by reading the code | csv-parse with `relax_quotes`, fflate or yauzl, a namespace-aware XML parser, a streaming JSON parser for the Wikidata dumps. Run the fixture plus real export files through the oracle |
| R15 | **Performance of neighbours**: scipy sparse `matriz[lote] @ matriz.T` over about 15M ratings of 4+ | `catalogo/vizinhos`, `avaliar` | by reading the code | a typed-array CSR port. Integer results, so exact parity is achievable (ties break by column index, as in `argpartition` on `col − count·n`). Budget a timing check on servidor-azul in E25 |

---

## 6. Findings that change the map

1. **Python reconstruct after cutover.** Reconstruct ports last and launch does not wait for it, so Python keeps building the DB on servidor-azul **after** filmes-dados and `config/*.toml` move to English keys. Python only reads PT keys, and four config files sit on hard-coded `RAIZ/config` paths. Fix (ticket E23): `db:publish` runs #77's script EN→PT into a scratch copy of filmes-dados and the config, and Python gets one small change, a `FILMES_CONFIG` directory env next to `FILMES_PESOS`. #77's round trip already promises this direction.
2. **The swap drops VPS writes.** The VPS writes Pessoas and Sessions to the DB as they happen (`sincronizar`, `sessao.banco.carregar`, Letterboxd loads). A DB built on servidor-azul at time T, swapped in at T+n, lacks those writes. On container start, TS must re-run the **data loaders** (etapas 10, 31, 32 and 40: wipe the person, session and import-derived rows and reload them from filmes-dados) before serving. So the mounted DB must be writable, and the data loaders are launch-critical, not part of "reconstruct last" (ticket E23).
3. **A process per command becomes a long-lived server.** Python got per-run isolation for free: one process per command, so one `Contexto`, one source-disable flag and one warning list each time. The server needs (a) a per-request `Run` scope for sources, warnings and today, and (b) one write semaphore around "write Markdown + sync DB + queue git commit", since two requests can touch the same Pessoa or Sessão file. `sessao.escrita` takes `BEGIN IMMEDIATE`, which only orders writers inside SQLite, not the Markdown file.
4. **The Dono.** `sessao.abrir` takes `next(iter(SELECT slug FROM pessoas WHERE dono = 1))`, and `presentes` resolves `"dono"` the same way. With two Donos, "dono" must mean the logged-in Pessoa (a request-scoped `Owner` service). The fixture has one Dono, so the oracle stays green. The change is recorded as a decision in the Sessions tickets.
5. **The data shape at the seams is not decided.** Code in English means the TS JSON output (and the MCP results) has English keys. The oracle maps Python keys with #77's map, so **#77 should cover the CLI JSON output keys and the enumerated values** (`tipo`, `forca`, `motivo`, Regra names), not just frontmatter and TOML. Otherwise each port ticket invents names. Evidence *text* and the Sessão body (`Força: forte · Tipo: nota`) stay PT, because they are prose the verifier parses.
6. **The test seam before reconstruct.** Until E24, the Vitest global setup builds the fixture DB **with Python** (`uv run python -m filmes reconstruir` once, cached by a hash of the fixture and the schema) and copies it per test. Tests that call `reconstruir` mid-test, to check that sync equals rebuild, use the TS data reload from E23 instead.
7. **Gaps in the map.** No tickets exist yet for the Google login, the MCP HTTP transport with OAuth (the SDK auth pieces and `auth.sqlite`), the filmes-dados git writer (commit per write, the push queue, retry, the admin banner), or `db:publish`. They are not engine port work, but the engine tickets below assume they exist. W0 is listed below as the one the screens need first. The rest are noted under "Not drafted".

---

## 7. Proposed tickets (drafts, not filed)

Conventions for every engine ticket: Effect v4, files in `packages/engine/src/<area>/`, the matching pytest files ported to Vitest through the public operations (not internals), and the argv adapter in `packages/engine/oracle/` extended for the ported commands. **Acceptance always includes: `pnpm check` green, and the fixture oracle shows zero differences, or only differences recorded in `decisions.yaml` with a reason, for the steps the ticket ports.** "Blocked by" uses draft ids. #73, #74 and #77 are real issues.

### Engine

**E1. Python-compat primitives and fact ids.** Blocked by #73.
- `pySum` (CPython float path), `pyRound`/`pyFixed`, `pyFormatG`, `thousandsDot`, `truncate2`, `pyStr` for fact ids, `casefold`, `isalnum`, `slug` (NFKD to ASCII, the Letterboxd variant and the Pessoa variant), `factId(table, ...typedParts)`, `compareTuple`.
- Also, on the Python side: add `ORDER BY` to the unordered queries in §5 R3, with no change in behaviour on the fixture.
- Acceptance: a Python script writes golden vectors (at least 10k random and edge inputs per function), and Vitest matches every one. The pytest suite is still green after the `ORDER BY`s.

**E2. Engine runtime and test seam.** Blocked by #73, #77.
- `Environment` (paths, weights and config from EN TOML), a `Clock` with `FILMES_HOJE` and America/Sao_Paulo, the error type with codes, the `Sqlite` service (read-only and write with `BEGIN IMMEDIATE`, custom functions, authorizer hook), and the per-request `Run` scope.
- Vitest global setup: builds the fixture DB through Python once (cached) and copies the fixture data and DB per test.
- Acceptance: test_erros ported. A smoke test reads `filmes` from the fixture DB.

**E3. Oracle harness.** Blocked by E2, #77.
- The pytest trace hook, the scenario runner, the argv adapter skeleton, the JSON, data-dir and DB-row comparison (§4.3), `decisions.yaml` with stale-entry detection, the Python double-seed self-check, and a CI job.
- Acceptance: on the fixture, every unported step is reported "not ported", none of them fail. A deliberately wrong TS stub (one evidence text changed) is caught. The Python self-check passes.

**E3b. Real-database oracle run.** Blocked by E3, E17. Runs on servidor-azul, so it needs the user or an agent there.
- The seeded request generator (§4.2), the cache capture from the Python pass, and a dated report.
- Acceptance: the report is committed, and each difference is fixed or recorded.

**E4. Evidence and ranking primitives.** Blocked by E1, E2.
- `Evidence` (`contribution`, `toJson`), the full Força ruler, PT wording, `Rule` (padrão/média/de, neutral 0.5, credit adjustment), `utility` (top-N cut, Já visto outside the cut, sigmoid), candidate selection, attendee resolution (`COLLATE NOCASE`).
- Acceptance: unit tests pinned to Python golden outputs for every ruler function, including leap days and the 2-year and 5-year edges.

**E5. Pessoa files.** Blocked by E1, E2, #77.
- Markdown and YAML 1.1 frontmatter read/write, `Pessoa` (vetos, ajustes, open questions, imports), the body sections and their line grammar, resolve by slug, name or nickname, `slugOf`, the note scales.
- Acceptance: every fixture Pessoa and a migrated copy of the real filmes-dados parse. Write then read round-trips. The oracle data-dir comparison passes on `pessoa criar`.

**E6. Pessoa sync and the first `pessoa` actions.** Blocked by E4, E5.
- DB sync for one Pessoa (`sincronizar`), the Pessoa data reload, and `criar`, `ver`, `declarar`, `relatar`, `visto`.
- Acceptance: test_pessoa (the subset for these actions) and test_pessoa_visto ported; oracle clean on those steps.

**E7. Remaining `pessoa` actions.** Blocked by E6. (Removing a Feedback comment waits for E15.)
- `vetar` (entity, film, tag group), `ajustar`, `pular`, `perguntas`, `remover`; vetos group labels.
- Acceptance: the rest of test_pessoa, plus test_perguntas_abertas and test_pessoa_remover (except the comment case) ported.

**E8. On-demand sources and cache.** Blocked by E1, E2.
- §3 in full: `Transport` Live and Recorded, the retry schedule, disabled-for-the-run, warnings, the cache with WAL, OMDb, DDD, TMDB (search with pages, external ids, details, the pt-BR card).
- Acceptance: tests over `gravacoes/` (hits, misses, `.falha.json` with and without `vezes`); `TestClock` proves the 2s and 4s backoff; a cache file written by Python is read by TS.

**E9. Ranking pipeline.** Blocked by E4, E8.
- The seven signals in Python's module order, vetos (entity, subgenres, IMDb-equivalent genre, tag groups), climas, the credit read, the three ordering bands, the `quantos` shortcut with `Selecao`, the card header (TMDB pt-BR), attributions, and the output shape. This is the `recommend` operation **without** opening a Sessão.
- Acceptance: test_recomendar, test_caminho_conteudo, test_vizinhanca, test_clima, test_grupo, test_cabecalho, test_veto_por_tag_e_nota_imdb, test_veto_subgeneros and test_ajuste_e_corte ported (the steps that need Sessions stay pending until E13).

**E10. Restrição framework and local restrictions.** Blocked by E9.
- `evaluate`, `Pending`, `resolve`, the `inherit` and `replacesList` hooks, labels, and the `tirados` and `saidas` counters; `duracao`, `ano`, `idioma`, `sem_ja_visto`, `sem_tristeza`, `sem_lento`.
- Acceptance: test_restricoes (local cases), test_restricao_ano, test_restricao_tristeza and test_sem_lento ported.

**E11. On-demand restrictions.** Blocked by E10, E8.
- `crianca` (isAdult, ClassInd, then the other systems, then OMDb Rated) and `gatilho` (DDD votes rule), `approve` within `alcance_sob_demanda`, and the "no information" lines.
- Acceptance: the remaining test_restricoes cases ported.

**E12. Similarity.** Blocked by E10.
- `parecenca` (genome excess, TF-IDF cosine, neighbour cosine, people, genres, weight redistribution) and the `parecido` restriction (top N, lines, list warning), without Session inheritance.
- Acceptance: test_parecido ported; oracle clean, with R1 and R3 handled.

**E13. Sessions: open and list.** Blocked by E9, E5.
- The Session file format (frontmatter and body), `newId` with suffixes, `order`, the body parser, DB sync for one Session and the Session data reload, `recommend` opening a Session, `openSessions`, and the request-scoped Owner (§6.4).
- Acceptance: test_sessoes ported; oracle data-dir comparison clean on the Session files.

**E14. Redoing a Session.** Blocked by E13, E12, E10.
- `--sessao`, `--manter`, `--trocar`, the `fora_da_sessao` restriction, `mantidos` (positions, the "novo" badge, `saidas` with reasons, warnings), `inherit` and `replacesList` (parecido in a Session), version history.
- Acceptance: test_refazer_sessao, test_regerar_mantidos, test_fora_da_sessao and test_parecido_na_sessao ported.

**E15. Feedback and credit.** Blocked by E13.
- Feedback parsing (note scales, relato levels, comments, chosen film by id or title, inside or outside the list, "nada"), the Fatos of a Feedback, closing the Session, the credit computation and credit line; `pessoa remover --comentario` from E7.
- Acceptance: test_feedback and test_credito ported.

**E16. Cartaz model and `responder`.** Blocked by E14, E6.
- `posterModel(session, shown?)`: everything the React Cartaz needs (request reading, film cards, the strongest Evidence per Presente with shared lines, versions). `cartaz.py` computes this; the TS version returns it as data, with no HTML.
- `show` (records `mostrados`), and `answerPoster(text)` (the `#cartaz` grammar, Já vi with notes, Trocar, stars, comments, acrescentar, old-version texts, idempotent re-paste).
- Acceptance: test_cartaz_responder, test_cartaz_responde and test_cartaz_mostrados ported. test_cartaz and test_cartaz_guarda move to W2 as component tests. The oracle compares the `cartaz` JSON minus `arquivo`.

**E17. Answer verification.** Blocked by E13.
- `verifyAnswer` (both line formats, per-film blocks, header skipping, grouped Presentes).
- Acceptance: test_verificar ported.

**E18. Letterboxd ZIP import.** Blocked by E8, E6.
- ZIP and CSV reading (watched, ratings, diary, reviews, watchlist), the resolution chain (decision, TMDB id, local Wikidata `slug` and Year ± 1, TMDB search, miniseries), `imports/letterboxd.md` decisions, keeping the original upload, the load into the DB, and the import report.
- Acceptance: test_letterboxd (the ZIP cases) ported; oracle clean including `imports/` files.

**E19. Letterboxd RSS and the queue.** Blocked by E18.
- RSS fetch (with consent), XML parsing, dates in the feed's offset (R9), and `fila ver`, `confirmar`, `descartar`, `reprocessar`.
- Acceptance: test_letterboxd_rss, test_fila_reprocessar and the rest of test_letterboxd ported.

**E20. Trakt import and removing an import.** Blocked by E18.
- Trakt raw export (ratings and history; ids to tconst), and `importar --remover` (frontmatter entry, stored file, facts reloaded from the remaining imports).
- Acceptance: test_trakt and test_importar_remover ported.

**E21. Export and consult.** Blocked by E2, E5.
- The IMDb CSV export (as bytes the web app and MCP return, not a server path), and `consult` (read-only, authorizer, the `somente_leitura` and `sql_invalido` codes, BigInt as strings).
- Acceptance: test_exportar and test_consultar ported.

**E22. Evaluate.** Blocked by E15, E1.
- Offline cut, Pessoas measured, the MovieLens sample (an MT19937 port of `Random(27).sample`, or a recorded decision), `vizinhos.calcular` in typed arrays (shared with E25), the grid with an exact mean, the report file and progress events.
- Acceptance: test_avaliar ported; oracle clean on the fixture, or every difference recorded.

**E23. Data reload on start and the publish path while Python builds.** Blocked by E13, E18, E20, #77. Coordinate with #79.
- On container start, reload every Pessoa, import and Session into the mounted DB before serving (§6.2).
- `db:publish` runs the #77 migration EN→PT into scratch filmes-dados and config dirs for the Python reconstruct (§6.1).
- On the Python side, add `FILMES_CONFIG`.
- Acceptance: starting from a DB built before a fixture write, the reload gives the same person and session rows as a fresh Python reconstruct. A scripted dry run of `db:publish` on the fixture passes.

**E24. Reconstruct, fixture path.** Blocked by E13, E18, E20.
- Schema apply, CSV tables with generated `fato_id`, series cleanup, age-rating conversion, the similarity precompute (`ln`, `ln1p`), the data loaders, and the atomic temp-file swap. The fixture DB of the test seam switches from Python to TS.
- Acceptance: test_reconstruir ported; the reconstruct oracle (§4.4) is row-identical on the fixture.

**E25. Reconstruct, real catalog.** Blocked by E24, E22.
- The versions manifest, IMDb TSVs, Wikidata SPARQL streaming (graph, cast, series, labels, subgenres), GroupLens (genome, tags, neighbours).
- Acceptance: test_ingestao (the reconstruct cases over `gravacoes/catalogo`) ported. On the catalog slice the oracle is row-identical. A neighbours timing check on servidor-azul is recorded.

**E26. `atualizar` and the full-DB parity run.** Blocked by E25.
- Downloads with progress, manifest pinning, and `db:publish` switched to the TS reconstruct.
- Acceptance: the rest of test_ingestao. On servidor-azul, the TS full build matches the Python full build row for row (report committed) and the real-database oracle run (E3b) is clean.

**E27. Python leaves.** Blocked by E26, M1b, E22.
- Delete `filmes/`, `tests/*.py`, `pyproject.toml`, `uv.lock`, the Python CI job, the oracle's Python side, the argv adapter and `FILMES_CONFIG`. The image has no Python.
- Acceptance: `pnpm check` green, and nothing in the repo or image references `python` or `uv`.

### MCP (in-process on the engine; the HTTP transport and OAuth are outside this list)

**M1a. Core MCP tools.** Blocked by E16, E17, E15.
- `recommend`, `open_sessions`, `record_feedback`, `answer_poster`, `verify_answer`, with English names, PT descriptions and GLOSSARY terms.
- The skill's text goes into `instructions`. Results are returned as JSON text, as today.
- Acceptance: servidor.test, feedback.test, cartaz_responder.test, verificar.test and parecido.test ported to call the engine in-process; there is no subprocess left.

**M1b. Person, import and admin tools.** Blocked by M1a, E7, E19, E20, E21, E22.
- `person` actions, `import` (RSS), `import_queue`, and `consult` and `evaluate` (with progress notifications) gated on `admin: true`.
- The `atualizar` tool is removed.
- Acceptance: pessoa.test, remover.test, letterboxd.test, trakt.test, exportar.test (now a download content check) and avaliar.test ported; a non-admin call to `consult` is refused with a coded error.

**M2. The Cartaz as an MCP Apps view.** Blocked by W2, #75.
- The Cartaz component bundled as one `ui://` resource. The Enviar button sends the `#cartaz` text back into the conversation, following #75's findings.
- Acceptance: a story and a jsdom test render the resource HTML within the CSP #75 found. A manual check in the Claude mobile app is a user step.

### Web-app screens (TanStack Start, Base UI and shadcn, PT-BR UI, with screen evidence per ADR 0018)

Every screen is blocked by #73, #78 and **W0**.

**W0. Google login and the Dono gate.** Not on the map yet.
- The hand-written Google OAuth (the `accounts.ts` shape), the `email:` lookup on Pessoas who are Dono, web sessions in `auth.sqlite`, and a request-scoped Owner.
- Acceptance: e2e logs in with a stubbed Google; an email not on a Dono is refused.

**W1. Sessions list and the request form.** Blocked by E13, E10, E11, E12.
- Open and closed Sessions.
- A "Nova Sessão" form, structured, with no LLM: Presentes, Regra/de, climas, duration, year range, language, child age, triggers, sem já visto, nada triste, nada lento, parecido-com (film search), quantos.
- Acceptance: jsdom tests for validation, an e2e flow from request to Cartaz, and stories.

**W2. The Cartaz component and regenerating.** Blocked by E16, E14.
- The React Cartaz (one component with a story, used here and in M2): marks per film (Já vi per Presente with a 1–10 note and a comment, Trocar, stars, comment) and acrescentar. Enviar records through `answerPoster`, then regenerates with keep.
- Local marks are kept per Session and version.
- Acceptance: test_cartaz and test_cartaz_guarda behaviours become component tests, stories cover light and dark, and the e2e flow covers mark, regenerate and the "novo" badge.

**W3. Feedback.** Blocked by E15.
- Choose the film (from the list or a search, or "não vimos nada"), a note per Presente or a relayed relato, and comments. This closes the Session.
- Acceptance: jsdom tests for each reaction type, and an e2e flow that closes a Session and shows the credit effect on the next one.

**W4. Pessoas.** Blocked by E7.
- A list, and a Pessoa page with taste (declarados, relatos, já vistos, imported notes), Vetos (entity, film, tag group), Ajustes per elo, and open questions (answer or skip). Add and remove each.
- Acceptance: jsdom tests per action and stories; the data-dir write is checked through the engine fake.

**W5. Imports and the resolution queue.** Blocked by E19, E20.
- Upload a Letterboxd ZIP or a Trakt ZIP, link the Letterboxd RSS with consent, the import report, the queue (confirm with an IMDb or TMDB link, discard with a reason, reprocess), and remove an import.
- Acceptance: e2e upload of the fixture ZIPs, and jsdom tests for the queue.

**W6. Export.** Blocked by E21.
- Download a Pessoa's IMDb CSV, with the MovieLens import hint.
- Acceptance: the download's content equals the engine output.

**W7. Operations (admin only).** Blocked by E21, E22, W0.
- A SQL console (read-only, results table, error codes) and evaluate with live progress and the report.
- Acceptance: hidden from and refused to non-admins; jsdom tests for the console; e2e for evaluate on the fixture.

**Count: 27 engine (E1–E27, including E3b), 3 MCP and 7 screens (W1–W7) = 37 drafts, plus W0 (login), which the map is missing.**

### Not drafted (the map should get these, outside this inventory)

- The MCP HTTP transport and OAuth (the SDK auth pieces, PKCE, DCR, `auth.sqlite`). This depends on #75.
- The filmes-dados git writer: one commit per write authored by the logged-in Pessoa, a write deploy key, the push queue with retry, and the admin banner.
- `db:publish` (rsync to `/opt/filmes/<db>/<version>.sqlite` and the swap). E23 only adds the EN→PT step and the reload.

---

## Appendix: queries with no `ORDER BY` whose row order can leak into output

`recomendacao/parecenca.py:122,133,148,179,199,201,221,225`, `sessao/credito.py:26,31,34`, `recomendacao/restricoes/sem_tristeza.py:82`, `recomendacao/restricoes/sem_ja_visto.py:35`, `recomendacao/restricoes/fora_da_sessao.py:113`, `recomendacao/presentes.py:19,23`, `sessao/__init__.py:21` (`next(iter(dono))`), `importar/letterboxd.py:100,366,447`, `importar/trakt.py:88,93`, `importar/fila.py:77`, `avaliacao/__init__.py:91`, `avaliacao/pessoas.py:69,80`, `catalogo/grafo.py:14`, `catalogo/elenco.py:18`, `banco/etapas/70_parecenca.py:19`. Most of these go into sets or dicts and are then sorted, so they are harmless. The ones that matter accumulate floats or keep the first of equals: `parecenca` 122 and 148, `credito` 34, `presentes` 23 (more than one match), and `sessao/__init__` 21. E1 adds `ORDER BY` to all of them in Python so the question goes away.
